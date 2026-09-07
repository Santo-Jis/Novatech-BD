const logger = require('./logger');
const { getRedisClient } = require('./redis');

// ============================================================
// Generic read-through cache — redis.js-এর existing client/fallback
// পুনর্ব্যবহার করে (নতুন connection বানায় না)। blocklist-এর মতোই:
// Redis না থাকলে in-memory fallback (single-instance-এ কাজ করে,
// multi-instance-এ প্রতিটা instance নিজের মতো cache করবে -- এখনো ঠিক
// আছে, কারণ এটা শুধু READ optimization, correctness cache-এর উপর
// নির্ভর করে না)।
//
// ⚠️ কখন cache করবে না: যেখানে সামান্য staleness-ও ব্যবসায়িক ক্ষতি করতে
// পারে (payment status, credit approval, live stock hold) -- সেখানে
// TTL যতই ছোট হোক, ঝুঁকি না নেওয়াই ভালো। এই cache শুধু "browsing/listing"
// টাইপ read-এর জন্য, actual write/commit path সবসময় live DB read করবে।
// ============================================================

const cacheGet = async (key) => {
    try {
        const client = await getRedisClient();
        const raw = await client.get(key);
        if (raw === null || raw === undefined) return null;
        return JSON.parse(raw);
    } catch (err) {
        logger.warn(`⚠️  cacheGet(${key}) ব্যর্থ, DB থেকেই পড়া হবে:`, err.message);
        return null; // cache miss হিসেবে treat করো, কখনো crash না
    }
};

const cacheSet = async (key, value, ttlSeconds) => {
    try {
        const client = await getRedisClient();
        await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (err) {
        logger.warn(`⚠️  cacheSet(${key}) ব্যর্থ (non-fatal):`, err.message);
    }
};

const cacheDel = async (keyOrPrefix) => {
    try {
        const client = await getRedisClient();
        await client.del(keyOrPrefix);
        // ✅ cross-check fix: আগে এখানে client.isMemoryFallback চেক করে দুটো
        // আলাদা branch ছিল, কিন্তু দুটোই একই কাজ করতো (await client.del(...))
        // — কমেন্টে prefix-scan bulk-delete-এর কথা বলা হয়েছিল যেটা আসলে
        // কখনো implement হয়নি। এখনকার একমাত্র caller (product-list cache
        // invalidation) সবসময় exact key দিয়েই ডাকে, তাই simple রাখাই honest।
        // prefix-based bulk invalidation সত্যিই দরকার হলে তখন আলাদাভাবে
        // scanIterator (real redis) বনাম Map.keys().filter() (fallback)
        // দিয়ে ঠিকভাবে implement করা উচিত, এই ভাঙা placeholder দিয়ে না।
    } catch (err) {
        logger.warn(`⚠️  cacheDel(${keyOrPrefix}) ব্যর্থ (non-fatal):`, err.message);
    }
};

/**
 * Read-through wrapper: cache-এ থাকলে সেটাই দাও, না থাকলে fn() চালিয়ে
 * cache করে দাও।
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {() => Promise<any>} fn — cache miss হলে যা চালাবে
 */
const withCache = async (key, ttlSeconds, fn) => {
    const cached = await cacheGet(key);
    if (cached !== null) return { data: cached, fromCache: true };
    const fresh = await fn();
    await cacheSet(key, fresh, ttlSeconds);
    return { data: fresh, fromCache: false };
};

module.exports = { cacheGet, cacheSet, cacheDel, withCache };
