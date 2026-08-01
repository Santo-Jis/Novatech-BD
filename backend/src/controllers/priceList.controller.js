const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');

// ============================================================
// GET PRICE LISTS
// GET /api/price-lists?channel=&price_type=&is_active=true
// ============================================================
const getPriceLists = async (req, res) => {
    try {
        const { channel, price_type, is_active } = req.query;
        const conditions = [`pl.tenant_id = $1`];
        const params      = [req.tenantId];
        let paramCount    = 1;

        if (channel) {
            paramCount++;
            conditions.push(`pl.channel = $${paramCount}`);
            params.push(channel);
        }
        if (price_type) {
            paramCount++;
            conditions.push(`pl.price_type = $${paramCount}`);
            params.push(price_type);
        }
        if (is_active !== undefined) {
            paramCount++;
            conditions.push(`pl.is_active = $${paramCount}`);
            params.push(is_active === 'true' || is_active === true);
        }

        const result = await query(
            `SELECT pl.*,
                    (SELECT COUNT(*) FROM price_list_items    i WHERE i.price_list_id = pl.id) AS item_count,
                    (SELECT COUNT(*) FROM price_list_areas    a WHERE a.price_list_id = pl.id) AS area_count,
                    (SELECT COUNT(*) FROM price_list_customers c WHERE c.price_list_id = pl.id) AS customer_count
             FROM price_lists pl
             WHERE ${conditions.join(' AND ')}
             ORDER BY pl.is_default DESC, pl.created_at DESC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Price Lists Error:', error.message);
        return res.status(500).json({ success: false, message: 'মূল্য তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ONE PRICE LIST (আইটেম/এলাকা/কাস্টমার-সহ বিস্তারিত)
// GET /api/price-lists/:id
// ============================================================
const getPriceList = async (req, res) => {
    try {
        const plResult = await query(
            `SELECT * FROM price_lists WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        if (plResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'মূল্য তালিকা পাওয়া যায়নি।' });
        }

        const [items, areas, customers] = await Promise.all([
            query(
                `SELECT i.id, i.product_id, i.price, p.name AS product_name, p.sku, p.price AS base_price, p.unit
                 FROM price_list_items i JOIN products p ON p.id = i.product_id
                 WHERE i.price_list_id = $1 ORDER BY p.name ASC`,
                [req.params.id]
            ),
            query(
                `SELECT a.id, a.route_id, r.name AS route_name
                 FROM price_list_areas a JOIN routes r ON r.id = a.route_id
                 WHERE a.price_list_id = $1 ORDER BY r.name ASC`,
                [req.params.id]
            ),
            query(
                `SELECT c.id, c.customer_id, cu.shop_name, cu.customer_code
                 FROM price_list_customers c JOIN customers cu ON cu.id = c.customer_id
                 WHERE c.price_list_id = $1 ORDER BY cu.shop_name ASC`,
                [req.params.id]
            )
        ]);

        return res.status(200).json({
            success: true,
            data: { ...plResult.rows[0], items: items.rows, areas: areas.rows, customers: customers.rows }
        });
    } catch (error) {
        logger.error('❌ Get Price List Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ── is_default=true সেট করার সময় একই tenant+channel-এর বাকি লিস্ট থেকে default সরাও ──
// (channel='all' নিজে একটা আলাদা "চ্যানেল" হিসেবে গণ্য — শুধু ওই channel-এর মধ্যেই এক্সক্লুসিভ)
const clearOtherDefaults = async (client, tenantId, channel, excludeId) => {
    await client.query(
        `UPDATE price_lists SET is_default = false
         WHERE tenant_id = $1 AND channel = $2 AND id != COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid)`,
        [tenantId, channel, excludeId || null]
    );
};

// ============================================================
// CREATE PRICE LIST
// POST /api/price-lists
// ============================================================
const createPriceList = async (req, res) => {
    try {
        const { name, name_bn, price_type = 'custom', channel = 'all', is_default = false, notes } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ success: false, message: 'মূল্য তালিকার নাম আবশ্যক।' });
        }
        if (!['wholesale', 'retail', 'area', 'custom'].includes(price_type)) {
            return res.status(400).json({ success: false, message: 'সঠিক ধরন নির্বাচন করুন।' });
        }
        if (!['van_sales', 'app_ecommerce', 'public_ecommerce', 'all'].includes(channel)) {
            return res.status(400).json({ success: false, message: 'সঠিক চ্যানেল নির্বাচন করুন।' });
        }

        const created = await withTransaction(async (client) => {
            if (is_default) await clearOtherDefaults(client, req.tenantId, channel, null);

            const result = await client.query(
                `INSERT INTO price_lists (tenant_id, name, name_bn, price_type, channel, is_default, notes, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [req.tenantId, name.trim(), name_bn || null, price_type, channel, !!is_default, notes || null, req.user.id]
            );
            return result.rows[0];
        });

        return res.status(201).json({ success: true, message: 'মূল্য তালিকা তৈরি হয়েছে।', data: created });
    } catch (error) {
        logger.error('❌ Create Price List Error:', error.message);
        return res.status(500).json({ success: false, message: 'তৈরি করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE PRICE LIST
// PUT /api/price-lists/:id
// ============================================================
const updatePriceList = async (req, res) => {
    try {
        const existing = await query(`SELECT * FROM price_lists WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'মূল্য তালিকা পাওয়া যায়নি।' });
        }
        const current = existing.rows[0];
        const { name, name_bn, price_type, channel, is_default, is_active, notes } = req.body;

        const nextChannel = channel !== undefined ? channel : current.channel;
        const nextDefault = is_default !== undefined ? !!is_default : current.is_default;

        const updated = await withTransaction(async (client) => {
            if (nextDefault) await clearOtherDefaults(client, req.tenantId, nextChannel, req.params.id);

            const result = await client.query(
                `UPDATE price_lists SET
                    name       = COALESCE($1, name),
                    name_bn    = COALESCE($2, name_bn),
                    price_type = COALESCE($3, price_type),
                    channel    = COALESCE($4, channel),
                    is_default = $5,
                    is_active  = COALESCE($6, is_active),
                    notes      = COALESCE($7, notes),
                    updated_at = NOW()
                 WHERE id = $8 AND tenant_id = $9
                 RETURNING *`,
                [name?.trim() || null, name_bn, price_type, channel, nextDefault, is_active, notes, req.params.id, req.tenantId]
            );
            return result.rows[0];
        });

        return res.status(200).json({ success: true, message: 'আপডেট সফল।', data: updated });
    } catch (error) {
        logger.error('❌ Update Price List Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE PRICE LIST
// DELETE /api/price-lists/:id
// ============================================================
const deletePriceList = async (req, res) => {
    try {
        const result = await query(
            `DELETE FROM price_lists WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'মূল্য তালিকা পাওয়া যায়নি।' });
        }
        return res.status(200).json({ success: true, message: 'মূল্য তালিকা মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ Delete Price List Error:', error.message);
        return res.status(500).json({ success: false, message: 'ডিলিট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SET/REPLACE PRODUCT PRICES (bulk upsert)
// PUT /api/price-lists/:id/items   body: { items: [{ product_id, price }] }
// ============================================================
const setPriceListItems = async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে একটি পণ্যের দাম দিন।' });
        }

        const plCheck = await query(`SELECT id FROM price_lists WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
        if (plCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'মূল্য তালিকা পাওয়া যায়নি।' });
        }

        await withTransaction(async (client) => {
            for (const it of items) {
                const price = parseFloat(it.price);
                if (!it.product_id || isNaN(price) || price < 0) continue; // খারাপ সারি স্কিপ, বাকিগুলো চলবে (CSV import-এর মতো convention)
                await client.query(
                    `INSERT INTO price_list_items (price_list_id, product_id, price)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (price_list_id, product_id)
                     DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
                    [req.params.id, it.product_id, price]
                );
            }
        });

        return res.status(200).json({ success: true, message: 'দাম আপডেট হয়েছে।' });
    } catch (error) {
        logger.error('❌ Set Price List Items Error:', error.message);
        return res.status(500).json({ success: false, message: 'দাম সেভ করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// REMOVE ONE PRODUCT FROM PRICE LIST
// DELETE /api/price-lists/:id/items/:productId
// ============================================================
const removePriceListItem = async (req, res) => {
    try {
        await query(
            `DELETE FROM price_list_items WHERE price_list_id = $1 AND product_id = $2`,
            [req.params.id, req.params.productId]
        );
        return res.status(200).json({ success: true, message: 'পণ্য তালিকা থেকে সরানো হয়েছে।' });
    } catch (error) {
        logger.error('❌ Remove Price List Item Error:', error.message);
        return res.status(500).json({ success: false, message: 'সরাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ASSIGN AREAS (routes) — bulk add
// POST /api/price-lists/:id/areas   body: { route_ids: [uuid] }
// ============================================================
const addPriceListAreas = async (req, res) => {
    try {
        const { route_ids } = req.body;
        if (!Array.isArray(route_ids) || route_ids.length === 0) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে একটি রুট নির্বাচন করুন।' });
        }
        await withTransaction(async (client) => {
            for (const routeId of route_ids) {
                await client.query(
                    `INSERT INTO price_list_areas (price_list_id, route_id)
                     VALUES ($1, $2) ON CONFLICT (price_list_id, route_id) DO NOTHING`,
                    [req.params.id, routeId]
                );
            }
        });
        return res.status(200).json({ success: true, message: 'এলাকা যোগ হয়েছে।' });
    } catch (error) {
        logger.error('❌ Add Price List Areas Error:', error.message);
        return res.status(500).json({ success: false, message: 'যোগ করতে সমস্যা হয়েছে।' });
    }
};

const removePriceListArea = async (req, res) => {
    try {
        await query(`DELETE FROM price_list_areas WHERE price_list_id = $1 AND route_id = $2`, [req.params.id, req.params.routeId]);
        return res.status(200).json({ success: true, message: 'এলাকা সরানো হয়েছে।' });
    } catch (error) {
        logger.error('❌ Remove Price List Area Error:', error.message);
        return res.status(500).json({ success: false, message: 'সরাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ASSIGN CUSTOMERS — bulk add (customer-নির্দিষ্ট override)
// POST /api/price-lists/:id/customers   body: { customer_ids: [uuid] }
// ============================================================
const addPriceListCustomers = async (req, res) => {
    try {
        const { customer_ids } = req.body;
        if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে একজন কাস্টমার নির্বাচন করুন।' });
        }

        // একই channel-এ একজন কাস্টমারের একটার বেশি override থাকলে দ্বন্দ্ব হবে,
        // তাই আগের (একই channel-এর) assignment সরিয়ে নতুনটা বসানো হচ্ছে (upsert-এর মতো)
        const plResult = await query(`SELECT channel FROM price_lists WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
        if (plResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'মূল্য তালিকা পাওয়া যায়নি।' });
        }
        const { channel } = plResult.rows[0];

        await withTransaction(async (client) => {
            for (const customerId of customer_ids) {
                await client.query(
                    `DELETE FROM price_list_customers plc
                     USING price_lists pl
                     WHERE plc.price_list_id = pl.id
                       AND plc.customer_id = $1 AND pl.channel = $2 AND pl.tenant_id = $3`,
                    [customerId, channel, req.tenantId]
                );
                await client.query(
                    `INSERT INTO price_list_customers (price_list_id, customer_id)
                     VALUES ($1, $2) ON CONFLICT (customer_id, price_list_id) DO NOTHING`,
                    [req.params.id, customerId]
                );
            }
        });
        return res.status(200).json({ success: true, message: 'কাস্টমার যোগ হয়েছে।' });
    } catch (error) {
        logger.error('❌ Add Price List Customers Error:', error.message);
        return res.status(500).json({ success: false, message: 'যোগ করতে সমস্যা হয়েছে।' });
    }
};

const removePriceListCustomer = async (req, res) => {
    try {
        await query(`DELETE FROM price_list_customers WHERE price_list_id = $1 AND customer_id = $2`, [req.params.id, req.params.customerId]);
        return res.status(200).json({ success: true, message: 'কাস্টমার সরানো হয়েছে।' });
    } catch (error) {
        logger.error('❌ Remove Price List Customer Error:', error.message);
        return res.status(500).json({ success: false, message: 'সরাতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getPriceLists,
    getPriceList,
    createPriceList,
    updatePriceList,
    deletePriceList,
    setPriceListItems,
    removePriceListItem,
    addPriceListAreas,
    removePriceListArea,
    addPriceListCustomers,
    removePriceListCustomer,
};
