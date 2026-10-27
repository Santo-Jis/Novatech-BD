// backend/src/jobs/pendingOrderReminder.job.js
// ============================================================
// রিটেইলার ই-কমার্স pending অর্ডারের রিমাইন্ডার
// প্রতি ৪ ঘণ্টা পর পর — শুধু দিনের বেলা (Asia/Dhaka):
//   সকাল ৮:০০, দুপুর ১২:০০, বিকাল ৪:০০, সন্ধ্যা ৮:০০
// রাতে (রাত ১০টা – সকাল ৮টা) কিছু যাবে না।
// → Admin ও Manager-কে অর্ডারের বিবরণসহ Email + WhatsApp
// ============================================================

const cron = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { sendPendingDigestForTenant } = require('../services/pendingOrderNotify.service');

let running = false;

const runPendingOrderReminderJob = async () => {
    if (running) {
        logger.warn('[PendingOrderReminder] আগের রান এখনো চলছে — skip');
        return;
    }
    running = true;
    try {
        const { rows } = await query(
            `SELECT DISTINCT tenant_id FROM customer_order_requests WHERE status = 'pending'`
        );
        if (!rows.length) {
            logger.info('[PendingOrderReminder] কোনো pending অর্ডার নেই');
            return;
        }
        for (const { tenant_id } of rows) {
            try {
                await sendPendingDigestForTenant(tenant_id);
            } catch (err) {
                logger.error(`[PendingOrderReminder] tenant ${tenant_id} ব্যর্থ: ${err.message}`);
            }
        }
    } catch (err) {
        logger.error('[PendingOrderReminder] Job error', { err });
    } finally {
        running = false;
    }
};

const startPendingOrderReminderJob = () => {
    if (process.env.PENDING_ORDER_REMINDER_ENABLED === 'false') {
        logger.info('⏸️ Pending Order Reminder Job বন্ধ (PENDING_ORDER_REMINDER_ENABLED=false)');
        return;
    }
    cron.schedule('0 8,12,16,20 * * *', runPendingOrderReminderJob, { timezone: 'Asia/Dhaka' });
    logger.info('⏰ Pending Order Reminder Job: প্রতি ৪ ঘণ্টায় (সকাল ৮, দুপুর ১২, বিকাল ৪, সন্ধ্যা ৮)');
};

module.exports = { startPendingOrderReminderJob, runPendingOrderReminderJob };
