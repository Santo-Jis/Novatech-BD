const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { logPlatformAction } = require('../services/platformAudit.service');

const PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET;
const ACCESS_TOKEN_TTL    = '15m'; // Security Doc §৪ — ছোট TTL

// ─── Login ────────────────────────────────────────────────
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
            'SELECT id, name, email, password_hash, scope, status FROM platform_staff WHERE email = $1',
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

        const accessToken = jwt.sign(
            { staffId: staff.id, scope: staff.scope, email: staff.email },
            PLATFORM_JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_TTL }
        );

        await query('UPDATE platform_staff SET last_login_at = NOW() WHERE id = $1', [staff.id]);

        await logPlatformAction({
            staffId: staff.id,
            staffEmail: staff.email,
            action: 'staff.login',
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
    } catch (err) {
        logger.error('❌ platformAuth.login Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { login };
