const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');
const { adjustDefaultWarehouseStock } = require('../services/warehouseStock.utils'); // ← per-warehouse স্টক ধাপ ৪
const { parseCSV, rowsToObjects, buildCSV } = require('../services/csv.utils');
const {
    TEMPLATE_HEADERS,
    REQUIRED_HEADERS,
    MAX_IMPORT_ROWS,
    normalizeRow
} = require('../services/productImport.utils');

// ============================================================
// ধাপ ২: Bulk CSV Import — পণ্য
// ধারণা: Preview (শুধু validate, DB-তে কিছু লেখা হয় না) → Commit (আসল লেখালেখি)
// দুটো ধাপই productImport.utils.js-এর একই normalizeRow() ব্যবহার করে,
// তাই preview-তে যা দেখানো হয় commit-এ ঠিক তাই ঘটে — কোনো surprise নেই।
// ============================================================

// ── এই tenant-এর সব বিদ্যমান SKU ও ক্যাটাগরি এক কুয়েরিতে এনে lookup map বানায় ──
const loadContext = async (tenantId) => {
    const [productsRes, categoriesRes] = await Promise.all([
        query(`SELECT id, sku FROM products WHERE tenant_id = $1`, [tenantId]),
        query(`SELECT id, name, name_bn FROM product_categories WHERE tenant_id = $1`, [tenantId]),
    ]);

    const existingSkuMap = new Map();
    productsRes.rows.forEach(p => existingSkuMap.set(p.sku.toLowerCase(), { id: p.id }));

    const existingCategoryMap = new Map();
    categoriesRes.rows.forEach(c => {
        existingCategoryMap.set(c.name.toLowerCase(), { id: c.id, name: c.name });
        if (c.name_bn) existingCategoryMap.set(c.name_bn.toLowerCase(), { id: c.id, name: c.name });
    });

    return { existingSkuMap, existingCategoryMap };
};

// CSV buffer/text কে normalize করা row-array-তে রূপান্তর করে, header যাচাই করে
const parseAndValidateFile = (fileBuffer, ctx) => {
    const rawRows = parseCSV(fileBuffer);
    const { headers, records } = rowsToObjects(rawRows);

    const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
        const err = new Error(`CSV ফাইলে আবশ্যক কলাম নেই: ${missingHeaders.join(', ')}`);
        err.isHeaderError = true;
        throw err;
    }

    if (records.length === 0) {
        const err = new Error('CSV ফাইলে কোনো ডেটা সারি পাওয়া যায়নি।');
        err.isHeaderError = true;
        throw err;
    }

    if (records.length > MAX_IMPORT_ROWS) {
        const err = new Error(`একবারে সর্বোচ্চ ${MAX_IMPORT_ROWS}টি সারি import করা যাবে। আপনার ফাইলে ${records.length}টি সারি আছে — ফাইলটি ভাগ করে আবার চেষ্টা করুন।`);
        err.isHeaderError = true;
        throw err;
    }

    const seenSkusInFile = new Set();
    const rows = records.map(raw => normalizeRow(raw, { ...ctx, seenSkusInFile }));

    return rows;
};

// ============================================================
// GET /api/products/import/template
// নমুনা CSV ডাউনলোড
// ============================================================
const downloadTemplate = async (req, res) => {
    try {
        const sampleRows = [
            ['কোকা কোলা ৫০০ml', 'COKE-500', 'বেভারেজ', 'Coca-Cola', 'pcs', '40', '32', '100', '20', '0', 'flat', '0', '0', 'ঠান্ডা পানীয়', ''],
            ['লাক্স সাবান ১০০gm', 'LUX-100', 'কসমেটিকস', 'Lux', 'pcs', '35', '28', '200', '30', '5', 'percent', '15', '0', '', ''],
        ];

        const csv = buildCSV(TEMPLATE_HEADERS, sampleRows);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="product_import_template.csv"');
        return res.send(csv);
    } catch (error) {
        logger.error('❌ Product Import Template Error:', error.message);
        return res.status(500).json({ success: false, message: 'টেমপ্লেট তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/products/import/preview
// শুধু validate করে — কোনো কিছু DB-তে সেভ হয় না
// ============================================================
const previewImport = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'CSV ফাইল আপলোড করুন।' });
        }

        const ctx  = await loadContext(req.tenantId);
        const rows = parseAndValidateFile(req.file.buffer, ctx);

        const errorRows       = rows.filter(r => r.status === 'error');
        const newCategoryNames = [...new Set(
            rows.filter(r => r.willCreateCategory).map(r => r.data.category_name)
        )];

        const summary = {
            totalRows:        rows.length,
            validRows:        rows.length - errorRows.length,
            errorRows:        errorRows.length,
            toCreate:         rows.filter(r => r.status === 'ok' && r.action === 'create').length,
            toUpdate:         rows.filter(r => r.status === 'ok' && r.action === 'update').length,
            newCategoryNames,
        };

        return res.status(200).json({ success: true, data: { summary, rows } });

    } catch (error) {
        if (error.isHeaderError) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error('❌ Product Import Preview Error:', error.message);
        return res.status(500).json({ success: false, message: 'ফাইল প্রসেস করতে সমস্যা হয়েছে। ফরম্যাট ঠিক আছে কিনা দেখুন।' });
    }
};

// ============================================================
// POST /api/products/import/commit
// body: { rows: [ preview থেকে পাওয়া row object গুলো (শুধু status:'ok') ] }
//
// নিরাপত্তা নোট: preview-এর "action"/"category_id" client থেকে ফেরত আসলেও
// এখানে আমরা তা অন্ধভাবে বিশ্বাস করি না — SKU/ক্যাটাগরি আবার fresh DB
// state দিয়ে resolve করা হয় (preview আর commit-এর মাঝে অন্য কেউ একই
// SKU/ক্যাটাগরি তৈরি করে ফেললেও যেন ডাটা ঠিক থাকে)।
//
// প্রতিটি সারি আলাদাভাবে try/catch করা হয় — একটা সারি ব্যর্থ হলেও
// বাকি সারিগুলো import হতে থাকবে (শত শত SKU-এর ক্ষেত্রে এটাই বাস্তবসম্মত)।
// ============================================================
const commitImport = async (req, res) => {
    try {
        const inputRows = Array.isArray(req.body.rows) ? req.body.rows : [];
        if (inputRows.length === 0) {
            return res.status(400).json({ success: false, message: 'Import করার মতো কোনো বৈধ সারি পাওয়া যায়নি।' });
        }
        if (inputRows.length > MAX_IMPORT_ROWS) {
            return res.status(400).json({ success: false, message: `একবারে সর্বোচ্চ ${MAX_IMPORT_ROWS}টি সারি import করা যাবে।` });
        }

        const tenantId = req.tenantId;
        const ctx      = await loadContext(tenantId);

        // ── ধাপ ১: re-validate সব সারি fresh DB state দিয়ে ──
        const seenSkusInFile = new Set();
        const revalidated = inputRows.map(r => normalizeRow(
            {
                __row:    r.row,
                ...r.data,
                category: r.data?.category_name, // normalizeRow 'category' key আশা করে, data-তে এটা 'category_name' নামে থাকে
                sku:      r.sku  ?? r.data?.sku,
                name:     r.name ?? r.data?.name,
            },
            { ...ctx, seenSkusInFile }
        ));

        const okRows    = revalidated.filter(r => r.status === 'ok');
        const rejected  = revalidated.filter(r => r.status === 'error')
            .map(r => ({ row: r.row, sku: r.sku, message: r.errors.join(' ') }));

        if (okRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'কোনো সারিই commit করার উপযুক্ত নয়। preview-তে দেখানো ভুলগুলো ঠিক করে আবার আপলোড করুন।',
                data: { created: 0, updated: 0, failed: rejected }
            });
        }

        // ── ধাপ ২: নতুন ক্যাটাগরি (যদি লাগে) একসাথে, একটা transaction-এ তৈরি করো ──
        const newCategoryNames = [...new Set(
            okRows.filter(r => r.willCreateCategory).map(r => r.data.category_name)
        )];

        if (newCategoryNames.length > 0) {
            await withTransaction(async (client) => {
                for (const catName of newCategoryNames) {
                    if (ctx.existingCategoryMap.has(catName.toLowerCase())) continue; // race-এ অন্য নাম থেকে আগেই তৈরি হয়ে গেছে
                    try {
                        const inserted = await client.query(
                            `INSERT INTO product_categories (tenant_id, name) VALUES ($1, $2) RETURNING id, name`,
                            [tenantId, catName]
                        );
                        ctx.existingCategoryMap.set(catName.toLowerCase(), { id: inserted.rows[0].id, name: catName });
                    } catch (err) {
                        if (err.code === '23505') {
                            // অন্য একটা row একই নামে ইতিমধ্যে তৈরি করে ফেলেছে — সেটাই ব্যবহার করো
                            const existing = await client.query(
                                `SELECT id, name FROM product_categories WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)`,
                                [tenantId, catName]
                            );
                            if (existing.rows[0]) {
                                ctx.existingCategoryMap.set(catName.toLowerCase(), existing.rows[0]);
                            }
                        } else {
                            throw err;
                        }
                    }
                }
            });
        }

        // ── ধাপ ৩: প্রতিটা প্রডাক্ট সারি আলাদাভাবে create/update করো ──
        let created = 0;
        let updated = 0;
        const failed = [...rejected];

        for (const r of okRows) {
            const d = r.data;
            const category_id = d.category_name
                ? (ctx.existingCategoryMap.get(d.category_name.toLowerCase())?.id || null)
                : null;

            try {
                if (r.existing_product_id) {
                    // ── UPDATE (স্টক বাদে — স্টক এডজাস্ট আলাদা ফিচার) ──
                    await query(
                        `UPDATE products SET
                            name          = $1,
                            price         = $2,
                            unit          = $3,
                            image_url     = COALESCE(NULLIF($4, ''), image_url),
                            description   = COALESCE(NULLIF($5, ''), description),
                            discount      = $6,
                            discount_type = $7,
                            vat           = $8,
                            tax           = $9,
                            cost_price    = $10,
                            category_id   = COALESCE($11, category_id),
                            brand         = COALESCE(NULLIF($12, ''), brand),
                            reorder_point = $13,
                            updated_at    = NOW()
                         WHERE id = $14 AND tenant_id = $15`,
                        [
                            d.name, d.price, d.unit,
                            d.image_url, d.description,
                            d.discount, d.discount_type,
                            d.vat, d.tax,
                            d.cost_price, category_id, d.brand, d.reorder_point,
                            r.existing_product_id, tenantId
                        ]
                    );
                    updated++;
                } else {
                    // ── CREATE ──
                    const inserted = await query(
                        `INSERT INTO products (name, sku, price, stock, unit,
                            image_url, description,
                            discount, discount_type,
                            vat, tax, tenant_id,
                            cost_price, category_id, brand, reorder_point)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                         RETURNING id`,
                        [
                            d.name, d.sku, d.price, d.stock, d.unit,
                            d.image_url || null,
                            d.description || null,
                            d.discount, d.discount_type,
                            d.vat, d.tax,
                            tenantId,
                            d.cost_price, category_id, d.brand || null, d.reorder_point
                        ]
                    );

                    if (d.stock > 0) {
                        try {
                            await query(
                                `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, note, created_by, tenant_id) VALUES ($1, 'in', $2, 'manual', 'বাল্ক CSV ইম্পোর্ট — প্রারম্ভিক স্টক', $3, $4)`,
                                [inserted.rows[0].id, d.stock, req.user.id, tenantId]
                            );
                        } catch (movErr) {
                            logger.warn('⚠️ Import stock_movement লগ ব্যর্থ:', movErr.message);
                        }
                        // ✅ per-warehouse স্টক ধাপ ৪: বাল্ক ইম্পোর্টে গুদাম বাছার UI
                        // এখনো নেই, তাই ডিফল্ট গুদামে প্রারম্ভিক স্টক ক্রেডিট হচ্ছে
                        await adjustDefaultWarehouseStock(query, {
                            tenantId, productId: inserted.rows[0].id, delta: d.stock
                        });
                    }
                    created++;
                }
            } catch (err) {
                logger.error('❌ Product Import Row Error:', { row: r.row, sku: r.sku, err: err.message });
                const message = err.code === '23505'
                    ? 'এই SKU আগে থেকেই আছে।'
                    : 'এই সারিটি সেভ করা যায়নি।';
                failed.push({ row: r.row, sku: r.sku, message });
            }
        }

        return res.status(200).json({
            success: true,
            message: `আমদানি সম্পন্ন — ${created}টি নতুন পণ্য, ${updated}টি আপডেট হয়েছে।`,
            data: { created, updated, failed }
        });

    } catch (error) {
        logger.error('❌ Product Import Commit Error:', error.message);
        return res.status(500).json({ success: false, message: 'আমদানিতে সমস্যা হয়েছে।' });
    }
};

module.exports = { downloadTemplate, previewImport, commitImport };
