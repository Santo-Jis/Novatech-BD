const logger = require('../config/logger');
const { query } = require('../config/db');
const { adjustDefaultWarehouseStock } = require('../services/warehouseStock.utils'); // ← per-warehouse স্টক ধাপ ৪
const { uploadToCloudinary } = require('../services/employee.service'); // ✅ FIX: base64 ছবি Cloudinary-তে সরানোর জন্য

// ============================================================
// ✅ FIX (২৬ আগস্ট ২০২৬): image_url raw base64 (data:image/...;base64,...)
// আকারে এলে সরাসরি DB-তে সেভ হয়ে যাচ্ছিল — একেকটা ছবি গড়ে ~২৭৩ KB,
// কিছু ১.৬ MB পর্যন্ত। ফলে /portal/products লিস্ট, ডিটেইল, related —
// প্রতিটা রেসপন্স কয়েকশ KB থেকে কয়েক MB হয়ে যাচ্ছিল, আর স্লো/অস্থির
// মোবাইল নেটওয়ার্কে (৫ KB/s-এর মতো) frontend-এর ১৫s timeout পার হয়ে
// product detail sheet ক্র্যাশ করছিল (ErrorBoundary "কিছু একটা ভুল
// হয়েছে" স্ক্রিন)।
//
// এই হেল্পার base64 ধরলে Cloudinary-তে আপলোড করে ছোট্ট URL রিটার্ন করে
// (বাকি সব মডিউলে যেভাবে uploadToCloudinary ব্যবহার হয় সেই একই ইউটিলিটি,
// শুধু এখানে ইনপুট multer file না হয়ে JSON body-এর base64 string)।
// আগে থেকেই http(s) URL হলে অপরিবর্তিত রেখে দেয়। খালি/undefined হলেও
// অপরিবর্তিত রিটার্ন করে (updateProduct-এর COALESCE পার্শিয়াল-আপডেট
// প্যাটার্নের সাথে সামঞ্জস্যপূর্ণ থাকার জন্য)।
// ============================================================
const BASE64_IMAGE_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

const resolveImageUrl = async (rawUrl, folder, filenameHint) => {
    if (!rawUrl) return rawUrl;

    const match = BASE64_IMAGE_RE.exec(rawUrl);
    if (!match) return rawUrl; // ইতিমধ্যে normal URL — অপরিবর্তিত

    const [, mimetype, base64Payload] = match;
    const buffer = Buffer.from(base64Payload, 'base64');
    const safeHint = String(filenameHint || 'product').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeHint}-${Date.now()}`;

    const uploadedUrl = await uploadToCloudinary(buffer, folder, filename, mimetype);
    if (!uploadedUrl) {
        // চুপচাপ raw base64 DB-তে পড়তে দেওয়া হবে না — বরং স্পষ্ট error,
        // যাতে সমস্যাটা আবার নিঃশব্দে ফিরে না আসে
        throw new Error('IMAGE_UPLOAD_FAILED');
    }
    return uploadedUrl;
};

// ============================================================
// GET PRODUCTS
// GET /api/products
// ============================================================

const getProducts = async (req, res) => {
    try {
        const { search, is_active = true, warehouse_id } = req.query; // ✅ warehouse_id: per-warehouse স্টক

        let conditions = [`p.is_active = $1`, `p.tenant_id = $2`];
        let params     = [is_active, req.tenantId];
        let paramCount = 2;

        if (search) {
            paramCount++;
            conditions.push(`(p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount})`);
            params.push(`%${search}%`);
        }

        let warehouseJoin = '';
        let warehouseSelect = '';
        if (warehouse_id) {
            paramCount++;
            // LEFT JOIN — যে গুদামে কোনো ট্র্যাক করা এন্ট্রি নেই তার জন্যও পণ্য দেখাতে হবে (০ হিসেবে)
            warehouseJoin = `LEFT JOIN warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = $${paramCount}`;
            warehouseSelect = `, COALESCE(ws.quantity, 0) AS warehouse_stock_qty`;
            params.push(warehouse_id);
        }

        const result = await query(
            `SELECT p.id, p.name, p.sku, p.price, p.stock, p.reserved_stock, p.return_stock, p.defective_stock,
                    (p.stock - COALESCE((
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
                    p.unit, p.is_active, p.updated_at,
                    p.image_url, p.description,
                    p.discount, p.discount_type, p.vat, p.tax,
                    p.cost_price, p.brand, p.category_id, p.reorder_point,
                    c.name AS category_name, c.name_bn AS category_name_bn,
                    (p.stock <= COALESCE(p.reorder_point, 0)) AS is_low_stock
                    ${warehouseSelect}
             FROM products p
             LEFT JOIN product_categories c ON c.id = p.category_id
             ${warehouseJoin}
             WHERE ${conditions.join(' AND ')}
             ORDER BY p.name ASC`,
            params
        );

        // cost_price শুধু admin/manager দেখতে পারবে — worker/অন্য রোলের রেসপন্স থেকে বাদ
        const canSeeCost = ['admin', 'manager'].includes(req.user?.role);
        const rows = canSeeCost
            ? result.rows
            : result.rows.map(({ cost_price, ...rest }) => rest);

        return res.status(200).json({ success: true, data: rows });

    } catch (error) {
        logger.error('❌ Get Products Error:', error.message);
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
            `SELECT p.*, (p.stock - COALESCE((
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
                    c.name AS category_name, c.name_bn AS category_name_bn,
                    (p.stock <= COALESCE(p.reorder_point, 0)) AS is_low_stock
             FROM products p
             LEFT JOIN product_categories c ON c.id = p.category_id
             WHERE p.id = $1
             AND p.tenant_id = $2`,
            [req.params.id,
                req.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
        }

        const canSeeCost = ['admin', 'manager'].includes(req.user?.role);
        const product = canSeeCost
            ? result.rows[0]
            : (({ cost_price, ...rest }) => rest)(result.rows[0]);

        return res.status(200).json({ success: true, data: product });

    } catch (error) {
        logger.error('❌ Get Product Error:', error.message);
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
            vat, tax,
            cost_price, category_id, brand, reorder_point
        } = req.body;

        if (!name || !sku || price === undefined) {
            return res.status(400).json({
                success: false,
                message: 'পণ্যের নাম, SKU এবং দাম আবশ্যক।'
            });
        }

        // ✅ FIX: base64 এলে Cloudinary URL-এ রূপান্তর, DB-তে raw base64 নয়
        const resolvedImageUrl = await resolveImageUrl(image_url, 'products', sku);

        const result = await query(
            `INSERT INTO products (name, sku, price, stock, unit,
                image_url, description,
                discount, discount_type,
                vat, tax, tenant_id,
                cost_price, category_id, brand, reorder_point)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [
                name, sku, price, stock || 0, unit || 'pcs',
                resolvedImageUrl || null,
                description  || null,
                discount     || 0,
                discount_type || 'flat',
                vat          || 0,
                tax          || 0,
                req.tenantId,   // $12 tenant_id
                cost_price    || 0,
                category_id   || null,
                brand         || null,
                reorder_point || 0
            ]
        );

        // স্টক মুভমেন্ট লগ
        if (stock > 0) {
            await query(
                `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, note, created_by, tenant_id) VALUES ($1, 'in', $2, 'manual', 'প্রারম্ভিক স্টক', $3, $4)`,
                [result.rows[0].id, stock, req.user.id, req.tenantId]
            );
            // ✅ per-warehouse স্টক ধাপ ৪: প্রোডাক্ট তৈরির ফর্মে গুদাম বাছার UI
            // এখনো নেই, তাই ডিফল্ট গুদামে প্রারম্ভিক স্টক ক্রেডিট হচ্ছে
            await adjustDefaultWarehouseStock(query, {
                tenantId: req.tenantId, productId: result.rows[0].id, delta: stock
            });
        }

        return res.status(201).json({
            success: true,
            message: 'পণ্য তৈরি সফল।',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ Create Product Error:', error.message);
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'এই SKU আগে থেকেই আছে।' });
        }
        if (error.message === 'IMAGE_UPLOAD_FAILED') {
            return res.status(502).json({ success: false, message: 'ছবি আপলোড ব্যর্থ হয়েছে, আবার চেষ্টা করুন।' });
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
            vat, tax,
            cost_price, category_id, brand, reorder_point
        } = req.body;

        // ✅ FIX: base64 এলে Cloudinary URL-এ রূপান্তর, DB-তে raw base64 নয়।
        // image_url না পাঠালে (undefined/null) resolveImageUrl অপরিবর্তিত
        // রিটার্ন করে, তাই COALESCE-এর পার্শিয়াল-আপডেট আচরণ ঠিক থাকে।
        const resolvedImageUrl = await resolveImageUrl(image_url, 'products', req.params.id);

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
                cost_price    = COALESCE($14, cost_price),
                category_id   = COALESCE($15, category_id),
                brand         = COALESCE($16, brand),
                reorder_point = COALESCE($17, reorder_point),
                updated_at    = NOW()
             WHERE id = $12 AND tenant_id = $13
             RETURNING *`,
            [
                name        ?? null,
                sku         ?? null,
                price       ?? null,
                unit        ?? null,
                is_active   ?? null,
                resolvedImageUrl ?? null,
                description ?? null,
                discount    ?? null,
                discount_type ?? null,
                vat         ?? null,
                tax         ?? null,
                req.params.id,
                req.tenantId,   // $13 tenant_id
                cost_price    ?? null,
                category_id   ?? null,
                brand         ?? null,
                reorder_point ?? null
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
        logger.error('❌ Update Product Error:', error.message);
        if (error.message === 'IMAGE_UPLOAD_FAILED') {
            return res.status(502).json({ success: false, message: 'ছবি আপলোড ব্যর্থ হয়েছে, আবার চেষ্টা করুন।' });
        }
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

        const product = await query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [productId, req.tenantId]);
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
            'UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
            [newStock, productId, req.tenantId]
        );
        // ✅ per-warehouse স্টক ধাপ ৪: ম্যানুয়াল অ্যাডজাস্টমেন্টে গুদাম বাছার UI এখনো
        // নেই, তাই ডিফল্ট গুদামে সিঙ্ক করা হচ্ছে (quantity ঋণাত্মক হলে ডেবিট হবে)
        await adjustDefaultWarehouseStock(query, {
            tenantId: req.tenantId, productId, delta: parseInt(quantity)
        });

        await query(
            `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, note, created_by, tenant_id) VALUES ($1, $2, $3, 'manual', $4, $5, $6)`,
            [productId, movementType, Math.abs(quantity), note || 'ম্যানুয়াল এডজাস্টমেন্ট', req.user.id, req.tenantId]
        );

        return res.status(200).json({
            success: true,
            message: `স্টক আপডেট। নতুন স্টক: ${newStock}`,
            data: { new_stock: newStock }
        });

    } catch (error) {
        logger.error('❌ Adjust Stock Error:', error.message);
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
             WHERE sm.product_id = $1 AND sm.tenant_id = $2
             ORDER BY sm.created_at DESC
             LIMIT 100`,
            [req.params.id, req.tenantId]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Stock Movements Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PRODUCT IMAGE GALLERY — ✅ NEW (ফেজ ২ — মাল্টি-ইমেজ গ্যালারি)
// products.image_url কভার/প্রথম ছবি হিসেবে থাকে (অপরিবর্তিত), এই
// টেবিল ADDITIONAL গ্যালারি ছবি। প্রতিটা এন্ডপয়েন্টে tenant_id
// দিয়ে product-এর মালিকানা যাচাই করা হয় — অন্য কোম্পানির প্রোডাক্টের
// গ্যালারি এডিট করতে পারবে না।
// ============================================================

// GET /api/products/:id/images
const getProductImages = async (req, res) => {
    try {
        const owns = await query(
            `SELECT id FROM products WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (!owns.rows.length) {
            return res.status(404).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
        }
        const result = await query(
            `SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC, created_at ASC`,
            [req.params.id]
        );
        return res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ getProductImages Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// POST /api/products/:id/images  { image_url }
const addProductImage = async (req, res) => {
    try {
        const { image_url } = req.body;
        if (!image_url) {
            return res.status(400).json({ success: false, message: 'ছবির URL দিন।' });
        }
        const owns = await query(
            `SELECT id FROM products WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (!owns.rows.length) {
            return res.status(404).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
        }
        // সর্বোচ্চ ৬টা গ্যালারি ছবি — মোবাইল ডেটার কথা মাথায় রেখে
        const countRes = await query(`SELECT COUNT(*) FROM product_images WHERE product_id = $1`, [req.params.id]);
        if (parseInt(countRes.rows[0].count) >= 6) {
            return res.status(400).json({ success: false, message: 'সর্বোচ্চ ৬টা ছবি যোগ করা যাবে।' });
        }

        // ✅ FIX: base64 এলে Cloudinary URL-এ রূপান্তর, DB-তে raw base64 নয়
        const resolvedImageUrl = await resolveImageUrl(image_url, 'products/gallery', req.params.id);

        const result = await query(
            `INSERT INTO product_images (product_id, image_url, sort_order)
             VALUES ($1, $2, COALESCE((SELECT MAX(sort_order)+1 FROM product_images WHERE product_id = $1), 0))
             RETURNING *`,
            [req.params.id, resolvedImageUrl]
        );
        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('❌ addProductImage Error:', error.message);
        if (error.message === 'IMAGE_UPLOAD_FAILED') {
            return res.status(502).json({ success: false, message: 'ছবি আপলোড ব্যর্থ হয়েছে, আবার চেষ্টা করুন।' });
        }
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// DELETE /api/products/:id/images/:imageId
const deleteProductImage = async (req, res) => {
    try {
        const owns = await query(
            `SELECT id FROM products WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (!owns.rows.length) {
            return res.status(404).json({ success: false, message: 'পণ্য পাওয়া যায়নি।' });
        }
        await query(
            `DELETE FROM product_images WHERE id = $1 AND product_id = $2`,
            [req.params.imageId, req.params.id]
        );
        return res.json({ success: true, message: 'ছবি সরানো হয়েছে।' });
    } catch (error) {
        logger.error('❌ deleteProductImage Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    adjustStock,
    getStockMovements,
    getProductImages,     // ✅ NEW (ফেজ ২)
    addProductImage,      // ✅ NEW (ফেজ ২)
    deleteProductImage,   // ✅ NEW (ফেজ ২)
};
