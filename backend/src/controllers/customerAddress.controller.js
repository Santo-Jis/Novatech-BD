// ============================================================
// customerAddress.controller.js
// ✅ NEW (ফেজ ৪ — Path B ভিত্তি: ঠিকানা-বুক)
// ============================================================
// Path A (order-request) ঠিকানা-বুক ছাড়াই চলে (SR সরাসরি শপে
// ডেলিভারি দেন)। এটা শুধু Path B (online payment/real courier)-এর
// জন্য দরকার — কিন্তু গেটওয়ে যেটাই হোক (SSLCommerz/bKash/Nagad),
// ঠিকানা-বুক একই থাকবে, তাই গেটওয়ে-নির্দিষ্ট কাজের আগে এটা বানানো।
// ============================================================

const logger = require('../config/logger');
const { query } = require('../config/db');

// GET /api/portal/addresses
const getAddresses = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const result = await query(
            `SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC`,
            [customer_id]
        );
        return res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ getAddresses Error:', error.message);
        return res.status(500).json({ success: false, message: 'ঠিকানা তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// POST /api/portal/addresses
const addAddress = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { label, recipient_name, phone, address_line, area, city, is_default } = req.body;

        if (!address_line) {
            return res.status(400).json({ success: false, message: 'ঠিকানা লিখুন।' });
        }

        // প্রথম ঠিকানা হলে, বা explicitly is_default চাইলে — অন্য সব
        // ঠিকানার default false করে দেওয়া (একসাথে একটাই default থাকবে)
        const existing = await query(`SELECT COUNT(*) FROM customer_addresses WHERE customer_id = $1`, [customer_id]);
        const shouldBeDefault = is_default || parseInt(existing.rows[0].count) === 0;

        if (shouldBeDefault) {
            await query(`UPDATE customer_addresses SET is_default = false WHERE customer_id = $1`, [customer_id]);
        }

        const result = await query(
            `INSERT INTO customer_addresses (customer_id, label, recipient_name, phone, address_line, area, city, is_default)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [customer_id, label || null, recipient_name || null, phone || null, address_line, area || null, city || null, shouldBeDefault]
        );
        return res.status(201).json({ success: true, data: result.rows[0], message: 'ঠিকানা যোগ হয়েছে।' });
    } catch (error) {
        logger.error('❌ addAddress Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// PUT /api/portal/addresses/:id
const updateAddress = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { id } = req.params;
        const fields  = req.body;
        const allowed = ['label', 'recipient_name', 'phone', 'address_line', 'area', 'city', 'is_default'];

        const sets   = [];
        const params = [];
        let   idx    = 1;
        for (const key of allowed) {
            if (fields[key] !== undefined) {
                sets.push(`${key} = $${idx++}`);
                params.push(fields[key]);
            }
        }
        if (!sets.length) {
            return res.status(400).json({ success: false, message: 'কিছু পরিবর্তন করুন।' });
        }

        if (fields.is_default === true) {
            await query(`UPDATE customer_addresses SET is_default = false WHERE customer_id = $1`, [customer_id]);
        }

        params.push(id, customer_id);
        const result = await query(
            `UPDATE customer_addresses SET ${sets.join(', ')} WHERE id = $${idx} AND customer_id = $${idx + 1} RETURNING *`,
            params
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'ঠিকানা পাওয়া যায়নি।' });
        }
        return res.json({ success: true, data: result.rows[0], message: 'আপডেট হয়েছে।' });
    } catch (error) {
        logger.error('❌ updateAddress Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// DELETE /api/portal/addresses/:id
const deleteAddress = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        await query(`DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2`, [req.params.id, customer_id]);
        return res.json({ success: true, message: 'ঠিকানা সরানো হয়েছে।' });
    } catch (error) {
        logger.error('❌ deleteAddress Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { getAddresses, addAddress, updateAddress, deleteAddress };
