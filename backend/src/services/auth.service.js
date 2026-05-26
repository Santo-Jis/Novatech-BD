const jwt       = require('jsonwebtoken');
const { query } = require('../config/db');
const { blockUserTokens, unblockUser } = require('../config/redis');

// ============================================================
// Auth Service — JWT Token ব্যবস্থাপনা
// ============================================================

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
        console.warn('⚠️ Session save failed (non-critical):', error.message);
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
                status, manager_id, employee_code
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
// ✅ FIX: suspend/archive করলে শুধু DB session মুছলে হয় না —
//   বিদ্যমান access token এখনো valid থাকে (সর্বোচ্চ ১৫ মিনিট)।
//   Redis blocklist-এ user-কে যোগ করলে instant block হয়।
//
// ব্যবহার:
//   await deleteAllUserSessions(userId);                       // suspend/archive
//   await deleteAllUserSessions(userId, { reactivating: true }); // পুনরায় active
// ============================================================
const deleteAllUserSessions = async (userId, { reactivating = false } = {}) => {
    await query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId]
    );

    if (reactivating) {
        await unblockUser(userId);
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
    console.log(`🧹 ${result.rowCount} মেয়াদোত্তীর্ণ session মুছে দেওয়া হয়েছে`);
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
};
