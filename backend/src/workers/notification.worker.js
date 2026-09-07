const { Worker } = require('bullmq');
const logger = require('../config/logger');
const { connection } = require('../config/queue');
const { sendEmail } = require('../services/email.service');
const { sendPushToMany } = require('../services/fcm.service');
const { sendCustomerNotification } = require('../controllers/customerNotification.controller');

// ============================================================
// Notification Worker — 'notifications' queue-এর job process করে
//
// এখন একটাই job type আছে (credit-reminder-email) — এটা
// creditReminder.controller.js থেকে সরিয়ে আনা হয়েছে (আগে সরাসরি,
// synchronous ভাবে request handler-এই sendEmail হতো)।
//
// নতুন job type যোগ করতে: এখানে একটা case যোগ করো, controller থেকে
// notificationQueue.add('your-job-name', {...data}) কল করো। নতুন
// queue/worker বানানোর দরকার নেই যতক্ষণ না volume/latency আলাদা
// isolation দাবি করে (তখন আলাদা Queue নাম দিয়ে এই প্যাটার্নটাই repeat
// করো)।
//
// থ্রো করা মানেই BullMQ retry করবে (attempts/backoff job creation-এর
// সময় সেট করা হয় — দেখো creditReminder.controller.js)। যেটা fail
// হলেও retry-র দরকার নেই (যেমন push notification — best-effort),
// সেটা এখানেই catch করে log করো, throw কোরো না।
// ============================================================

async function processJob(job) {
    switch (job.name) {
        case 'credit-reminder-email': {
            const {
                to, subject, html, text, meta,
                customerId, managerId, managerPushPayload, customerNotifyPayload,
            } = job.data;

            const emailResult = await sendEmail(to, subject, html, text, meta);
            if (!emailResult.success) {
                // থ্রো করলে BullMQ retry করবে (network blip, gateway সাময়িক down ইত্যাদি)
                throw new Error(emailResult.error || 'sendEmail ব্যর্থ হয়েছে, কারণ অজানা');
            }

            if (managerId && managerPushPayload) {
                await sendPushToMany([managerId], managerPushPayload).catch((e) =>
                    logger.warn(`credit-reminder: manager push ব্যর্থ (non-fatal, retry হবে না): ${e.message}`)
                );
            }

            if (customerNotifyPayload) {
                await sendCustomerNotification(customerId, customerNotifyPayload).catch((e) =>
                    logger.warn(`credit-reminder: customer notify ব্যর্থ (non-fatal, retry হবে না): ${e.message}`)
                );
            }

            return { emailSent: true };
        }

        default:
            // অচেনা job type -- retry করে লাভ নেই, সরাসরি fail
            throw new Error(`Unknown job type: ${job.name}`);
    }
}

function startNotificationWorker() {
    if (!connection) {
        logger.warn('⚠️  Redis নেই — notification worker চালু হয়নি (queue disabled)।');
        return null;
    }

    const worker = new Worker('notifications', processJob, {
        connection,
        concurrency: 5, // একসাথে সর্বোচ্চ ৫টা job -- ছোট স্কেলে যথেষ্ট, দরকার হলে বাড়াও
    });

    worker.on('completed', (job) => {
        logger.info(`✅ Job ${job.id} (${job.name}) সম্পন্ন`);
    });

    worker.on('failed', (job, err) => {
        logger.error(
            `❌ Job ${job?.id} (${job?.name}) ব্যর্থ (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${err.message}`
        );
    });

    logger.info('🔄 Notification worker চালু (একই process-এ, concurrency: 5)।');
    return worker;
}

module.exports = { startNotificationWorker };
