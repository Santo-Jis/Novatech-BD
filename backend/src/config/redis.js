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
        memoryBlocklist.set(key, Date.now() + ttlMs);
    },
    async get(key) {
        const expiresAt = memoryBlocklist.get(key);
        if (!expiresAt) return null;
        if (Date.now() > expiresAt) {
            memoryBlocklist.delete(key);
            return null;
        }
        return '1';
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
        console.warn('⚠️  REDIS_URL নেই — in-memory blocklist fallback চলছে।');
        console.warn('   Multi-instance production deploy-এ Redis আবশ্যক।');
        redisClient = memoryFallback;
        return redisClient;
    }

    try {
        const client = createClient({ url: process.env.REDIS_URL });
        client.on('error', (err) => console.error('❌ Redis Error:', err.message));
        client.on('connect', () => console.log('✅ Redis সংযুক্ত।'));
        await client.connect();
        redisClient = client;
        return redisClient;
    } catch (err) {
        console.error('❌ Redis সংযোগ ব্যর্থ — in-memory fallback:', err.message);
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
        console.log(`🔒 User ${userId} blocklist-এ যোগ হয়েছে (TTL: ${ttlSeconds}s)`);
    } catch (err) {
        console.error(`❌ blockUserTokens ব্যর্থ (userId: ${userId}):`, err.message);
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
        console.error(`❌ isUserBlocked চেক ব্যর্থ (userId: ${userId}):`, err.message);
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
        console.log(`🔓 User ${userId} blocklist থেকে সরানো হয়েছে।`);
    } catch (err) {
        console.error(`❌ unblockUser ব্যর্থ (userId: ${userId}):`, err.message);
    }
};

module.exports = { getRedisClient, blockUserTokens, isUserBlocked, unblockUser };
