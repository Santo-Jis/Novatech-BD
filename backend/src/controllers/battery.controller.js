const logger = require('../config/logger');
const { query } = require('../config/db');
const { sendPushNotification } = require('../services/fcm.service');
const { firebaseNotify } = require('../services/firebase.notify');

// ============================================================
// POST /api/battery/alert
// SR-এর battery কম হলে Manager/Admin-কে notify করবে
// ============================================================

const reportBatteryLow = async (req, res) => {
    try {
        const workerId = req.user.id;
        const { level } = req.body;

        if (level === undefined || level === null) {
            return res.status(400).json({ success: false, message: 'battery level দিন।' });
        }

        // সেটিং থেকে threshold নাও
        const settingRes = await query(
            `SELECT value FROM system_settings WHERE key = 'battery_alert_threshold'`
        );
        const threshold = parseInt(settingRes.rows[0]?.value || '20');

        const enabledRes = await query(
            `SELECT value FROM system_settings WHERE key = 'battery_alert_enabled'`
        );
        const enabled = enabledRes.rows[0]?.value !== 'false';

        if (!enabled || level > threshold) {
            return res.json({ success: true, message: 'alert প্রয়োজন নেই।' });
        }

        // SR-এর নাম ও manager বের করো
        const workerRes = await query(
            `SELECT u.name_bn, u.manager_id, m.name_bn as manager_name
             FROM users u
             LEFT JOIN users m ON m.id = u.manager_id
             WHERE u.id = $1`,
            [workerId]
        );
        if (!workerRes.rows.length) {
            return res.status(404).json({ success: false, message: 'user পাওয়া যায়নি।' });
        }

        const worker = workerRes.rows[0];
        const title  = '⚠️ ব্যাটারি সতর্কতা';
        const body   = `${worker.name_bn}-এর ফোনের ব্যাটারি ${level}% — তাকে চার্জ দিতে বলুন।`;

        // Manager-কে notify করো
        if (worker.manager_id) {
            await firebaseNotify(worker.manager_id, { title, body, type: 'battery_alert' });
            await sendPushNotification(worker.manager_id, { title, body, type: 'battery_alert' });

            // notifications table-এ save করো
            await query(
                `INSERT INTO notifications (user_id, title, body, type, reference_id)
                 VALUES ($1, $2, $3, 'battery_alert', $4)`,
                [worker.manager_id, title, body, workerId]
            );
        }

        // Admin-দেরও notify করো
        const adminsRes = await query(
            `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
        );
        for (const admin of adminsRes.rows) {
            await sendPushNotification(admin.id, { title, body, type: 'battery_alert' });
        }

        logger.info(`[Battery] Alert sent: ${worker.name_bn} = ${level}%`);
        return res.json({ success: true, message: 'alert পাঠানো হয়েছে।' });

    } catch (err) {
        logger.error('[Battery] reportBatteryLow error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { reportBatteryLow };
