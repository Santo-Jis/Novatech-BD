const PDFDocument = require('pdfkit');
const { generateOTP } = require('../config/encryption');
const { sendOTP, sendInvoice: sendInvoiceSMS, getWhatsAppInvoiceLink } = require('./sms.service');
const { sendOTPEmail, sendOTPWithInvoiceEmail, sendInvoiceEmail } = require('./email.service');

// ============================================================
// Invoice Number জেনারেশন
// ============================================================

const generateInvoiceNumber = async () => {
    const { query } = require('../config/db');
    const result    = await query('SELECT generate_invoice_number() AS invoice_number');
    return result.rows[0].invoice_number;
};

// ============================================================
// OTP পাঠানো — Email + SMS Fallback
// ============================================================
// লজিক:
//   1. কাস্টমারের email থাকলে → Email পাঠাও
//   2. Email না থাকলে বা fail হলে → SMS দিয়ে পাঠাও
//   3. দুটোই পাঠানো হলে সেটাও OK
// ============================================================

// ============================================================
// OTP + Invoice একসাথে পাঠানো — একটাই Email/SMS
// ============================================================
// লজিক:
//   1. কাস্টমারের email থাকলে → OTP+Invoice একটাই Email পাঠাও
//   2. Email না থাকলে বা fail হলে → SMS দিয়ে OTP পাঠাও
// ============================================================

const sendInvoiceOTP = async (customer, saleId, otp, expiryMinutes = 10, sale = null, worker = null, items = null) => {
    const phone = customer.whatsapp || customer.sms_phone;
    const email = customer.email;

    const results = { email: null, sms: null };
    let anySent   = false;

    // ── Email চেষ্টা — OTP + Invoice একসাথে ──
    if (email) {
        try {
            // sale তথ্য থাকলে combined email, না থাকলে শুধু OTP email
            if (sale && worker && items) {
                results.email = await sendOTPWithInvoiceEmail(email, otp, expiryMinutes, sale, customer, worker, items);
            } else {
                results.email = await sendOTPEmail(email, otp, customer.shop_name, expiryMinutes);
            }
            if (results.email?.success && !results.email?.dev && !results.email?.disabled) {
                anySent = true;
                console.log(`📧 OTP+Invoice Email সফল → ${email}`);
            }
        } catch (err) {
            console.error(`❌ OTP+Invoice Email ব্যর্থ → ${email}:`, err.message);
            results.email = { success: false, error: err.message };
        }
    }

    // ── SMS চেষ্টা (Email না থাকলে বা fail হলে) ──
    if (phone && (!anySent)) {
        try {
            results.sms = await sendOTP(phone, otp, customer.shop_name);
            if (results.sms?.success) {
                anySent = true;
                console.log(`📱 OTP SMS সফল → ${phone}`);
            }
        } catch (err) {
            console.error(`❌ OTP SMS ব্যর্থ → ${phone}:`, err.message);
            results.sms = { success: false, error: err.message };
        }
    }

    if (!anySent) {
        console.warn(`⚠️ OTP পাঠানো যায়নি। Sale ID: ${saleId} | Email: ${email || 'নেই'} | Phone: ${phone || 'নেই'}`);
    }

    return { otp, results };
};

// ============================================================
// Invoice নোটিফিকেশন — শুধু SMS Fallback
// (Email আগেই OTP-এর সাথে পাঠানো হয়েছে)
// ============================================================

const sendInvoiceNotification = async (customer, sale, worker, items) => {
    const phone = customer.whatsapp || customer.sms_phone;

    const results = { email: null, sms: null };
    let anySent   = false;

    // ── Email skip — OTP-এর সাথেই combined email চলে গেছে ──

    // ── SMS Fallback (email না থাকলে) ──
    if (phone && !customer.email) {
        try {
            results.sms = await sendInvoiceSMS(
                phone,
                sale.invoice_number,
                sale.net_amount,
                customer.shop_name
            );
            if (results.sms?.success) {
                anySent = true;
                console.log(`📱 Invoice SMS সফল → ${phone}`);
            }
        } catch (err) {
            console.error(`❌ Invoice SMS ব্যর্থ → ${phone}:`, err.message);
            results.sms = { success: false, error: err.message };
        }
    }

    return { results, anySent };
};

// ============================================================
// Invoice PDF তৈরি
// ============================================================

const generateInvoicePDF = async (sale, customer, worker, items) => {
    return new Promise((resolve, reject) => {
        try {
            const doc    = new PDFDocument({ margin: 40, size: [283, 600] }); // Receipt size
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end',  ()    => resolve(Buffer.concat(chunks)));
            doc.on('error', err  => reject(err));

            // ── Header ──
            doc.fontSize(14).font('Helvetica-Bold')
               .text('NovaTech BD (Ltd.)', { align: 'center' });
            doc.fontSize(8).font('Helvetica')
               .text('জানকি সিংহ রোড, বরিশাল সদর – ১২০০', { align: 'center' })
               .text('inf.novatechbd@gmail.com', { align: 'center' });

            doc.moveDown(0.3);
            doc.moveTo(40, doc.y).lineTo(243, doc.y).dash(3).stroke();
            doc.undash();
            doc.moveDown(0.3);

            // ── Invoice Info ──
            doc.fontSize(9).font('Helvetica-Bold')
               .text(`Invoice: ${sale.invoice_number}`);
            doc.fontSize(8).font('Helvetica')
               .text(`তারিখ: ${new Date(sale.created_at).toLocaleDateString('bn-BD')}`)
               .text(`দোকান: ${customer.shop_name}`)
               .text(`মালিক: ${customer.owner_name}`)
               .text(`SR: ${worker.name_bn} (${worker.employee_code})`);

            doc.moveDown(0.3);
            doc.moveTo(40, doc.y).lineTo(243, doc.y).dash(3).stroke();
            doc.undash();
            doc.moveDown(0.3);

            // ── Items ──
            doc.fontSize(8).font('Helvetica-Bold')
               .text('পণ্য', 40, doc.y, { width: 100, continued: false });

            let yPos = doc.y;
            doc.text('পরিমাণ', 140, yPos, { width: 40 });
            doc.text('মোট',    185, yPos, { width: 58, align: 'right' });

            doc.moveDown(0.2);
            doc.moveTo(40, doc.y).lineTo(243, doc.y).stroke();
            doc.moveDown(0.2);

            items.forEach(item => {
                const subtotal = item.qty * item.price;
                yPos = doc.y;
                doc.fontSize(8).font('Helvetica')
                   .text(item.product_name, 40, yPos, { width: 100 });
                doc.text(`${item.qty} × ৳${item.price}`, 140, yPos, { width: 40 });
                doc.text(`৳${subtotal.toLocaleString('bn-BD')}`, 185, yPos, { width: 58, align: 'right' });
                doc.moveDown(0.3);
            });

            // Replacement items
            if (sale.replacement_items?.length > 0) {
                doc.moveDown(0.2);
                doc.fontSize(8).font('Helvetica-Bold').text('রিপ্লেসমেন্ট (ফেরত):');
                sale.replacement_items.forEach(item => {
                    yPos = doc.y;
                    doc.fontSize(8).font('Helvetica')
                       .text(`(-) ${item.product_name}`, 40, yPos, { width: 140 });
                    doc.text(`-৳${item.total}`, 185, yPos, { width: 58, align: 'right' });
                    doc.moveDown(0.3);
                });
            }

            doc.moveDown(0.2);
            doc.moveTo(40, doc.y).lineTo(243, doc.y).stroke();
            doc.moveDown(0.3);

            // ── Summary ──
            const addSummaryRow = (label, value, bold = false) => {
                yPos = doc.y;
                doc.fontSize(9)
                   .font(bold ? 'Helvetica-Bold' : 'Helvetica')
                   .text(label, 40, yPos, { width: 140 });
                doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
                   .text(value, 185, yPos, { width: 58, align: 'right' });
                doc.moveDown(0.3);
            };

            addSummaryRow('মোট',                    `৳${sale.total_amount.toLocaleString('bn-BD')}`);
            if (sale.discount_amount > 0) {
                addSummaryRow('ছাড় (ব্যালেন্স)',   `-৳${sale.discount_amount}`);
            }
            addSummaryRow('পরিশোধযোগ্য',            `৳${sale.net_amount.toLocaleString('bn-BD')}`, true);

            doc.moveDown(0.2);

            const paymentLabels = { cash: 'নগদ', credit: 'বাকি', replacement: 'রিপ্লেসমেন্ট' };
            addSummaryRow('পেমেন্ট পদ্ধতি', paymentLabels[sale.payment_method]);

            if (sale.cash_received > 0) {
                addSummaryRow('নগদ প্রাপ্ত', `৳${sale.cash_received}`);
            }
            if (sale.credit_used > 0) {
                addSummaryRow('বাকি দেওয়া হয়েছে', `৳${sale.credit_used}`);
            }
            if (sale.credit_balance_added > 0) {
                addSummaryRow('ক্রেডিট ব্যালেন্স যোগ', `৳${sale.credit_balance_added}`);
            }

            // OTP যাচাই
            doc.moveDown(0.3);
            doc.fontSize(8).font('Helvetica')
               .text(`OTP যাচাই: ${sale.otp_verified ? '✅ যাচাইকৃত' : '❌ অযাচাইকৃত'}`,
                     { align: 'center' });

            // Footer
            doc.moveDown(0.5);
            doc.moveTo(40, doc.y).lineTo(243, doc.y).dash(3).stroke();
            doc.undash();
            doc.moveDown(0.3);
            doc.fontSize(8).font('Helvetica')
               .text('আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ', { align: 'center' })
               .text('NovaTech BD (Ltd.)', { align: 'center' });

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
};

// ============================================================
// WhatsApp Invoice Message
// ============================================================

const getInvoiceWhatsAppMessage = (sale, customer, worker, items) => {
    const itemsList = items
        .map(i => `• ${i.product_name}: ${i.qty} × ৳${i.price} = ৳${i.qty * i.price}`)
        .join('\n');

    const replacementList = sale.replacement_items?.length > 0
        ? '\n↩️ *রিপ্লেসমেন্ট (ফেরত):*\n' +
          sale.replacement_items.map(i => `• ${i.product_name}: ${i.qty} পিস = -৳${i.total}`).join('\n')
        : '';

    const paymentLabels = { cash: 'নগদ', credit: 'বাকি', replacement: 'রিপ্লেসমেন্ট' };

    return `🧾 *NovaTech BD Invoice*
━━━━━━━━━━━━━━━━━━
📋 Invoice: *${sale.invoice_number}*
📅 তারিখ: ${new Date().toLocaleDateString('bn-BD')}
🏪 দোকান: *${customer.shop_name}*
👤 SR: ${worker.name_bn}
━━━━━━━━━━━━━━━━━━
${itemsList}${replacementList}
━━━━━━━━━━━━━━━━━━
💰 মোট: ৳${sale.total_amount}${sale.discount_amount > 0 ? `\n💳 ক্রেডিট ব্যালেন্স থেকে: -৳${sale.discount_amount}` : ''}${sale.replacement_value > 0 ? `\n↩️ রিপ্লেসমেন্ট: -৳${sale.replacement_value}` : ''}${sale.credit_balance_added > 0 ? `\n✅ ব্যালেন্সে জমা: +৳${sale.credit_balance_added}` : ''}
💳 পেমেন্ট: ${paymentLabels[sale.payment_method]}
✅ পরিশোধযোগ্য: *৳${sale.net_amount}*
━━━━━━━━━━━━━━━━━━
_NovaTech BD (Ltd.) | বরিশাল_`;
};

module.exports = {
    generateInvoiceNumber,
    sendInvoiceOTP,
    sendInvoiceNotification,
    generateInvoicePDF,
    getInvoiceWhatsAppMessage
};
