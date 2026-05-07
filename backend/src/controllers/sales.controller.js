const { query, withTransaction } = require('../config/db');
const { calcFromProduct }        = require('../services/price.utils');
const { generateOTP }            = require('../config/encryption');
const { addLedgerEntry }         = require('./ledger.controller');
const {
    generateInvoiceNumber,
    sendInvoiceOTP,
    sendInvoiceNotification,
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

        // ✅ FIX: latitude/longitude validate করো, তারপর parameterized query-তে পাঠাও
        const rawLat = parseFloat(latitude);
        const rawLng = parseFloat(longitude);
        const hasLocation = isFinite(rawLat) && isFinite(rawLng)
                         && rawLat >= -90  && rawLat <= 90
                         && rawLng >= -180 && rawLng <= 180;

        if (hasLocation && customer.rows[0].location) {
            const distResult = await query(
                `SELECT ROUND(ST_Distance(
                    $1::geography,
                    ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
                )::numeric, 0) AS distance`,
                [customer.rows[0].location, rawLng, rawLat]
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
              ${hasLocation ? 'ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography' : 'NULL'},
              ${hasLocation ? '$9, $10' : '$7, $8'})
             RETURNING id`,
            hasLocation
                ? [req.user.id, customer_id, route_id || null,
                   will_sell !== false, no_sell_reason || null,
                   closedShopPhoto, rawLng, rawLat, locationMatched, distance]
                : [req.user.id, customer_id, route_id || null,
                   will_sell !== false, no_sell_reason || null,
                   closedShopPhoto, locationMatched, distance]
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
        let {
            customer_id, visit_id, order_id,
            items,
            payment_method,
            replacement_items,
            use_credit_balance,  // কাস্টমারের জমা ব্যালেন্স ব্যবহার
            idempotency_key      // Offline duplicate প্রতিরোধ
        } = req.body;

        if (!customer_id || !items || !payment_method) {
            return res.status(400).json({
                success: false,
                message: 'কাস্টমার, পণ্য এবং পেমেন্ট পদ্ধতি আবশ্যক।'
            });
        }

        // ── Idempotency Check — Offline duplicate প্রতিরোধ ─────────────
        // Frontend প্রতিটি sale-এ একটি unique key পাঠাবে (যেমন: uuid বা timestamp+worker)
        // Network retry-তে একই key আসলে আগের সফল response ফিরিয়ে দাও
        if (idempotency_key) {
            const existing = await query(
                `SELECT id, invoice_number, total_amount, net_amount,
                        payment_method, credit_balance_used, credit_balance_added
                 FROM sales_transactions
                 WHERE worker_id = $1 AND idempotency_key = $2`,
                [req.user.id, idempotency_key]
            );
            if (existing.rows.length > 0) {
                const prev = existing.rows[0];
                return res.status(200).json({
                    success:    true,
                    duplicate:  true,
                    message:    'এই বিক্রয় আগেই সম্পন্ন হয়েছে।',
                    data: {
                        sale_id:              prev.id,
                        invoice_number:       prev.invoice_number,
                        total_amount:         prev.total_amount,
                        net_amount:           prev.net_amount,
                        payment_method:       prev.payment_method,
                        credit_balance_used:  prev.credit_balance_used,
                        credit_balance_added: prev.credit_balance_added,
                    }
                });
            }
        }

        // ── অনুমোদিত অর্ডার যাচাই (Server-side hard block) ──────
        const today = new Date().toISOString().split('T')[0];
        const orderCheck = await query(
            `SELECT id FROM orders
             WHERE worker_id = $1
               AND DATE(requested_at) = $2
               AND status = 'approved'
             ORDER BY approved_at DESC
             LIMIT 1`,
            [req.user.id, today]
        );

        if (orderCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'আজকের অর্ডার ম্যানেজার কর্তৃক অনুমোদিত হয়নি। অনুমোদন ছাড়া বিক্রয় সম্ভব নয়।'
            });
        }

        // order_id না পাঠালে approved order থেকেই নাও
        if (!order_id) {
            order_id = orderCheck.rows[0].id;
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
                'SELECT id, name, price, vat, tax FROM products WHERE id = $1',
                [item.product_id]
            );
            if (product.rows.length === 0) continue;

            const { unitPrice, vatRate, taxRate,
                    vatAmount, taxAmount, finalPrice, subtotal } =
                calcFromProduct(product.rows[0], item.qty);
            totalAmount += subtotal;

            processedItems.push({
                product_id:   item.product_id,
                product_name: product.rows[0].name,
                qty:          item.qty,
                price:        unitPrice,
                vat_rate:     vatRate,
                tax_rate:     taxRate,
                vat_amount:   vatAmount,
                tax_amount:   taxAmount,
                final_price:  finalPrice,
                subtotal
            });
        }

        // রিপ্লেসমেন্ট হিসাব
        const processedReplacement = [];
        if (replacement_items?.length > 0) {
            for (const item of replacement_items) {
                const product = await query(
                    'SELECT id, name, price, vat, tax FROM products WHERE id = $1',
                    [item.product_id]
                );
                if (product.rows.length === 0) continue;

                const { unitPrice, vatRate, taxRate,
                        vatAmount, taxAmount, finalPrice,
                        subtotal: total } =
                    calcFromProduct(product.rows[0], item.qty);
                replacementValue += total;

                processedReplacement.push({
                    product_id:   item.product_id,
                    product_name: product.rows[0].name,
                    qty:          item.qty,
                    unit_price:   unitPrice,
                    vat_rate:     vatRate,
                    tax_rate:     taxRate,
                    vat_amount:   vatAmount,
                    tax_amount:   taxAmount,
                    final_price:  finalPrice,
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
                  invoice_number, otp_code, otp_expires_at,
                  idempotency_key)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                 RETURNING *`,
                [
                    req.user.id, customer_id, visit_id || null, order_id || null,
                    JSON.stringify(processedItems),
                    totalAmount, discountAmount, netAmount,
                    payment_method, cashReceived, creditUsed,
                    JSON.stringify(processedReplacement), replacementValue,
                    creditBalanceUsed, creditBalanceAdded,
                    invoiceNumber, otp, otpExpiresAt,
                    idempotency_key || null
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

                // ─── Ledger: বিক্রয় OUT ───────────────────
                await addLedgerEntry(client, {
                    worker_id:      req.user.id,
                    product_id:     item.product_id,
                    product_name:   item.product_name || item.name,
                    txn_type:       'sale_out',
                    direction:      -1,
                    qty:            item.qty,
                    reference_id:   result.rows[0].id,
                    reference_type: 'sale',
                    note:           `বিক্রয় — Invoice: ${invoiceNumber}`,
                    created_by:     req.user.id,
                });
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

                // ─── Ledger: রিপ্লেসমেন্ট ফেরত IN ────────
                await addLedgerEntry(client, {
                    worker_id:      req.user.id,
                    product_id:     item.product_id,
                    product_name:   item.product_name || item.name,
                    txn_type:       'order_in',
                    direction:      1,
                    qty:            item.qty,
                    reference_id:   result.rows[0].id,
                    reference_type: 'sale',
                    note:           'রিপ্লেসমেন্ট ফেরত',
                    created_by:     req.user.id,
                });
            }

            return result.rows[0];
        });

        // OTP + Invoice একসাথে একটাই Email/SMS
        if (otp) {
            const otpResult = await sendInvoiceOTP(cust, saleResult.id, otp, expiryMinutes, saleResult, req.user, processedItems);
            console.log('📤 OTP+Invoice পাঠানো:', JSON.stringify(otpResult.results));
        }

        // Invoice SMS Fallback (email না থাকলে)
        sendInvoiceNotification(cust, saleResult, req.user, processedItems)
            .then(r => console.log('📄 Invoice SMS Fallback:', JSON.stringify(r.results)))
            .catch(e => console.error('⚠️ Invoice নোটিফিকেশন Error:', e.message));

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
                replacement_value:    replacementValue,
                net_amount:           netAmount,
                otp_required:         otpRequired,
                items:                processedItems,
                replacement_items:    processedReplacement,
                payment_method:       payment_method,
                discount_amount:      discountAmount,
                credit_balance_used:  creditBalanceUsed,
                credit_balance_added: creditBalanceAdded,
                whatsapp_link:     `https://wa.me/${(() => { const r = cust.whatsapp?.replace(/\D/g, '') || ''; return r.startsWith('880') ? r : '880' + r.replace(/^0/, ''); })()}?text=${encodeURIComponent(waLink)}`
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

        // send_via: 'email', 'sms', 'auto' (default)
        const sendVia = send_via || 'auto';

        if (sendVia === 'sms') {
            const { sendInvoice: smsSend } = require('../services/sms.service');
            await smsSend(
                s.sms_phone || s.whatsapp,
                s.invoice_number,
                s.net_amount,
                s.shop_name
            );
        } else if (sendVia === 'email' && s.email) {
            const { sendInvoiceEmail } = require('../services/email.service');
            const items = typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []);
            await sendInvoiceEmail(s.email, s, s, req.user, items);
        } else {
            // 'auto' — Email আগে, না থাকলে SMS
            const items = typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []);
            await sendInvoiceNotification(s, s, req.user, items);
        }

        return res.status(200).json({
            success:     true,
            message:    'Invoice পাঠানো হয়েছে।',
            whatsapp_link: s.whatsapp
                ? `https://wa.me/${(() => { const r = s.whatsapp.replace(/\D/g, ''); return r.startsWith('880') ? r : '880' + r.replace(/^0/, ''); })()}`
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
            // ✅ FIX: BETWEEN এর দুইটা parameter একসাথে একটাই condition-এ রাখো
            paramCount++;
            const fromParam = paramCount;
            paramCount++;
            const toParam   = paramCount;
            conditions.push(`st.date BETWEEN $${fromParam} AND $${toParam}`);
            params.push(from, to);
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

        // ─── Visit stats per date (fallback mode এর জন্য) ───────────────
        let visitsByDate = {};
        if (from && to) {
            // Date range: প্রতিটি দিনের visit count আলাদা করে আনি
            const visitResult = await query(
                `SELECT
                    visit_date::text                                AS date,
                    COUNT(*)                                        AS total_visits,
                    COUNT(CASE WHEN will_sell = true THEN 1 END)   AS sold_visits
                 FROM visits
                 WHERE worker_id = $1
                   AND visit_date BETWEEN $2 AND $3
                 GROUP BY visit_date`,
                [req.user.id, from, to]
            );
            visitResult.rows.forEach(row => {
                visitsByDate[row.date] = {
                    total_visits: parseInt(row.total_visits || 0),
                    sold_visits:  parseInt(row.sold_visits || 0),
                };
            });

            // মোট active customer count (সব দিনের জন্য একই)
            const totalCustomersResult = await query(
                `SELECT COUNT(*) AS total
                 FROM customer_assignments
                 WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL`,
                [req.user.id]
            );
            const totalCustomers = parseInt(totalCustomersResult.rows[0]?.total || 0);

            return res.status(200).json({
                success: true,
                data: result.rows,
                visit_summary: { visitsByDate, total_customers: totalCustomers }
            });
        } else {
            // Single date: visit stats সরাসরি include করি
            const visitResult = await query(
                `SELECT
                    COUNT(*)                                        AS total_visits,
                    COUNT(CASE WHEN will_sell = true THEN 1 END)   AS sold_visits
                 FROM visits
                 WHERE worker_id = $1 AND visit_date = $2`,
                [req.user.id, today]
            );
            const totalCustomersResult = await query(
                `SELECT COUNT(*) AS total
                 FROM customer_assignments
                 WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL`,
                [req.user.id]
            );
            return res.status(200).json({
                success: true,
                data: result.rows,
                visit_summary: {
                    visitsByDate: {
                        [today]: {
                            total_visits: parseInt(visitResult.rows[0]?.total_visits || 0),
                            sold_visits:  parseInt(visitResult.rows[0]?.sold_visits || 0),
                        }
                    },
                    total_customers: parseInt(totalCustomersResult.rows[0]?.total || 0)
                }
            });
        }

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

        // ✅ আজকের চেক-ইন স্ট্যাটাস যাচাই
        const attendanceToday = await query(
            `SELECT check_in_time, check_out_time FROM attendance
             WHERE user_id = $1 AND date = $2
             LIMIT 1`,
            [workerId, today]
        );
        const checkedIn = attendanceToday.rows.length > 0 && !!attendanceToday.rows[0].check_in_time;

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
                outstanding_dues: dues.rows[0]?.outstanding_dues || 0,
                checked_in:       checkedIn   // ✅ নতুন: চেক-ইন হয়েছে কিনা
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

// ============================================================
// SKIP OTP — মেমো ছবি আপলোড বাধ্যতামূলক
// POST /api/sales/skip-otp
// ============================================================

const skipOTPWithPhoto = async (req, res) => {
    try {
        const { sale_id } = req.body;

        if (!sale_id) {
            return res.status(400).json({ success: false, message: 'sale_id দিন।' });
        }

        // ছবি আপলোড না করলে reject
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'মেমোর ছবি আপলোড করা বাধ্যতামূলক।'
            });
        }

        // বিক্রয় খোঁজো
        const sale = await query(
            'SELECT id, otp_verified, worker_id FROM sales_transactions WHERE id = $1',
            [sale_id]
        );

        if (sale.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'বিক্রয় পাওয়া যায়নি।' });
        }

        // অন্য SR-এর sale হলে block
        if (sale.rows[0].worker_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'অনুমতি নেই।' });
        }

        if (sale.rows[0].otp_verified) {
            return res.status(400).json({ success: false, message: 'এই বিক্রয় আগেই verify হয়েছে।' });
        }

        // Cloudinary-তে মেমো ছবি আপলোড
        const memoPhotoUrl = await uploadToCloudinary(
            req.file.buffer,
            'memo_photos',
            `memo_${sale_id}_${Date.now()}`
        );

        // DB update — otp_skipped = true, memo_photo সংরক্ষণ
        await query(
            `UPDATE sales_transactions
             SET otp_skipped    = true,
                 otp_skip_photo = $1,
                 updated_at     = NOW()
             WHERE id = $2`,
            [memoPhotoUrl, sale_id]
        );

        console.log(`⚠️ OTP Skip — Sale ${sale_id} by Worker ${req.user.id}, Photo: ${memoPhotoUrl}`);

        return res.status(200).json({
            success: true,
            message: 'মেমো ছবিসহ বিক্রয় সম্পন্ন।',
            data: { memo_photo_url: memoPhotoUrl }
        });

    } catch (error) {
        console.error('❌ Skip OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MY MONTHLY SALES SUMMARY
// GET /api/sales/my-monthly?month=6&year=2025
// SR-এর মাসিক দৈনিক বিক্রয় সারসংক্ষেপ
// ============================================================

const getMyMonthlySales = async (req, res) => {
    try {
        const { month, year } = req.query;
        const workerId = req.user.id;

        const targetMonth = parseInt(month) || new Date().getMonth() + 1;
        const targetYear  = parseInt(year)  || new Date().getFullYear();

        const from    = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(targetYear, targetMonth, 0).getDate();
        const to      = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

        // দৈনিক বিক্রয় + ভিজিট (LEFT JOIN)
        const dailyResult = await query(
            `SELECT
                st.date,
                COUNT(DISTINCT st.id)                 AS sale_count,
                COALESCE(SUM(st.total_amount), 0)     AS total_amount,
                COALESCE(SUM(st.cash_received), 0)    AS cash_received,
                COALESCE(SUM(st.credit_used), 0)      AS credit_given,
                COALESCE(SUM(st.replacement_value),0) AS replacement_value,
                COALESCE(v.total_visits, 0)            AS total_visits,
                COALESCE(v.sold_visits, 0)             AS sold_visits
             FROM sales_transactions st
             LEFT JOIN (
                 SELECT
                     visit_date AS date,
                     COUNT(*) AS total_visits,
                     COUNT(CASE WHEN will_sell = true THEN 1 END) AS sold_visits
                 FROM visits
                 WHERE worker_id = $1 AND visit_date BETWEEN $2 AND $3
                 GROUP BY visit_date
             ) v ON v.date = st.date
             WHERE st.worker_id = $1
               AND st.date BETWEEN $2 AND $3
             GROUP BY st.date, v.total_visits, v.sold_visits
             ORDER BY st.date DESC`,
            [workerId, from, to]
        );

        // visit আছে কিন্তু sale নেই — এমন দিনও include করি
        const visitOnlyResult = await query(
            `SELECT
                visit_date::text AS date,
                COUNT(*) AS total_visits,
                COUNT(CASE WHEN will_sell = true THEN 1 END) AS sold_visits
             FROM visits
             WHERE worker_id = $1
               AND visit_date BETWEEN $2 AND $3
               AND visit_date NOT IN (
                   SELECT DISTINCT date FROM sales_transactions
                   WHERE worker_id = $1 AND date BETWEEN $2 AND $3
               )
             GROUP BY visit_date
             ORDER BY visit_date DESC`,
            [workerId, from, to]
        );

        // মোট active customer count
        const custResult = await query(
            `SELECT COUNT(*) AS total
             FROM customer_assignments
             WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL`,
            [workerId]
        );
        const totalCustomers = parseInt(custResult.rows[0]?.total || 0);

        // sale+visit + শুধু-visit দিন মার্জ করা
        const visitOnlyRows = visitOnlyResult.rows.map(r => ({
            date: r.date, sale_count: 0, total_amount: 0,
            cash_received: 0, credit_given: 0, replacement_value: 0,
            total_visits: parseInt(r.total_visits || 0),
            sold_visits:  parseInt(r.sold_visits  || 0),
            total_customers: totalCustomers,
        }));
        const mergedDaily = [
            ...dailyResult.rows.map(r => ({
                ...r,
                total_visits:    parseInt(r.total_visits || 0),
                sold_visits:     parseInt(r.sold_visits  || 0),
                total_customers: totalCustomers,
            })),
            ...visitOnlyRows,
        ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

        // মাসিক মোট
        const totalResult = await query(
            `SELECT
                COUNT(*)                             AS sale_count,
                COALESCE(SUM(total_amount), 0)       AS total_amount,
                COALESCE(SUM(cash_received), 0)      AS cash_received,
                COALESCE(SUM(credit_used), 0)        AS credit_given,
                COALESCE(SUM(replacement_value), 0)  AS replacement_value
             FROM sales_transactions
             WHERE worker_id = $1
               AND date BETWEEN $2 AND $3`,
            [workerId, from, to]
        );

        // টার্গেট (যদি থাকে)
        const targetResult = await query(
            `SELECT monthly_target, target_visit_rate
             FROM users WHERE id = $1`,
            [workerId]
        );

        return res.status(200).json({
            success: true,
            data: {
                month: targetMonth,
                year:  targetYear,
                from,
                to,
                daily:             mergedDaily,
                ...totalResult.rows[0],
                monthly_target:    targetResult.rows[0]?.monthly_target    || 0,
                target_visit_rate: targetResult.rows[0]?.target_visit_rate || 80,
            }
        });

    } catch (error) {
        console.error('❌ Monthly Sales Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MY VISIT STATS (মাসিক)
// GET /api/sales/my-visit-stats?month=6&year=2025
// ============================================================

const getMyVisitStats = async (req, res) => {
    try {
        const { month, year } = req.query;
        const workerId = req.user.id;

        const targetMonth = parseInt(month) || new Date().getMonth() + 1;
        const targetYear  = parseInt(year)  || new Date().getFullYear();

        const from    = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(targetYear, targetMonth, 0).getDate();
        const to      = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${lastDay}`;

        // মাসিক ভিজিট সারসংক্ষেপ
        const visitResult = await query(
            `SELECT
                COUNT(*)                                       AS total_visits,
                COUNT(CASE WHEN will_sell = true  THEN 1 END) AS sold_visits,
                COUNT(CASE WHEN will_sell = false THEN 1 END) AS no_sell_visits
             FROM visits
             WHERE worker_id = $1
               AND visit_date BETWEEN $2 AND $3`,
            [workerId, from, to]
        );

        // দৈনিক ভিজিট
        const dailyVisit = await query(
            `SELECT
                visit_date AS date,
                COUNT(*)                                       AS total_visits,
                COUNT(CASE WHEN will_sell = true  THEN 1 END) AS sold_visits,
                COUNT(CASE WHEN will_sell = false THEN 1 END) AS no_sell_visits
             FROM visits
             WHERE worker_id = $1
               AND visit_date BETWEEN $2 AND $3
             GROUP BY visit_date
             ORDER BY visit_date DESC`,
            [workerId, from, to]
        );

        // মোট কাস্টমার
        const custResult = await query(
            `SELECT COUNT(*) AS total
             FROM customer_assignments
             WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL`,
            [workerId]
        );

        const totalCustomers = parseInt(custResult.rows[0]?.total || 0);
        const totalVisits    = parseInt(visitResult.rows[0]?.total_visits || 0);

        return res.status(200).json({
            success: true,
            data: {
                ...visitResult.rows[0],
                total_customers: totalCustomers,
                visit_rate: totalCustomers > 0
                    ? Math.round((totalVisits / totalCustomers) * 100) : 0,
                daily: dailyVisit.rows
            }
        });

    } catch (error) {
        console.error('❌ Visit Stats Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET VISIT STATUS FOR TODAY
// GET /api/sales/visit-status/:customerId
// আজকে এই কাস্টমারে ভিজিট হয়েছে কিনা চেক করে
// ============================================================

const getVisitStatus = async (req, res) => {
    try {
        const { customerId } = req.params;
        const workerId = req.user.id;
        const today = new Date().toISOString().split('T')[0];

        const result = await query(
            `SELECT id, will_sell, no_sell_reason, created_at
             FROM visits
             WHERE worker_id = $1
               AND customer_id = $2
               AND visit_date = $3
             ORDER BY created_at DESC
             LIMIT 1`,
            [workerId, customerId, today]
        );

        const visited = result.rows.length > 0;

        return res.status(200).json({
            success: true,
            data: {
                visited,
                visit: visited ? result.rows[0] : null
            }
        });

    } catch (error) {
        console.error('❌ Visit Status Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

const getTeamVisits = async (req, res) => {
    try {
        const { worker_id, date, from, to } = req.query;
        const today    = new Date().toISOString().split('T')[0];
        const fromDate = from || date || today;
        const toDate   = to   || date || today;

        let conditions = ['v.visit_date BETWEEN $1 AND $2'];
        let params     = [fromDate, toDate];
        let paramCount = 2;

        // worker_id দিলে সরাসরি সেই worker-এর data আনো — manager filter দরকার নেই
        if (worker_id) {
            paramCount++;
            conditions.push(`v.worker_id = $${paramCount}`);
            params.push(worker_id);
        } else if (req.teamFilter) {
            // worker_id না দিলে পুরো টিমের data ফিল্টার করো
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        const result = await query(
            `SELECT
                v.id,
                v.visit_date,
                v.created_at,
                v.will_sell,
                v.no_sell_reason,
                v.closed_shop_photo,
                v.location_matched,
                v.location_distance,
                ST_X(v.worker_location::geometry) AS worker_lng,
                ST_Y(v.worker_location::geometry) AS worker_lat,
                u.name_bn        AS worker_name,
                u.employee_code,
                c.shop_name,
                c.owner_name,
                c.whatsapp,
                c.sms_phone,
                c.email,
                r.name           AS route_name
             FROM visits v
             JOIN users     u ON v.worker_id   = u.id
             JOIN customers c ON v.customer_id = c.id
             LEFT JOIN routes r ON c.route_id  = r.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY v.created_at DESC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Team Visits Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    createVisit,
    createSale,
    sendInvoice,
    verifyOTP,
    skipOTPWithPhoto,
    getMySales,
    getTeamSales,
    getTeamVisits,
    getTodaySummary,
    getSaleDetail,
    getMyMonthlySales,
    getMyVisitStats,
    getVisitStatus
};
