const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const { query } = require('../config/db');
const {
    generateAccessToken,
    generateRefreshToken,
    saveRefreshToken,
    verifyRefreshToken,
    deleteRefreshToken
} = require('../services/auth.service');
const { saveFCMToken: saveFCMTokenToDB, clearFCMToken } = require('../services/fcm.service');
const { generateOTP } = require('../config/encryption');

// ──────────────────────────────────────────────────────────────
// OTP HASH HELPER
// Plain OTP ইমেইলে পাঠানো হয়, DB-তে শুধু hash রাখা হয়।
// DB leak হলেও attacker সরাসরি OTP ব্যবহার করতে পারবে না।
// SHA-256 ব্যবহার — bcrypt এর মতো slow হওয়ার দরকার নেই
// কারণ OTP ১০ মিনিটেই expire হয় এবং ৬ সংখ্যার।
// ──────────────────────────────────────────────────────────────
const hashOTP = (otp) =>
    crypto.createHash('sha256').update(otp).digest('hex');

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

        // Refresh Token DB তে সেভ (fail হলেও login চলবে)
        try {
            await saveRefreshToken(user.id, refreshToken);
        } catch (tokenErr) {
            console.warn('⚠️ RefreshToken save failed:', tokenErr.message);
        }

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
        // ✅ sendBeacon থেকে আসলে body text/plain হয় — parse করতে হবে
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { body = {}; }
        }

        const { refreshToken } = body;
        const userId = req.user?.id;

        // FCM token DB থেকে মুছে ফেলো — পরের user যেন notification না পায়
        if (userId) {
            await clearFCMToken(userId);
        }

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

// ============================================================
// FORGOT PASSWORD - OTP পাঠাও
// POST /api/auth/forgot-password
// ============================================================

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'ইমেইল দিন।' });
        }

        // ইউজার আছে কিনা দেখো
        const result = await query(
            `SELECT id, name_bn, email, status FROM users WHERE email = $1`,
            [email.trim().toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'এই ইমেইল দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' });
        }

        const user = result.rows[0];

        if (user.status !== 'active') {
            return res.status(403).json({ success: false, message: 'এই অ্যাকাউন্ট সক্রিয় নয়।' });
        }

        // ─── FIX #3a: Secure OTP তৈরি ────────────────────────────
        // আগে: Math.random() — cryptographically insecure
        // এখন: generateOTP() — crypto.randomBytes() ব্যবহার করে,
        //       encryption.js-এ আগে থেকেই আছে
        const otp       = generateOTP(6);
        const otpHash   = hashOTP(otp);          // DB-তে শুধু hash যাবে
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // ১০ মিনিট

        // OTP DB তে সেভ করো (আগেরটা মুছে) — plain OTP নয়, hash রাখো
        await query(`DELETE FROM password_reset_otps WHERE user_id = $1`, [user.id]);
        await query(
            `INSERT INTO password_reset_otps (user_id, otp, expires_at) VALUES ($1, $2, $3)`,
            [user.id, otpHash, expiresAt]
        );

        // Email পাঠাও
        const { sendEmail } = require('../services/email.service');
        const html = `<div style="font-family:Arial;max-width:500px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden">
          <div style="background:#1e3a8a;padding:20px;text-align:center">
            <h2 style="color:white;margin:0">NovaTech BD</h2>
          </div>
          <div style="padding:24px">
            <p>আস্সালামু আলাইকুম <strong>${user.name_bn}</strong>,</p>
            <p>আপনার পাসওয়ার্ড রিসেটের জন্য OTP কোড:</p>
            <div style="background:#f0f4ff;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
              <p style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#1e3a8a;margin:0">${otp}</p>
            </div>
            <p style="color:#e74c3c;font-size:13px">⚠️ এই কোডটি <strong>১০ মিনিট</strong> পর্যন্ত কার্যকর। কাউকে শেয়ার করবেন না।</p>
            <div style="text-align:center;margin:20px 0">
              <a href="https://novatech-bd-kqrn.vercel.app" style="background:#1e3a8a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">🚀 অ্যাপে যান</a>
            </div>
            <p style="font-size:13px;color:#666;text-align:center"><a href="https://novatech-bd-kqrn.vercel.app" style="color:#1e3a8a">https://novatech-bd-kqrn.vercel.app</a></p>
            <p>ধন্যবাদ,<br><strong>NovaTech BD টিম</strong></p>
          </div>
        </div>`;

        await sendEmail(user.email, 'NovaTech BD - পাসওয়ার্ড রিসেট OTP 🔑', html);

        return res.status(200).json({ success: true, message: 'OTP আপনার ইমেইলে পাঠানো হয়েছে।' });

    } catch (error) {
        console.error('❌ Forgot Password Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// VERIFY OTP
// POST /api/auth/verify-otp
// ============================================================

const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'ইমেইল ও OTP দিন।' });
        }

        const userResult = await query(`SELECT id FROM users WHERE email = $1`, [email.trim().toLowerCase()]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'ইমেইল পাওয়া যায়নি।' });
        }

        const userId = userResult.rows[0].id;

        // ─── FIX #3b: Plain OTP নয়, hash দিয়ে DB compare করো ──
        // আগে: WHERE otp = $2 (plain text match — DB leak = instant compromise)
        // এখন: OTP-এর hash বের করে hash column-এর সাথে মেলাও
        const otpHash = hashOTP(otp);

        const otpResult = await query(
            `SELECT * FROM password_reset_otps WHERE user_id = $1 AND otp = $2 AND expires_at > NOW() AND used = false`,
            [userId, otpHash]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP ভুল অথবা মেয়াদ শেষ।' });
        }

        // OTP সঠিক — reset_token তৈরি করো
        const resetToken  = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // ১৫ মিনিট

        await query(
            `UPDATE password_reset_otps SET used = true, reset_token = $1, token_expires_at = $2 WHERE user_id = $3 AND otp = $4`,
            [resetToken, tokenExpiry, userId, otpHash]
        );

        return res.status(200).json({ success: true, message: 'OTP সঠিক।', data: { reset_token: resetToken } });

    } catch (error) {
        console.error('❌ Verify OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// RESET PASSWORD (OTP দিয়ে)
// POST /api/auth/reset-password
// ============================================================

const resetPasswordWithOtp = async (req, res) => {
    try {
        const { email, reset_token, new_password } = req.body;

        if (!email || !reset_token || !new_password) {
            return res.status(400).json({ success: false, message: 'সব তথ্য দিন।' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ success: false, message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
        }

        const userResult = await query(`SELECT id FROM users WHERE email = $1`, [email.trim().toLowerCase()]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'ইমেইল পাওয়া যায়নি।' });
        }

        const userId = userResult.rows[0].id;

        const tokenResult = await query(
            `SELECT * FROM password_reset_otps WHERE user_id = $1 AND reset_token = $2 AND token_expires_at > NOW() AND used = true`,
            [userId, reset_token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'রিসেট টোকেন অবৈধ বা মেয়াদ শেষ।' });
        }

        // নতুন পাসওয়ার্ড সেভ
        const newHash = await bcrypt.hash(new_password, 12);
        await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newHash, userId]);

        // OTP রেকর্ড মুছে ফেলো
        await query(`DELETE FROM password_reset_otps WHERE user_id = $1`, [userId]);

        return res.status(200).json({ success: true, message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে! এখন লগইন করুন।' });

    } catch (error) {
        console.error('❌ Reset Password OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SAVE FCM TOKEN
// POST /api/auth/fcm-token
// ============================================================

const saveFCMToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        const userId = req.user.id;

        if (!fcmToken || typeof fcmToken !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'fcmToken প্রয়োজন'
            });
        }

        await saveFCMTokenToDB(userId, fcmToken);

        return res.json({
            success: true,
            message: 'FCM Token সেভ হয়েছে'
        });
    } catch (error) {
        console.error('❌ FCM Token Save Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'FCM Token সেভ ব্যর্থ'
        });
    }
};

// ============================================================
// POST /api/auth/check-email
// Google Login এর পর email দিয়ে user type চেক করবে
// কাস্টমার → portal_jwt দেবে
// কর্মী    → পাসওয়ার্ড চাইবে
// অচেনা   → 404
// ============================================================
const checkEmailType = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email দেওয়া হয়নি।'
            });
        }

        const cleanEmail = email.toLowerCase().trim();

        // ১. কর্মী কিনা দেখো
        // users টেবিলে is_active কলাম নেই — status দিয়ে চেক করো
        const workerResult = await query(
            `SELECT id, role, name_bn, status
             FROM users
             WHERE email = $1
               AND status NOT IN ('archived', 'suspended')`,
            [cleanEmail]
        );

        if (workerResult.rows.length > 0) {
            const worker = workerResult.rows[0];

            if (worker.status === 'pending') {
                return res.status(403).json({
                    success: false,
                    type: 'blocked',
                    message: 'আপনার অ্যাকাউন্ট অনুমোদিত হয়নি। Admin এর সাথে যোগাযোগ করুন।'
                });
            }

            return res.status(200).json({
                success: true,
                type: 'worker',
                message: 'কর্মী পাওয়া গেছে।',
                data: { name: worker.name_bn, role: worker.role }
            });
        }

        // ২. কাস্টমার কিনা দেখো
        const customerResult = await query(
            `SELECT id, shop_name, owner_name, customer_code
             FROM customers
             WHERE email = $1 AND is_active = true`,
            [cleanEmail]
        );

        if (customerResult.rows.length > 0) {
            const customer = customerResult.rows[0];

            const jwt = require('jsonwebtoken');
            // ✅ FIX: Employee JWT_ACCESS_SECRET থেকে আলাদা secret ব্যবহার করো।
            // একই secret হলে customer token দিয়ে employee route access সম্ভব।
            const portalSecret = process.env.JWT_PORTAL_SECRET;
            if (!portalSecret) {
                console.error('❌ JWT_PORTAL_SECRET environment variable সেট নেই!');
                return res.status(500).json({ success: false, message: 'Server configuration error.' });
            }
            const portalJWT = jwt.sign(
                { customer_id: customer.id, email: cleanEmail, type: 'customer_portal' },
                portalSecret,
                { expiresIn: '30d' }
            );

            return res.status(200).json({
                success: true,
                type: 'customer',
                message: 'কাস্টমার পাওয়া গেছে।',
                data: {
                    portal_jwt:    portalJWT,
                    customer_id:   customer.id,
                    shop_name:     customer.shop_name,
                    owner_name:    customer.owner_name,
                    customer_code: customer.customer_code
                }
            });
        }

        // ৩. অচেনা
        return res.status(404).json({
            success: false,
            type: 'unknown',
            message: 'এই Email দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি।'
        });

    } catch (error) {
        console.error('❌ checkEmailType Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।'
        });
    }
};

module.exports = {
    login,
    refresh,
    logout,
    me,
    changePassword,
    forgotPassword,
    verifyOtp,
    resetPasswordWithOtp,
    saveFCMToken,
    checkEmailType
};
