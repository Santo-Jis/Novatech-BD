// ============================================================
// PORTAL AUTH CACHE SERVICE
// Controller ও Routes উভয়ই এখান থেকে import করে।
// আগে cache logic routes-এ ছিল — controller সেটা lazy require
// দিয়ে আনত (circular dependency হ্যাক)।
//
// key   → portal_auth:{customer_id}
// value → JSON { token_version, cachedAt }
// TTL   → 60 সেকেন্ড (Redis EX)
// ============================================================

const { getRedisClient } = require('../config/redis');
const logger             = require('../config/logger');

const PORTAL_CACHE_TTL_SEC = 60;
const PORTAL_CACHE_PREFIX  = 'portal_auth:';

// Cache থেকে পড়ো — miss বা error হলে null
const getCached = async (customerId) => {
    try {
        const client = await getRedisClient();
        const raw    = await client.get(`${PORTAL_CACHE_PREFIX}${customerId}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        logger.error('portalAuth cache GET error:', err.message);
        return null;
    }
};

// Cache-এ লেখো — error হলে silent fail (auth চলতে থাকে)
const setCache = async (customerId, data) => {
    try {
        const client = await getRedisClient();
        await client.set(
            `${PORTAL_CACHE_PREFIX}${customerId}`,
            JSON.stringify(data),
            { EX: PORTAL_CACHE_TTL_SEC }
        );
    } catch (err) {
        logger.error('portalAuth cache SET error:', err.message);
    }
};

// Cache মুছে দাও — logout, device revoke, token invalidation-এ call করো
const invalidatePortalAuthCache = async (customerId) => {
    try {
        const client = await getRedisClient();
        await client.del(`${PORTAL_CACHE_PREFIX}${customerId}`);
    } catch (err) {
        logger.error('portalAuth cache DEL error:', err.message);
    }
};

module.exports = { getCached, setCache, invalidatePortalAuthCache };
