const { query } = require('../config/db');

// ============================================================
// GET PRODUCTS
// GET /api/products
// ============================================================

const getProducts = async (req, res) => {
    try {
        const { search, is_active = true } = req.query;

        let conditions = [`is_active = $1`];
        let params     = [is_active];
        let paramCount = 1;

        if (search) {
            paramCount++;
            conditions.push(`(name ILIKE $${paramCount} OR sku ILIKE $${paramCount})`);
            params.push(`%${search}%`);
        }

        const result = await query(
            `SELECT id, name, sku, price, stock, reserved_stock,
                    (stock - COALESCE((
                        SELECT SUM((item->>'quantity')::int)
                        FROM orders o,
                             jsonb_array_elements(
                                 CASE WHEN jsonb_typeof(o.items::jsonb) = 'array'
                                      THEN o.items::jsonb
                                      ELSE '[]'::jsonb
                                 END
                             ) AS item
                        WHERE (item->>'product_id')::uuid = p.id
                          AND o.status IN ('pending', 'approved', 'processing')
                    ), 0)) AS available_stock,
                    unit, is_active, updated_at,
                    image_url, description,
                    discount, discount_type, vat, tax
             FROM products p
             WHERE ${conditions.join(' AND ')}
             ORDER BY name ASC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Get Products Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ONE PRODUCT
// GET /api/products/:id
// ============================================================

const getProduct = async (req, res) => {
    try {
        const result = await query(
            `SELECT *, (stock - COALESCE((
                        SELECT SUM((item->>'quantity')::int)
                        FROM orders o,
                             jsonb_array_elements(
                                 CASE WHEN jsonb_typeof(o.items::jsonb) = 'array'
                                      THEN o.items::jsonb
                                      ELSE '[]'::jsonb
                                 END
                             ) AS item
                        WHERE (item->>'product_id')::uuid = p.id
                          AND o.status IN ('pending', 'approved', 'processing')
                    ), 0)) AS available_stock
             FROM products p WHERE id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('❌ Get Product Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE PRODUCT
// POST /api/products
// ============================================================

const createProduct = async (req, res) => {
    try {
        const {
            name, sku, price, stock, unit,
            image_url, description,
            discount, discount_type,
            vat, tax
        } = req.body;

        if (!name || !sku || price === undefined) {
            return res.status(400).json({
                success: false,
                message: 'পণ্যের নাম, SKU এবং দাম আবশ্যক।'
            });
        }

        const result = await query(
            `INSERT INTO products
               (name, sku, price, stock, unit,
                image_url, description,
                discount, discount_type,
                vat, tax)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
                name, sku, price, stock || 0, unit || 'pcs',
                image_url    || null,
                description  || null,
                discount     || 0,
                discount_type || 'flat',
                vat          || 0,
                tax          || 0
            ]
        );

        // স্টক মুভমেন্ট লগ
        if (stock > 0) {
            await query(
                `INSERT INTO stock_movements
                 (product_id, movement_type, quantity, reference_type, note, created_by)
                 VALUES ($1, 'in', $2, 'manual', 'প্রারম্ভিক স্টক', $3)`,
                [result.rows[0].id, stock, req.user.id]
            );
        }

        return res.status(201).json({
            success: true,
            message: 'পণ্য তৈরি সফল।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Create Product Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই SKU আগে থেকেই আছে।' });
        }
        return res.status(500).json({ success: false, message: 'পণ্য তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE PRODUCT
// PUT /api/products/:id
// ============================================================

const updateProduct = async (req, res) => {
    try {
        const {
            name, sku, price, unit, is_active,
            image_url, description,
            discount, discount_type,
            vat, tax
        } = req.body;

        const result = await query(
            `UPDATE products SET
                name          = COALESCE($1,  name),
                sku           = COALESCE($2,  sku),
                price         = COALESCE($3,  price),
                unit          = COALESCE($4,  unit),
                is_active     = COALESCE($5,  is_active),
                image_url     = COALESCE($6,  image_url),
                description   = COALESCE($7,  description),
                discount      = COALESCE($8,  discount),
                discount_type = COALESCE($9,  discount_type),
                vat           = COALESCE($10, vat),
                tax           = COALESCE($11, tax),
                updated_at    = NOW()
             WHERE id = $12
             RETURNING *`,
            [
                name        ?? null,
                sku         ?? null,
                price       ?? null,
                unit        ?? null,
                is_active   ?? null,
                image_url   ?? null,
                description ?? null,
                discount    ?? null,
                discount_type ?? null,
                vat         ?? null,
                tax         ?? null,
                req.params.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
        }

        return res.status(200).json({
            success: true,
            message: 'পণ্য আপডেট সফল।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Update Product Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ADJUST STOCK (Manual)
// POST /api/products/:id/adjust-stock
// ============================================================

const adjustStock = async (req, res) => {
    try {
        const { quantity, note } = req.body;
        const productId          = req.params.id;

        if (!quantity) {
            return res.status(400).json({ success: false, message: 'পরিমাণ দিন।' });
        }

        const product = await query('SELECT * FROM products WHERE id = $1', [productId]);
        if (product.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
        }

        const newStock     = parseInt(product.rows[0].stock) + parseInt(quantity);
        const movementType = quantity > 0 ? 'in' : 'adjustment';

        if (newStock < 0) {
            return res.status(400).json({
                success: false,
                message: `স্টক ঋণাত্মক হতে পারবে না। বর্তমান স্টক: ${product.rows[0].stock}`
            });
        }

        await query(
            'UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2',
            [newStock, productId]
        );

        await query(
            `INSERT INTO stock_movements
             (product_id, movement_type, quantity, reference_type, note, created_by)
             VALUES ($1, $2, $3, 'manual', $4, $5)`,
            [productId, movementType, Math.abs(quantity), note || 'ম্যানুয়াল এডজাস্টমেন্ট', req.user.id]
        );

        return res.status(200).json({
            success: true,
            message: `স্টক আপডেট। নতুন স্টক: ${newStock}`,
            data: { new_stock: newStock }
        });

    } catch (error) {
        console.error('❌ Adjust Stock Error:', error.message);
        return res.status(500).json({ success: false, message: 'স্টক আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET STOCK MOVEMENTS
// GET /api/products/:id/movements
// ============================================================

const getStockMovements = async (req, res) => {
    try {
        const result = await query(
            `SELECT sm.*, u.name_bn AS created_by_name
             FROM stock_movements sm
             JOIN users u ON sm.created_by = u.id
             WHERE sm.product_id = $1
             ORDER BY sm.created_at DESC
             LIMIT 100`,
            [req.params.id]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Stock Movements Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    adjustStock,
    getStockMovements
};
