const bcrypt    = require('bcryptjs');
const { query } = require('../config/db');
const {
    generateAccessToken,
    generateRefreshToken,
    saveRefreshToken,
    verifyRefreshToken,
    deleteRefreshToken
} = require('../services/auth.service');

// ============================================================
// LOGIN
// POST /api/auth/login
// ৩ ভাবে লগইন: ইমেইল / ফোন / কর্মী কোড + পাসওয়ার্ড
// ============================================================

const login = async (req, res) => {
    try {
        const { identifier, password } = req.body;

        // ইনপুট যাচাই
        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                message: 'ইমেইল/ফোন/কোড এবং পাসওয়ার্ড দিন।'
            });
        }

        // ইমেইল, ফোন বা কর্মী কোড দিয়ে খোঁজো
        const result = await query(
            `SELECT id, role, employee_code, name_bn, name_en,
                    email, phone, password_hash, status, 
                    manager_id, basic_salary, outstanding_dues,
                    profile_photo
             FROM users
             WHERE email = $1 
                OR phone = $1 
                OR employee_code = $1`,
            [identifier.trim()]
        );

        // ইউজার না পেলে
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'ইমেইল/ফোন/কোড বা পাসওয়ার্ড ভুল।'
            });
        }

        const user = result.rows[0];

        // পাসওয়ার্ড যাচাই
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'ইমেইল/ফোন/কোড বা পাসওয়ার্ড ভুল।'
            });
        }

        // অ্যাকাউন্ট স্ট্যাটাস যাচাই
        if (user.status === 'pending') {
            return res.status(403).json({
                success: false,
                message: 'আপনার অ্যাকাউন্ট এখনো অনুমোদিত হয়নি। Admin এর সাথে যোগাযোগ করুন।'
            });
        }

        if (user.status === 'suspended') {
            return res.status(403).json({
                success: false,
                message: 'আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ। Admin এর সাথে যোগাযোগ করুন।'
            });
        }

        if (user.status === 'archived') {
            return res.status(403).json({
                success: false,
                message: 'এই অ্যাকাউন্ট নিষ্ক্রিয়।'
            });
        }

        // Token তৈরি
        const accessToken  = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Refresh Token DB তে সেভ
        await saveRefreshToken(user.id, refreshToken);

        // password_hash বাদ দিয়ে response পাঠাও
        const { password_hash, ...userData } = user;

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল।',
            data: {
                user:         userData,
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        console.error('❌ Login Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'লগইনে সমস্যা হয়েছে।'
        });
    }
};

// ============================================================
// REFRESH TOKEN
// POST /api/auth/refresh
// Refresh Token দিয়ে নতুন Access Token নেওয়া
// ============================================================

const refresh = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh Token দিন।'
            });
        }

        // Token যাচাই ও user তথ্য নাও
        const user = await verifyRefreshToken(refreshToken);

        // নতুন Access Token তৈরি
        const newAccessToken = generateAccessToken(user);

        return res.status(200).json({
            success: true,
            message: 'নতুন টোকেন পাওয়া গেছে।',
            data: {
                accessToken: newAccessToken
            }
        });

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: error.message || 'টোকেন রিফ্রেশ ব্যর্থ।'
        });
    }
};

// ============================================================
// LOGOUT
// POST /api/auth/logout
// ============================================================

const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            await deleteRefreshToken(refreshToken);
        }

        return res.status(200).json({
            success: true,
            message: 'লগআউট সফল।'
        });

    } catch (error) {
        console.error('❌ Logout Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'লগআউটে সমস্যা হয়েছে।'
        });
    }
};

// ============================================================
// ME
// GET /api/auth/me
// বর্তমান লগইন করা ইউজারের তথ্য
// ============================================================

const me = async (req, res) => {
    try {
        const result = await query(
            `SELECT id, role, employee_code, name_bn, name_en,
                    email, phone, phone2, dob, gender,
                    marital_status, nid, permanent_address,
                    current_address, district, thana,
                    skills, education, experience,
                    emergency_contact, profile_photo,
                    basic_salary, join_date, status,
                    outstanding_dues, manager_id,
                    created_at
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'ব্যবহারকারী পাওয়া যায়নি।'
            });
        }

        return res.status(200).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Me Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'তথ্য আনতে সমস্যা হয়েছে।'
        });
    }
};

// ============================================================
// CHANGE PASSWORD
// PUT /api/auth/change-password
// ============================================================

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'বর্তমান ও নতুন পাসওয়ার্ড দিন।'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'
            });
        }

        // বর্তমান পাসওয়ার্ড যাচাই
        const result = await query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        );

        const isValid = await bcrypt.compare(
            currentPassword,
            result.rows[0].password_hash
        );

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: 'বর্তমান পাসওয়ার্ড ভুল।'
            });
        }

        // নতুন পাসওয়ার্ড hash করো
        const newHash = await bcrypt.hash(newPassword, 12);

        await query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newHash, req.user.id]
        );

        return res.status(200).json({
            success: true,
            message: 'পাসওয়ার্ড পরিবর্তন সফল।'
        });

    } catch (error) {
        console.error('❌ Change Password Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'পাসওয়ার্ড পরিবর্তনে সমস্যা হয়েছে।'
        });
    }
};

module.exports = {
    login,
    refresh,
    logout,
    me,
    changePassword
};
