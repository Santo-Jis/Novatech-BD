const { query } = require('../config/db');

// ============================================================
// CREATE NOTICE
// POST /api/notices
// ============================================================
const createNotice = async (req, res) => {
    try {
        const { title, message, target_role, expires_in_hours } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'শিরোনাম ও বার্তা দিন।' });
        }

        // মেয়াদ হিসাব
        let expiresAt = null;
        if (expires_in_hours && expires_in_hours !== 'forever') {
            expiresAt = new Date(Date.now() + parseInt(expires_in_hours) * 60 * 60 * 1000);
        }

        const result = await query(
            `INSERT INTO notices (title, message, target_role, created_by, expires_at)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [title, message, target_role || 'all', req.user.id, expiresAt]
        );

        return res.status(201).json({ success: true, message: 'নোটিশ তৈরি হয়েছে।', data: result.rows[0] });
    } catch (error) {
        console.error('❌ Create Notice Error:', error.message);
        return res.status(500).json({ success: false, message: 'নোটিশ তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET NOTICES (role-filtered, active only)
// GET /api/notices
// ============================================================
const getNotices = async (req, res) => {
    try {
        const role = req.user.role;

        // role অনুযায়ী ফিল্টার
        const roleFilter = role === 'admin'
            ? `target_role IN ('all', 'admin')`
            : ['manager','supervisor','asm','rsm','accountant'].includes(role)
                ? `target_role IN ('all', 'manager')`
                : `target_role IN ('all', 'worker')`;

        const result = await query(
            `SELECT n.*, u.name_bn AS creator_name
             FROM notices n
             LEFT JOIN users u ON n.created_by = u.id
             WHERE ${roleFilter}
               AND n.is_active = true
               AND (n.expires_at IS NULL OR n.expires_at > NOW())
             ORDER BY n.created_at DESC`
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ Get Notices Error:', error.message);
        return res.status(500).json({ success: false, message: 'নোটিশ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ALL NOTICES (Admin — manage করতে)
// GET /api/notices/all
// ============================================================
const getAllNotices = async (req, res) => {
    try {
        const result = await query(
            `SELECT n.*, u.name_bn AS creator_name
             FROM notices n
             LEFT JOIN users u ON n.created_by = u.id
             ORDER BY n.created_at DESC
             LIMIT 100`
        );
        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ Get All Notices Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE NOTICE
// DELETE /api/notices/:id
// ============================================================
const deleteNotice = async (req, res) => {
    try {
        await query(
            `UPDATE notices SET is_active = false WHERE id = $1 AND created_by = $2`,
            [req.params.id, req.user.id]
        );
        return res.status(200).json({ success: true, message: 'নোটিশ মুছা হয়েছে।' });
    } catch (error) {
        console.error('❌ Delete Notice Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

module.exports = { createNotice, getNotices, getAllNotices, deleteNotice };
