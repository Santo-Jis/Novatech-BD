const { query, withTransaction } = require('../config/db');
const { uploadToCloudinary }     = require('../services/employee.service');
const { generateCustomerCode }   = require('../services/employee.service');

// ============================================================
// GET CUSTOMERS
// GET /api/customers
// SR → নিজের অ্যাসাইন করা কাস্টমার (দূরত্ব সহ)
// ============================================================

const getCustomers = async (req, res) => {
    try {
        const {
            route_id, search,
            lat, lng,           // SR এর বর্তমান অবস্থান
            page = 1, limit = 50
        } = req.query;
        const offset = (page - 1) * limit;

        let conditions = ['c.is_active = true'];
        let params     = [];
        let paramCount = 0;

        // SR শুধু নিজের অ্যাসাইন করা কাস্টমার দেখবে
        if (req.user.role === 'worker') {
            paramCount++;
            conditions.push(
                `c.id IN (
                    SELECT customer_id FROM customer_assignments
                    WHERE worker_id = $${paramCount} AND is_active = true
                    AND customer_id IS NOT NULL
                 )`
            );
            params.push(req.user.id);
        }

        // Manager শুধু নিজের রুটের কাস্টমার
        if (req.teamFilter && req.user.role !== 'worker') {
            paramCount++;
            conditions.push(
                `c.route_id IN (
                    SELECT id FROM routes WHERE manager_id = $${paramCount}
                 )`
            );
            params.push(req.teamFilter);
        }

        if (route_id) {
            paramCount++;
            conditions.push(`c.route_id = $${paramCount}`);
            params.push(route_id);
        }

        if (search) {
            paramCount++;
            conditions.push(
                `(c.shop_name ILIKE $${paramCount} OR c.owner_name ILIKE $${paramCount}
                  OR c.customer_code ILIKE $${paramCount})`
            );
            params.push(`%${search}%`);
        }

        // দূরত্ব হিসাব (SR এর অবস্থান থেকে)
        let distanceSelect = '';
        let orderBy        = 'c.shop_name ASC';

        if (lat && lng) {
            distanceSelect = `,
                ROUND(
                    ST_Distance(
                        c.location::geography,
                        ST_GeogFromText('POINT(${lng} ${lat})')
                    )::numeric, 0
                ) AS distance_meters`;
            orderBy = 'distance_meters ASC NULLS LAST';
        }

        const whereClause = conditions.join(' AND ');

        paramCount++;
        params.push(limit);
        paramCount++;
        params.push(offset);

        const result = await query(
            `SELECT c.id, c.customer_code, c.shop_name, c.owner_name,
                    c.shop_photo, c.business_type,
                    c.whatsapp, c.sms_phone,
                    c.credit_limit, c.current_credit, c.credit_balance,
                    r.name AS route_name
                    ${distanceSelect}
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             WHERE ${whereClause}
             ORDER BY ${orderBy}
             LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
            params
        );

        // আজকের ভিজিট স্ট্যাটাস যোগ করো
        const today      = new Date().toISOString().split('T')[0];
        const customerIds = result.rows.map(c => c.id);

        let visitedToday = [];
        if (customerIds.length > 0) {
            const visits = await query(
                `SELECT customer_id FROM visits
                 WHERE worker_id = $1 AND visit_date = $2
                   AND customer_id = ANY($3)`,
                [req.user.id, today, customerIds]
            );
            visitedToday = visits.rows.map(v => v.customer_id);
        }

        const customers = result.rows.map(c => ({
            ...c,
            visited_today: visitedToday.includes(c.id)
        }));

        return res.status(200).json({
            success: true,
            data: customers
        });

    } catch (error) {
        console.error('❌ Get Customers Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ONE CUSTOMER
// GET /api/customers/:id
// ============================================================

const getCustomer = async (req, res) => {
    try {
        const result = await query(
            `SELECT c.*,
                    r.name AS route_name,
                    u.name_bn AS created_by_name
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             LEFT JOIN users  u ON c.created_by = u.id
             WHERE c.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('❌ Get Customer Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE CUSTOMER
// POST /api/customers
// ============================================================

const createCustomer = async (req, res) => {
    try {
        const {
            shop_name, owner_name, business_type,
            whatsapp, sms_phone, route_id,
            latitude, longitude
        } = req.body;

        if (!shop_name || !owner_name) {
            return res.status(400).json({
                success: false,
                message: 'দোকানের নাম ও মালিকের নাম দিন।'
            });
        }

        // দোকানের ছবি Cloudinary তে
        let shopPhotoUrl = null;
        if (req.file) {
            shopPhotoUrl = await uploadToCloudinary(
                req.file.buffer,
                'shops',
                `shop_${Date.now()}`
            );
        }

        // Customer Code জেনারেট
        const customerCode = await generateCustomerCode(new Date());

        // Location
        const locationPoint = (latitude && longitude)
            ? `ST_GeogFromText('POINT(${longitude} ${latitude})')`
            : 'NULL';

        const result = await query(
            `INSERT INTO customers
             (customer_code, shop_name, owner_name, shop_photo,
              business_type, whatsapp, sms_phone, route_id,
              location, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
              ${locationPoint}, $9)
             RETURNING *`,
            [
                customerCode, shop_name, owner_name, shopPhotoUrl,
                business_type || null, whatsapp || null,
                sms_phone || null, route_id || null,
                req.user.id
            ]
        );

        // SR নিজেই তৈরি করলে তাকে অ্যাসাইন করো
        if (req.user.role === 'worker') {
            await query(
                `INSERT INTO customer_assignments
                 (worker_id, customer_id, route_id, assigned_by)
                 VALUES ($1, $2, $3, $4)`,
                [req.user.id, result.rows[0].id, route_id || null, req.user.id]
            );
        }

        return res.status(201).json({
            success: true,
            message: `কাস্টমার তৈরি সফল। কোড: ${customerCode}`,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Create Customer Error:', error.message);
        return res.status(500).json({ success: false, message: 'কাস্টমার তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE CUSTOMER
// PUT /api/customers/:id
// SR এডিট করলে pending, Admin/Manager সরাসরি
// ============================================================

const updateCustomer = async (req, res) => {
    try {
        const { id }  = req.params;
        const isAdmin = ['admin', 'manager'].includes(req.user.role);

        // বর্তমান তথ্য
        const current = await query('SELECT * FROM customers WHERE id = $1', [id]);
        if (current.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        // নতুন ছবি
        let shopPhotoUrl = current.rows[0].shop_photo;
        if (req.file) {
            shopPhotoUrl = await uploadToCloudinary(
                req.file.buffer,
                'shops',
                `shop_${id}_${Date.now()}`
            );
        }

        const {
            shop_name, owner_name, business_type,
            whatsapp, sms_phone, route_id,
            latitude, longitude
        } = req.body;

        const locationPoint = (latitude && longitude)
            ? `ST_GeogFromText('POINT(${longitude} ${latitude})')`
            : null;

        await query(
            `UPDATE customers SET
                shop_name     = COALESCE($1, shop_name),
                owner_name    = COALESCE($2, owner_name),
                business_type = COALESCE($3, business_type),
                whatsapp      = COALESCE($4, whatsapp),
                sms_phone     = COALESCE($5, sms_phone),
                route_id      = COALESCE($6, route_id),
                shop_photo    = COALESCE($7, shop_photo),
                location      = COALESCE(${locationPoint ? locationPoint : 'location'}, location),
                updated_at    = NOW()
             WHERE id = $8`,
            [
                shop_name, owner_name, business_type,
                whatsapp, sms_phone, route_id,
                shopPhotoUrl, id
            ]
        );

        return res.status(200).json({ success: true, message: 'কাস্টমার আপডেট সফল।' });

    } catch (error) {
        console.error('❌ Update Customer Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET CUSTOMER HISTORY
// GET /api/customers/:id/history
// কেনার ইতিহাস, বাকি, রিপ্লেসমেন্ট
// ============================================================

const getCustomerHistory = async (req, res) => {
    try {
        const { id } = req.params;

        // বিক্রয় ইতিহাস
        const sales = await query(
            `SELECT st.*, u.name_bn AS worker_name
             FROM sales_transactions st
             JOIN users u ON st.worker_id = u.id
             WHERE st.customer_id = $1
             ORDER BY st.created_at DESC
             LIMIT 50`,
            [id]
        );

        // বাকি পরিশোধ ইতিহাস
        const creditPayments = await query(
            `SELECT cp.*, u.name_bn AS collected_by_name
             FROM credit_payments cp
             JOIN users u ON cp.worker_id = u.id
             WHERE cp.customer_id = $1
             ORDER BY cp.created_at DESC`,
            [id]
        );

        // ভিজিট ইতিহাস
        const visits = await query(
            `SELECT v.*, u.name_bn AS worker_name
             FROM visits v
             JOIN users u ON v.worker_id = u.id
             WHERE v.customer_id = $1
             ORDER BY v.visit_time DESC
             LIMIT 30`,
            [id]
        );

        // কাস্টমারের বর্তমান তথ্য
        const customer = await query(
            'SELECT shop_name, credit_limit, current_credit, credit_balance FROM customers WHERE id = $1',
            [id]
        );

        return res.status(200).json({
            success: true,
            data: {
                customer:       customer.rows[0],
                sales:          sales.rows,
                credit_payments: creditPayments.rows,
                visits:         visits.rows
            }
        });

    } catch (error) {
        console.error('❌ Customer History Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SET CREDIT LIMIT
// PUT /api/customers/:id/credit-limit
// ============================================================

const setCreditLimit = async (req, res) => {
    try {
        const { credit_limit } = req.body;

        if (credit_limit === undefined || credit_limit < 0) {
            return res.status(400).json({
                success: false,
                message: 'সঠিক ক্রেডিট লিমিট দিন।'
            });
        }

        const result = await query(
            `UPDATE customers
             SET credit_limit = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING shop_name, credit_limit`,
            [credit_limit, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'SET_CREDIT_LIMIT', 'customers', $2, $3)`,
            [req.user.id, req.params.id, JSON.stringify({ credit_limit })]
        );

        return res.status(200).json({
            success: true,
            message: `${result.rows[0].shop_name} এর ক্রেডিট লিমিট ৳${credit_limit} সেট করা হয়েছে।`,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Set Credit Limit Error:', error.message);
        return res.status(500).json({ success: false, message: 'লিমিট সেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// COLLECT CREDIT (বাকি আদায়)
// POST /api/customers/:id/collect-credit
// ============================================================

const collectCredit = async (req, res) => {
    try {
        const { amount, notes } = req.body;
        const customerId        = req.params.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'সঠিক পরিমাণ দিন।'
            });
        }

        // বর্তমান বাকি যাচাই
        const customer = await query(
            'SELECT shop_name, current_credit FROM customers WHERE id = $1',
            [customerId]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        if (parseFloat(amount) > parseFloat(customer.rows[0].current_credit)) {
            return res.status(400).json({
                success: false,
                message: `বাকির পরিমাণ ৳${customer.rows[0].current_credit} এর বেশি দেওয়া যাবে না।`
            });
        }

        // credit_payments এ সেভ (trigger অটো current_credit কমাবে)
        await query(
            `INSERT INTO credit_payments
             (customer_id, worker_id, amount, notes)
             VALUES ($1, $2, $3, $4)`,
            [customerId, req.user.id, amount, notes || null]
        );

        return res.status(200).json({
            success: true,
            message: `৳${amount} বাকি আদায় সফল।`
        });

    } catch (error) {
        console.error('❌ Collect Credit Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাকি আদায়ে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY CUSTOMER COUNT
// GET /api/customers/my-count
// Worker এর মোট assigned কাস্টমার সংখ্যা
// ============================================================

const getMyCustomerCount = async (req, res) => {
    try {
        const result = await query(
            `SELECT COUNT(*) AS total
             FROM customer_assignments
             WHERE worker_id = $1
               AND is_active = true
               AND customer_id IS NOT NULL`,
            [req.user.id]
        );

        return res.status(200).json({
            success: true,
            data: parseInt(result.rows[0]?.total || 0)
        });

    } catch (error) {
        console.error('❌ My Customer Count Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    getCustomerHistory,
    setCreditLimit,
    collectCredit,
    getMyCustomerCount
};
