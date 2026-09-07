const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const logger = require('./logger');

// ============================================================
// Job Queue — BullMQ, Redis-backed
//
// এই ফাইলটা redis.js-এর (blocklist) থেকে আলাদা: BullMQ নিজের ioredis
// connection চায় ('redis' প্যাকেজ দিয়ে কাজ করে না), আর blocklist-এর মতো
// in-memory fallback এখানে সম্ভব না -- queue মানেই persistent storage +
// worker-এর কাছে delivery guarantee, memory-তে সেটা নকল করা যায় না।
//
// REDIS_URL না থাকলে: queue বন্ধ থাকে (notificationQueue = null)।
// Producer-রা isQueueAvailable() চেক করে সরাসরি-send fallback-এ যাবে
// (দেখো: creditReminder.controller.js)। App crash করবে না, শুধু
// queue-based reliability পাওয়া যাবে না।
// ============================================================

let connection = null;
let notificationQueue = null;

if (process.env.REDIS_URL) {
    connection = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null, // BullMQ-র নিজস্ব requirement
    });
    connection.on('error', (err) => logger.error('❌ Queue Redis connection error:', err.message));
    connection.on('connect', () => logger.info('✅ Job queue Redis সংযুক্ত।'));

    notificationQueue = new Queue('notifications', { connection });
} else {
    logger.warn('⚠️  REDIS_URL নেই — job queue বন্ধ। Producer-রা direct-send fallback ব্যবহার করবে।');
}

const isQueueAvailable = () => notificationQueue !== null;

module.exports = { connection, notificationQueue, isQueueAvailable };
