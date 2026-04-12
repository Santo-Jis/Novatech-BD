const { query, withTransaction } = require('../config/db');
const { generateOTP }            = require('../config/encryption');
const {
    generateInvoiceNumber,
    sendInvoiceOTP,
    generateInvoicePDF,
    getInvoiceWhatsAppMessage
} = require('../services/invoice.service');
const { uploadToCloudinary } = require('../services/employee.service');
const axios = require('axios');

// Firebase নোটিফিকেশন
const firebaseNotify = async (path, data) => {
    try {
        const url = process.env.FIREBASE_DATABASE_URL;
        if (!url) return;
        await axios.post(`${url}/${path}.json`, { ...data, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('⚠️ Firebase Error:', err.message);
    }
};

// ============================================================
// CREATE VISIT
// POST /api/sales/visit
// SR দোকানে গেলে রেকর্ড হবে
// ============================================================

const createVisit = async (req, res) => {
    try {
        const {
            customer_id, route_id,
            will_sell, no_sell_reason,
            latitude, longitude
        } = req.body;

        if (!customer_id) {
            return res.status(400).json({ success: false, message: 'কাস্টমার সিলেক্ট করুন।' });
        }

        // কাস্টমারের GPS লোকেশন নাও
        const customer = await query(
            'SELECT id, shop_name, location, whatsapp, sms_phone FROM customers WHERE id = $1',
            [customer_id]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        // লোকেশন যাচাই (৫ মিটারের মধ্যে)
        let locationMatched = false;
        let distance        = null;

        if (latitude && longitude && customer.rows[0].location) {
            const distResult = await query(
                `SELECT ROUND(ST_Distance(
                    $1::geography,
                    ST_GeogFromText('POINT($2 $3)')
                )::numeric, 0) AS distance`,
                [customer.rows[0].location, longitude, latitude]
            );
            distance        = distResult.rows[0]?.distance;
            locationMatched = distance <= 5; // ৫ মিটার
        }

        // বন্ধ দোকানের ছবি আপলোড
        let closedShopPhoto = null;
        if (!will_sell && req.file) {
            closedShopPhoto = await uploadToCloudinary(
                req.file.buffer,
                'closed_shops',
                `closed_${customer_id}_${Date.now()}`
            );
        }

        // ভিজিট সেভ
        const result = await query(
            `INSERT INTO visits
             (worker_id, customer_id, route_id, will_sell,
              no_sell_reason, closed_shop_photo,
              worker_location, location_matched, location_distance)
             VALUES ($1, $2, $3, $4, $5, $6,
              ${latitude && longitude ? `ST_GeogFromText('POINT(${longitude} ${latitude})')` : 'NULL'},
              $7, $8)
             RETURNING id`,
            [
                req.user.id, customer_id, route_id || null,
                will_sell !== false, no_sell_reason || null,
                closedShopPhoto, locationMatched, distance
            ]
        );

        // লোকেশন warning (৫ মিটারের বাইরে)
        const warning = !locationMatched && latitude
            ? `⚠️ আপনি দোকান থেকে ${distance} মিটার দূরে আছেন।`
            : null;

        return res.status(201).json({
            success:  true,
            message: 'ভিজিট রেকর্ড হয়েছে।',
            data: {
                visit_id:        result.rows[0].id,
                location_matched: locationMatched,
                distance,
                warning
            }
        });

    } catch (error) {
        console.error('❌ Create Visit Error:', error.message);
        return res.status(500).json({ success: false, message: 'ভিজিট রেকর্ডে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CREATE SALE
// POST /api/sales
// ============================================================

const createSale = async (req, res) => {
    try {
        const {
            customer_id, visit_id, order_id,
            items,
            payment_method,
            replacement_items,
            use_credit_balance  // কাস্টমারের জমা ব্যালেন্স ব্যবহার
        } = req.body;

        if (!customer_id || !items || !payment_method) {
            return res.status(400).json({
                success: false,
                message: 'কাস্টমার, পণ্য এবং পেমেন্ট পদ্ধতি আবশ্যক।'
            });
        }

        // কাস্টমার তথ্য
        const customer = await query(
            'SELECT * FROM customers WHERE id = $1',
            [customer_id]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        const cust = customer.rows[0];

        // মোট হিসাব
        let totalAmount       = 0;
        let replacementValue  = 0;
        const processedItems  = [];

        for (const item of items) {
            const product = await query(
                'SELECT id, name, price FROM products WHERE id = $1',
                [item.product_id]
            );
            if (product.rows.length === 0) continue;

            const subtotal = product.rows[0].price * item.qty;
            totalAmount   += subtotal;

            processedItems.push({
                product_id:   item.product_id,
                product_name: product.rows[0].name,
                qty:          item.qty,
                price:        product.rows[0].price,
                subtotal
            });
        }

        // রিপ্লেসমেন্ট হিসাব
        const processedReplacement = [];
        if (replacement_items?.length > 0) {
            for (const item of replacement_items) {
                const product = await query(
                    'SELECT id, name, price FROM products WHERE id = $1',
                    [item.product_id]
                );
                if (product.rows.length === 0) continue;

                const total       = product.rows[0].price * item.qty;
                replacementValue += total;

                processedReplacement.push({
                    product_id:   item.product_id,
                    product_name: product.rows[0].name,
                    qty:          item.qty,
                    unit_price:   product.rows[0].price,
                    total
                });
            }
        }

        // Credit Balance সমন্বয়
        let creditBalanceUsed  = 0;
        let discountAmount     = 0;

        if (use_credit_balance && cust.credit_balance > 0) {
            creditBalanceUsed = Math.min(cust.credit_balance, totalAmount);
            discountAmount    = creditBalanceUsed;
        }

        // রিপ্লেসমেন্ট সমন্বয়
        const netBeforeReplacement = totalAmount - discountAmount;
        let   netAmount            = netBeforeReplacement - replacementValue;

        // Credit Balance যোগ (রিপ্লেসমেন্ট বেশি হলে)
        let creditBalanceAdded = 0;
        if (netAmount < 0) {
            creditBalanceAdded = Math.abs(netAmount);
            netAmount          = 0;
        }

        // পেমেন্ট লজিক যাচাই
        let cashReceived = 0;
        let creditUsed   = 0;

        if (payment_method === 'cash') {
            cashReceived = netAmount;

        } else if (payment_method === 'credit') {
            // ক্রেডিট লিমিট যাচাই
            const newCredit = parseFloat(cust.current_credit) + netAmount;
            if (newCredit > parseFloat(cust.credit_limit)) {
                return res.status(400).json({
                    success: false,
                    message: `ক্রেডিট লিমিট পার হবে। বর্তমান বাকি: ৳${cust.current_credit}, লিমিট: ৳${cust.credit_limit}`
                });
            }
            creditUsed = netAmount;

        } else if (payment_method === 'replacement') {
            // রিপ্লেসমেন্টে বাকি থাকলে নগদ বা ক্রেডিট
            cashReceived = netAmount;
        }

        // Invoice নম্বর
        const invoiceNumber = await generateInvoiceNumber();

        // OTP তৈরি
        const settings  = await query("SELECT value FROM system_settings WHERE key = 'otp_required'");
        const otpRequired = settings.rows[0]?.value === 'true';
        const otp        = otpRequired ? generateOTP(6) : null;

        const expiryMinutesResult = await query(
            "SELECT value FROM system_settings WHERE key = 'otp_expiry_minutes'"
        );
        const expiryMinutes = parseInt(expiryMinutesResult.rows[0]?.value || '10');
        const otpExpiresAt  = otp
            ? new Date(Date.now() + expiryMinutes * 60 * 1000)
            : null;

        // বিক্রয় সেভ
        const saleResult = await withTransaction(async (client) => {
            const result = await client.query(
                `INSERT INTO sales_transactions
                 (worker_id, customer_id, visit_id, order_id,
                  items, total_amount, discount_amount, net_amount,
                  payment_method, cash_received, credit_used,
                  replacement_items, replacement_value,
                  credit_balance_used, credit_balance_added,
                  invoice_number, otp_code, otp_expires_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                 RETURNING *`,
                [
                    req.user.id, customer_id, visit_id || null, order_id || null,
                    JSON.stringify(processedItems),
                    totalAmount, discountAmount, netAmount,
                    payment_method, cashReceived, creditUsed,
                    JSON.stringify(processedReplacement), replacementValue,
                    creditBalanceUsed, creditBalanceAdded,
                    invoiceNumber, otp, otpExpiresAt
                ]
            );

            // স্টক কমাও
            for (const item of processedItems) {
                await client.query(
                    `UPDATE products
                     SET stock          = stock - $1,
                         reserved_stock = GREATEST(0, reserved_stock - $1),
                         updated_at     = NOW()
                     WHERE id = $2`,
                    [item.qty, item.product_id]
                );

                await client.query(
                    `INSERT INTO stock_movements
                     (product_id, movement_type, quantity, reference_id, reference_type, created_by)
                     VALUES ($1, 'out', $2, $3, 'sale', $4)`,
                    [item.product_id, item.qty, result.rows[0].id, req.user.id]
                );
            }

            // রিপ্লেসমেন্ট স্টক ফেরত
            for (const item of processedReplacement) {
                await client.query(
                    `UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2`,
                    [item.qty, item.product_id]
                );
                await client.query(
                    `INSERT INTO stock_movements
                     (product_id, movement_type, quantity, reference_id, reference_type, note, created_by)
                     VALUES ($1, 'returned', $2, $3, 'sale', 'রিপ্লেসমেন্ট ফেরত', $4)`,
                    [item.product_id, item.qty, result.rows[0].id, req.user.id]
                );
            }

            return result.rows[0];
        });

        // OTP ও Invoice SMS পাঠাও
        if (otp) {
            await sendInvoiceOTP(cust, saleResult.id, otp);
        }

        // WhatsApp লিংক তৈরি
        const waLink = getInvoiceWhatsAppMessage(
            saleResult, cust, req.user, processedItems
        );

        // Firebase → Manager রিয়েলটাইম আপডেট
        if (req.user.manager_id) {
            await firebaseNotify(
                `live/sales/${req.user.manager_id}/${req.user.id}`,
                {
                    invoiceNumber,
                    totalAmount,
                    netAmount,
                    paymentMethod: payment_method,
                    shopName:      cust.shop_name
                }
            );
        }

        return res.status(201).json({
            success: true,
            message: 'বিক্রয় সফল।',
            data: {
                sale_id:           saleResult.id,
                invoice_number:    invoiceNumber,
                total_amount:      totalAmount,
                replacement_value: replacementValue,
                net_amount:        netAmount,
                otp_required:      otpRequired,
                items:             processedItems,
                replacement_items: processedReplacement,
                payment_method:    payment_method,
                whatsapp_link:     `https://wa.me/${cust.whatsapp?.replace(/\D/g, '')}?text=${encodeURIComponent(waLink)}`
            }
        });

    } catch (error) {
        console.error('❌ Create Sale Error:', error.message);
        return res.status(500).json({ success: false, message: 'বিক্রয়ে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SEND INVOICE
// POST /api/sales/invoice/send
// ============================================================

const sendInvoice = async (req, res) => {
    try {
        const { sale_id, send_via } = req.body; // 'whatsapp' or 'sms'

        const sale = await query(
            `SELECT st.*, c.shop_name, c.whatsapp, c.sms_phone, c.owner_name
             FROM sales_transactions st
             JOIN customers c ON st.customer_id = c.id
             WHERE st.id = $1`,
            [sale_id]
        );

        if (sale.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'বিক্রয় পাওয়া যায়নি।' });
        }

        const s = sale.rows[0];

        if (send_via === 'sms') {
            const { sendInvoice: smsSend } = require('../services/sms.service');
            await smsSend(
                s.sms_phone || s.whatsapp,
                s.invoice_number,
                s.net_amount,
                s.shop_name
            );
        }

        return res.status(200).json({
            success:     true,
            message:    'Invoice পাঠানো হয়েছে।',
            whatsapp_link: s.whatsapp
                ? `https://wa.me/${s.whatsapp.replace(/\D/g, '')}`
                : null
        });

    } catch (error) {
        console.error('❌ Send Invoice Error:', error.message);
        return res.status(500).json({ success: false, message: 'Invoice পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// VERIFY OTP
// POST /api/sales/verify-otp
// ============================================================

const verifyOTP = async (req, res) => {
    try {
        const { sale_id, otp } = req.body;

        const sale = await query(
            'SELECT id, otp_code, otp_expires_at, otp_verified FROM sales_transactions WHERE id = $1',
            [sale_id]
        );

        if (sale.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'বিক্রয় পাওয়া যায়নি।' });
        }

        const s = sale.rows[0];

        if (s.otp_verified) {
            return res.status(400).json({ success: false, message: 'OTP আগে থেকেই যাচাই হয়েছে।' });
        }

        if (new Date() > new Date(s.otp_expires_at)) {
            return res.status(400).json({ success: false, message: 'OTP মেয়াদ শেষ। নতুন OTP নিন।' });
        }

        if (s.otp_code !== otp) {
            return res.status(400).json({ success: false, message: 'OTP ভুল।' });
        }

        await query(
            'UPDATE sales_transactions SET otp_verified = true WHERE id = $1',
            [sale_id]
        );

        return res.status(200).json({ success: true, message: 'OTP যাচাই সফল। বিক্রয় নিশ্চিত।' });

    } catch (error) {
        console.error('❌ Verify OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'OTP যাচাইয়ে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY SALES
// GET /api/sales/my
// ============================================================

const getMySales = async (req, res) => {
    try {
        const { date, from, to } = req.query;
        const today              = date || new Date().toISOString().split('T')[0];

        let conditions = ['st.worker_id = $1'];
        let params     = [req.user.id];
        let paramCount = 1;

        if (from && to) {
            paramCount++;
            conditions.push(`st.date BETWEEN $${paramCount}`);
            params.push(from);
            paramCount++;
            conditions[conditions.length - 1] += ` AND $${paramCount}`;
            params.push(to);
        } else {
            paramCount++;
            conditions.push(`st.date = $${paramCount}`);
            params.push(today);
        }

        const result = await query(
            `SELECT st.*, c.shop_name, c.owner_name
             FROM sales_transactions st
             JOIN customers c ON st.customer_id = c.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY st.created_at DESC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ My Sales Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TODAY SUMMARY (SR ড্যাশবোর্ড)
// GET /api/sales/today-summary
// ============================================================

const getTodaySummary = async (req, res) => {
    try {
        const today    = new Date().toISOString().split('T')[0];
        const workerId = req.user.id;

        // বিক্রয় সারসংক্ষেপ
        const salesSummary = await query(
            `SELECT
                COUNT(*)                                    AS total_sales,
                COALESCE(SUM(total_amount), 0)              AS total_amount,
                COALESCE(SUM(cash_received), 0)             AS cash_received,
                COALESCE(SUM(credit_used), 0)               AS credit_given,
                COALESCE(SUM(replacement_value), 0)         AS replacement_value,
                COALESCE(SUM(credit_balance_used), 0)       AS credit_collected
             FROM sales_transactions
             WHERE worker_id = $1 AND date = $2`,
            [workerId, today]
        );

        // ভিজিট সারসংক্ষেপ
        const visitSummary = await query(
            `SELECT
                COUNT(*)                                     AS total_visits,
                COUNT(CASE WHEN will_sell = true THEN 1 END) AS sold_visits,
                COUNT(CASE WHEN will_sell = false THEN 1 END) AS no_sell_visits
             FROM visits
             WHERE worker_id = $1 AND visit_date = $2`,
            [workerId, today]
        );

        // মোট কাস্টমার
        const totalCustomers = await query(
            `SELECT COUNT(*) AS total
             FROM customer_assignments
             WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL`,
            [workerId]
        );

        // আজকের অর্ডার
        const todayOrder = await query(
            `SELECT status, total_amount FROM orders
             WHERE worker_id = $1 AND DATE(requested_at) = $2
             ORDER BY requested_at DESC LIMIT 1`,
            [workerId, today]
        );

        // বকেয়া
        const dues = await query(
            'SELECT outstanding_dues FROM users WHERE id = $1',
            [workerId]
        );

        return res.status(200).json({
            success: true,
            data: {
                date:             today,
                sales:            salesSummary.rows[0],
                visits: {
                    ...visitSummary.rows[0],
                    total_customers: parseInt(totalCustomers.rows[0].total),
                    visit_percentage: totalCustomers.rows[0].total > 0
                        ? Math.round((visitSummary.rows[0].total_visits / totalCustomers.rows[0].total) * 100)
                        : 0
                },
                today_order:      todayOrder.rows[0] || null,
                outstanding_dues: dues.rows[0]?.outstanding_dues || 0
            }
        });

    } catch (error) {
        console.error('❌ Today Summary Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TEAM SALES
// GET /api/sales/team
// ============================================================

const getTeamSales = async (req, res) => {
    try {
        const { from, to, worker_id } = req.query;
        const today                   = new Date().toISOString().split('T')[0];
        const fromDate                = from || today;
        const toDate                  = to   || today;

        let conditions = ['st.date BETWEEN $1 AND $2'];
        let params     = [fromDate, toDate];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        if (worker_id) {
            paramCount++;
            conditions.push(`st.worker_id = $${paramCount}`);
            params.push(worker_id);
        }

        const result = await query(
            `SELECT st.date,
                    u.name_bn AS worker_name, u.employee_code,
                    c.shop_name,
                    st.total_amount, st.net_amount,
                    st.payment_method, st.invoice_number,
                    st.otp_verified, st.created_at
             FROM sales_transactions st
             JOIN users     u ON st.worker_id   = u.id
             JOIN customers c ON st.customer_id = c.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY st.created_at DESC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Team Sales Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SALE DETAIL
// GET /api/sales/:id
// ============================================================

const getSaleDetail = async (req, res) => {
    try {
        const result = await query(
            `SELECT st.*,
                    c.shop_name, c.owner_name, c.whatsapp, c.sms_phone,
                    u.name_bn AS worker_name, u.employee_code
             FROM sales_transactions st
             JOIN customers c ON st.customer_id = c.id
             JOIN users     u ON st.worker_id   = u.id
             WHERE st.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'বিক্রয় পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('❌ Sale Detail Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    createVisit,
    createSale,
    sendInvoice,
    verifyOTP,
    getMySales,
    getTeamSales,
    getTodaySummary,
    getSaleDetail
};
