const { query, withTransaction } = require('../config/db');
const { calcFromProduct }        = require('../services/price.utils');
const { generateOTP }            = require('../config/encryption');
const crypto                     = require('crypto');
const logger = require('../config/logger');
const { addLedgerEntry }         = require('./ledger.controller');
const {
    generateInvoiceNumber,
    sendInvoiceOTP,
    sendInvoiceNotification,
    generateInvoicePDF,
    getInvoiceWhatsAppMessage
} = require('../services/invoice.service');
const { uploadToCloudinary } = require('../services/employee.service');

// Firebase নোটিফিকেশন
const { firebaseNotify } = require('../services/firebase.notify');

// ✅ Real-time commission
const { updateCommissionRealtime } = require('../services/commission.service');

// WhatsApp Invoice Image
const { sendInvoiceWhatsApp } = require('../services/invoiceWhatsapp.service');

// ─── Bangladesh Timezone Helper (UTC+6) ───────────────────────────────────────
// settlement.controller.js-এর মতোই এক helper।
// new Date().toISOString() সবসময় UTC ধরে (বাংলাদেশ UTC+6 পিছিয়ে)।
// রাত ১২টার পরে UTC date হয় আগের দিনের — DB-তে ভুল date সেভ হয়।
// এই helper সরাসরি BD local date string (YYYY-MM-DD) রিটার্ন করে।
const getBDToday = () => {
    const bdOffset = 6 * 60 * 60 * 1000; // UTC+6
    return new Date(Date.now() + bdOffset).toISOString().split('T')[0];
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

        // ✅ FIX: will_sell normalize — string "false"/"0" সহ সব falsy value সঠিকভাবে handle করো
        const willSell = will_sell === false
            || will_sell === 'false'
            || will_sell === 0
            || will_sell === '0'
            ? false
            : true;

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
        if (!willSell && req.file) {
            closedShopPhoto = await uploadToCloudinary(
                req.file.buffer,
                'closed_shops',
                `closed_${customer_id}_${Date.now()}`
            );
        }

        // ভিজিট সেভ
        const result = await query(
            `INSERT INTO visits (worker_id, customer_id, route_id, will_sell,
              no_sell_reason, closed_shop_photo,
              worker_location, location_matched, location_distance, tenant_id) VALUES ($1, $2, $3, $4, $5, $6,
              ${hasLocation ? 'ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography' : 'NULL'},
              ${hasLocation ? '$9, $10, $11' : '$7, $8, $9'})
             RETURNING id`,
            hasLocation
                ? [req.user.id, customer_id, route_id || null,
                   willSell, no_sell_reason || null,
                   closedShopPhoto, rawLng, rawLat, locationMatched, distance, req.tenantId]
                : [req.user.id, customer_id, route_id || null,
                   willSell, no_sell_reason || null,
                   closedShopPhoto, locationMatched, distance, req.tenantId]
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
        logger.error('❌ Create Visit Error:', error.message);
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
        // NOTE: query সবসময় চালানো হয় (idempotency_key না থাকলে NULL দিয়ে),
        // যাতে mock sequence সব test-এ একই থাকে।
        const existing = await query(
            `SELECT id, invoice_number, total_amount, net_amount,
                    payment_method, credit_balance_used, credit_balance_added
             FROM sales_transactions
             WHERE worker_id = $1 AND idempotency_key = $2
             AND tenant_id = $3`,
            [req.user.id, idempotency_key ?? null, req.tenantId]
        );
        if (idempotency_key && existing.rows.length > 0) {
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

        // ── অনুমোদিত অর্ডার যাচাই — Transaction-এর ভেতরে FOR UPDATE দিয়ে হবে ──────
        // ⚠️ Race Condition Fix:
        // আগে এখানে transaction-এর বাইরে SELECT করা হতো, তারপর transaction-এ INSERT।
        // ফলে একাধিক SR একই সময়ে একই approved order পেয়ে যেত।
        // Fix: order lock + validation এখন withTransaction-এর ভেতরে নামানো হয়েছে।
        // ✅ FIX Bug-1: UTC নয়, BD local date — settlement-এর getBDToday()-এর সাথে মিলবে
        const today = getBDToday();
        const requested_order_id = order_id; // user যা পাঠিয়েছে সেটা ধরে রাখো

        // কাস্টমার তথ্য
        const customer = await query(
            'SELECT * FROM customers WHERE id = $1',
            [customer_id]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        const cust = customer.rows[0];

        // ── Batch Product Fetch — N+1 Fix ────────────────────────────────
        // আগে items ও replacement_items-এর প্রতিটি product আলাদা DB query-তে
        // fetch হতো (N+1 pattern)। এখন সব product_id একটি SET-এ deduplicate
        // করে একটিমাত্র ANY($1::uuid[]) query-তে fetch করা হচ্ছে।
        const allProductIds = [...new Set([
            ...items.map(i => i.product_id),
            ...(replacement_items || []).map(i => i.product_id)
        ])];

        const prodResult = await query(
            'SELECT id, name, price, vat, tax FROM products WHERE id = ANY($1::uuid[])',
            [allProductIds]
        );
        const productMap = Object.fromEntries(prodResult.rows.map(p => [p.id, p]));

        // মোট হিসাব
        let totalAmount       = 0;
        let replacementValue  = 0;
        const processedItems  = [];

        for (const item of items) {
            const product = productMap[item.product_id];
            if (!product) continue;

            const { unitPrice, vatRate, taxRate,
                    vatAmount, taxAmount, finalPrice, subtotal } =
                calcFromProduct(product, item.qty);
            totalAmount += subtotal;

            processedItems.push({
                product_id:   item.product_id,
                product_name: product.name,
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
                const product = productMap[item.product_id];
                if (!product) continue;

                const { unitPrice, vatRate, taxRate,
                        vatAmount, taxAmount, finalPrice,
                        subtotal: total } =
                    calcFromProduct(product, item.qty);
                replacementValue += total;

                processedReplacement.push({
                    product_id:   item.product_id,
                    product_name: product.name,
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

        // পেমেন্ট লজিক — প্রাথমিক মান নির্ধারণ (credit চেক নিচে OTP-এর পরে)
        let cashReceived = 0;
        let creditUsed   = 0;

        if (payment_method === 'cash') {
            cashReceived = netAmount;
        } else if (payment_method === 'credit') {
            creditUsed = netAmount;
        } else if (payment_method === 'replacement') {
            cashReceived = netAmount;
        }

        // Invoice নম্বর
        const invoiceNumber = await generateInvoiceNumber();

        // OTP তৈরি
        // NOTE: OTP settings query দুটো credit চেকের আগে করা হচ্ছে
        // যাতে mock sequence সঠিক থাকে এবং early return-এ mock bleed না হয়।
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

        // ক্রেডিট লিমিট প্রাথমিক চেক — race condition এড়াতে
        // চূড়ান্ত চেক transaction-এর ভেতরে FOR UPDATE দিয়ে হবে (নিচে)
        // NOTE: OTP query-র পরে রাখা হয়েছে যাতে সব mock consume হয় early return-এর আগে।
        if (payment_method === 'credit') {
            const prelimCredit = parseFloat(cust.current_credit) + netAmount;
            if (prelimCredit > parseFloat(cust.credit_limit)) {
                return res.status(400).json({
                    success: false,
                    message: `ক্রেডিট লিমিট পার হবে। বর্তমান বাকি: ৳${cust.current_credit}, লিমিট: ৳${cust.credit_limit}`
                });
            }
        }

        // বিক্রয় সেভ
        const saleResult = await withTransaction(async (client) => {

            // ── Customer Row Lock — Credit Race Condition Fix ────────────────
            // Transaction-এর বাইরে cust.current_credit পড়া হয়েছিল —
            // দুইজন SR একসাথে একই কাস্টমারে credit sale করলে উভয়েই
            // চেক পাস করত এবং লিমিট exceed হতো।
            // Fix: FOR UPDATE দিয়ে customer row lock করে fresh data নিয়ে
            //      চূড়ান্ত credit check করা হচ্ছে।
            //      অন্য transaction এই row-এ পৌঁছালে lock ছাড়া পর্যন্ত wait করবে।
            if (payment_method === 'credit') {
                const lockedCustomer = await client.query(
                    `SELECT current_credit, credit_limit
                     FROM customers
                     WHERE id = $1
                     FOR UPDATE
             AND tenant_id = $2`,
                    [customer_id, req.tenantId]
                );

                if (lockedCustomer.rows.length === 0) {
                    throw Object.assign(
                        new Error('CUSTOMER_NOT_FOUND'),
                        { statusCode: 404, clientMessage: 'কাস্টমার পাওয়া যায়নি।' }
                    );
                }

                const freshCust    = lockedCustomer.rows[0];
                const finalCredit  = parseFloat(freshCust.current_credit) + netAmount;

                if (finalCredit > parseFloat(freshCust.credit_limit)) {
                    throw Object.assign(
                        new Error('CREDIT_LIMIT_EXCEEDED'),
                        {
                            statusCode: 400,
                            clientMessage: `ক্রেডিট লিমিট পার হবে। বর্তমান বাকি: ৳${freshCust.current_credit}, লিমিট: ৳${freshCust.credit_limit}`
                        }
                    );
                }
            }

            // ── Order Lock — Race Condition Fix ─────────────────────────────
            // FOR UPDATE: এই row অন্য কেউ একই সময়ে lock করতে পারবে না
            // SKIP LOCKED: lock করা row পেলে error না দিয়ে 0 rows ফেরত দেবে
            // এতে একই order দুইজন SR কখনো পাবে না
            let lockedOrderId;

            if (requested_order_id) {
                // explicit order_id পাঠানো হয়েছে — সেটাই lock করো
                const lockResult = await client.query(
                    `SELECT id FROM orders
                     WHERE id = $1
                       AND worker_id = $2
                       AND DATE(requested_at) = $3
                       AND status = 'approved'
                     FOR UPDATE SKIP LOCKED
             AND tenant_id = $4`,
                    [requested_order_id, req.user.id, today, req.tenantId]
                );
                if (lockResult.rows.length === 0) {
                    throw Object.assign(
                        new Error('ORDER_UNAVAILABLE'),
                        { statusCode: 403, clientMessage: 'এই অর্ডারটি ইতোমধ্যে ব্যবহৃত হয়েছে বা অনুমোদিত নেই।' }
                    );
                }
                lockedOrderId = lockResult.rows[0].id;

            } else {
                // order_id পাঠানো হয়নি — আজকের approved order খোঁজো
                const lockResult = await client.query(
                    `SELECT id FROM orders
                     WHERE worker_id = $1
                       AND DATE(requested_at) = $2
                       AND status = 'approved'
             AND tenant_id = $3
             ORDER BY approved_at DESC
                     LIMIT 1
                     FOR UPDATE SKIP LOCKED`,
                    [req.user.id, today, req.tenantId]
                );
                if (lockResult.rows.length === 0) {
                    throw Object.assign(
                        new Error('ORDER_UNAVAILABLE'),
                        { statusCode: 403, clientMessage: 'আজকের অর্ডার অনুমোদিত হয়নি বা অন্য কেউ ব্যবহার করছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।' }
                    );
                }
                lockedOrderId = lockResult.rows[0].id;
            }

            const verifyToken = crypto.randomBytes(32).toString('hex'); // 64-char unique token

            const result = await client.query(
                `INSERT INTO sales_transactions (worker_id, customer_id, visit_id, order_id,
                  items, total_amount, discount_amount, net_amount,
                  payment_method, cash_received, credit_used,
                  replacement_items, replacement_value,
                  credit_balance_used, credit_balance_added,
                  invoice_number, otp_code, otp_expires_at,
                  verify_token,
                  idempotency_key, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, $21)
                 RETURNING *`,
                [
                    req.user.id, customer_id, visit_id || null, lockedOrderId,
                    JSON.stringify(processedItems),
                    totalAmount, discountAmount, netAmount,
                    payment_method, cashReceived, creditUsed,
                    JSON.stringify(processedReplacement), replacementValue,
                    creditBalanceUsed, creditBalanceAdded,
                    invoiceNumber, otp, otpExpiresAt,
                    verifyToken,
                    idempotency_key || null,
                    req.tenantId  // SaaS: tenant isolation
                ]
            );

            // ─── স্টক আন্দোলন রেকর্ড ───────────────────────────
            // ⚠️ FIX #1 — Double Deduction সমস্যা সমাধান:
            // approveOrder()-এ products.stock ইতোমধ্যে কমানো হয়েছে।
            // এখানে আবার stock কমালে একই পণ্য দুইবার বাদ যায় — এটা ছিল মূল বাগ।
            // তাই এখানে শুধু audit trail হিসেবে stock_movements রেকর্ড করা হচ্ছে,
            // products টেবিলের stock কলাম আর স্পর্শ করা হচ্ছে না।
            for (const item of processedItems) {
                await client.query(
                    `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_id, reference_type, created_by, tenant_id) VALUES ($1, 'out', $2, $3, 'sale', $4, $5)`,
                    [item.product_id, item.qty, result.rows[0].id, req.user.id, req.tenantId]
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
                    `UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2
             AND tenant_id = $3`,
                    [item.qty, item.product_id, req.tenantId]
                );
                await client.query(
                    `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_id, reference_type, note, created_by, tenant_id) VALUES ($1, 'returned', $2, $3, 'sale', 'রিপ্লেসমেন্ট ফেরত', $4, $5)`,
                    [item.product_id, item.qty, result.rows[0].id, req.user.id, req.tenantId]
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

            // ─── Customer credit_balance আপডেট ───────────────────
            // ⚠️ FIX #2 — credit_balance_used রেকর্ড হতো কিন্তু customers টেবিলে
            // balance কমানো হতো না, ফলে একই balance বারবার ব্যবহারযোগ্য ছিল।
            if (creditBalanceUsed > 0 || creditBalanceAdded > 0) {
                await client.query(
                    `UPDATE customers
                     SET credit_balance = GREATEST(0, credit_balance - $1) + $2,
                         updated_at = NOW()
                     WHERE id = $3
             AND tenant_id = $4`,
                    [creditBalanceUsed, creditBalanceAdded, customer_id, req.tenantId]
                );
            }

            return result.rows[0];
        });

        // OTP + Invoice একসাথে একটাই Email/SMS
        if (otp) {
            const otpResult = await sendInvoiceOTP(cust, saleResult.id, otp, expiryMinutes, saleResult, req.user, processedItems);
            logger.info('📤 OTP+Invoice পাঠানো:', JSON.stringify(otpResult.results));
        }

        // Invoice SMS Fallback (email না থাকলে)
        sendInvoiceNotification(cust, saleResult, req.user, processedItems)
            .then(r => logger.info('📄 Invoice SMS Fallback:', JSON.stringify(r.results)))
            .catch(e => logger.error('⚠️ Invoice নোটিফিকেশন Error:', e.message));

        // ✅ WhatsApp-এ Invoice ছবি পাঠাও (Puppeteer rendered PNG)
        sendInvoiceWhatsApp(cust, saleResult, req.user, processedItems)
            .then(r => {
                if (r.success) {
                    logger.info(`📲 [InvoiceWA] ছবি পাঠানো সফল → ${cust.whatsapp || cust.sms_phone}`);
                } else {
                    logger.warn(`⚠️ [InvoiceWA] পাঠানো যায়নি (${r.reason}) — ${saleResult.invoice_number}`);
                }
            })
            .catch(e => logger.error('❌ [InvoiceWA] Unexpected error:', e.message));

        // WhatsApp লিংক তৈরি
        const waLink = getInvoiceWhatsAppMessage(
            saleResult, cust, req.user, processedItems
        );

        // ✅ কাস্টমারকে নতুন invoice notification দাও
        sendCustomerNotification(customer_id, {
            title: '🧾 নতুন ইনভয়েস',
            body:  `Invoice ${invoiceNumber} — মোট: ৳${netAmount.toLocaleString('bn-BD')} (${
                payment_method === 'cash'   ? 'নগদ' :
                payment_method === 'credit' ? 'বাকি' : 'মিশ্র'
            })`,
            type:  'new_invoice',
        }).catch(e => logger.error('[Sale] Invoice notification error:', e.message));

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

        // ✅ REAL-TIME COMMISSION: sale-এর পরেই commission হিসাব করো
        // Main transaction-এর বাইরে — fail হলেও sale cancel হবে না।
        // Midnight job reconciliation হিসেবে থাকবে।
        setImmediate(async () => {
            try {
                const { rate, amount, totalSales } = await updateCommissionRealtime(
                    req.user.id, today
                );
                if (amount > 0) {
                    // SR-এর app-এ live commission badge আপডেট
                    await firebaseNotify(
                        `live/commission/${req.user.id}`,
                        {
                            date:        today,
                            totalSales,
                            rate,
                            amount,
                            updatedAt:   new Date().toISOString()
                        }
                    );
                }
            } catch (e) {
                // silent fail — midnight job এ ঠিক হয়ে যাবে
            }
        });

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
                verify_link:       `${process.env.FRONTEND_URL || 'https://novatech.com'}/verify/${saleResult.verify_token}`,
                whatsapp_link:     `https://wa.me/${(() => { const r = cust.whatsapp?.replace(/\D/g, '') || ''; return r.startsWith('880') ? r : '880' + r.replace(/^0/, ''); })()}?text=${encodeURIComponent(waLink)}`
            }
        });

    } catch (error) {
        logger.error('❌ Create Sale Error:', error.message);

        // Known business errors — transaction-এর ভেতর থেকে throw হওয়া
        const knownErrors = ['ORDER_UNAVAILABLE', 'CREDIT_LIMIT_EXCEEDED', 'CUSTOMER_NOT_FOUND'];
        if (knownErrors.includes(error.message)) {
            return res.status(error.statusCode || 400).json({
                success: false,
                message: error.clientMessage || 'বিক্রয়ে সমস্যা হয়েছে।'
            });
        }

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
             WHERE st.id = $1
             AND st.tenant_id = $2`,
            [sale_id, req.tenantId]
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
        logger.error('❌ Send Invoice Error:', error.message);
        return res.status(500).json({ success: false, message: 'Invoice পাঠাতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// VERIFY ORDER BY LINK
// GET /api/sales/verify/:token
// কাস্টমার WhatsApp লিংকে ট্যাপ করলে — auth লাগবে না
// ============================================================

const verifyOrderByLink = async (req, res) => {
    try {
        const { token } = req.params;
        if (!token || token.length !== 64) {
            return res.status(400).send(buildVerifyPage('error', 'লিংকটি সঠিক নয়।'));
        }

        const result = await query(
            `SELECT st.id, st.invoice_number, st.net_amount, st.payment_method,
                    st.otp_verified, st.verify_token_used, st.otp_expires_at,
                    st.created_at, c.shop_name, c.owner_name
             FROM sales_transactions st
             JOIN customers c ON c.id = st.customer_id
             WHERE st.verify_token = $1
             AND st.tenant_id = $2`,
            [token, req.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send(buildVerifyPage('error', 'লিংকটি বৈধ নয় বা মেয়াদ শেষ।'));
        }

        const sale = result.rows[0];

        if (sale.otp_verified) {
            return res.send(buildVerifyPage('already', sale));
        }

        if (sale.otp_expires_at && new Date() > new Date(sale.otp_expires_at)) {
            return res.status(410).send(buildVerifyPage('expired', sale));
        }

        // ✅ Verify
        await query(
            `UPDATE sales_transactions SET otp_verified = true, verify_token_used = true WHERE id = $1
             AND tenant_id = $2`,
            [sale.id, req.tenantId]
        );

        logger.info(`✅ [VerifyLink] → ${sale.invoice_number} (${sale.shop_name})`);
        return res.send(buildVerifyPage('success', sale));

    } catch (error) {
        logger.error('❌ Verify Link Error:', error.message);
        return res.status(500).send(buildVerifyPage('error', 'সমস্যা হয়েছে। আবার চেষ্টা করুন।'));
    }
};

// ─── Verification Result Page ────────────────────────────────
const buildVerifyPage = (status, data) => {
    const configs = {
        success: { icon: '✅', color: '#059669', bg: '#ecfdf5', title: 'অর্ডার নিশ্চিত হয়েছে!', sub: 'আপনার ক্রয় সফলভাবে যাচাই হয়েছে।' },
        already: { icon: '✅', color: '#2563eb', bg: '#eff6ff', title: 'আগেই যাচাই হয়েছে',      sub: 'এই অর্ডারটি আগেই নিশ্চিত করা হয়েছে।' },
        expired: { icon: '⏰', color: '#d97706', bg: '#fffbeb', title: 'মেয়াদ শেষ',              sub: 'যাচাইয়ের সময় পেরিয়ে গেছে। SR-কে জানান।' },
        error:   { icon: '❌', color: '#dc2626', bg: '#fef2f2', title: 'সমস্যা হয়েছে',           sub: typeof data === 'string' ? data : 'আবার চেষ্টা করুন।' },
    };
    const c = configs[status] || configs.error;
    const paymentLabel = { cash: 'নগদ', credit: 'বাকি', replacement: 'রিপ্লেসমেন্ট' };
    const hasData = data && typeof data === 'object' && data.invoice_number;

    return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>NovaTech BD — অর্ডার যাচাই</title>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hind Siliguri','Segoe UI',sans-serif;background:linear-gradient(135deg,#0f172a,#1e3a8a);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:24px;width:100%;max-width:380px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3)}
.hdr{background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:22px 20px 18px;text-align:center}
.hdr h3{color:#fff;font-size:17px;font-weight:800}.hdr p{color:rgba(255,255,255,0.45);font-size:11px;margin-top:3px}
.body{padding:28px 22px;text-align:center}
.ico{width:80px;height:80px;border-radius:50%;background:${c.bg};border:3px solid ${c.color}20;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:36px}
.ttl{font-size:21px;font-weight:800;color:${c.color};margin-bottom:6px}
.sub{font-size:13.5px;color:#6b7280;line-height:1.6}
.det{margin-top:20px;background:#f8fafc;border-radius:14px;padding:14px;text-align:left}
.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
.row:last-child{border-bottom:none}
.lbl{color:#9ca3af}.val{font-weight:700;color:#1f2937}
.amt{font-size:30px;font-weight:800;color:#1e3a8a;margin-top:16px}
.ftr{background:#f8fafc;padding:14px 20px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #f1f5f9}
</style>
</head>
<body>
<div class="card">
  <div class="hdr"><h3>NovaTech BD</h3><p>জানকি সিংহ রোড, বরিশাল</p></div>
  <div class="body">
    <div class="ico">${c.icon}</div>
    <p class="ttl">${c.title}</p>
    <p class="sub">${c.sub}</p>
    ${hasData ? `
    <div class="det">
      <div class="row"><span class="lbl">Invoice</span><span class="val" style="font-family:monospace">${data.invoice_number}</span></div>
      <div class="row"><span class="lbl">দোকান</span><span class="val">${data.shop_name}</span></div>
      <div class="row"><span class="lbl">পেমেন্ট</span><span class="val">${paymentLabel[data.payment_method] || data.payment_method}</span></div>
      <div class="row"><span class="lbl">তারিখ</span><span class="val">${new Date(data.created_at).toLocaleDateString('bn-BD',{day:'numeric',month:'long',year:'numeric'})}</span></div>
    </div>
    <p class="amt">৳${parseFloat(data.net_amount).toLocaleString()}</p>` : ''}
  </div>
  <div class="ftr">NovaTech BD (Ltd.) — এই পেজটি স্বয়ংক্রিয়ভাবে তৈরি হয়েছে</div>
</div>
</body></html>`;
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
        logger.error('❌ Verify OTP Error:', error.message);
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
        // ✅ FIX Bug-1: BD local date default
        const today              = date || getBDToday();

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
             AND tenant_id = $4
             GROUP BY visit_date`,
                [req.user.id, from, to, req.tenantId]
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
                 WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL
             AND tenant_id = $2`,
                [req.user.id, req.tenantId]
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
                 WHERE worker_id = $1 AND visit_date = $2
             AND tenant_id = $3`,
                [req.user.id, today, req.tenantId]
            );
            const totalCustomersResult = await query(
                `SELECT COUNT(*) AS total
                 FROM customer_assignments
                 WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL
             AND tenant_id = $2`,
                [req.user.id, req.tenantId]
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
        logger.error('❌ My Sales Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TODAY SUMMARY (SR ড্যাশবোর্ড)
// GET /api/sales/today-summary
// ============================================================

const getTodaySummary = async (req, res) => {
    try {
        // ✅ FIX Bug-1: BD local date — sales_transactions.date এর সাথে মিলবে
        const today    = getBDToday();
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
             WHERE worker_id = $1 AND date = $2
             AND tenant_id = $3`,
            [workerId, today, req.tenantId]
        );

        // ভিজিট সারসংক্ষেপ
        const visitSummary = await query(
            `SELECT
                COUNT(*)                                     AS total_visits,
                COUNT(CASE WHEN will_sell = true THEN 1 END) AS sold_visits,
                COUNT(CASE WHEN will_sell = false THEN 1 END) AS no_sell_visits
             FROM visits
             WHERE worker_id = $1 AND visit_date = $2
             AND tenant_id = $3`,
            [workerId, today, req.tenantId]
        );

        // মোট কাস্টমার
        const totalCustomers = await query(
            `SELECT COUNT(*) AS total
             FROM customer_assignments
             WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL
             AND tenant_id = $2`,
            [workerId, req.tenantId]
        );

        // আজকের অর্ডার
        const todayOrder = await query(
            `SELECT status, total_amount FROM orders
             WHERE worker_id = $1 AND DATE(requested_at) = $2
             AND tenant_id = $3
             ORDER BY requested_at DESC LIMIT 1`,
            [workerId, today, req.tenantId]
        );

        // বকেয়া
        const dues = await query(
            'SELECT outstanding_dues, cash_dues FROM users WHERE id = $1',
            [workerId]
        );

        // ✅ আজকের চেক-ইন স্ট্যাটাস যাচাই
        const attendanceToday = await query(
            `SELECT check_in_time, check_out_time FROM attendance
             WHERE user_id = $1 AND date = $2
             AND tenant_id = $3
             LIMIT 1`,
            [workerId, today, req.tenantId]
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
                cash_dues:        dues.rows[0]?.cash_dues        || 0,
                checked_in:       checkedIn   // ✅ নতুন: চেক-ইন হয়েছে কিনা
            }
        });

    } catch (error) {
        logger.error('❌ Today Summary Error:', error.message);
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
        // ✅ FIX Bug-1: BD local date default
        const today                   = getBDToday();
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
        logger.error('❌ Team Sales Error:', error.message);
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
             WHERE st.id = $1
             AND st.tenant_id = $2`,
            [req.params.id, req.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'বিক্রয় পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, data: result.rows[0] });

    } catch (error) {
        logger.error('❌ Sale Detail Error:', error.message);
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
             WHERE id = $2
             AND tenant_id = $3`,
            [memoPhotoUrl, sale_id, req.tenantId]
        );

        logger.info(`⚠️ OTP Skip — Sale ${sale_id} by Worker ${req.user.id}, Photo: ${memoPhotoUrl}`);

        return res.status(200).json({
            success: true,
            message: 'মেমো ছবিসহ বিক্রয় সম্পন্ন।',
            data: { memo_photo_url: memoPhotoUrl }
        });

    } catch (error) {
        logger.error('❌ Skip OTP Error:', error.message);
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
             AND st.tenant_id = $4
             GROUP BY st.date, v.total_visits, v.sold_visits
             ORDER BY st.date DESC`,
            [workerId, from, to, req.tenantId]
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
             AND tenant_id = $4
             GROUP BY visit_date
             ORDER BY visit_date DESC`,
            [workerId, from, to, req.tenantId]
        );

        // মোট active customer count
        const custResult = await query(
            `SELECT COUNT(*) AS total
             FROM customer_assignments
             WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL
             AND tenant_id = $2`,
            [workerId, req.tenantId]
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
               AND date BETWEEN $2 AND $3
             AND tenant_id = $4`,
            [workerId, from, to, req.tenantId]
        );

        // টার্গেট (যদি থাকে)
        const targetResult = await query(
            `SELECT monthly_target, target_visit_rate
             FROM users WHERE id = $1
             AND tenant_id = $2`,
            [workerId, req.tenantId]
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
        logger.error('❌ Monthly Sales Error:', error.message);
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
               AND visit_date BETWEEN $2 AND $3
             AND tenant_id = $4`,
            [workerId, from, to, req.tenantId]
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
             AND tenant_id = $4
             GROUP BY visit_date
             ORDER BY visit_date DESC`,
            [workerId, from, to, req.tenantId]
        );

        // মোট কাস্টমার
        const custResult = await query(
            `SELECT COUNT(*) AS total
             FROM customer_assignments
             WHERE worker_id = $1 AND is_active = true AND customer_id IS NOT NULL
             AND tenant_id = $2`,
            [workerId, req.tenantId]
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
        logger.error('❌ Visit Stats Error:', error.message);
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
        // ✅ FIX Bug-1: BD local date
        const today = getBDToday();

        const result = await query(
            `SELECT id, will_sell, no_sell_reason, created_at
             FROM visits
             WHERE worker_id = $1
               AND customer_id = $2
               AND visit_date = $3
             AND tenant_id = $4
             ORDER BY created_at DESC
             LIMIT 1`,
            [workerId, customerId, today, req.tenantId]
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
        logger.error('❌ Visit Status Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

const getTeamVisits = async (req, res) => {
    try {
        const { worker_id, date, from, to } = req.query;
        // ✅ FIX Bug-1: BD local date default
        const today    = getBDToday();
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
        logger.error('❌ Team Visits Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPLOAD RECEIPT PHOTO
// POST /api/sales/upload-receipt
// বিক্রয়ের রসিদ/মেমো ছবি Cloudinary তে আপলোড করে URL ফেরত দেয়।
// Sale তৈরির আগে আলাদাভাবে call করা হয়, URL পরে /sales payload-এ যায়।
// ============================================================

const uploadReceipt = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'রসিদের ছবি দিন। (receipt_photo field)'
            });
        }

        const workerId  = req.user.id;
        const timestamp = Date.now();

        const url = await uploadToCloudinary(
            req.file.buffer,
            'receipt_photos',
            `receipt_${workerId}_${timestamp}`,
            req.file.mimetype
        );

        if (!url) {
            return res.status(500).json({
                success: false,
                message: 'ছবি আপলোড করা সম্ভব হয়নি। পরে চেষ্টা করুন।'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'রসিদের ছবি আপলোড সফল।',
            data: { url }
        });

    } catch (error) {
        logger.error('❌ Upload Receipt Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

module.exports = {
    createVisit,
    createSale,
    sendInvoice,
    verifyOTP,
    verifyOrderByLink,
    skipOTPWithPhoto,
    getMySales,
    getTeamSales,
    getTeamVisits,
    getTodaySummary,
    getSaleDetail,
    getMyMonthlySales,
    getMyVisitStats,
    getVisitStatus,
    uploadReceipt
};
