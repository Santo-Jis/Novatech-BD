// backend/src/controllers/creditReminderSnooze.controller.js
// ============================================================
// কাস্টমার পোর্টাল — "পরে পরিশোধ করব" (বাকি-রিমাইন্ডার snooze)
//
// Base: /api/portal/connections   (customerPortalConnection.routes.js-এ রেজিস্টার)
//   GET  /reminder-snoozes          → প্রতিটা কানেক্টেড কোম্পানির চলমান snooze
//   POST /reminder-snooze           → body { connection_id, snooze_until:'YYYY-MM-DD' } অথবা { connection_id, days }
//   POST /reminder-snooze/cancel    → body { connection_id }
//
// নিয়ম:
//   • তারিখ আজ (ঢাকা) থেকে সর্বোচ্চ ৩০ দিনের মধ্যে; বাকি (current_credit) > ০ হতে হবে
//   • অপব্যবহার রোধ: ৬০ দিনে সর্বোচ্চ ৩ বার snooze (cancel করলেও গণনায় থাকে)
//   • নতুন snooze আগেরটাকে বাতিল করে (তারিখ আগে-পরে যাই হোক, শেষেরটাই কার্যকর)
//   • মালিকানা যাচাই: connection_id অবশ্যই এই person-এর ও 'connected' (limit-request-এর মতোই)
//   • SR-কে push যায়, যাতে সে জানে কাস্টমার কবে দেবে বলেছে
// ============================================================

const { query } = require('../config/db');
const logger = require('../config/logger');
const { getPersonId } = require('../services/portalPerson.service');
const { sendPushToMany } = require('../services/fcm.service');
const { sendCustomerNotification } = require('./customerNotification.controller');

const MAX_DAYS_AHEAD = 30;
const MAX_SNOOZES_PER_WINDOW = 3;
const WINDOW_DAYS = 60;

// ─── তারিখ হেল্পার (ঢাকার সময়) ───────────────────────────────
const dhakaToday = (now = new Date()) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now); // YYYY-MM-DD

const isRealDate = (s) =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

const addDays = (dateStr, n) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

/** body থেকে snooze-এর শেষ তারিখ বের করে + সীমা যাচাই */
const resolveSnoozeDate = (body, today = dhakaToday()) => {
    let until;
    if (body.snooze_until !== undefined && body.snooze_until !== null && body.snooze_until !== '') {
        if (!isRealDate(body.snooze_until)) return { error: 'সঠিক তারিখ দিন।' };
        until = body.snooze_until;
    } else if (body.days !== undefined) {
        const n = Number(body.days);
        if (!Number.isInteger(n) || n < 1) return { error: 'সঠিক দিনের সংখ্যা দিন।' };
        until = addDays(today, n);
    } else {
        return { error: 'কবে পরিশোধ করবেন তা জানান।' };
    }
    if (until < today) return { error: 'আগের তারিখ দেওয়া যাবে না।' };
    if (until > addDays(today, MAX_DAYS_AHEAD)) {
        return { error: `সর্বোচ্চ ${MAX_DAYS_AHEAD} দিন পরের তারিখ দেওয়া যাবে।` };
    }
    return { until };
};

// connection_id এই person-এর এবং connected কিনা যাচাই
const loadOwnedConnection = async (req, connectionId) => {
    const personId = await getPersonId(req.portalUser);
    const r = await query(
        `SELECT c.id AS customer_id, c.tenant_id, c.shop_name, c.owner_name, c.current_credit
         FROM customer_company_connections ccc
         JOIN customers c ON c.id = ccc.customer_id
         WHERE ccc.id = $1 AND ccc.person_id = $2 AND ccc.status = 'connected'`,
        [connectionId, personId]
    );
    return r.rows[0] || null;
};

const handleErr = (res, err, label) => {
    if (err.message === 'PERSON_NOT_LINKED') {
        return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
    }
    logger.error(`❌ ${label} error:`, err.message);
    return res.status(500).json({ success: false, message: 'কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
};

// ============================================================
// GET /reminder-snoozes
// ============================================================
const getMyReminderSnoozes = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const r = await query(
            `SELECT ccc.id AS connection_id, c.id AS customer_id,
                    to_char(sn.snoozed_until, 'YYYY-MM-DD') AS snoozed_until
             FROM customer_company_connections ccc
             JOIN customers c ON c.id = ccc.customer_id
             LEFT JOIN LATERAL (
                 SELECT MAX(s.snoozed_until) AS snoozed_until
                 FROM credit_reminder_snoozes s
                 WHERE s.customer_id = c.id
                   AND s.snoozed_until >= (NOW() AT TIME ZONE 'Asia/Dhaka')::date
             ) sn ON true
             WHERE ccc.person_id = $1 AND ccc.status = 'connected'`,
            [personId]
        );
        return res.json({ success: true, data: r.rows });
    } catch (err) {
        return handleErr(res, err, 'getMyReminderSnoozes');
    }
};

// ============================================================
// POST /reminder-snooze
// ============================================================
const snoozeMyReminder = async (req, res) => {
    try {
        const { connection_id } = req.body || {};
        if (!connection_id) {
            return res.status(400).json({ success: false, message: 'কোম্পানি বেছে নিন।' });
        }

        const today = dhakaToday();
        const { until, error } = resolveSnoozeDate(req.body, today);
        if (error) return res.status(400).json({ success: false, message: error });

        const cust = await loadOwnedConnection(req, connection_id);
        if (!cust) {
            return res.status(403).json({ success: false, message: 'এই কোম্পানিতে আপনার অ্যাক্সেস নেই।' });
        }
        if (!(parseFloat(cust.current_credit) > 0)) {
            return res.status(400).json({ success: false, message: 'এই কোম্পানিতে আপনার কোনো বাকি নেই।' });
        }

        const recent = await query(
            `SELECT COUNT(*)::int AS n FROM credit_reminder_snoozes
             WHERE customer_id = $1 AND created_by = 'customer'
               AND created_at > NOW() - ($2 || ' days')::interval`,
            [cust.customer_id, String(WINDOW_DAYS)]
        );
        if (recent.rows[0].n >= MAX_SNOOZES_PER_WINDOW) {
            return res.status(429).json({
                success: false,
                message: 'এই সময়ে আর তারিখ পিছানো যাবে না। অনুগ্রহ করে আমাদের প্রতিনিধির সাথে কথা বলুন।',
            });
        }

        // আগের চলমান snooze বাতিল (শেষেরটাই কার্যকর) — ইতিহাস থাকে, কারণ গণনায় লাগে
        await query(
            `UPDATE credit_reminder_snoozes SET snoozed_until = $2::date - 1
             WHERE customer_id = $1 AND snoozed_until >= $2::date`,
            [cust.customer_id, today]
        );
        await query(
            `INSERT INTO credit_reminder_snoozes (tenant_id, customer_id, snoozed_until, created_by)
             VALUES ($1, $2, $3::date, 'customer')`,
            [cust.tenant_id, cust.customer_id, until]
        );

        // ── Best-effort নোটিফিকেশন (ব্যর্থ হলেও snooze বহাল) ──
        const niceDate = new Date(`${until}T00:00:00Z`)
            .toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', timeZone: 'UTC' });
        sendCustomerNotification(cust.customer_id, {
            title: '⏰ ঠিক আছে, জানিয়ে রাখলাম',
            body:  `আপনি ${niceDate} তারিখে বাকি পরিশোধের কথা জানিয়েছেন। ততদিন আমরা রিমাইন্ডার পাঠাব না।`,
            type:  'credit_reminder',
        }).catch((e) => logger.warn('snooze কনফার্মেশন নোটিফিকেশন ব্যর্থ:', e.message));

        query(
            `SELECT ca.worker_id FROM customer_assignments ca
             WHERE ca.customer_id = $1 AND ca.is_active = true LIMIT 1`,
            [cust.customer_id]
        ).then(async (a) => {
            if (!a.rows.length) return;
            await sendPushToMany([a.rows[0].worker_id], {
                title: '⏰ কাস্টমার তারিখ জানিয়েছেন',
                body:  `${cust.shop_name} — ${niceDate} তারিখে বাকি দেবেন বলেছেন।`,
                type:  'credit_reminder',
                data:  { kind: 'credit_snooze', customer_id: cust.customer_id },
            });
        }).catch((e) => logger.warn('snooze SR push ব্যর্থ:', e.message));

        return res.status(201).json({
            success: true,
            message: 'ঠিক আছে, ওই তারিখ পর্যন্ত রিমাইন্ডার পাঠানো হবে না।',
            data: { snoozed_until: until },
        });
    } catch (err) {
        return handleErr(res, err, 'snoozeMyReminder');
    }
};

// ============================================================
// POST /reminder-snooze/cancel
// ============================================================
const cancelMyReminderSnooze = async (req, res) => {
    try {
        const { connection_id } = req.body || {};
        if (!connection_id) {
            return res.status(400).json({ success: false, message: 'কোম্পানি বেছে নিন।' });
        }
        const cust = await loadOwnedConnection(req, connection_id);
        if (!cust) {
            return res.status(403).json({ success: false, message: 'এই কোম্পানিতে আপনার অ্যাক্সেস নেই।' });
        }
        const today = dhakaToday();
        const r = await query(
            `UPDATE credit_reminder_snoozes SET snoozed_until = $2::date - 1
             WHERE customer_id = $1 AND snoozed_until >= $2::date`,
            [cust.customer_id, today]
        );
        return res.json({ success: true, message: 'তারিখ বাতিল হয়েছে।', data: { cancelled: r.rowCount || 0 } });
    } catch (err) {
        return handleErr(res, err, 'cancelMyReminderSnooze');
    }
};

module.exports = {
    getMyReminderSnoozes, snoozeMyReminder, cancelMyReminderSnooze,
    // টেস্টের জন্য
    resolveSnoozeDate, dhakaToday, addDays, MAX_DAYS_AHEAD, MAX_SNOOZES_PER_WINDOW,
};
