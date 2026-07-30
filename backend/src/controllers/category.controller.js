const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// GET CATEGORIES
// GET /api/categories
// ============================================================

const getCategories = async (req, res) => {
    try {
        const result = await query(
            `SELECT c.*, (
                SELECT COUNT(*) FROM products p
                WHERE p.category_id = c.id AND p.tenant_id = c.tenant_id
             ) AS product_count
             FROM product_categories c
             WHERE c.tenant_id = $1
             ORDER BY c.name ASC`,
            [req.tenantId]
        );
        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Categories Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE CATEGORY
// POST /api/categories
// ============================================================

const createCategory = async (req, res) => {
    try {
        const { name, name_bn, parent_id } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'ক্যাটাগরির নাম আবশ্যক।' });
        }

        const result = await query(
            `INSERT INTO product_categories (tenant_id, name, name_bn, parent_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.tenantId, name, name_bn || null, parent_id || null]
        );

        return res.status(201).json({
            success: true,
            message: 'ক্যাটাগরি তৈরি সফল।',
            data: result.rows[0]
        });
    } catch (error) {
        logger.error('❌ Create Category Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই নামের ক্যাটাগরি আগে থেকেই আছে।' });
        }
        return res.status(500).json({ success: false, message: 'ক্যাটাগরি তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE CATEGORY
// PUT /api/categories/:id
// ============================================================

const updateCategory = async (req, res) => {
    try {
        const { name, name_bn, parent_id } = req.body;

        const result = await query(
            `UPDATE product_categories SET
                name      = COALESCE($1, name),
                name_bn   = COALESCE($2, name_bn),
                parent_id = $3
             WHERE id = $4 AND tenant_id = $5
             RETURNING *`,
            [
                name    ?? null,
                name_bn ?? null,
                parent_id ?? null,
                req.params.id,
                req.tenantId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ক্যাটাগরি পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, message: 'আপডেট সফল।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ Update Category Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE CATEGORY
// DELETE /api/categories/:id
// (শুধু তখনই ডিলিট হবে যদি কোনো প্রডাক্ট এই ক্যাটাগরি ব্যবহার না করে)
// ============================================================

const deleteCategory = async (req, res) => {
    try {
        const inUse = await query(
            `SELECT COUNT(*) FROM products WHERE category_id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );

        if (parseInt(inUse.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                message: `এই ক্যাটাগরিতে ${inUse.rows[0].count}টি প্রডাক্ট আছে — আগে সেগুলো সরিয়ে নিন।`
            });
        }

        const result = await query(
            `DELETE FROM product_categories WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ক্যাটাগরি পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, message: 'ক্যাটাগরি মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ Delete Category Error:', error.message);
        return res.status(500).json({ success: false, message: 'মুছতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
