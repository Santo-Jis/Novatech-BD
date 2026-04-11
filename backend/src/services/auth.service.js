const jwt       = require('jsonwebtoken');
const { query } = require('../config/db');

// ============================================================
// Auth Service — JWT Token ব্যবস্থাপনা
// ============================================================

// Access Token তৈরি (১৫ মিনিট)
const generateAccessToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
            role:   user.role,
            name:   user.name_bn
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
        expiresAt.setDate(expiresAt.getDate() + 7); // ৭ দিন পরে

        await query(
            `INSERT INTO user_sessions (user_id, refresh_token, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (refresh_token) DO UPDATE SET expires_at = $3`,
            [userId, refreshToken, expiresAt]
        );
    } catch (error) {
        // Session save fail হলেও login চলবে
        console.warn('⚠️ Session save failed (non-critical):', error.message);
    }
};

// Refresh Token যাচাই ও নতুন Access Token দেওয়া
const verifyRefreshToken = async (refreshToken) => {
    // ১. JWT যাচাই
    let decoded;
    try {
        decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
        throw new Error('অবৈধ বা মেয়াদোত্তীর্ণ Refresh Token।');
    }

    // ২. DB তে আছে কিনা যাচাই
    const sessionResult = await query(
        `SELECT * FROM user_sessions 
         WHERE refresh_token = $1 AND expires_at > NOW()`,
        [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
        throw new Error('Session পাওয়া যায়নি। আবার লগইন করুন।');
    }

    // ৩. User তথ্য নাও
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

// একজন ইউজারের সব Session মুছে দেওয়া (সব ডিভাইস থেকে লগআউট)
const deleteAllUserSessions = async (userId) => {
    await query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [userId]
    );
};

// মেয়াদোত্তীর্ণ Session পরিষ্কার (ব্যাকগ্রাউন্ড জব থেকে)
const cleanExpiredSessions = async () => {
    const result = await query(
        'DELETE FROM user_sessions WHERE expires_at < NOW()'
    );
    console.log(`🧹 ${result.rowCount} মেয়াদোত্তীর্ণ session মুছে দেওয়া হয়েছে`);
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    saveRefreshToken,
    verifyRefreshToken,
    deleteRefreshToken,
    deleteAllUserSessions,
    cleanExpiredSessions
};
