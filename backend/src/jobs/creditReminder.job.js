// backend/src/jobs/creditReminder.job.js
// ============================================================
// স্মার্ট বাকি Reminder Job
// প্রতিদিন সকাল ১১:০০ (ঢাকা) তে চলে, কিন্তু প্রতিদিন সবাইকে পাঠায় না —
// নীতি (creditReminderPolicy.service.js):
//   • ইনভয়েস-ভিত্তিক বাকির বয়স ≥ ৭ দিন, বাকি ≥ ৳৫০০
//   • গত ৩ দিনে পেমেন্ট করলে বা snooze থাকলে বাদ
//   • ধাপ ১→২→৩ এর মাঝে ৭/৭ দিন বিরতি; ধাপ ৪–৫ শুধু SR/Manager-কে (১৪ দিন পরপর)
//   • চ্যানেল: WhatsApp আগে, না হলে Email; ধাপ ৩-এ দুটোই
// SR/Manager-কে কাস্টমার-প্রতি push নয়, একটাই সারাংশ push।
// ============================================================

const cron      = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { sendEmail }          = require('../services/email.service');
const { sendPushToMany }     = require('../services/fcm.service');
const { sendCustomerNotification } = require('../controllers/customerNotification.controller');
const { getPublicAppUrl } = require('../config/publicAppUrl');
const { sendPortalWhatsAppMessage, isWhatsAppLikelyDown } = require('../services/portalWhatsapp.service');
const { decideReminder, channelPlan, isSendWindow } = require('../services/creditReminderPolicy.service');

// ============================================================
// EMAIL TEMPLATE — কাস্টমারের বাকি reminder
// ============================================================
const buildReminderEmail = (customer, portalLink) => {
    const credit = parseFloat(customer.current_credit || 0).toLocaleString('bn-BD');
    const subject = `⚠️ বাকি পরিশোধের অনুরোধ — ${customer.shop_name} | ZovoriX`;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:30px 0;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#e53935,#b71c1c);padding:28px 35px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">ZovoriX</h1>
      <p style="color:#ffcdd2;margin:5px 0 0;font-size:12px;">বাকি পরিশোধের অনুরোধ</p>
    </td>
  </tr>

  <!-- Alert -->
  <tr>
    <td style="background:#fff3e0;border-bottom:2px solid #ffe0b2;padding:16px 35px;text-align:center;">
      <p style="color:#e65100;font-size:14px;font-weight:bold;margin:0;">
        ⚠️ আপনার দোকানে বাকি রয়েছে। অনুগ্রহ করে পরিশোধ করুন।
      </p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:30px 35px;">
      <p style="color:#333;font-size:15px;margin:0 0 6px;">প্রিয় <strong>${customer.owner_name}</strong>,</p>
      <p style="color:#555;font-size:13px;margin:0 0 25px;line-height:1.8;">
        আপনার <strong>${customer.shop_name}</strong> দোকানে বর্তমানে নিচের পরিমাণ বাকি রয়েছে।
        অনুগ্রহ করে দ্রুত পরিশোধ করুন, অন্যথায় পরবর্তী মাল সরবরাহে সমস্যা হতে পারে।
      </p>

      <!-- Credit Box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 25px;">
        <tr>
          <td style="background:linear-gradient(135deg,#fce4ec,#f8bbd0);border:2px solid #ef9a9a;border-radius:14px;padding:24px;text-align:center;">
            <p style="color:#c62828;font-size:12px;font-weight:bold;letter-spacing:1px;margin:0 0 8px;">বর্তমান বাকির পরিমাণ</p>
            <p style="color:#b71c1c;font-size:42px;font-weight:800;margin:0;font-family:'Courier New',monospace;">৳${credit}</p>
            <p style="color:#e57373;font-size:11px;margin:8px 0 0;">SR-এর কাছে বা সরাসরি অফিসে পরিশোধ করুন</p>
          </td>
        </tr>
      </table>

      <!-- Info -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f8f9fa;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
        <tr>
          <td style="padding:5px 0;color:#777;font-size:12.5px;">দোকানের নাম</td>
          <td style="padding:5px 0;color:#333;font-size:12.5px;font-weight:bold;text-align:right;">${customer.shop_name}</td>
        </tr>
        <tr><td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:4px 0;"></div></td></tr>
        <tr>
          <td style="padding:5px 0;color:#777;font-size:12.5px;">কাস্টমার কোড</td>
          <td style="padding:5px 0;color:#333;font-size:12.5px;font-weight:bold;text-align:right;">${customer.customer_code}</td>
        </tr>
        <tr><td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:4px 0;"></div></td></tr>
        <tr>
          <td style="padding:5px 0;color:#777;font-size:12.5px;">আপনার SR</td>
          <td style="padding:5px 0;color:#333;font-size:12.5px;font-weight:bold;text-align:right;">${customer.sr_name || 'N/A'}</td>
        </tr>
      </table>

      <!-- Portal Link -->
      ${portalLink ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
        <tr>
          <td style="text-align:center;">
            <a href="${portalLink}"
               style="display:inline-block;background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;
                      font-size:14px;font-weight:bold;padding:14px 30px;border-radius:25px;
                      text-decoration:none;">
              📊 আপনার পোর্টালে দেখুন
            </a>
            <p style="color:#aaa;font-size:11px;margin:8px 0 0;">বিস্তারিত invoice ও payment history দেখতে ক্লিক করুন</p>
          </td>
        </tr>
      </table>` : ''}

      <!-- Warning -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#fff8e1;border-left:4px solid #ffc107;padding:12px 16px;border-radius:0 8px 8px 0;">
            <p style="color:#f57f17;font-size:12px;font-weight:bold;margin:0 0 4px;">📌 মনে রাখবেন</p>
            <p style="color:#6d4c41;font-size:12px;margin:0;line-height:1.7;">
              বাকি পরিশোধ না হলে পরবর্তী অর্ডারে মাল সরবরাহ বন্ধ থাকবে।
              সমস্যায় আপনার SR-এর সাথে যোগাযোগ করুন।
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f8f9fa;padding:14px 35px;text-align:center;border-top:1px solid #e0e0e0;">
      <p style="color:#999;font-size:11px;margin:0;">ZovoriX (Ltd.) | inf.novatechbd@gmail.com | বরিশাল সদর – ১২০০</p>
      <p style="color:#bbb;font-size:10px;margin:4px 0 0;">এই Email স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে।</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `ZovoriX — বাকি Reminder\nদোকান: ${customer.shop_name}\nবর্তমান বাকি: ৳${credit}\nঅনুগ্রহ করে দ্রুত পরিশোধ করুন।`;
    return { subject, html, text };
};

// ============================================================
// WhatsApp / In-app টেক্সট — ধাপ অনুযায়ী সুর
// ============================================================
const bn = (n) => parseFloat(n || 0).toLocaleString('bn-BD');

const buildWhatsAppMessage = (c, stage, days, portalLink) => {
    const amount = bn(c.current_credit);
    const link = portalLink ? `\n\n🔗 বিস্তারিত দেখুন: ${portalLink}` : '';
    if (stage === 1) {
        return `আসসালামু আলাইকুম ${c.owner_name || ''},\n` +
            `${c.shop_name}-এর ৳${amount} বাকি আছে (সবচেয়ে পুরনো ইনভয়েস ${bn(days)} দিনের)। ` +
            `সুবিধামতো সময়ে পরিশোধ করলে কৃতজ্ঞ থাকব। কবে দিতে পারবেন তা পোর্টালের ক্রেডিট ট্যাবে "পরে পরিশোধ করব" থেকে জানালে ততদিন আর মনে করাব না।${link}\n\n— ZovoriX`;
    }
    if (stage === 2) {
        return `আসসালামু আলাইকুম ${c.owner_name || ''},\n` +
            `আগের অনুরোধের পরও ${c.shop_name}-এর ৳${amount} বাকি রয়ে গেছে (${bn(days)} দিন)। ` +
            `অনুগ্রহ করে এই সপ্তাহের মধ্যে পরিশোধ করুন, বা পোর্টালের ক্রেডিট ট্যাবে "পরে পরিশোধ করব" থেকে তারিখ জানান।${link}\n\n— ZovoriX`;
    }
    return `${c.owner_name || 'সম্মানিত গ্রাহক'},\n` +
        `${c.shop_name}-এর ৳${amount} বাকি ${bn(days)} দিন ধরে অপরিশোধিত। ` +
        `আমাদের প্রতিনিধি শীঘ্রই যোগাযোগ করবেন — তার আগে পরিশোধ করলে ভালো হয়।${link}\n\n— ZovoriX`;
};

const buildInAppBody = (c, stage) => {
    const amount = bn(c.current_credit);
    if (stage === 1) return `আপনার ${c.shop_name} দোকানে ৳${amount} বাকি আছে। সুবিধামতো সময়ে পরিশোধ করুন।`;
    if (stage === 2) return `আপনার ${c.shop_name} দোকানের ৳${amount} বাকি এখনো অপরিশোধিত। এই সপ্তাহে পরিশোধ করুন।`;
    return `আপনার ${c.shop_name} দোকানের ৳${amount} বাকি অনেক দিনের। প্রতিনিধি শীঘ্রই যোগাযোগ করবেন।`;
};

// ============================================================
// কাস্টমারের সব তথ্য — ইনভয়েস-ভিত্তিক বাকি + বয়স + শেষ পেমেন্ট/রিমাইন্ডার + snooze
//
// "সবচেয়ে পুরনো অপরিশোধিত ইনভয়েস": ইনভয়েসের বাকি = credit_used − SUM(payment_allocations)।
// ব্যাকফিল না চালানো থাকলে পুরনো শোধ-হওয়া ইনভয়েসও "বাকি" দেখাত — তাই নতুন ইনভয়েস থেকে
// পেছনের দিকে জমিয়ে customers.current_credit পর্যন্ত যে ইনভয়েসগুলো লাগে শুধু সেগুলো ধরা হয়
// (FIFO-সামঞ্জস্যপূর্ণ)। এতে ব্যাকফিল ছাড়াও বয়স/পরিমাণ অতিরিক্ত বাড়ে না।
// ============================================================
const CANDIDATES_SQL = `
    WITH inv AS (
        SELECT st.id, st.customer_id, st.tenant_id, st.created_at,
               st.credit_used - COALESCE(pa.allocated, 0) AS remaining
        FROM sales_transactions st
        LEFT JOIN (
            SELECT sale_id, SUM(amount) AS allocated
            FROM payment_allocations GROUP BY sale_id
        ) pa ON pa.sale_id = st.id
        WHERE st.payment_method = 'credit'
          AND st.credit_used > 0
          AND st.credit_used - COALESCE(pa.allocated, 0) > 0
    ),
    cov AS (
        SELECT i.*, c.current_credit,
               SUM(i.remaining) OVER (PARTITION BY i.customer_id
                                      ORDER BY i.created_at DESC, i.id DESC) - i.remaining AS newer_sum
        FROM inv i
        JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
        WHERE c.is_active = true AND c.current_credit > 0
    ),
    inv_due AS (
        SELECT customer_id,
               LEAST(SUM(remaining), MAX(current_credit)) AS inv_amount,
               MIN(created_at)                            AS oldest_invoice_at
        FROM cov
        WHERE newer_sum < current_credit
        GROUP BY customer_id
    ),
    -- বাকি = ইনভয়েস-ভিত্তিক অংশ + (ইনভয়েসে ব্যাখ্যা-না-হওয়া অংশ = শুরুর/ম্যানুয়াল ব্যালেন্স)।
    -- শুরুর ব্যালেন্সের বয়স অজানা, তাই কাস্টমারের রেকর্ড তৈরির তারিখ ধরা হয় (যেন এমন কাস্টমার
    -- কখনোই রিমাইন্ডার-বহির্ভূত না থাকে — প্রোডাকশন ডেটায় এমন কাস্টমারই বেশি ছিল)।
    due AS (
        SELECT c.id AS customer_id,
               c.current_credit AS amount_due,
               CASE WHEN COALESCE(i.inv_amount, 0) < c.current_credit
                    THEN LEAST(COALESCE(i.oldest_invoice_at, c.created_at), c.created_at)
                    ELSE i.oldest_invoice_at
               END AS oldest_invoice_at
        FROM customers c
        LEFT JOIN inv_due i ON i.customer_id = c.id
        WHERE c.is_active = true AND c.current_credit > 0
    )
    SELECT
        c.id, c.tenant_id, c.shop_name, c.owner_name, c.customer_code,
        c.email, c.whatsapp, c.current_credit,
        d.amount_due, d.oldest_invoice_at,
        lp.last_payment_at,
        lr.last_reminder_at,
        COALESCE(cyc.cnt, 0)::int AS reminders_in_cycle,
        sn.snoozed_until,
        u.id AS sr_id, u.name_bn AS sr_name, u.manager_id,
        cpt.redirect_id AS portal_redirect_id
    FROM due d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN LATERAL (
        SELECT MAX(t) AS last_payment_at FROM (
            SELECT cp.created_at AS t FROM credit_payments cp WHERE cp.customer_id = c.id
            UNION ALL
            SELECT COALESCE(col.verified_at, col.created_at)
            FROM collections col WHERE col.customer_id = c.id AND col.status = 'verified'
        ) p
    ) lp ON true
    LEFT JOIN LATERAL (
        SELECT MAX(l.sent_at) AS last_reminder_at
        FROM credit_reminder_logs l WHERE l.customer_id = c.id
    ) lr ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM credit_reminder_logs l
        WHERE l.customer_id = c.id
          AND (lp.last_payment_at IS NULL OR l.sent_at > lp.last_payment_at)
    ) cyc ON true
    LEFT JOIN LATERAL (
        SELECT MAX(s.snoozed_until) AS snoozed_until
        FROM credit_reminder_snoozes s
        WHERE s.customer_id = c.id AND s.snoozed_until >= CURRENT_DATE
    ) sn ON true
    LEFT JOIN LATERAL (
        SELECT ca.worker_id FROM customer_assignments ca
        WHERE ca.customer_id = c.id AND ca.is_active = true LIMIT 1
    ) assign ON true
    LEFT JOIN users u ON u.id = assign.worker_id
    LEFT JOIN LATERAL (
        SELECT t.redirect_id FROM customer_portal_tokens t
        WHERE t.customer_id = c.id AND t.expires_at > NOW()
        ORDER BY t.expires_at DESC LIMIT 1
    ) cpt ON true
    ORDER BY c.current_credit DESC
`;

const DAY_MS = 86400000;
// ক্যালেন্ডার-দিন (ঢাকা) হিসাবে ব্যবধান। ২৪-ঘণ্টার টুকরো গুনলে এক রান ও পরের রানের মধ্যে
// কয়েক সেকেন্ডের পার্থক্যে "৭ দিন" আসলে ৬ দিন ২৩:৫৯ হয়ে যেত, আর রিমাইন্ডার একদিন পিছিয়ে যেত।
const dhakaDay = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(d));
const daysSince = (ts, now) => {
    if (!ts) return null;
    return Math.round((Date.parse(`${dhakaDay(now)}T00:00:00Z`) - Date.parse(`${dhakaDay(ts)}T00:00:00Z`)) / DAY_MS);
};

// ============================================================
// MAIN JOB
// ============================================================
let running = false;

const runCreditReminderJob = async ({ force = false } = {}) => {
    if (running) { logger.warn('💳 Credit Reminder Job আগের রান এখনো চলছে — বাদ।'); return; }
    if (!force && !isSendWindow()) {
        logger.info('💳 Credit Reminder: এখন পাঠানোর সময় নয় (সময়-জানালা/ছুটির দিন) — বাদ।');
        return;
    }
    running = true;
    logger.info('\n💳 Smart Credit Reminder Job শুরু...');

    try {
        const { rows: customers } = await query(CANDIDATES_SQL);
        logger.info(`📋 ${customers.length} জন কাস্টমারের ইনভয়েস-ভিত্তিক বাকি আছে`);

        const now = Date.now();
        const FRONTEND_URL = getPublicAppUrl();
        const skipped = {};
        const stats = { whatsapp: 0, email: 0, inApp: 0, staffOnly: 0 };
        const srDigest = new Map();       // srId -> { reminded: [], visit: [] }
        const mgrDigest = new Map();      // managerId -> { reminded: n, visit: [] }

        for (const c of customers) {
            const amountDue   = parseFloat(c.amount_due || 0);
            const oldestDays  = daysSince(c.oldest_invoice_at, now);

            const decision = decideReminder({
                amountDue,
                oldestDueDays:        oldestDays ?? 0,
                daysSinceLastPayment: daysSince(c.last_payment_at, now),
                remindersInCycle:     c.reminders_in_cycle,
                daysSinceLastReminder: daysSince(c.last_reminder_at, now),
                snoozedUntil:         c.snoozed_until,
                now: new Date(now),
            });

            if (!decision.send) { skipped[decision.reason] = (skipped[decision.reason] || 0) + 1; continue; }

            const { stage, audience } = decision;

            // ── ডাবল-সেন্ড রক্ষা: আগে "claim" লগ বসাও (একই কাস্টমারে ২০ ঘণ্টার মধ্যে অটো-লগ থাকলে বাদ) ──
            let claimId = null;
            try {
                const claim = await query(
                    `INSERT INTO credit_reminder_logs
                        (customer_id, sr_id, method, sent_at, tenant_id, stage, channel, amount_due, oldest_due_days, source)
                     SELECT $1, $2, 'pending', NOW(), $3, $4, 'pending', $5, $6, 'auto'
                     WHERE NOT EXISTS (
                        SELECT 1 FROM credit_reminder_logs
                        WHERE customer_id = $1 AND sent_at > NOW() - INTERVAL '20 hours'
                     )
                     RETURNING id`,
                    [c.id, c.sr_id || null, c.tenant_id, stage, amountDue, oldestDays]
                );
                if (!claim.rows.length) { skipped.already_sent_today = (skipped.already_sent_today || 0) + 1; continue; }
                claimId = claim.rows[0].id;
            } catch (e) {
                logger.error(`❌ Reminder claim fail (${c.shop_name}):`, e.message);
                continue;
            }

            const delivered = [];

            if (audience === 'customer') {
                const portalLink = c.portal_redirect_id
                    ? `${FRONTEND_URL}/customer/portal?r=${c.portal_redirect_id}` : null;
                const plan = channelPlan(stage);

                for (const ch of plan.order) {
                    if (plan.mode === 'first' && delivered.length) break;
                    try {
                        if (ch === 'whatsapp' && c.whatsapp && !isWhatsAppLikelyDown()) {
                            const r = await sendPortalWhatsAppMessage(
                                c.whatsapp, buildWhatsAppMessage(c, stage, oldestDays, portalLink), 'credit_reminder');
                            if (r && r.success) { delivered.push('whatsapp'); stats.whatsapp++; }
                        } else if (ch === 'email' && c.email) {
                            const { subject, html, text } = buildReminderEmail(c, portalLink);
                            const r = await sendEmail(c.email, subject, html, text,
                                { type: 'credit_reminder', tenant_id: c.tenant_id });
                            if (r && r.success) { delivered.push('email'); stats.email++; }
                        }
                    } catch (e) {
                        logger.error(`❌ ${ch} fail (${c.shop_name}):`, e.message);
                    }
                }

                // In-app: ধাপ ২–৩-এ সবসময়; ধাপ ১-এ শুধু যদি অন্য কোনো চ্যানেলে পৌঁছানো না যায়
                if (plan.inApp || !delivered.length) {
                    try {
                        await sendCustomerNotification(c.id, {
                            title: stage === 1 ? '💳 বাকির স্মরণ' : '⚠️ বাকি পরিশোধের অনুরোধ',
                            body:  buildInAppBody(c, stage),
                            type:  'credit_reminder',
                        });
                        delivered.push('inapp'); stats.inApp++;
                    } catch (e) {
                        logger.error(`❌ In-app fail (${c.shop_name}):`, e.message);
                    }
                }
            } else {
                delivered.push('staff'); stats.staffOnly++;
            }

            // ── কোনো চ্যানেলে পৌঁছাতে না পারলে claim তুলে নাও, কাল আবার চেষ্টা হবে ──
            if (!delivered.length) {
                await query('DELETE FROM credit_reminder_logs WHERE id = $1', [claimId]).catch(() => {});
                skipped.undeliverable = (skipped.undeliverable || 0) + 1;
                continue;
            }
            const channel = delivered.filter(d => d !== 'inapp').join('+') || delivered.join('+');
            await query(
                `UPDATE credit_reminder_logs SET method = $2, channel = $2 WHERE id = $1`,
                [claimId, channel]
            ).catch(() => {});

            // ── SR/Manager সারাংশের জন্য জমা ──
            const entry = { name: c.shop_name, credit: c.current_credit };
            const needsVisit = stage >= 3;
            if (c.sr_id) {
                const d = srDigest.get(c.sr_id) || { reminded: [], visit: [] };
                (needsVisit ? d.visit : d.reminded).push(entry);
                srDigest.set(c.sr_id, d);
            }
            if (c.manager_id) {
                const d = mgrDigest.get(c.manager_id) || { reminded: 0, visit: [] };
                if (needsVisit) d.visit.push(entry); else d.reminded++;
                mgrDigest.set(c.manager_id, d);
            }
        }

        // ── SR/Manager-কে একটাই সারাংশ push (কাস্টমার-প্রতি নয়) ──
        const top = (list) => list.slice(0, 3).map(e => `${e.name} (৳${bn(e.credit)})`).join(', ')
            + (list.length > 3 ? ` +${list.length - 3}` : '');

        for (const [srId, d] of srDigest) {
            try {
                const parts = [];
                if (d.visit.length)    parts.push(`সরাসরি আদায়ে যান: ${top(d.visit)}`);
                if (d.reminded.length) parts.push(`${d.reminded.length} জনকে রিমাইন্ডার গেছে`);
                await sendPushToMany([srId], {
                    title: '💳 আজকের বাকি আদায়',
                    body:  parts.join(' • '),
                    type:  'credit_reminder',
                    data:  { kind: 'credit_digest' },
                });
            } catch (e) { logger.error('❌ SR digest push fail:', e.message); }
        }
        for (const [mgrId, d] of mgrDigest) {
            try {
                const parts = [];
                if (d.visit.length) parts.push(`${d.visit.length} জনের কাছে সরাসরি আদায় দরকার: ${top(d.visit)}`);
                if (d.reminded)     parts.push(`${d.reminded} জনকে রিমাইন্ডার গেছে`);
                await sendPushToMany([mgrId], {
                    title: '💳 বাকি রিমাইন্ডার সারাংশ',
                    body:  parts.join(' • '),
                    type:  'credit_reminder',
                    data:  { kind: 'credit_digest' },
                });
            } catch (e) { logger.error('❌ Manager digest push fail:', e.message); }
        }

        logger.info(`✅ Credit Reminder সম্পন্ন — WhatsApp: ${stats.whatsapp}, Email: ${stats.email}, ` +
                    `In-app: ${stats.inApp}, শুধু-স্টাফ: ${stats.staffOnly} | বাদ: ${JSON.stringify(skipped)}`);
    } catch (error) {
        logger.error('❌ Credit Reminder Job Error:', error.message);
    } finally {
        running = false;
    }
};

// ============================================================
// SCHEDULE — প্রতিদিন সকাল ১১:০০ (ঢাকার সময়)
// ⚠️ আগের কোডে কমেন্টে "রাত ১০টা" লেখা ছিল, কিন্তু `'0 16 * * *'` + timezone: 'Asia/Dhaka'
//    মানে ঢাকার সময় বিকেল ৪টা — এজন্যই Email বিকেল ৪টায় যাচ্ছিল। cron-এর timezone দেওয়া
//    থাকলে সংখ্যাটা ওই timezone-এরই ঘণ্টা, UTC নয়।
// ============================================================
const scheduleCreditReminderJob = () => {
    cron.schedule('0 11 * * *', () => runCreditReminderJob(), { timezone: 'Asia/Dhaka' });
    logger.info('⏰ Smart Credit Reminder Job: প্রতিদিন সকাল ১১:০০ (ঢাকা) — যোগ্য কাস্টমারদের জন্য');
};

module.exports = { scheduleCreditReminderJob, runCreditReminderJob };
