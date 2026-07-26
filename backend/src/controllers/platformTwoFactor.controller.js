/**
 * platformTwoFactor.controller.js — নতুন ফাইল
 * 2FA setup/confirm/disable/status — সব endpoint-ই ইতিমধ্যে লগইন করা
 * (normal accessToken) staff-এর নিজের অ্যাকাউন্টের জন্য, req.platformStaff
 * থেকেই staffId নেওয়া হয় (routes ফাইলে platformAuth middleware বসানো)।
 */

const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { encrypt, decrypt } = require('../config/encryption');
const {
    generateSecret,
    verifyTOTP,
    buildOtpAuthUri,
    generateRecoveryCodes,
    hashRecoveryCode,
} = require('../services/totp.service');

// ─── বর্তমান 2FA স্ট্যাটাস ─────────────────────────────────────
const status = async (req, res) => {
    try {
        const result = await query(
            'SELECT totp_enabled FROM platform_staff WHERE id = $1',
            [req.platformStaff.id]
        );
        const unusedCodesResult = await query(
            `SELECT COUNT(*) AS count FROM platform_staff_recovery_codes
             WHERE staff_id = $1 AND used_at IS NULL`,
            [req.platformStaff.id]
        );
        return res.json({
            success: true,
            data: {
                enabled: result.rows[0]?.totp_enabled || false,
                remaining_recovery_codes: parseInt(unusedCodesResult.rows[0].count, 10),
            },
        });
    } catch (err) {
        logger.error('❌ platformTwoFactor.status Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── সেটআপ শুরু — নতুন সিক্রেট + QR তৈরি (এখনো enable হয় না) ───
const setupStart = async (req, res) => {
    try {
        const secret = generateSecret();
        const encryptedSecret = encrypt(secret);

        await query(
            'UPDATE platform_staff SET totp_pending_secret = $1 WHERE id = $2',
            [encryptedSecret, req.platformStaff.id]
        );

        const otpauthUri = buildOtpAuthUri(secret, req.platformStaff.email);
        const qrDataUrl = await QRCode.toDataURL(otpauthUri);

        return res.json({
            success: true,
            data: { qrDataUrl, secret, otpauthUri },
        });
    } catch (err) {
        logger.error('❌ platformTwoFactor.setupStart Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── প্রথম কোড verify করে 2FA চালু করা + recovery codes ইস্যু ───
const setupConfirm = async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ success: false, message: 'code আবশ্যক' });
    }

    try {
        const result = await query(
            'SELECT totp_pending_secret FROM platform_staff WHERE id = $1',
            [req.platformStaff.id]
        );
        const pendingSecret = result.rows[0]?.totp_pending_secret;
        if (!pendingSecret) {
            return res.status(400).json({ success: false, message: 'আগে সেটআপ শুরু করুন (QR স্ক্যান করুন)।' });
        }

        const secret = decrypt(pendingSecret);
        if (!verifyTOTP(secret, code)) {
            return res.status(400).json({ success: false, message: 'ভুল কোড। Authenticator app-এর কোড আবার চেক করুন।' });
        }

        // পুরনো recovery codes (যদি থাকে) মুছে নতুন সেট বানানো হচ্ছে
        await query('DELETE FROM platform_staff_recovery_codes WHERE staff_id = $1', [req.platformStaff.id]);

        const recoveryCodes = generateRecoveryCodes(8);
        for (const rc of recoveryCodes) {
            await query(
                'INSERT INTO platform_staff_recovery_codes (staff_id, code_hash) VALUES ($1, $2)',
                [req.platformStaff.id, hashRecoveryCode(rc)]
            );
        }

        await query(
            `UPDATE platform_staff
             SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled = true
             WHERE id = $1`,
            [req.platformStaff.id]
        );

        return res.json({
            success: true,
            message: '2FA চালু হয়েছে।',
            data: { recoveryCodes }, // ⚠️ শুধু এই একবারই দেখানো হবে, আর কখনো ফেরত দেওয়া যাবে না
        });
    } catch (err) {
        logger.error('❌ platformTwoFactor.setupConfirm Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── 2FA বন্ধ করা — নিরাপত্তার জন্য বর্তমান পাসওয়ার্ড লাগবে ───
const disable = async (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ success: false, message: 'নিরাপত্তার জন্য বর্তমান পাসওয়ার্ড দিন।' });
    }

    try {
        const result = await query('SELECT password_hash FROM platform_staff WHERE id = $1', [req.platformStaff.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Staff পাওয়া যায়নি।' });
        }

        const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'ভুল পাসওয়ার্ড।' });
        }

        await query(
            `UPDATE platform_staff SET totp_enabled = false, totp_secret = NULL, totp_pending_secret = NULL WHERE id = $1`,
            [req.platformStaff.id]
        );
        await query('DELETE FROM platform_staff_recovery_codes WHERE staff_id = $1', [req.platformStaff.id]);

        return res.json({ success: true, message: '2FA বন্ধ করা হয়েছে।' });
    } catch (err) {
        logger.error('❌ platformTwoFactor.disable Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── Recovery codes আবার নতুন করে জেনারেট (পুরনোগুলো বাতিল) ───
const regenerateRecoveryCodes = async (req, res) => {
    try {
        const staffResult = await query('SELECT totp_enabled FROM platform_staff WHERE id = $1', [req.platformStaff.id]);
        if (!staffResult.rows[0]?.totp_enabled) {
            return res.status(400).json({ success: false, message: '2FA চালু নেই।' });
        }

        await query('DELETE FROM platform_staff_recovery_codes WHERE staff_id = $1', [req.platformStaff.id]);

        const recoveryCodes = generateRecoveryCodes(8);
        for (const rc of recoveryCodes) {
            await query(
                'INSERT INTO platform_staff_recovery_codes (staff_id, code_hash) VALUES ($1, $2)',
                [req.platformStaff.id, hashRecoveryCode(rc)]
            );
        }

        return res.json({ success: true, data: { recoveryCodes } });
    } catch (err) {
        logger.error('❌ platformTwoFactor.regenerateRecoveryCodes Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { status, setupStart, setupConfirm, disable, regenerateRecoveryCodes };
