// backend/src/controllers/creditReminder.controller.js
// ============================================================
// SR ম্যানুয়ালি একজন কাস্টমারকে বাকি reminder পাঠাবে
// POST /api/portal/send-reminder/:customerId
// ============================================================

const { query }      = require('../config/db');
const { sendEmail }  = require('../services/email.service');
const { sendPushToMany } = require('../services/fcm.service');
const { sendCustomerNotification } = require('./customerNotification.controller');

const sendCreditReminder = async (req, res) => {
    try {
        const { customerId } = req.params;
        const srId = req.user.id; // auth middleware থেকে

        // কাস্টমার তথ্য
        const { rows } = await query(`
            SELECT
                c.id, c.shop_name, c.owner_name, c.customer_code,
                c.email, c.current_credit, c.whatsapp,
                u.name_bn  AS sr_name,
                u.manager_id,
                cpt.token  AS portal_token
            FROM customers c
            LEFT JOIN users u ON u.id = $2
            LEFT JOIN customer_portal_tokens cpt ON c.id = cpt.customer_id
                AND cpt.expires_at > NOW()
            WHERE c.id = $1 AND c.is_active = true
        `, [customerId, srId]);

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        const customer = rows[0];

        if (!customer.current_credit || parseFloat(customer.current_credit) <= 0) {
            return res.status(400).json({ success: false, message: 'এই কাস্টমারের কোনো বাকি নেই।' });
        }

        if (!customer.email) {
            return res.status(400).json({ success: false, message: 'কাস্টমারের email নেই।' });
        }

        const FRONTEND_URL = process.env.FRONTEND_URL || 'https://novatech-bd-kqrn.vercel.app';
        const portalLink   = customer.portal_token
            ? `${FRONTEND_URL}/customer-portal?token=${customer.portal_token}`
            : null;

        const credit = parseFloat(customer.current_credit).toLocaleString('bn-BD');

        // ── Email ────────────────────────────────────────────
        const subject = `⚠️ বাকি পরিশোধের অনুরোধ — ${customer.shop_name} | NovaTech BD`;

        const html = `<!DOCTYPE html>
<html lang="bn">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:30px 0;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
  <tr>
    <td style="background:linear-gradient(135deg,#e53935,#b71c1c);padding:28px 35px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">NovaTech BD</h1>
      <p style="color:#ffcdd2;margin:5px 0 0;font-size:12px;">বাকি পরিশোধের অনুরোধ</p>
    </td>
  </tr>
  <tr>
    <td style="padding:30px 35px;">
      <p style="color:#333;font-size:15px;margin:0 0 6px;">প্রিয় <strong>${customer.owner_name}</strong>,</p>
      <p style="color:#555;font-size:13px;margin:0 0 22px;line-height:1.8;">
        আপনার <strong>${customer.shop_name}</strong> দোকানে নিচের পরিমাণ বাকি রয়েছে।
        অনুগ্রহ করে দ্রুত পরিশোধ করুন।
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
        <tr>
          <td style="background:#fce4ec;border:2px solid #ef9a9a;border-radius:14px;padding:22px;text-align:center;">
            <p style="color:#c62828;font-size:12px;font-weight:bold;margin:0 0 8px;">বর্তমান বাকির পরিমাণ</p>
            <p style="color:#b71c1c;font-size:42px;font-weight:800;margin:0;font-family:'Courier New',monospace;">৳${credit}</p>
          </td>
        </tr>
      </table>
      ${portalLink ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr>
          <td style="text-align:center;">
            <a href="${portalLink}"
               style="display:inline-block;background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;
                      font-size:14px;font-weight:bold;padding:14px 30px;border-radius:25px;text-decoration:none;">
              📊 আপনার পোর্টালে দেখুন
            </a>
          </td>
        </tr>
      </table>` : ''}
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#fff8e1;border-left:4px solid #ffc107;padding:12px 16px;border-radius:0 8px 8px 0;">
            <p style="color:#6d4c41;font-size:12px;margin:0;line-height:1.7;">
              SR: <strong>${customer.sr_name || 'N/A'}</strong> আপনার কাছে শীঘ্রই আসবেন।
              সমস্যায় তার সাথে যোগাযোগ করুন।
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background:#f8f9fa;padding:14px 35px;text-align:center;border-top:1px solid #e0e0e0;">
      <p style="color:#999;font-size:11px;margin:0;">NovaTech BD (Ltd.) | inf.novatechbd@gmail.com</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

        const emailResult = await sendEmail(
            customer.email, subject, html,
            `NovaTech BD — বাকি Reminder\nদোকান: ${customer.shop_name}\nবাকি: ৳${credit}`
        );

        // ── Push to SR's Manager ─────────────────────────────
        if (customer.manager_id) {
            await sendPushToMany([customer.manager_id], {
                title: `💳 Reminder পাঠানো — ${customer.shop_name}`,
                body:  `${req.user.name_bn || 'SR'} ${customer.owner_name}-কে বাকি reminder পাঠিয়েছে। বাকি: ৳${credit}`,
                type:  'credit_reminder_sent',
                data:  {
                    customer_id:   String(customer.id),
                    credit_amount: String(customer.current_credit),
                }
            }).catch(() => {}); // push fail হলেও response দাও
        }

        // ── In-App Notification to Customer ──────────────────
        await sendCustomerNotification(customer.id, {
            title: `⚠️ বাকি পরিশোধের অনুরোধ`,
            body:  `আপনার ${customer.shop_name} দোকানে ৳${credit} বাকি রয়েছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন।`,
            type:  'credit_reminder',
        }).catch(() => {});

        // ── Log reminder ─────────────────────────────────────
        await query(`
            INSERT INTO credit_reminder_logs (customer_id, sr_id, method, sent_at)
            VALUES ($1, $2, 'email', NOW())
            ON CONFLICT DO NOTHING
        `, [customer.id, srId]).catch(() => {}); // table না থাকলে skip

        return res.json({
            success: true,
            message: `✅ ${customer.owner_name}-কে Email reminder পাঠানো হয়েছে।`,
            data: {
                email_sent: emailResult.success,
                customer:   customer.shop_name,
                credit:     customer.current_credit,
            }
        });

    } catch (error) {
        console.error('❌ Credit Reminder Error:', error.message);
        return res.status(500).json({ success: false, message: 'Reminder পাঠাতে সমস্যা হয়েছে।' });
    }
};

module.exports = { sendCreditReminder };
