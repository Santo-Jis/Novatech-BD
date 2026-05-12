// backend/src/jobs/creditReminder.job.js
// ============================================================
// বাকি Reminder Job
// প্রতিদিন রাত ১০:০০ তে auto চলবে
// → কাস্টমারকে Email
// → SR ও Manager কে App Notification (FCM + Realtime DB)
// ============================================================

const cron      = require('node-cron');
const { query } = require('../config/db');
const { sendEmail }          = require('../services/email.service');
const { sendPushToMany }     = require('../services/fcm.service');
const { sendCustomerNotification } = require('../controllers/customerNotification.controller');

// ============================================================
// EMAIL TEMPLATE — কাস্টমারের বাকি reminder
// ============================================================
const buildReminderEmail = (customer, portalLink) => {
    const credit = parseFloat(customer.current_credit || 0).toLocaleString('bn-BD');
    const subject = `⚠️ বাকি পরিশোধের অনুরোধ — ${customer.shop_name} | NovaTech BD`;

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
      <h1 style="color:#fff;margin:0;font-size:22px;">NovaTech BD</h1>
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
      <p style="color:#999;font-size:11px;margin:0;">NovaTech BD (Ltd.) | inf.novatechbd@gmail.com | বরিশাল সদর – ১২০০</p>
      <p style="color:#bbb;font-size:10px;margin:4px 0 0;">এই Email স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে।</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `NovaTech BD — বাকি Reminder\nদোকান: ${customer.shop_name}\nবর্তমান বাকি: ৳${credit}\nঅনুগ্রহ করে দ্রুত পরিশোধ করুন।`;
    return { subject, html, text };
};

// ============================================================
// MAIN JOB — বাকি আছে এমন কাস্টমারদের reminder পাঠাও
// ============================================================
const runCreditReminderJob = async () => {
    console.log('\n💳 Credit Reminder Job শুরু...');

    try {
        // বাকি আছে এমন সব active কাস্টমার
        const { rows: customers } = await query(`
            SELECT
                c.id, c.shop_name, c.owner_name, c.customer_code,
                c.email, c.current_credit, c.credit_limit,
                u.name_bn  AS sr_name,
                u.id       AS sr_id,
                u.manager_id,
                cpt.token  AS portal_token
            FROM customers c
            LEFT JOIN users u ON c.assigned_sr_id = u.id
            LEFT JOIN customer_portal_tokens cpt ON c.id = cpt.customer_id
                AND cpt.expires_at > NOW()
            WHERE c.is_active = true
              AND c.current_credit > 0
              AND c.email IS NOT NULL
              AND c.email != ''
            ORDER BY c.current_credit DESC
        `);

        console.log(`📋 ${customers.length} জন কাস্টমারের বাকি আছে`);

        const FRONTEND_URL = process.env.FRONTEND_URL || 'https://novatech-bd-kqrn.vercel.app';
        let emailSent = 0, pushSent = 0;

        for (const customer of customers) {
            const credit = parseFloat(customer.current_credit || 0).toLocaleString('bn-BD');

            // ── Email to Customer ────────────────────────────
            try {
                const portalLink = customer.portal_token
                    ? `${FRONTEND_URL}/customer/dashboard?token=${customer.portal_token}`
                    : null;

                const { subject, html, text } = buildReminderEmail(customer, portalLink);
                const result = await sendEmail(customer.email, subject, html, text);
                if (result.success) emailSent++;
            } catch (e) {
                console.error(`❌ Email fail (${customer.shop_name}):`, e.message);
            }

            // ── Push Notification to SR & Manager ───────────
            try {
                const userIds = [customer.sr_id, customer.manager_id].filter(Boolean);

                if (userIds.length) {
                    await sendPushToMany(userIds, {
                        title: `💳 বাকি Reminder — ${customer.shop_name}`,
                        body:  `${customer.owner_name}-এর বাকি: ৳${credit} — আজ collect করুন।`,
                        type:  'credit_reminder',
                        data:  {
                            customer_id:   String(customer.id),
                            customer_code: customer.customer_code,
                            credit_amount: String(customer.current_credit),
                        }
                    });
                    pushSent++;
                }
            } catch (e) {
                console.error(`❌ Push fail (${customer.shop_name}):`, e.message);
            }

            // ── In-App Notification to Customer ─────────────────
            try {
                await sendCustomerNotification(customer.id, {
                    title: `⚠️ বাকি পরিশোধের অনুরোধ`,
                    body:  `আপনার ${customer.shop_name} দোকানে ৳${credit} বাকি রয়েছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন।`,
                    type:  'credit_reminder',
                });
            } catch (e) {
                console.error(`❌ In-app notification fail (${customer.shop_name}):`, e.message);
            }
        }

        console.log(`✅ Credit Reminder সম্পন্ন — Email: ${emailSent}, Push: ${pushSent}`);

    } catch (error) {
        console.error('❌ Credit Reminder Job Error:', error.message);
    }
};

// ============================================================
// SCHEDULE — প্রতিদিন রাত ১০:০০ (BD time)
// ============================================================
const scheduleCreditReminderJob = () => {
    // রাত ১০:০০ — Asia/Dhaka = UTC+6, তাই UTC ১৬:০০
    cron.schedule('0 16 * * *', runCreditReminderJob, {
        timezone: 'Asia/Dhaka'
    });
    console.log('⏰ Credit Reminder Job: প্রতিদিন রাত ১০:০০ তে চলবে');
};

module.exports = { scheduleCreditReminderJob, runCreditReminderJob };
