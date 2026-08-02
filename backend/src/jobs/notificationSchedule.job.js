// backend/src/jobs/notificationSchedule.job.js
// ============================================================
// Scheduled / Recurring Notification Runner
// প্রতি ৫ মিনিট পরপর চেক করে — next_run_at পার হয়ে গেছে এমন
// schedule পেলে আসল notification তৈরি করে + deliver করে,
// তারপর পরবর্তী next_run_at হিসাব করে (recurring হলে) অথবা
// বন্ধ করে দেয় (একবারের schedule হলে)।
// ============================================================

const cron    = require('node-cron');
const logger  = require('../config/logger');
const { query } = require('../config/db');
const { sendPushToMany } = require('../services/fcm.service');
const { sendCustomerNotification } = require('../controllers/customerNotification.controller');
const { resolveStaffRecipientIds, resolveCustomerRecipientIds } = require('../controllers/notification.controller');
const { computeNextRun } = require('../services/scheduleTime.service');

const runDueSchedules = async () => {
    try {
        const { rows: due } = await query(
            `SELECT * FROM notification_schedules WHERE is_active = true AND next_run_at <= NOW()`
        );

        if (!due.length) return;
        logger.info(`⏰ [NotificationSchedule] ${due.length} টা schedule fire হচ্ছে...`);

        for (const sch of due) {
            try {
                // ── recipient resolve করো (fire হওয়ার সময়ের বর্তমান তালিকা দিয়ে) ──
                const recipientIds = sch.audience === 'staff'
                    ? await resolveStaffRecipientIds(sch.tenant_id, sch.target_type, sch.target_value || {}, {})
                    : await resolveCustomerRecipientIds(sch.tenant_id, sch.target_type, sch.target_value || {});

                let expiresAt = null;
                if (sch.result_expires_in_hours) {
                    expiresAt = new Date(Date.now() + sch.result_expires_in_hours * 60 * 60 * 1000);
                }

                // ── আসল notification row তৈরি করো (sent-history-তে দেখা যাবে) ──
                const { rows: created } = await query(
                    `INSERT INTO notifications
                        (tenant_id, sender_id, title, body, category, is_urgent, audience, target_type,
                         target_value, recipient_count, expires_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                     RETURNING id`,
                    [
                        sch.tenant_id, sch.sender_id, sch.title, sch.body, sch.category, sch.is_urgent,
                        sch.audience, sch.target_type, JSON.stringify(sch.target_value || {}),
                        recipientIds.length, expiresAt,
                    ]
                );
                const notificationId = created[0].id;

                // ── ডেলিভারি ──
                if (sch.audience === 'staff') {
                    if (recipientIds.length) {
                        sendPushToMany(recipientIds, {
                            title: sch.title, body: sch.body, type: sch.category,
                            data: { notification_id: String(notificationId) },
                        }).catch(e => logger.error('[NotificationSchedule] staff push error:', e.message));
                    }
                } else {
                    recipientIds.forEach(customerId => {
                        sendCustomerNotification(customerId, { title: sch.title, body: sch.body, type: sch.category })
                            .catch(e => logger.error('[NotificationSchedule] customer push error:', e.message));
                    });
                }

                // ── পরবর্তী next_run_at হিসাব করো ──
                const nextRun = computeNextRun(sch.recurrence_type, sch.recurrence_meta, new Date());

                if (nextRun) {
                    await query(
                        `UPDATE notification_schedules
                         SET last_run_at = NOW(), run_count = run_count + 1, next_run_at = $2
                         WHERE id = $1`,
                        [sch.id, nextRun]
                    );
                } else {
                    // 'once' — আর চলবে না
                    await query(
                        `UPDATE notification_schedules
                         SET last_run_at = NOW(), run_count = run_count + 1, is_active = false
                         WHERE id = $1`,
                        [sch.id]
                    );
                }

                logger.info(`✅ [NotificationSchedule] "${sch.title}" পাঠানো হয়েছে (${recipientIds.length} জনকে)`);
            } catch (innerErr) {
                logger.error(`❌ [NotificationSchedule] schedule #${sch.id} ব্যর্থ:`, innerErr.message);
            }
        }
    } catch (error) {
        logger.error('❌ [NotificationSchedule] Job Error:', error.message);
    }
};

const startNotificationScheduleJob = () => {
    // প্রতি ৫ মিনিট পরপর চেক
    cron.schedule('*/5 * * * *', runDueSchedules, { timezone: 'Asia/Dhaka' });
    logger.info('⏰ Notification Schedule Job: প্রতি ৫ মিনিট পরপর চলবে');
};

module.exports = { startNotificationScheduleJob, runDueSchedules };
