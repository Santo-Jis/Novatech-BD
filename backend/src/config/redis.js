const logger = require('../config/logger');
const { createClient } = require('redis');

// ============================================================
// Redis Client — Token Blocklist এর জন্য
//
// ব্যবহার:
//   suspend/archive হলে admin যখন deleteAllUserSessions() ডাকে,
//   একই সঙ্গে blockUserTokens(userId, ttlSeconds) ডাকতে হবে।
//   auth middleware প্রতি request-এ isUserBlocked() চেক করবে।
//
// Redis না থাকলে (REDIS_URL অনুপস্থিত):
//   In-memory fallback চলবে — single instance-এ কাজ করে।
//   Production-এ multi-instance deploy থাকলে অবশ্যই Redis চাই।
// ============================================================

let redisClient = null;

// ── In-memory fallback (Redis না থাকলে) ─────────────────────
const memoryBlocklist = new Map();

const memoryFallback = {
    async set(key, value, options) {
        const ttlMs = (options?.EX ?? 900) * 1000;
        // ✅ Phase 1 ফিক্স: আগে শুধু expiry timestamp রাখা হতো, value না --
        // get() তাই hardcoded '1' রিটার্ন করতো। blocklist-এর জন্য এতদিন
        // সমস্যা হয়নি (blockUserTokens সবসময় '1'-ই সেট করে, শুধু presence
        // চেক হয়), কিন্তু cache.js-এর মতো generic ব্যবহারে এটা ভুল ডেটা
        // রিটার্ন করতো। এখন real value-ও রাখা হচ্ছে -- blocklist আচরণ
        // অপরিবর্তিত থাকে, শুধু generic cache use-case-এ এখন সঠিক কাজ করে।
        memoryBlocklist.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    async get(key) {
        const entry = memoryBlocklist.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            memoryBlocklist.delete(key);
            return null;
        }
        return entry.value;
    },
    async del(key) {
        memoryBlocklist.delete(key);
    },
    isMemoryFallback: true,
};

// ── Redis সংযোগ ──────────────────────────────────────────────
const getRedisClient = async () => {
    if (redisClient) return redisClient;

    if (!process.env.REDIS_URL) {
        logger.warn('⚠️  REDIS_URL নেই — in-memory blocklist fallback চলছে।');
        logger.warn('   Multi-instance production deploy-এ Redis আবশ্যক।');
        redisClient = memoryFallback;
        return redisClient;
    }

    try {
        const client = createClient({
            url: process.env.REDIS_URL,
            // Idle থাকলে Redis/প্রক্সি কানেকশন কেটে দেয় ("Socket closed unexpectedly")।
            // ৩০ সেকেন্ডে একবার PING + TCP keep-alive দিয়ে কানেকশন জীবিত রাখা হচ্ছে।
            pingInterval: 30 * 1000,
            socket: {
                keepAlive: 30 * 1000,
                connectTimeout: 10 * 1000,
                // কেটে গেলে দ্রুত আবার চেষ্টা (সর্বোচ্চ ৩ সেকেন্ড বিরতি)
                reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
            },
        });
        client.on('error', (err) => {
            // কানেকশন কেটে যাওয়া অস্থায়ী — নিজে reconnect হয়, তাই warn।
            // বাকি error-গুলো (auth, config ইত্যাদি) error হিসেবেই থাকবে।
            const transient = /Socket closed|ECONNRESET|ETIMEDOUT|EPIPE/i.test(`${err.code || ''} ${err.message || ''}`);
            if (transient) logger.warn('⚠️ Redis সংযোগ কেটেছে, পুনরায় চেষ্টা চলছে', { reason: err.message });
            else logger.error('❌ Redis Error', { err });
        });
        client.on('connect', () => logger.info('✅ Redis সংযুক্ত।'));
        client.on('reconnecting', () => logger.info('🔄 Redis reconnecting...'));
        await client.connect();
        redisClient = client;
        return redisClient;
    } catch (err) {
        logger.error('❌ Redis সংযোগ ব্যর্থ — in-memory fallback', { err });
        redisClient = memoryFallback;
        return redisClient;
    }
};

/**
 * একজন user-কে block করো।
 * suspend/archive করার সময় deleteAllUserSessions()-এর পাশে ডাকো।
 * @param {number|string} userId
 * @param {number} ttlSeconds  — কতক্ষণ block থাকবে (default: 900 = ১৫ মিনিট)
 */
const blockUserTokens = async (userId, ttlSeconds = 900) => {
    try {
        const client = await getRedisClient();
        await client.set(`blocklist:user:${userId}`, '1', { EX: ttlSeconds });
        logger.info(`🔒 User ${userId} blocklist-এ যোগ হয়েছে (TTL: ${ttlSeconds}s)`);
    } catch (err) {
        logger.error(`❌ blockUserTokens ব্যর্থ (userId: ${userId}):`, err.message);
    }
};

/**
 * User block আছে কিনা যাচাই।
 * @param {number|string} userId
 * @returns {Promise<boolean>}
 */
const isUserBlocked = async (userId) => {
    try {
        const client = await getRedisClient();
        const result = await client.get(`blocklist:user:${userId}`);
        return result !== null;
    } catch (err) {
        logger.error(`❌ isUserBlocked চেক ব্যর্থ (userId: ${userId}):`, err.message);
        return false; // Redis down হলে safe default: block করা হয় না
    }
};

/**
 * User-কে blocklist থেকে সরাও।
 * ব্যবহার: admin user পুনরায় active করলে।
 * @param {number|string} userId
 */
const unblockUser = async (userId) => {
    try {
        const client = await getRedisClient();
        await client.del(`blocklist:user:${userId}`);
        logger.info(`🔓 User ${userId} blocklist থেকে সরানো হয়েছে।`);
    } catch (err) {
        logger.error(`❌ unblockUser ব্যর্থ (userId: ${userId}):`, err.message);
    }
};

module.exports = { getRedisClient, blockUserTokens, isUserBlocked, unblockUser };
