const { query, withTransaction } = require('../config/db');
const { uploadToCloudinary, generateCustomerCode } = require('../services/employee.service');
const { sendWelcomeEmail, sendOTPEmail } = require('../services/email.service');
const { generateOTP } = require('../config/encryption');

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
        // ক্রম: visit_order → GPS দূরত্ব → নাম
        let orderBy = 'ca.visit_order ASC NULLS LAST, c.shop_name ASC';

        // ✅ FIX: lat/lng parameterized query-তে পাঠাও — SQL injection ঠেকাও
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        const hasValidCoords = lat && lng
            && isFinite(parsedLat) && isFinite(parsedLng)
            && parsedLat >= -90  && parsedLat <= 90
            && parsedLng >= -180 && parsedLng <= 180;

        if (hasValidCoords) {
            paramCount++;
            params.push(parsedLng);  // ST_MakePoint(lng, lat) — longitude প্রথমে
            const lngParam = paramCount;
            paramCount++;
            params.push(parsedLat);
            const latParam = paramCount;

            distanceSelect = `,
                ROUND(
                    ST_Distance(
                        c.location::geography,
                        ST_SetSRID(ST_MakePoint($${lngParam}, $${latParam}), 4326)::geography
                    )::numeric, 0
                ) AS distance_meters`;
            orderBy = 'ca.visit_order ASC NULLS LAST, distance_meters ASC NULLS LAST';
        }

        const whereClause = conditions.join(' AND ');

        paramCount++;
        params.push(limit);
        paramCount++;
        params.push(offset);

        // Worker হলে ca JOIN-এ worker_id filter (param $1 সবসময় req.user.id worker-এর জন্য)
        const caWorkerCondition = req.user.role === 'worker' ? 'AND ca.worker_id = $1' : '';

        const result = await query(
            `SELECT c.id, c.customer_code, c.shop_name, c.owner_name,
                    c.shop_photo, c.business_type,
                    c.whatsapp, c.sms_phone, c.email,
                    c.credit_limit, c.current_credit, c.credit_balance,
                    c.has_pending_edit,
                    r.name AS route_name,
                    ca.visit_order,
                    ST_Y(c.location::geometry) AS latitude,
                    ST_X(c.location::geometry) AS longitude
                    ${distanceSelect}
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             LEFT JOIN customer_assignments ca
               ON ca.customer_id = c.id
               AND ca.is_active = true
               ${caWorkerCondition}
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

        const customer = result.rows[0];

        // Manager শুধু নিজের রুটের customer দেখতে পারবে
        if (req.user.role === 'manager') {
            if (!customer.route_id) {
                return res.status(403).json({ success: false, message: 'এই কাস্টমার আপনার টিমে নেই।' });
            }
            const routeCheck = await query(
                `SELECT id FROM routes WHERE id = $1 AND manager_id = $2`,
                [customer.route_id, req.user.id]
            );
            if (routeCheck.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'এই কাস্টমার আপনার টিমে নেই।' });
            }
        }

        return res.status(200).json({ success: true, data: customer });

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
            whatsapp, sms_phone, email, route_id,
            latitude, longitude, credit_limit
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

        // ✅ FIX: Location — parameterized ST_MakePoint ব্যবহার করো
        const parsedLat = parseFloat(latitude);
        const parsedLng = parseFloat(longitude);
        const hasValidCoords = latitude && longitude
            && isFinite(parsedLat) && isFinite(parsedLng)
            && parsedLat >= -90  && parsedLat <= 90
            && parsedLng >= -180 && parsedLng <= 180;

        let result;
        if (hasValidCoords) {
            result = await query(
                `INSERT INTO customers
                 (customer_code, shop_name, owner_name, shop_photo,
                  business_type, whatsapp, sms_phone, email, route_id,
                  credit_limit, location, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                  ST_SetSRID(ST_MakePoint($11, $12), 4326)::geography, $13)
                 RETURNING *`,
                [
                    customerCode, shop_name, owner_name, shopPhotoUrl,
                    business_type || null, whatsapp || null,
                    sms_phone || null, email || null,
                    route_id || null,
                    credit_limit ? parseFloat(credit_limit) : 5000,
                    parsedLng, parsedLat,  // ST_MakePoint(lng, lat)
                    req.user.id
                ]
            );
        } else {
            result = await query(
                `INSERT INTO customers
                 (customer_code, shop_name, owner_name, shop_photo,
                  business_type, whatsapp, sms_phone, email, route_id,
                  credit_limit, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING *`,
                [
                    customerCode, shop_name, owner_name, shopPhotoUrl,
                    business_type || null, whatsapp || null,
                    sms_phone || null, email || null,
                    route_id || null,
                    credit_limit ? parseFloat(credit_limit) : 5000,
                    req.user.id
                ]
            );
        }

        // SR নিজেই তৈরি করলে তাকে অ্যাসাইন করো
        if (req.user.role === 'worker') {
            await query(
                `INSERT INTO customer_assignments
                 (worker_id, customer_id, route_id, assigned_by)
                 VALUES ($1, $2, $3, $4)`,
                [req.user.id, result.rows[0].id, route_id || null, req.user.id]
            );
        }

        // ✅ স্বাগতম Email পাঠাও (email থাকলে)
        if (email) {
            try {
                // SR এর তথ্য আনো (worker হলে)
                let workerInfo = null;
                if (req.user.role === 'worker') {
                    const workerResult = await query(
                        `SELECT name_bn, name_en, phone FROM users WHERE id = $1`,
                        [req.user.id]
                    );
                    workerInfo = workerResult.rows[0] || null;
                }

                await sendWelcomeEmail(email, result.rows[0], workerInfo);
                console.log(`📧 স্বাগতম Email পাঠানো হয়েছে → ${email}`);
            } catch (emailErr) {
                // Email ব্যর্থ হলেও customer creation সফল রাখো
                console.error('⚠️ Welcome Email পাঠানো যায়নি:', emailErr.message);
            }
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
            whatsapp, sms_phone, email, route_id,
            latitude, longitude
        } = req.body;

        // ✅ FIX: Location — parameterized ST_MakePoint ব্যবহার করো
        const parsedLat = parseFloat(latitude);
        const parsedLng = parseFloat(longitude);
        const hasValidCoords = latitude && longitude
            && isFinite(parsedLat) && isFinite(parsedLng)
            && parsedLat >= -90  && parsedLat <= 90
            && parsedLng >= -180 && parsedLng <= 180;

        if (hasValidCoords) {
            await query(
                `UPDATE customers SET
                    shop_name     = COALESCE($1, shop_name),
                    owner_name    = COALESCE($2, owner_name),
                    business_type = COALESCE($3, business_type),
                    whatsapp      = COALESCE($4, whatsapp),
                    sms_phone     = COALESCE($5, sms_phone),
                    email         = COALESCE($6, email),
                    route_id      = COALESCE($7, route_id),
                    shop_photo    = COALESCE($8, shop_photo),
                    location      = ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
                    updated_at    = NOW()
                 WHERE id = $11`,
                [
                    shop_name, owner_name, business_type,
                    whatsapp, sms_phone, email || null,
                    route_id, shopPhotoUrl,
                    parsedLng, parsedLat,  // ST_MakePoint(lng, lat)
                    id
                ]
            );
        } else {
            await query(
                `UPDATE customers SET
                    shop_name     = COALESCE($1, shop_name),
                    owner_name    = COALESCE($2, owner_name),
                    business_type = COALESCE($3, business_type),
                    whatsapp      = COALESCE($4, whatsapp),
                    sms_phone     = COALESCE($5, sms_phone),
                    email         = COALESCE($6, email),
                    route_id      = COALESCE($7, route_id),
                    shop_photo    = COALESCE($8, shop_photo),
                    updated_at    = NOW()
                 WHERE id = $9`,
                [
                    shop_name, owner_name, business_type,
                    whatsapp, sms_phone, email || null,
                    route_id, shopPhotoUrl, id
                ]
            );
        }

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

        // Manager শুধু নিজের রুটের customer এর history দেখতে পারবে
        if (req.user.role === 'manager') {
            const routeCheck = await query(
                `SELECT c.id FROM customers c
                 JOIN routes r ON c.route_id = r.id
                 WHERE c.id = $1 AND r.manager_id = $2`,
                [id, req.user.id]
            );
            if (routeCheck.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'এই কাস্টমার আপনার টিমে নেই।' });
            }
        }

        // বিক্রয় ইতিহাস
        // sale_status: Admin/Manager কে দেখায় প্রতিটি sale এর অবস্থা
        //   verified  → কাস্টমার OTP দিয়েছে ✅
        //   skipped   → কাস্টমার অনুপস্থিত, SR ছবি তুলেছে 📷
        //   pending   → OTP এখনো দেওয়া হয়নি ⏳
        const sales = await query(
            `SELECT st.*,
                    u.name_bn AS worker_name,
                    CASE
                        WHEN st.otp_verified = true THEN 'verified'
                        WHEN st.otp_skipped  = true THEN 'skipped'
                        ELSE                             'pending'
                    END AS sale_status
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
// ============================================================
// REQUEST CUSTOMER EDIT (Worker করবে)
// POST /api/customers/:id/edit-request
// ============================================================

const requestCustomerEdit = async (req, res) => {
    try {
        const { id } = req.params;
        const current = await query('SELECT * FROM customers WHERE id = $1', [id]);
        if (current.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        if (['admin', 'manager'].includes(req.user.role)) {
            const { shop_name, owner_name, business_type, whatsapp, sms_phone, email, route_id } = req.body;
            await query(
                `UPDATE customers SET
                    shop_name = COALESCE($1, shop_name),
                    owner_name = COALESCE($2, owner_name),
                    business_type = COALESCE($3, business_type),
                    whatsapp = COALESCE($4, whatsapp),
                    sms_phone = COALESCE($5, sms_phone),
                    email = COALESCE($6, email),
                    route_id = COALESCE($7, route_id),
                    updated_at = NOW()
                 WHERE id = $8`,
                [shop_name, owner_name, business_type, whatsapp, sms_phone, email || null, route_id, id]
            );
            return res.status(200).json({ success: true, message: 'কাস্টমার আপডেট সফল।' });
        }
        const existingPending = await query(
            `SELECT id FROM customer_edit_requests WHERE customer_id = $1 AND status = 'pending'`,
            [id]
        );
        if (existingPending.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'আগের এডিট রিকোয়েস্ট এখনো অপেক্ষায় আছে।' });
        }
        const { shop_name, owner_name, business_type, whatsapp, sms_phone } = req.body;
        const previousData = {
            shop_name: current.rows[0].shop_name,
            owner_name: current.rows[0].owner_name,
            business_type: current.rows[0].business_type,
            whatsapp: current.rows[0].whatsapp,
            sms_phone: current.rows[0].sms_phone
        };
        const newData = {};
        if (shop_name && shop_name !== previousData.shop_name) newData.shop_name = shop_name;
        if (owner_name && owner_name !== previousData.owner_name) newData.owner_name = owner_name;
        if (business_type !== undefined && business_type !== previousData.business_type) newData.business_type = business_type;
        if (whatsapp !== undefined && whatsapp !== previousData.whatsapp) newData.whatsapp = whatsapp;
        if (sms_phone !== undefined && sms_phone !== previousData.sms_phone) newData.sms_phone = sms_phone;
        if (Object.keys(newData).length === 0) {
            return res.status(400).json({ success: false, message: 'কোনো পরিবর্তন নেই।' });
        }
        const request = await query(
            `INSERT INTO customer_edit_requests (customer_id, requested_by, new_data, previous_data, status)
             VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
            [id, req.user.id, JSON.stringify(newData), JSON.stringify(previousData)]
        );
        await query(`UPDATE customers SET has_pending_edit = true WHERE id = $1`, [id]);
        const updateFields = [];
        const updateParams = [];
        let paramCount = 0;
        if (newData.shop_name) { paramCount++; updateFields.push(`shop_name = $${paramCount}`); updateParams.push(newData.shop_name); }
        if (newData.owner_name) { paramCount++; updateFields.push(`owner_name = $${paramCount}`); updateParams.push(newData.owner_name); }
        if (newData.business_type !== undefined) { paramCount++; updateFields.push(`business_type = $${paramCount}`); updateParams.push(newData.business_type); }
        if (newData.whatsapp !== undefined) { paramCount++; updateFields.push(`whatsapp = $${paramCount}`); updateParams.push(newData.whatsapp); }
        if (newData.sms_phone !== undefined) { paramCount++; updateFields.push(`sms_phone = $${paramCount}`); updateParams.push(newData.sms_phone); }
        if (updateFields.length > 0) {
            paramCount++;
            updateParams.push(id);
            await query(`UPDATE customers SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`, updateParams);
        }
        return res.status(200).json({ success: true, message: 'এডিট রিকোয়েস্ট পাঠানো হয়েছে। ম্যানেজার অনুমোদন দিলে চূড়ান্ত হবে।', data: { request_id: request.rows[0].id } });
    } catch (error) {
        console.error('❌ Request Customer Edit Error:', error.message);
        return res.status(500).json({ success: false, message: 'এডিট রিকোয়েস্টে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET PENDING CUSTOMER EDITS (Manager দেখবে)
// GET /api/customers/edit-requests/pending
// ============================================================

const getPendingCustomerEdits = async (req, res) => {
    try {
        let whereClause = `cer.status = 'pending'`;
        const params = [];
        if (req.user.role === 'manager') {
            params.push(req.user.id);
            whereClause += ` AND c.route_id IN (SELECT id FROM routes WHERE manager_id = $${params.length})`;
        }
        const result = await query(
            `SELECT cer.id, cer.customer_id, cer.new_data, cer.previous_data, cer.created_at,
                    c.shop_name, c.owner_name, c.customer_code,
                    u.name_bn AS requested_by_name, u.phone AS requested_by_phone
             FROM customer_edit_requests cer
             JOIN customers c ON cer.customer_id = c.id
             JOIN users u ON cer.requested_by = u.id
             WHERE ${whereClause}
             ORDER BY cer.created_at DESC`,
            params
        );
        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('❌ Get Pending Customer Edits Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// APPROVE CUSTOMER EDIT
// PUT /api/customers/edit-requests/:requestId/approve
// ============================================================

const approveCustomerEdit = async (req, res) => {
    try {
        const { requestId } = req.params;
        const reqData = await query(`SELECT * FROM customer_edit_requests WHERE id = $1 AND status = 'pending'`, [requestId]);
        if (reqData.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });
        }
        const editReq = reqData.rows[0];
        await query(`UPDATE customer_edit_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`, [req.user.id, requestId]);
        await query(`UPDATE customers SET has_pending_edit = false WHERE id = $1`, [editReq.customer_id]);
        await query(`INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value) VALUES ($1, 'APPROVE_CUSTOMER_EDIT', 'customers', $2, $3)`, [req.user.id, editReq.customer_id, JSON.stringify(editReq.new_data)]);
        return res.status(200).json({ success: true, message: 'কাস্টমার এডিট অনুমোদন সফল।' });
    } catch (error) {
        console.error('❌ Approve Customer Edit Error:', error.message);
        return res.status(500).json({ success: false, message: 'অনুমোদনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// REJECT CUSTOMER EDIT — আগের data ফিরে আসবে
// PUT /api/customers/edit-requests/:requestId/reject
// ============================================================

const rejectCustomerEdit = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { reason } = req.body;
        const reqData = await query(`SELECT * FROM customer_edit_requests WHERE id = $1 AND status = 'pending'`, [requestId]);
        if (reqData.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি।' });
        }
        const editReq = reqData.rows[0];
        const previousData = editReq.previous_data;
        const rollbackFields = [];
        const rollbackParams = [];
        let paramCount = 0;
        for (const field of ['shop_name', 'owner_name', 'business_type', 'whatsapp', 'sms_phone']) {
            if (previousData[field] !== undefined) {
                paramCount++;
                rollbackFields.push(`${field} = $${paramCount}`);
                rollbackParams.push(previousData[field]);
            }
        }
        if (rollbackFields.length > 0) {
            paramCount++;
            rollbackParams.push(editReq.customer_id);
            await query(`UPDATE customers SET ${rollbackFields.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`, rollbackParams);
        } else {
            // কোনো rollback field না থাকলেও updated_at রিফ্রেশ (query order consistent)
            await query(`UPDATE customers SET updated_at = NOW() WHERE id = $1`, [editReq.customer_id]);
        }
        await query(`UPDATE customer_edit_requests SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_note = $2 WHERE id = $3`, [req.user.id, reason || 'ম্যানেজার কর্তৃক বাতিল', requestId]);
        await query(`UPDATE customers SET has_pending_edit = false WHERE id = $1`, [editReq.customer_id]);
        return res.status(200).json({ success: true, message: 'এডিট বাতিল। আগের তথ্য পুনরুদ্ধার হয়েছে।', rollback: previousData });
    } catch (error) {
        console.error('❌ Reject Customer Edit Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাতিলে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// EMAIL OTP — কাস্টমার তৈরির আগে Email যাচাই
// POST /api/customers/verify-email/send
// POST /api/customers/verify-email/confirm
// ⚠️ In-Memory Map বাদ — এখন PostgreSQL DB-তে সেভ হয়
//    (Render free tier spin-down এ data হারায় না)
// ============================================================

const sendEmailVerifyOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'সঠিক Email দিন।' });
        }


        const otp        = generateOTP(6);
        const expiresAt  = new Date(Date.now() + 10 * 60 * 1000); // 10 মিনিট
        const emailLower = email.toLowerCase();

        // DB-তে upsert — আগেরটা থাকলে replace করো
        await query(
            `INSERT INTO email_otps (email, otp, expires_at, created_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (email)
             DO UPDATE SET otp = $2, expires_at = $3, created_at = NOW()`,
            [emailLower, otp, expiresAt]
        );

        const result = await sendOTPEmail(email, otp, 'নতুন কাস্টমার নিবন্ধন');

        if (!result.success && !result.dev) {
            return res.status(500).json({ success: false, message: 'Email পাঠানো যায়নি। পরে চেষ্টা করুন।' });
        }

        return res.status(200).json({ success: true, message: `OTP পাঠানো হয়েছে ${email}-এ।` });

    } catch (error) {
        console.error('❌ sendEmailVerifyOTP:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

const confirmEmailVerifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email ও OTP দিন।' });
        }

        const emailLower = email.toLowerCase();

        // DB থেকে OTP পড়ো
        const result = await query(
            `SELECT otp, expires_at FROM email_otps WHERE email = $1`,
            [emailLower]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP পাঠানো হয়নি। আবার চেষ্টা করুন।' });
        }

        const record = result.rows[0];

        if (new Date() > new Date(record.expires_at)) {
            await query(`DELETE FROM email_otps WHERE email = $1`, [emailLower]);
            return res.status(400).json({ success: false, message: 'OTP মেয়াদ শেষ। নতুন OTP নিন।' });
        }

        if (record.otp !== otp.trim()) {
            return res.status(400).json({ success: false, message: 'OTP ভুল।' });
        }

        // যাচাই সফল — রেকর্ড মুছো
        await query(`DELETE FROM email_otps WHERE email = $1`, [emailLower]);

        return res.status(200).json({ success: true, message: 'Email যাচাই সফল ✅' });

    } catch (error) {
        console.error('❌ confirmEmailVerifyOTP:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE VISIT ORDER
// PUT /api/customers/visit-order
// Manager/Admin → route-র কাস্টমারদের visit ক্রম সেট করবেন
// Body: { route_id, orders: [{ customer_id, visit_order }] }
// ============================================================

const updateVisitOrder = async (req, res) => {
    try {
        const { route_id, orders } = req.body;

        if (!route_id || !Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ success: false, message: 'route_id এবং orders দরকার।' });
        }

        // ── FIX: N+1 loop বাদ → একটি bulk UPDATE ──────────────────────
        // আগে: N জন customer → N টি আলাদা UPDATE query (serial round-trip)
        // এখন: একটি VALUES list → PostgreSQL একটি pass-এই সব row আপডেট করে
        //
        // Query গঠন:
        //   UPDATE customer_assignments AS ca
        //   SET visit_order = v.visit_order
        //   FROM (VALUES ($1::uuid, $2::int), ($3::uuid, $4::int), ...) AS v(customer_id, visit_order)
        //   WHERE ca.customer_id = v.customer_id
        //     AND ca.route_id   = $N
        //     AND ca.is_active  = true
        //
        // params: [cid1, ord1, cid2, ord2, ..., route_id]

        const values  = [];   // flat param list
        const tuples  = [];   // ($1::uuid, $2::int), ($3::uuid, $4::int) ...
        let   i       = 1;

        for (const { customer_id, visit_order } of orders) {
            tuples.push(`($${i}::uuid, $${i + 1}::int)`);
            values.push(customer_id, visit_order ?? null);
            i += 2;
        }

        // route_id শেষ param
        values.push(route_id);
        const routeParam = i;

        await query(
            `UPDATE customer_assignments AS ca
             SET visit_order = v.visit_order
             FROM (VALUES ${tuples.join(', ')}) AS v(customer_id, visit_order)
             WHERE ca.customer_id = v.customer_id
               AND ca.route_id   = $${routeParam}::uuid
               AND ca.is_active  = true`,
            values
        );

        return res.status(200).json({ success: true, message: 'Visit ক্রম সেভ হয়েছে ✅' });

    } catch (error) {
        console.error('❌ updateVisitOrder Error:', error.message);
        return res.status(500).json({ success: false, message: 'ক্রম সেভ করতে সমস্যা হয়েছে।' });
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
    getMyCustomerCount,
    requestCustomerEdit,
    getPendingCustomerEdits,
    approveCustomerEdit,
    rejectCustomerEdit,
    sendEmailVerifyOTP,
    confirmEmailVerifyOTP,
    updateVisitOrder
};
