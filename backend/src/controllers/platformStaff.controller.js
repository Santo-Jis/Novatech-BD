/**
 * platformStaff.controller.js — নতুন ফাইল
 * platform_staff অ্যাকাউন্ট (Support/Full) ম্যানেজ করার জন্য।
 *
 * ⚠️ পুরো ফাইলটাই requireScope('full')-এর পেছনে থাকবে (routes ফাইলে বসানো) —
 * Support scope নিজে নতুন staff (এমনকি নিজের মতো আরেকটা support account-ও)
 * তৈরি করতে পারবে না, privilege-escalation ঝুঁকি এড়াতে।
 */

const bcrypt = require('bcryptjs');
const logger = require('../config/logger');
const { query } = require('../config/db');

const VALID_SCOPES  = ['full', 'support'];
const VALID_STATUSES = ['active', 'suspended'];

// ─── সব Platform Staff দেখো ───────────────────────────────────
const listStaff = async (req, res) => {
    try {
        const result = await query(
            `SELECT id, name, email, scope, status, last_login_at, created_at
             FROM platform_staff
             ORDER BY created_at ASC`
        );
        return res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('❌ platformStaff.listStaff Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── নতুন Staff তৈরি ──────────────────────────────────────────
const createStaff = async (req, res) => {
    const { name, email, password, scope } = req.body;

    if (!name?.trim() || !email?.trim() || !password || !scope) {
        return res.status(400).json({ success: false, message: 'name, email, password, scope — সব দিতে হবে।' });
    }
    if (!VALID_SCOPES.includes(scope)) {
        return res.status(400).json({ success: false, message: `scope অবশ্যই 'full' অথবা 'support' হতে হবে।` });
    }
    if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' });
    }

    try {
        const existing = await query('SELECT id FROM platform_staff WHERE email = $1', [email.trim().toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'এই email দিয়ে ইতিমধ্যে একটা staff account আছে।' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await query(
            `INSERT INTO platform_staff (name, email, password_hash, scope, status)
             VALUES ($1, $2, $3, $4, 'active')
             RETURNING id, name, email, scope, status, created_at`,
            [name.trim(), email.trim().toLowerCase(), passwordHash, scope]
        );

        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        logger.error('❌ platformStaff.createStaff Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── Staff Suspend/Reactivate ─────────────────────────────────
const updateStaffStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `status অবশ্যই 'active' অথবা 'suspended' হতে হবে।` });
    }

    if (id === req.platformStaff.id && status === 'suspended') {
        return res.status(400).json({ success: false, message: 'নিজের অ্যাকাউন্ট নিজে suspend করা যাবে না।' });
    }

    try {
        const result = await query(
            `UPDATE platform_staff SET status = $1, updated_at = NOW() WHERE id = $2
             RETURNING id, name, email, scope, status`,
            [status, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Staff পাওয়া যায়নি।' });
        }
        return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        logger.error('❌ platformStaff.updateStaffStatus Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── Staff Password Reset (Full scope অন্য কারো password রিসেট করে দিতে পারবে) ───
const resetStaffPassword = async (req, res) => {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 8) {
        return res.status(400).json({ success: false, message: 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' });
    }

    try {
        const passwordHash = await bcrypt.hash(new_password, 10);
        const result = await query(
            `UPDATE platform_staff SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name`,
            [passwordHash, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Staff পাওয়া যায়নি।' });
        }
        return res.json({ success: true, message: `${result.rows[0].name}-এর পাসওয়ার্ড রিসেট হয়েছে।` });
    } catch (err) {
        logger.error('❌ platformStaff.resetStaffPassword Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { listStaff, createStaff, updateStaffStatus, resetStaffPassword };
