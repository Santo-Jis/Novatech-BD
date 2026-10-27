// backend/src/services/pendingOrderNotify.service.js
// ============================================================
// রিটেইলার শপের ই-কমার্স অর্ডার (customer_order_requests) →
// Admin ও Manager-কে Email + WhatsApp নোটিফিকেশন।
//
// দুটো ব্যবহার:
//   ১. notifyNewOrderRequest()      — নতুন অর্ডার আসার সাথে সাথে (শুধু দিনের বেলা)
//   ২. sendPendingDigestForTenant() — প্রতি ৪ ঘণ্টায় সব pending অর্ডারের রিমাইন্ডার
//
// নিয়ম:
//   • শুধু দিনের বেলা (সকাল ৮টা — রাত ১০টা, Asia/Dhaka) পাঠানো হয়।
//     রাতের অর্ডার পরদিন সকালের রিমাইন্ডারে যাবে।
//   • যে অর্ডার approve/reject হয়ে গেছে (status != 'pending') সেটা
//     আর রিমাইন্ডারে আসবে না — আলাদা কোনো কলাম/migration লাগে না।
//   • একজন প্রাপকের জন্য প্রতি রানে একটাই Email ও একটাই WhatsApp।
// ============================================================

const logger = require('../config/logger');
const { query } = require('../config/db');
const { sendEmail } = require('./email.service');
const { sendPortalWhatsAppMessage, isWhatsAppLikelyDown } = require('./portalWhatsapp.service');

const DAY_START_HOUR = 8;    // সকাল ৮টা (সহ)
const DAY_END_HOUR   = 22;   // রাত ১০টা (বাদে)

const WA_MAX_ORDERS       = 8;    // এক WhatsApp মেসেজে সর্বোচ্চ কয়টা অর্ডার দেখাবে
const WA_MAX_ITEMS        = 3;    // প্রতি অর্ডারে সর্বোচ্চ কয়টা পণ্য দেখাবে
const EMAIL_MAX_ORDERS    = 25;
const WA_GAP_MS           = 1500; // দুই WhatsApp মেসেজের মাঝে বিরতি

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── ঢাকার বর্তমান ঘণ্টা ───
const dhakaHour = () => {
    const h = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dhaka', hour: '2-digit', hour12: false,
    }).format(new Date());
    return parseInt(h, 10) % 24;
};

const isDaytimeInDhaka = () => {
    const h = dhakaHour();
    return h >= DAY_START_HOUR && h < DAY_END_HOUR;
};

// ─── ছোট হেল্পার ───
const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const bn = (n) => Number(n || 0).toLocaleString('bn-BD');
const taka = (n) => `৳${bn(Math.round(Number(n || 0)))}`;

const ageText = (createdAt) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    if (mins < 1)    return 'এইমাত্র';
    if (mins < 60)   return `${bn(mins)} মিনিট আগে`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)    return `${bn(hrs)} ঘণ্টা ${bn(mins % 60)} মিনিট আগে`;
    const days = Math.floor(hrs / 24);
    return `${bn(days)} দিন ${bn(hrs % 24)} ঘণ্টা আগে`;
};

const orderTotal = (items) =>
    (items || []).reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.qty || 0), 0);

// ============================================================
// DB
// ============================================================
const fetchOrders = async ({ tenantId, requestId = null }) => {
    const params = [tenantId];
    let where = `r.tenant_id = $1 AND r.status = 'pending'`;
    if (requestId) {
        params.push(requestId);
        where += ` AND r.id = $2`;
    }
    const { rows } = await query(
        `SELECT r.id, r.items, r.note, r.created_at, r.payment_method, r.payment_status,
                c.shop_name, c.owner_name, c.customer_code,
                COALESCE(NULLIF(c.whatsapp, ''), NULLIF(c.sms_phone, '')) AS customer_phone
         FROM customer_order_requests r
         JOIN customers c ON c.id = r.customer_id
         WHERE ${where}
         ORDER BY r.created_at ASC`,
        params
    );
    return rows;
};

// শুধু Admin ও Manager (active)
const fetchRecipients = async (tenantId) => {
    const { rows } = await query(
        `SELECT id, name_bn, role, email, phone
         FROM users
         WHERE tenant_id = $1
           AND role IN ('admin', 'manager')
           AND status = 'active'`,
        [tenantId]
    );
    return rows;
};

// ============================================================
// মেসেজ তৈরি
// ============================================================
const paymentLabel = (o) => {
    if (o.payment_method === 'bkash_manual')  return 'bKash (যাচাই বাকি)';
    if (o.payment_method === 'nagad_manual')  return 'Nagad (যাচাই বাকি)';
    return null;
};

const buildWhatsAppText = (orders, { mode }) => {
    const grand = orders.reduce((s, o) => s + orderTotal(o.items), 0);
    const head = mode === 'new'
        ? `🛒 *নতুন অর্ডার রিকোয়েস্ট*`
        : `⏰ *Pending অর্ডার রিমাইন্ডার*\n${bn(orders.length)}টি অর্ডার এখনো অপেক্ষায় আছে (মোট ${taka(grand)})`;

    const shown = orders.slice(0, WA_MAX_ORDERS);
    const blocks = shown.map((o, idx) => {
        const items = Array.isArray(o.items) ? o.items : [];
        const lines = items.slice(0, WA_MAX_ITEMS)
            .map(it => `   • ${it.product_name} × ${bn(it.qty)} — ${taka(Number(it.unit_price) * Number(it.qty))}`);
        if (items.length > WA_MAX_ITEMS) lines.push(`   • আরও ${bn(items.length - WA_MAX_ITEMS)}টি পণ্য…`);

        const pay = paymentLabel(o);
        return [
            `${bn(idx + 1)}) *${o.shop_name}* (${o.customer_code || '—'})`,
            `   👤 ${o.owner_name}${o.customer_phone ? ` | 📞 ${o.customer_phone}` : ''}`,
            `   🕐 ${ageText(o.created_at)}`,
            ...lines,
            `   💰 মোট: ${taka(orderTotal(items))}${pay ? ` | ${pay}` : ''}`,
            o.note ? `   📝 ${o.note}` : null,
        ].filter(Boolean).join('\n');
    });

    const more = orders.length > WA_MAX_ORDERS
        ? `\n… আরও ${bn(orders.length - WA_MAX_ORDERS)}টি অর্ডার আছে।` : '';

    return `${head}\n\n${blocks.join('\n\n')}${more}\n\n👉 অ্যাপ থেকে অর্ডারগুলো দেখে approve/reject করুন।\n— ZovoriX`;
};

const buildEmail = (orders, { mode, recipientName }) => {
    const grand = orders.reduce((s, o) => s + orderTotal(o.items), 0);
    const subject = mode === 'new'
        ? `🛒 নতুন অর্ডার: ${orders[0].shop_name} — ${taka(orderTotal(orders[0].items))}`
        : `⏰ ${bn(orders.length)}টি অর্ডার pending — ${taka(grand)} | ZovoriX`;

    const shown = orders.slice(0, EMAIL_MAX_ORDERS);
    const blocks = shown.map((o) => {
        const items = Array.isArray(o.items) ? o.items : [];
        const rows = items.map((it, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#333;">${esc(it.product_name)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;color:#555;">${bn(it.qty)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;color:#555;">${taka(it.unit_price)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:bold;color:#1a73e8;">${taka(Number(it.unit_price) * Number(it.qty))}</td>
            </tr>`).join('');
        const pay = paymentLabel(o);
        return `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr><td style="background:#fff7ed;padding:12px 14px;border-bottom:1px solid #fed7aa;">
            <strong style="font-size:14px;color:#9a3412;">${esc(o.shop_name)}</strong>
            <span style="font-size:12px;color:#777;"> (${esc(o.customer_code || '—')})</span><br>
            <span style="font-size:12px;color:#555;">👤 ${esc(o.owner_name)}${o.customer_phone ? ` &nbsp;|&nbsp; 📞 ${esc(o.customer_phone)}` : ''} &nbsp;|&nbsp; 🕐 ${esc(ageText(o.created_at))}</span>
          </td></tr>
          <tr><td>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:#f3f4f6;">
                <th style="padding:8px 12px;font-size:12px;text-align:left;color:#555;">পণ্য</th>
                <th style="padding:8px 12px;font-size:12px;color:#555;">পরিমাণ</th>
                <th style="padding:8px 12px;font-size:12px;color:#555;">দর</th>
                <th style="padding:8px 12px;font-size:12px;text-align:right;color:#555;">মোট</th>
              </tr>${rows}
            </table>
          </td></tr>
          <tr><td style="padding:10px 14px;text-align:right;font-size:14px;font-weight:bold;color:#111;">
            অর্ডার মোট: ${taka(orderTotal(items))}${pay ? ` <span style="font-size:12px;color:#b45309;">(${esc(pay)})</span>` : ''}
            ${o.note ? `<div style="font-size:12px;font-weight:normal;color:#666;margin-top:4px;text-align:left;">📝 ${esc(o.note)}</div>` : ''}
          </td></tr>
        </table>`;
    }).join('');

    const more = orders.length > EMAIL_MAX_ORDERS
        ? `<p style="font-size:13px;color:#b45309;">… আরও ${bn(orders.length - EMAIL_MAX_ORDERS)}টি অর্ডার আছে। অ্যাপে সব দেখুন।</p>` : '';

    const html = `<!DOCTYPE html>
<html lang="bn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 0;"><tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:96%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
  <tr><td style="background:linear-gradient(135deg,#e65100,#bf360c);padding:22px 28px;">
    <h1 style="color:#fff;margin:0;font-size:19px;">${mode === 'new' ? '🛒 নতুন অর্ডার রিকোয়েস্ট' : '⏰ Pending অর্ডার রিমাইন্ডার'}</h1>
    <p style="color:#ffccbc;margin:5px 0 0;font-size:12px;">ZovoriX — ই-কমার্স অর্ডার নোটিফিকেশন</p>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <p style="margin:0 0 6px;font-size:14px;color:#333;">প্রিয় <strong>${esc(recipientName || 'ম্যানেজার')}</strong>,</p>
    <p style="margin:0 0 18px;font-size:13px;color:#555;line-height:1.7;">
      ${mode === 'new'
        ? 'একজন রিটেইলার নতুন অর্ডার দিয়েছেন। বিবরণ নিচে দেওয়া হলো।'
        : `মোট <strong>${bn(orders.length)}টি</strong> অর্ডার এখনো pending আছে (সর্বমোট <strong>${taka(grand)}</strong>)। অনুগ্রহ করে দ্রুত approve/reject করুন।`}
    </p>
    ${blocks}${more}
    <p style="margin:18px 0 0;font-size:12px;color:#888;">অ্যাপ থেকে অর্ডারগুলো দেখে ব্যবস্থা নিন। ব্যবস্থা নেওয়া হলে অর্ডার আর রিমাইন্ডারে আসবে না।</p>
  </td></tr>
</table></td></tr></table></body></html>`;

    const text = orders.slice(0, EMAIL_MAX_ORDERS).map((o, i) =>
        `${i + 1}) ${o.shop_name} (${o.customer_code || '-'}) — ${taka(orderTotal(o.items))} — ${ageText(o.created_at)}`
    ).join('\n');

    return { subject, html, text };
};

// ============================================================
// পাঠানো — Admin + Manager সবাইকে
// ============================================================
const deliver = async ({ tenantId, orders, mode }) => {
    const recipients = await fetchRecipients(tenantId);
    if (!recipients.length) {
        logger.info(`[PendingOrderNotify] tenant ${tenantId}: কোনো active Admin/Manager নেই`);
        return { emails: 0, whatsapps: 0 };
    }

    const waText = buildWhatsAppText(orders, { mode });
    let emails = 0, whatsapps = 0;
    const seenEmail = new Set();
    const seenPhone = new Set();

    for (const u of recipients) {
        // ── Email ──
        const email = (u.email || '').trim().toLowerCase();
        if (email && !seenEmail.has(email)) {
            seenEmail.add(email);
            try {
                const { subject, html, text } = buildEmail(orders, { mode, recipientName: u.name_bn });
                const r = await sendEmail(email, subject, html, text, {
                    type: mode === 'new' ? 'customer_order_new' : 'customer_order_reminder',
                    tenant_id: tenantId,
                });
                if (r?.success) emails++;
                else logger.warn(`[PendingOrderNotify] Email ব্যর্থ/ব্লকড → ${email}: ${r?.error || r?.reason || ''}`);
            } catch (err) {
                logger.error(`[PendingOrderNotify] Email error → ${email}: ${err.message}`);
            }
        }

        // ── WhatsApp ──
        const phone = (u.phone || '').replace(/\D/g, '');
        if (phone && !seenPhone.has(phone)) {
            seenPhone.add(phone);
            if (isWhatsAppLikelyDown()) {
                logger.warn(`[PendingOrderNotify] WhatsApp গেটওয়ে সাময়িক বন্ধ — skip → ${phone}`);
                continue;
            }
            try {
                const r = await sendPortalWhatsAppMessage(phone, waText, 'customer_order_notify');
                if (r?.success) whatsapps++;
                else logger.warn(`[PendingOrderNotify] WhatsApp ব্যর্থ → ${phone}: ${r?.reason || ''}`);
            } catch (err) {
                logger.error(`[PendingOrderNotify] WhatsApp error → ${phone}: ${err.message}`);
            }
            await sleep(WA_GAP_MS);
        }
    }

    return { emails, whatsapps };
};

// ============================================================
// ১. প্রতি ৪ ঘণ্টার রিমাইন্ডার (একটা tenant-এর সব pending অর্ডার)
// ============================================================
const sendPendingDigestForTenant = async (tenantId, { force = false } = {}) => {
    if (!force && !isDaytimeInDhaka()) return { skipped: 'night' };

    const orders = await fetchOrders({ tenantId });
    if (!orders.length) return { skipped: 'no_pending' };

    const res = await deliver({ tenantId, orders, mode: 'reminder' });
    logger.info(`[PendingOrderNotify] tenant ${tenantId}: ${orders.length}টি pending → Email ${res.emails}, WhatsApp ${res.whatsapps}`);
    return { orders: orders.length, ...res };
};

// ============================================================
// ২. নতুন অর্ডার আসার সাথে সাথে (শুধু দিনের বেলা)
// রাতে এলে পরদিন সকালের রিমাইন্ডারেই যাবে।
// ============================================================
const notifyNewOrderRequest = async ({ tenantId, requestId }) => {
    if (!isDaytimeInDhaka()) {
        logger.info(`[PendingOrderNotify] রাতের অর্ডার ${requestId} — সকালের রিমাইন্ডারে যাবে`);
        return { skipped: 'night' };
    }
    const orders = await fetchOrders({ tenantId, requestId });
    if (!orders.length) return { skipped: 'not_pending' };

    return deliver({ tenantId, orders, mode: 'new' });
};

module.exports = {
    sendPendingDigestForTenant,
    notifyNewOrderRequest,
    isDaytimeInDhaka,
    // টেস্টের জন্য
    _internal: { buildWhatsAppText, buildEmail, ageText, orderTotal },
};
