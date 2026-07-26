const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { logPlatformAction } = require('../services/platformAudit.service');
const { decrypt } = require('../config/encryption');
const { verifyTOTP, hashRecoveryCode } = require('../services/totp.service');

const PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET;
const ACCESS_TOKEN_TTL    = '15m'; // Security Doc §৪ — ছোট TTL
const PENDING_2FA_TTL     = '5m';  // 2FA কোড দেওয়ার জন্য অল্প সময়ের window

// পাসওয়ার্ড ঠিক থাকলে ও 2FA পাস হলে — দুই জায়গা থেকেই ডাকা হয়,
// তাই আলাদা helper হিসেবে রাখা হলো (কোড ডুপ্লিকেট না করতে)।
const issueSessionAndRespond = async (res, staff, req, { viaRecoveryCode = false } = {}) => {
    const accessToken = jwt.sign(
        { staffId: staff.id, scope: staff.scope, email: staff.email },
        PLATFORM_JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_TTL }
    );

    await query('UPDATE platform_staff SET last_login_at = NOW() WHERE id = $1', [staff.id]);

    await logPlatformAction({
        staffId: staff.id,
        staffEmail: staff.email,
        action: viaRecoveryCode ? 'staff.login_via_recovery_code' : 'staff.login',
        targetType: 'platform_staff',
        targetId: staff.id,
        ip: req.ip,
    });

    return res.json({
        success: true,
        data: {
            accessToken,
            staff: { id: staff.id, name: staff.name, email: staff.email, scope: staff.scope },
        },
    });
};

// ─── Login (ধাপ ১: email+password) ────────────────────────────
const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'email ও password আবশ্যক' });
    }

    if (!PLATFORM_JWT_SECRET) {
        logger.error('❌ PLATFORM_JWT_SECRET env var সেট নেই — লগইন সম্ভব না।');
        return res.status(500).json({ success: false, message: 'Server misconfigured' });
    }

    try {
        const result = await query(
            'SELECT id, name, email, password_hash, scope, status, totp_enabled FROM platform_staff WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'ভুল email অথবা password।' });
        }

        const staff = result.rows[0];

        if (staff.status === 'suspended') {
            return res.status(403).json({ success: false, message: 'আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ।' });
        }

        const isValid = await bcrypt.compare(password, staff.password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'ভুল email অথবা password।' });
        }

        // ✅ 2FA চালু থাকলে — সরাসরি accessToken না দিয়ে ছোট মেয়াদের
        // pendingToken দেওয়া হয়, TOTP কোড verify হলে তারপর আসল token।
        if (staff.totp_enabled) {
            const pendingToken = jwt.sign(
                { staffId: staff.id, pending2FA: true },
                PLATFORM_JWT_SECRET,
                { expiresIn: PENDING_2FA_TTL }
            );
            return res.json({ success: true, data: { requires2FA: true, pendingToken } });
        }

        return issueSessionAndRespond(res, staff, req);
    } catch (err) {
        logger.error('❌ platformAuth.login Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── Login (ধাপ ২: TOTP কোড অথবা recovery code) ────────────────
const verify2FA = async (req, res) => {
    const { pendingToken, code } = req.body;

    if (!pendingToken || !code) {
        return res.status(400).json({ success: false, message: 'pendingToken ও code আবশ্যক' });
    }

    let decoded;
    try {
        decoded = jwt.verify(pendingToken, PLATFORM_JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ success: false, message: 'সেশনের মেয়াদ শেষ, আবার লগইন করুন।' });
    }

    if (!decoded.pending2FA) {
        return res.status(400).json({ success: false, message: 'অবৈধ token।' });
    }

    try {
        const result = await query(
            'SELECT id, name, email, scope, status, totp_secret, totp_enabled FROM platform_staff WHERE id = $1',
            [decoded.staffId]
        );
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Staff account পাওয়া যায়নি।' });
        }

        const staff = result.rows[0];

        if (staff.status === 'suspended') {
            return res.status(403).json({ success: false, message: 'আপনার অ্যাকাউন্ট সাময়িকভাবে বন্ধ।' });
        }
        if (!staff.totp_enabled || !staff.totp_secret) {
            return res.status(400).json({ success: false, message: '2FA চালু নেই এই অ্যাকাউন্টে।' });
        }

        const secret = decrypt(staff.totp_secret);
        const cleanedCode = String(code).trim();

        // প্রথমে সাধারণ ৬-সংখ্যার TOTP কোড হিসেবে try
        if (/^\d{6}$/.test(cleanedCode) && verifyTOTP(secret, cleanedCode)) {
            return issueSessionAndRespond(res, staff, req);
        }

        // না মিললে recovery code হিসেবে try (ফোন হারালে ব্যবহারের জন্য)
        const codeHash = hashRecoveryCode(cleanedCode);
        const recoveryResult = await query(
            `SELECT id FROM platform_staff_recovery_codes
             WHERE staff_id = $1 AND code_hash = $2 AND used_at IS NULL`,
            [staff.id, codeHash]
        );
        if (recoveryResult.rows.length > 0) {
            await query('UPDATE platform_staff_recovery_codes SET used_at = NOW() WHERE id = $1', [recoveryResult.rows[0].id]);
            return issueSessionAndRespond(res, staff, req, { viaRecoveryCode: true });
        }

        return res.status(401).json({ success: false, message: 'ভুল কোড। আবার চেষ্টা করুন।' });
    } catch (err) {
        logger.error('❌ platformAuth.verify2FA Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { login, verify2FA };
