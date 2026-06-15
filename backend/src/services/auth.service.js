const jwt       = require('jsonwebtoken');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { blockUserTokens, unblockUser } = require('../config/redis');

// ============================================================
// Auth Service — JWT Token ব্যবস্থাপনা
// ============================================================

// ✅ SaaS Phase 2 (lite): JWT payload-এ tenantId যোগ করা হলো।
// Export/signature কিছুই বদলায়নি — শুধু payload-এ একটা নতুন field।
// user.tenant_id না থাকলে (পুরোনো token, বা DB row-এ এখনো না থাকলে)
// DEFAULT_TENANT_ID (migration-এর default tenant) fallback হবে —
// তাই কোনো breaking change বা flag-day নেই।
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

// Access Token তৈরি (১৫ মিনিট)
const generateAccessToken = (user) => {
    return jwt.sign(
        {
            userId:        user.id,
            role:          user.role,
            status:        user.status,
            name_bn:       user.name_bn,
            name_en:       user.name_en       || null,
            manager_id:    user.manager_id    || null,
            employee_code: user.employee_code || null,
            phone:         user.phone         || null,
            tenantId:      user.tenant_id     || DEFAULT_TENANT_ID, // ✅ SaaS
        },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
    );
};

// Refresh Token তৈরি (৭ দিন)
const generateRefreshToken = (user) => {
    return jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
    );
};

// Refresh Token DB তে সেভ
const saveRefreshToken = async (userId, refreshToken) => {
    try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await query(
            `INSERT INTO user_sessions (user_id, refresh_token, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (refresh_token) DO UPDATE SET expires_at = $3`,
            [userId, refreshToken, expiresAt]
        );
    } catch (error) {
        logger.warn('⚠️ Session save failed (non-critical):', error.message);
    }
};

// Refresh Token যাচাই ও নতুন Access Token দেওয়া
const verifyRefreshToken = async (refreshToken) => {
    let decoded;
    try {
        decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
        throw new Error('অবৈধ বা মেয়াদোত্তীর্ণ Refresh Token।');
    }

    const sessionResult = await query(
        `SELECT * FROM user_sessions 
         WHERE refresh_token = $1 AND expires_at > NOW()`,
        [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
        throw new Error('Session পাওয়া যায়নি। আবার লগইন করুন।');
    }

    const userResult = await query(
        `SELECT id, role, name_bn, name_en, email, phone, 
                status, manager_id, employee_code, tenant_id
         FROM users WHERE id = $1`,
        [decoded.userId]
    );

    if (userResult.rows.length === 0) {
        throw new Error('ব্যবহারকারী পাওয়া যায়নি।');
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
        throw new Error('অ্যাকাউন্ট সক্রিয় নেই।');
    }

    return user;
};

// Refresh Token মুছে দেওয়া (লগআউট)
const deleteRefreshToken = async (refreshToken) => {
    await query(
        'DELETE FROM user_sessions WHERE refresh_token = $1',
        [refreshToken]
    );
};

// ============================================================
// একজন ইউজারের সব Session মুছে দেওয়া (সব ডিভাইস থেকে লগআউট)
//
// ✅ FIX (suspend/archive): শুধু DB session মুছলে হয় না —
//   বিদ্যমান access token এখনো valid থাকে (সর্বোচ্চ ১৫ মিনিট)।
//   Redis blocklist-এ user-কে যোগ করলে instant block হয়।
//
// ✅ FIX #9 (role/manager_id change): softLogout option যোগ করা হয়েছে।
//   role বা manager_id পরিবর্তনে শুধু refresh tokens মুছে দেওয়া হয়।
//   বর্তমান access token (max ১৫ মিনিট) শেষ হলে user আর refresh
//   করতে পারবে না — re-login বাধ্য। নতুন token-এ নতুন role থাকবে।
//   suspend-এর মতো সাথে সাথে block করা হয় না (misleading 403 এড়ানো)।
//
// ব্যবহার:
//   await deleteAllUserSessions(userId);                          // suspend/archive
//   await deleteAllUserSessions(userId, { reactivating: true }); // পুনরায় active
//   await deleteAllUserSessions(userId, { softLogout: true });   // role পরিবর্তন
// ============================================================
const deleteAllUserSessions = async (userId, { reactivating = false, softLogout = false } = {}) => {
    await query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId]
    );

    if (reactivating) {
        await unblockUser(userId);
    } else if (softLogout) {
        // শুধু refresh tokens মুছে দাও — Redis block নয়।
        // current access token expire হলে user আর refresh করতে পারবে না,
        // তখন re-login করলে নতুন token-এ নতুন role পাবে।
    } else {
        const ttlSeconds = parseTtlSeconds(process.env.JWT_ACCESS_EXPIRES || '15m');
        await blockUserTokens(userId, ttlSeconds);
    }
};

// মেয়াদোত্তীর্ণ Session পরিষ্কার (ব্যাকগ্রাউন্ড জব থেকে)
const cleanExpiredSessions = async () => {
    const result = await query(
        'DELETE FROM user_sessions WHERE expires_at < NOW()'
    );
    logger.info(`🧹 ${result.rowCount} মেয়াদোত্তীর্ণ session মুছে দেওয়া হয়েছে`);
};

// ── Utility ──────────────────────────────────────────────────
// JWT expiresIn string (e.g. '15m', '1h', '7d') → seconds
const parseTtlSeconds = (expiresIn) => {
    if (!expiresIn || typeof expiresIn !== 'string') return 900;
    const match = expiresIn.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 900;
    const value = parseInt(match[1], 10);
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[match[2]] ?? 60);
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    saveRefreshToken,
    verifyRefreshToken,
    deleteRefreshToken,
    deleteAllUserSessions,
    cleanExpiredSessions,
    parseTtlSeconds,
    DEFAULT_TENANT_ID, // ✅ SaaS: controller/job-এ tenant_id লাগলে এটাই fallback ব্যবহার করো
};
