const crypto = require('crypto');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { isUserBlocked, unblockUser } = require('../config/redis');
const { generateOTP } = require('../config/encryption');
const { logPlatformAction } = require('../services/platformAudit.service');

// ============================================================
// Support Panel — User Lookup / Unblock / Reset-Link / Tickets
// Security & Access Doc §১-২ অনুযায়ী স্কোপ: 'full', 'support'
// (destructive tenant action এখানে নেই — সেটা superAdmin এজেন্টের কাজ)
// ============================================================

const hashOTP = (otp) => {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) throw new Error('ENCRYPTION_KEY environment variable সেট নেই');
    return crypto.createHmac('sha256', secret).update(String(otp)).digest('hex');
};

// ─── User Status Lookup (phone অথবা email দিয়ে) ─────────────
const lookupUser = async (req, res) => {
    const { q } = req.query; // phone অথবা email

    if (!q) {
        return res.status(400).json({ success: false, message: 'phone বা email দিয়ে সার্চ করুন (?q=)' });
    }

    try {
        const result = await query(
            `SELECT u.id, u.name_bn, u.name_en, u.email, u.phone, u.role, u.status,
                    u.tenant_id, t.company_name
             FROM users u
             LEFT JOIN tenants t ON t.id = u.tenant_id
             WHERE u.email = $1 OR u.phone = $1
             LIMIT 5`,
            [q.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কোনো ইউজার পাওয়া যায়নি।' });
        }

        // প্রতিটা user-এর জন্য Redis block status যোগ করো
        const data = await Promise.all(result.rows.map(async (u) => ({
            ...u,
            is_blocked: await isUserBlocked(u.id),
        })));

        return res.json({ success: true, data });
    } catch (err) {
        logger.error('❌ platformSupport.lookupUser Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── User Unblock (Redis blocklist clear) ───────────────────
const unblockUserAccount = async (req, res) => {
    const { id } = req.params;

    try {
        const userResult = await query('SELECT id, name_bn, status FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি।' });
        }

        await unblockUser(id);

        return res.json({ success: true, message: `${userResult.rows[0].name_bn}-এর ব্লক সরানো হয়েছে।` });
    } catch (err) {
        logger.error('❌ platformSupport.unblockUserAccount Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── Password Reset Link Trigger (OTP email পাঠায়, Support নিজে পাসওয়ার্ড সেট করতে পারে না) ───
const triggerPasswordReset = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await query('SELECT id, name_bn, email, status FROM users WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি।' });
        }

        const user = result.rows[0];

        if (!user.email) {
            return res.status(400).json({ success: false, message: 'এই ইউজারের কোনো ইমেইল সেট নেই, reset link পাঠানো যাচ্ছে না।' });
        }

        const otp       = generateOTP(6);
        const otpHash    = hashOTP(otp);
        const expiresAt  = new Date(Date.now() + 10 * 60 * 1000);

        await query('DELETE FROM password_reset_otps WHERE user_id = $1', [user.id]);
        await query(
            'INSERT INTO password_reset_otps (user_id, otp, expires_at) VALUES ($1, $2, $3)',
            [user.id, otpHash, expiresAt]
        );

        const { sendEmail } = require('../services/email.service');
        const html = `<div style="font-family:Arial;max-width:500px;margin:auto;border:1px solid #eee;border-radius:10px;overflow:hidden">
          <div style="background:#1e3a8a;padding:20px;text-align:center"><h2 style="color:white;margin:0">ZovoriX</h2></div>
          <div style="padding:24px">
            <p>আস্সালামু আলাইকুম <strong>${user.name_bn}</strong>,</p>
            <p>আমাদের সাপোর্ট টিমের অনুরোধে আপনার পাসওয়ার্ড রিসেটের জন্য OTP কোড পাঠানো হলো:</p>
            <div style="background:#f0f4ff;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
              <p style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#1e3a8a;margin:0">${otp}</p>
            </div>
            <p style="color:#e74c3c;font-size:13px">⚠️ এই কোডটি ১০ মিনিট পর্যন্ত কার্যকর। কাউকে শেয়ার করবেন না। আপনি যদি রিসেট রিকোয়েস্ট না করে থাকেন, এই ইমেইল উপেক্ষা করুন।</p>
          </div>
        </div>`;

        await sendEmail(user.email, 'ZovoriX - পাসওয়ার্ড রিসেট OTP (Support সহায়তা) 🔑', html);

        return res.json({ success: true, message: `${user.name_bn}-এর ইমেইলে reset OTP পাঠানো হয়েছে।` });
    } catch (err) {
        logger.error('❌ platformSupport.triggerPasswordReset Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ─── Tickets ─────────────────────────────────────────────────
const createTicket = async (req, res) => {
    const { tenant_id, user_id, subject, description } = req.body;

    if (!subject) {
        return res.status(400).json({ success: false, message: 'subject আবশ্যক' });
    }

    try {
        const result = await query(
            `INSERT INTO support_tickets (tenant_id, user_id, subject, description, created_by, assigned_to)
             VALUES ($1, $2, $3, $4, $5, $5)
             RETURNING *`,
            [tenant_id || null, user_id || null, subject, description || null, req.platformStaff.id]
        );
        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        logger.error('❌ platformSupport.createTicket Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

const listTickets = async (req, res) => {
    const { status, mine } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
    }
    if (mine === 'true') {
        params.push(req.platformStaff.id);
        conditions.push(`assigned_to = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        const result = await query(
            `SELECT st.*, t.company_name
             FROM support_tickets st
             LEFT JOIN tenants t ON t.id = st.tenant_id
             ${where}
             ORDER BY st.created_at DESC
             LIMIT 100`,
            params
        );
        return res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('❌ platformSupport.listTickets Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

const updateTicket = async (req, res) => {
    const { id } = req.params;
    const { status, resolution_note, assigned_to } = req.body;

    const fields = [];
    const params = [];

    if (status) { params.push(status); fields.push(`status = $${params.length}`); }
    if (resolution_note !== undefined) { params.push(resolution_note); fields.push(`resolution_note = $${params.length}`); }
    if (assigned_to !== undefined) { params.push(assigned_to); fields.push(`assigned_to = $${params.length}`); }
    if (status === 'closed') { fields.push(`closed_at = NOW()`); }

    if (fields.length === 0) {
        return res.status(400).json({ success: false, message: 'কোনো পরিবর্তনযোগ্য ফিল্ড দেওয়া হয়নি।' });
    }

    params.push(id);

    try {
        const result = await query(
            `UPDATE support_tickets SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
            params
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Ticket পাওয়া যায়নি।' });
        }
        return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        logger.error('❌ platformSupport.updateTicket Error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    lookupUser,
    unblockUserAccount,
    triggerPasswordReset,
    createTicket,
    listTickets,
    updateTicket,
};
