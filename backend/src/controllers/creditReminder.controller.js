const logger = require('../config/logger');
// backend/src/controllers/creditReminder.controller.js
// ============================================================
// SR ম্যানুয়ালি একজন কাস্টমারকে বাকি reminder পাঠাবে
// POST /api/portal/send-reminder/:customerId
// ✅ Throttle: প্রতিদিন একই customer-কে সর্বোচ্চ ১ বার
// ============================================================

const { query }      = require('../config/db');
const { sendEmail }  = require('../services/email.service');
const { sendPushToMany } = require('../services/fcm.service');
const { sendCustomerNotification } = require('./customerNotification.controller');
const { getPublicAppUrl } = require('../config/publicAppUrl');
const { notificationQueue, isQueueAvailable } = require('../config/queue');

const sendCreditReminder = async (req, res) => {
    try {
        const { customerId } = req.params;
        const srId = req.user.id; // auth middleware থেকে

        // ✅ Throttle Check — আজকে কি এই customer-কে reminder পাঠানো হয়েছে?
        const { rows: throttleRows } = await query(`
            SELECT id FROM credit_reminder_logs
            WHERE customer_id = $1
              AND sent_at::date = CURRENT_DATE
             AND tenant_id = $2
             LIMIT 1
        `, [customerId,
                req.tenantId]);

        if (throttleRows.length > 0) {
            return res.status(429).json({
                success: false,
                message: '⚠️ আজকে এই কাস্টমারকে ইতিমধ্যে reminder পাঠানো হয়েছে। আগামীকাল আবার চেষ্টা করুন।'
            });
        }

        // ✅ tenant_id চেক যোগ করা হলো — আগে শুধু c.id দিয়ে লুকআপ হতো, মানে অন্য
        // tenant-এর customerId আন্দাজ/জানা থাকলেও তাদের বাকি/email/হোয়াটসঅ্যাপ আর
        // পোর্টাল-রিডাইরেক্ট আইডি পড়া (এবং তাদের নামে reminder ইমেইল পাঠানো) সম্ভব ছিল।
        //
        // এছাড়া আগে `LEFT JOIN users u ON u.id = $2 (srId)` ছিল — মানে sr_name/
        // manager_id সবসময় *কলকারীর নিজের* তথ্য দেখাত, কাস্টমারের প্রকৃত assigned
        // SR-এর নয়। এখন resolvePersonalStaffIds (chatFirebase.service.js)-এর
        // মতোই customer_assignments + routes থেকে আসল assigned SR + route-manager
        // টানা হচ্ছে (LATERAL + LIMIT 1, একাধিক active assignment থাকলেও রো
        // ফ্যান-আউট না হওয়ার জন্য)। srId নিচে credit_reminder_logs-এ "কে
        // পাঠালো" হিসেবে অক্ষত আছে (audit-এর জন্য এটাই ঠিক, assigned SR থেকে আলাদা)।
        const { rows } = await query(`
            SELECT
                c.id, c.shop_name, c.owner_name, c.customer_code,
                c.email, c.current_credit, c.whatsapp,
                sr.name_bn AS sr_name,
                COALESCE(assign.manager_id, sr.manager_id) AS manager_id,
                cpt.redirect_id  AS portal_redirect_id
            FROM customers c
            LEFT JOIN LATERAL (
                SELECT ca.worker_id, rt.manager_id
                FROM customer_assignments ca
                LEFT JOIN routes rt ON rt.id = ca.route_id
                WHERE ca.customer_id = c.id AND ca.tenant_id = c.tenant_id AND ca.is_active = true
                LIMIT 1
            ) assign ON true
            LEFT JOIN users sr ON sr.id = assign.worker_id
            LEFT JOIN customer_portal_tokens cpt ON c.id = cpt.customer_id
                AND cpt.expires_at > NOW()
            WHERE c.id = $1 AND c.tenant_id = $2 AND c.is_active = true
        `, [customerId, req.tenantId]);

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

        // ⚠️ FRONTEND_URL নয় — ওটা CORS-এর জন্য comma/wildcard ধারণ করতে পারে।
        // getPublicAppUrl() customer-facing লিংকের জন্য clean single URL দেয়।
        const FRONTEND_URL = getPublicAppUrl();

        // ✅ Fix 1: URL-এ redirect_id যাবে, token নয়
        const portalLink   = customer.portal_redirect_id
            ? `${FRONTEND_URL}/customer/portal?r=${customer.portal_redirect_id}`
            : null;

        const credit = parseFloat(customer.current_credit).toLocaleString('bn-BD');

        // ── Email ────────────────────────────────────────────
        const subject = `⚠️ বাকি পরিশোধের অনুরোধ — ${customer.shop_name} | ZovoriX`;

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
      <h1 style="color:#fff;margin:0;font-size:22px;">ZovoriX</h1>
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
      <p style="color:#999;font-size:11px;margin:0;">ZovoriX (Ltd.) | inf.novatechbd@gmail.com</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

        const emailSubject = subject;
        const emailText = `ZovoriX — বাকি Reminder\nদোকান: ${customer.shop_name}\nবাকি: ৳${credit}`;
        const emailMeta = { type: 'credit_reminder', tenant_id: req.tenantId };
        const managerPushPayload = customer.manager_id ? {
            title: `💳 Reminder পাঠানো — ${customer.shop_name}`,
            body:  `${req.user.name_bn || 'SR'} ${customer.owner_name}-কে বাকি reminder পাঠিয়েছে। বাকি: ৳${credit}`,
            type:  'credit_reminder_sent',
            data:  {
                customer_id:   String(customer.id),
                credit_amount: String(customer.current_credit),
            }
        } : null;
        const customerNotifyPayload = {
            title: `⚠️ বাকি পরিশোধের অনুরোধ`,
            body:  `আপনার ${customer.shop_name} দোকানে ৳${credit} বাকি রয়েছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন।`,
            type:  'credit_reminder',
        };

        // ✅ Phase 1: sendEmail আগে এখানেই সরাসরি await হতো (request-কে block
        // করতো, retry ছিল না)। এখন queue থাকলে queue করি -- 3 attempt,
        // exponential backoff। Redis না থাকলে (isQueueAvailable() === false)
        // আগের সরাসরি-send আচরণেই fallback করি, যাতে Redis ছাড়া environment-এ
        // (যেমন local dev) ফিচারটা ভেঙে না যায়।
        let queued = false;
        let emailResult = { success: true }; // direct-send path-এ override হবে

        if (isQueueAvailable()) {
            await notificationQueue.add('credit-reminder-email', {
                to: customer.email, subject: emailSubject, html, text: emailText, meta: emailMeta,
                customerId: customer.id, managerId: customer.manager_id,
                managerPushPayload, customerNotifyPayload,
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { age: 86400 }, // ১ দিন পর কমপ্লিটেড job cleanup
                removeOnFail: { age: 604800 },     // ৭ দিন পর ফেইলড job cleanup (debug-এর জন্য রাখা)
            });
            queued = true;
        } else {
            emailResult = await sendEmail(customer.email, emailSubject, html, emailText, emailMeta);
            if (customer.manager_id) {
                await sendPushToMany([customer.manager_id], managerPushPayload).catch(() => {});
            }
            await sendCustomerNotification(customer.id, customerNotifyPayload).catch(() => {});
        }

        // ✅ Log reminder — throttle check পাস করার পরেই insert (আগের মতোই,
        // queue করা মাত্রই লগ হয় — actual delivery-র জন্য অপেক্ষা করে না,
        // থ্রটল সিমান্টিক্স অপরিবর্তিত থাকে)
        await query(`
            INSERT INTO credit_reminder_logs (customer_id, sr_id, method, sent_at, tenant_id) VALUES ($1, $2, 'email', NOW(), $3)
        `, [customer.id, srId, req.tenantId]);

        return res.json({
            success: true,
            message: queued
                ? `✅ ${customer.owner_name}-কে reminder পাঠানোর জন্য queue করা হয়েছে।`
                : `✅ ${customer.owner_name}-কে Email reminder পাঠানো হয়েছে।`,
            data: {
                queued,
                email_sent: emailResult.success,
                customer:   customer.shop_name,
                credit:     customer.current_credit,
            }
        });

    } catch (error) {
        logger.error('❌ Credit Reminder Error:', error.message);
        return res.status(500).json({ success: false, message: 'Reminder পাঠাতে সমস্যা হয়েছে।' });
    }
};

module.exports = { sendCreditReminder };
