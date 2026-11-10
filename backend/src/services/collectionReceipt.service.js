// backend/src/services/collectionReceipt.service.js
//
// বাকি আদায়ের "মানি রিসিপ্ট" — কাস্টমার পণ্য না নিয়ে শুধু বাকির টাকা দিলে আগে কোনো ইনভয়েস/রসিদ
// কাস্টমারের কাছে যেত না (শুধু একটা push নোটিফিকেশন)। এখন আদায় রেকর্ড হওয়ার সাথে সাথে:
//   ১. WhatsApp-এ রসিদের PDF (ইনভয়েস PDF-এর মতোই)
//   ২. WhatsApp না গেলে / নম্বর না থাকলে ইমেইল (কাস্টমারের ইমেইল থাকলে)
// রসিদে থাকে: রসিদ নম্বর, তারিখ, আদায়কারী, কত টাকা, আগের বাকি, এখনকার বাকি,
// এবং কোন কোন ইনভয়েসের বাকি শোধ হলো।
//
// ⚠️ সবকিছু best-effort: ব্যর্থ হলে আদায় আটকায় না (caller .catch করে), কখনো throw করে না।
// ⚠️ রসিদ নম্বর আলাদা কলামে সেভ হয় না — আদায়ের id থেকেই নির্ধারিত (deterministic), তাই
//    কোনো migration লাগে না এবং একই আদায়ের রসিদ বারবার একই নম্বরে বের হয়।

const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');
const logger = require('../config/logger');
const { query } = require('../config/db');
const whatsappGateway = require('./whatsappGateway.service');
const { loadInvoiceBranding } = require('./invoiceBranding.service');
const { fmt } = require('./invoiceDue.util');

const BN_FONT_REGULAR = path.join(__dirname, '../assets/fonts/HindSiliguri-Regular.ttf');
const BN_FONT_BOLD    = path.join(__dirname, '../assets/fonts/HindSiliguri-Bold.ttf');

const MODE_LABELS = { cash: 'নগদ', cheque: 'চেক', bkash: 'বিকাশ', nagad: 'নগদ (Nagad)' };

const formatPhone = (phone) => {
    if (!phone) return null;
    let d = String(phone).replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('880')) return d;
    if (d.startsWith('0'))   return '880' + d.slice(1);
    if (d.length === 10)     return '880' + d;
    return d;
};

const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * রসিদ নম্বর — আদায়ের id + তারিখ থেকে। যেমন: MR-20261108-A1B2C3
 * (BD সময়ের তারিখ, id-র প্রথম ৬ অক্ষর বড় হাতের)
 */
const buildReceiptNo = (paymentId, createdAt = new Date()) => {
    const bd = new Date(new Date(createdAt).getTime() + 6 * 60 * 60 * 1000);
    const ymd = bd.toISOString().slice(0, 10).replace(/-/g, '');
    const tail = String(paymentId || '').replace(/-/g, '').slice(0, 6).toUpperCase() || '000000';
    return `MR-${ymd}-${tail}`;
};

const collectorName = (u) => (u && (u.name_bn || u.name_en || u.name)) || null;

// ─── PDF ─────────────────────────────────────────────────────
const generateCollectionReceiptPDF = (r) => new Promise((resolve, reject) => {
    try {
        const company = r.company || {};
        const invs    = r.invoiceNumbers || [];
        const doc     = new PDFDocument({ margin: 40, size: [283, 430 + invs.length * 12] });
        const chunks  = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end',  () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let F = 'Helvetica', FB = 'Helvetica-Bold';
        if (fs.existsSync(BN_FONT_REGULAR) && fs.existsSync(BN_FONT_BOLD)) {
            doc.registerFont('bn', BN_FONT_REGULAR);
            doc.registerFont('bn-bold', BN_FONT_BOLD);
            F = 'bn'; FB = 'bn-bold';
        }

        const dash = () => {
            doc.moveDown(0.3);
            doc.moveTo(40, doc.y).lineTo(243, doc.y).dash(3).stroke();
            doc.undash();
            doc.moveDown(0.3);
        };
        const row = (label, value, bold = false) => {
            const y = doc.y;
            doc.fontSize(9).font(bold ? FB : F).text(label, 40, y, { width: 120 });
            doc.font(bold ? FB : F).text(value, 150, y, { width: 93, align: 'right' });
            doc.moveDown(0.3);
        };

        doc.fontSize(14).font(FB).text(company.name || '', { align: 'center' });
        doc.fontSize(8).font(F);
        if (company.address) doc.text(company.address, { align: 'center' });
        if (company.phone)   doc.text(company.phone,   { align: 'center' });
        if (company.email)   doc.text(company.email,   { align: 'center' });

        dash();
        doc.fontSize(11).font(FB).text('পেমেন্ট রসিদ (Money Receipt)', 40, doc.y, { width: 203, align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(9).font(FB).text(`রসিদ নং: ${r.receiptNo}`);
        doc.fontSize(8).font(F)
           .text(`তারিখ: ${new Date(r.createdAt).toLocaleDateString('bn-BD')}`)
           .text(`দোকান: ${r.customer.shop_name}`)
           .text(`মালিক: ${r.customer.owner_name || '-'}`);
        if (r.collectorName) {
            doc.text(`গ্রহণকারী: ${r.collectorName}${r.collectorCode ? ` (${r.collectorCode})` : ''}`);
        }

        dash();
        row('পেমেন্ট পদ্ধতি', MODE_LABELS[r.paymentMode] || r.paymentMode || 'নগদ');
        row('গ্রহণ করা টাকা', `৳${fmt(r.amount)}`, true);

        dash();
        doc.fontSize(8).font(FB).text('বাকির হিসাব', 40, doc.y, { width: 203 });
        doc.moveDown(0.2);
        if (r.previousDue !== null && r.previousDue !== undefined) row('আগের বাকি', `৳${fmt(r.previousDue)}`);
        if (!r.remainingIsCurrent) row('− এই পেমেন্ট', `৳${fmt(r.amount)}`);
        row(r.remainingIsCurrent ? 'বর্তমান মোট বাকি' : 'এই পেমেন্টের পর বাকি', `৳${fmt(r.remainingDue)}`, true);

        if (invs.length > 0) {
            dash();
            doc.fontSize(8).font(FB).text('যে ইনভয়েসের বাকি শোধ হলো:', 40, doc.y, { width: 203 });
            doc.fontSize(8).font(F);
            invs.forEach(n => doc.text(`• ${n}`, 40, doc.y, { width: 203 }));
        }
        if (r.paymentMode === 'cheque') {
            doc.moveDown(0.3);
            doc.fontSize(7.5).font(F).fillColor('#555555')
               .text('চেক ক্যাশ হওয়া সাপেক্ষে পেমেন্ট চূড়ান্ত হবে।', 40, doc.y, { width: 203, align: 'center' })
               .fillColor('#000000');
        }

        dash();
        doc.fontSize(8).font(F)
           .text('পেমেন্টের জন্য ধন্যবাদ', 40, doc.y, { width: 203, align: 'center' })
           .text(company.name || '', 40, doc.y, { width: 203, align: 'center' });
        doc.end();
    } catch (e) { reject(e); }
});

// ─── WhatsApp টেক্সট (caption / fallback) ────────────────────
const receiptCaption = (r) =>
    `🧾 পেমেন্ট রসিদ ${r.receiptNo}\n` +
    `💰 গ্রহণ: ৳${fmt(r.amount)}\n` +
    `📒 ${r.remainingIsCurrent ? 'বর্তমান বাকি' : 'পেমেন্টের পর বাকি'}: ৳${fmt(r.remainingDue)}`;

// ─── Email ───────────────────────────────────────────────────
const buildReceiptHTML = (r) => {
    const company = r.company || {};
    const invs = (r.invoiceNumbers || []).map(n => `<li>${escapeHtml(n)}</li>`).join('');
    const tr = (l, v, strong) =>
        `<tr><td style="padding:5px 0;color:${strong ? '#c62828' : '#555'};font-size:13px;${strong ? 'font-weight:bold;' : ''}">${l}</td>` +
        `<td style="padding:5px 0;text-align:right;color:${strong ? '#c62828' : '#222'};font-size:${strong ? 15 : 13}px;${strong ? 'font-weight:bold;' : ''}">${v}</td></tr>`;
    return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" style="max-width:520px;margin:auto;background:#fff;border-radius:10px;overflow:hidden;">
<tr><td style="background:#2e7d32;padding:20px 28px;color:#fff;">
  <div style="font-size:18px;font-weight:bold;">${escapeHtml(company.name || '')}</div>
  <div style="font-size:12px;margin-top:4px;">💳 পেমেন্ট রসিদ — ${escapeHtml(r.receiptNo)}</div>
</td></tr>
<tr><td style="padding:20px 28px;">
  <p style="margin:0 0 4px;font-size:14px;"><strong>${escapeHtml(r.customer.shop_name)}</strong></p>
  <p style="margin:0 0 14px;color:#777;font-size:12px;">📅 ${new Date(r.createdAt).toLocaleDateString('bn-BD')}${r.collectorName ? ` · গ্রহণকারী: ${escapeHtml(r.collectorName)}` : ''}</p>
  <table width="100%" style="border-top:1px solid #eee;">
    ${tr('পেমেন্ট পদ্ধতি', escapeHtml(MODE_LABELS[r.paymentMode] || r.paymentMode || 'নগদ'))}
    ${tr('গ্রহণ করা টাকা', `৳${fmt(r.amount)}`, false)}
    ${r.previousDue !== null && r.previousDue !== undefined ? tr('আগের বাকি', `৳${fmt(r.previousDue)}`) : ''}
    ${tr(r.remainingIsCurrent ? 'বর্তমান মোট বাকি' : 'এই পেমেন্টের পর বাকি', `৳${fmt(r.remainingDue)}`, true)}
  </table>
  ${invs ? `<p style="margin:14px 0 4px;font-size:12px;color:#555;font-weight:bold;">যে ইনভয়েসের বাকি শোধ হলো:</p><ul style="margin:0;padding-left:18px;font-size:13px;">${invs}</ul>` : ''}
</td></tr>
<tr><td style="background:#e8f5e9;padding:12px 28px;text-align:center;color:#2e7d32;font-size:13px;font-weight:bold;">🙏 পেমেন্টের জন্য ধন্যবাদ</td></tr>
</table></body></html>`;
};

/**
 * আদায়ের রসিদ কাস্টমারকে পাঠায় (WhatsApp PDF → না হলে ইমেইল)। কখনো throw করে না।
 *
 * @param {object} p
 * @param {string} p.tenantId
 * @param {string} p.customerId
 * @param {string} p.paymentId       collections.id অথবা credit_payments.id
 * @param {number|string} p.amount
 * @param {string} [p.paymentMode='cash']
 * @param {number|null} [p.previousDue]  আদায়ের আগের বাকি (জানা থাকলে)
 * @param {number} p.remainingDue        আদায়ের পরের বাকি
 * @param {boolean} [p.remainingIsCurrent]  true হলে remainingDue আদায়ের সময়ের নয়, "বর্তমান" বাকি (পুরনো আদায়ের resend)
 * @param {Array<{sale_id:string}>} [p.allocations]  FIFO বরাদ্দ (allocatePaymentSafe-এর ফল)
 * @param {object} [p.collector]         req.user (name_bn, employee_code)
 * @param {Date|string} [p.createdAt]
 * @returns {Promise<{success:boolean, channel?:string, reason?:string, receiptNo?:string}>}
 */
const sendCollectionReceipt = async (p) => {
    try {
        const custRes = await query(
            `SELECT shop_name, owner_name, whatsapp, sms_phone, email
               FROM customers WHERE id = $1 AND tenant_id = $2`,
            [p.customerId, p.tenantId]
        );
        const customer = custRes.rows[0];
        if (!customer) return { success: false, reason: 'customer_not_found' };

        // কোন ইনভয়েসগুলোতে বসল (নম্বর দেখানোর জন্য)
        let invoiceNumbers = [];
        const saleIds = (p.allocations || []).map(a => a.sale_id).filter(Boolean);
        if (saleIds.length > 0) {
            try {
                const inv = await query(
                    `SELECT invoice_number FROM sales_transactions
                      WHERE id = ANY($1::uuid[]) AND tenant_id = $2
                      ORDER BY created_at ASC`,
                    [saleIds, p.tenantId]
                );
                invoiceNumbers = inv.rows.map(x => x.invoice_number).filter(Boolean);
            } catch (e) {
                logger.warn(`[Receipt] ইনভয়েস নম্বর আনা যায়নি: ${e.message}`);
            }
        }

        const { company } = await loadInvoiceBranding({
            customer, meta: { tenant_id: p.tenantId },
        });

        const createdAt = p.createdAt || new Date();
        const r = {
            receiptNo:     buildReceiptNo(p.paymentId, createdAt),
            createdAt,
            company,
            customer,
            amount:        parseFloat(p.amount) || 0,
            paymentMode:   p.paymentMode || 'cash',
            previousDue:   p.previousDue === undefined ? null : p.previousDue,
            remainingDue:  parseFloat(p.remainingDue) || 0,
            remainingIsCurrent: !!p.remainingIsCurrent, // পুরনো আদায়ের resend: আদায়ের সময়ের স্ন্যাপশট নেই, আজকের বাকি দেখানো হচ্ছে
            invoiceNumbers,
            collectorName: collectorName(p.collector),
            collectorCode: p.collector?.employee_code || null,
        };

        // ── ১. WhatsApp PDF ──
        const phone = formatPhone(customer.whatsapp || customer.sms_phone);
        if (phone && !whatsappGateway.isLikelyDown()) {
            try {
                const pdf = await generateCollectionReceiptPDF(r);
                const wa = await whatsappGateway.sendDocument({
                    to: phone,
                    documentBuffer: pdf,
                    filename: `Receipt-${r.receiptNo}.pdf`,
                    caption: receiptCaption(r),
                    type: 'collection_receipt',
                });
                if (wa?.success) {
                    logger.info(`📲 [Receipt] WhatsApp সফল → ${r.receiptNo}`);
                    return { success: true, channel: 'whatsapp', receiptNo: r.receiptNo };
                }
                logger.warn(`⚠️ [Receipt] WhatsApp যায়নি (${wa?.reason || 'unknown'}) — ${r.receiptNo}`);
            } catch (e) {
                logger.error(`❌ [Receipt] WhatsApp ব্যর্থ — ${r.receiptNo}: ${e.message}`);
            }
        }

        // ── ২. Email fallback ──
        if (customer.email) {
            try {
                // লেটার-লোডে circular dependency এড়াতে এখানে require
                const { sendEmail } = require('./email.service');
                const text = `${receiptCaption(r)}\nদোকান: ${customer.shop_name}`;
                const em = await sendEmail(
                    customer.email,
                    `পেমেন্ট রসিদ ${r.receiptNo} | ${customer.shop_name}`,
                    buildReceiptHTML(r),
                    text,
                    { type: 'collection_receipt', tenant_id: p.tenantId }
                );
                if (em?.success) {
                    logger.info(`📧 [Receipt] Email সফল → ${r.receiptNo}`);
                    return { success: true, channel: 'email', receiptNo: r.receiptNo };
                }
            } catch (e) {
                logger.error(`❌ [Receipt] Email ব্যর্থ — ${r.receiptNo}: ${e.message}`);
            }
        }

        return { success: false, reason: phone || customer.email ? 'send_failed' : 'no_contact', receiptNo: r.receiptNo };
    } catch (err) {
        logger.error(`❌ [Receipt] অপ্রত্যাশিত ত্রুটি: ${err.message}`);
        return { success: false, reason: 'unexpected_error' };
    }
};

/**
 * আদায়ের মুহূর্তের বাকি স্ন্যাপশট (due_before / due_after) সেভ করে — resend-এর জন্য।
 * কলারের transaction-এর ভেতরে চলে; SAVEPOINT-এ, তাই migration_receipt_snapshot.sql
 * না চললেও আদায়/বিক্রি আটকায় না (শুধু warning লগ)।
 * table হোয়াইটলিস্টেড — SQL-এ সরাসরি বসে।
 */
const saveReceiptSnapshotSafe = async (client, { table, id, tenantId, dueBefore, dueAfter }) => {
    if (!['collections', 'credit_payments'].includes(table)) return;
    await client.query('SAVEPOINT receipt_snapshot');
    try {
        await client.query(
            `UPDATE ${table} SET due_before = $1, due_after = $2 WHERE id = $3 AND tenant_id = $4`,
            [dueBefore, dueAfter, id, tenantId]
        );
        await client.query('RELEASE SAVEPOINT receipt_snapshot');
    } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT receipt_snapshot');
        await client.query('RELEASE SAVEPOINT receipt_snapshot');
        logger.warn(`[Receipt] স্ন্যাপশট সেভ হয়নি (migration_receipt_snapshot.sql চালানো হয়েছে?): ${e.message}`);
    }
};

module.exports = {
    saveReceiptSnapshotSafe,
    buildReceiptNo,
    generateCollectionReceiptPDF,
    sendCollectionReceipt,
};
