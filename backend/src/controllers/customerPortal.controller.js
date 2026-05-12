// ============================================================
// CUSTOMER PORTAL CONTROLLER
// Google OAuth দিয়ে কাস্টমার লগইন করবে
// WhatsApp-এ পাঠানো unique link → Google Login → Dashboard
// ============================================================

const { query }  = require('../config/db');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const axios      = require('axios');

// ============================================================
// HELPER: Unique Token তৈরি
// ============================================================
const generatePortalToken = () => crypto.randomBytes(32).toString('hex');

// ============================================================
// HELPER: Device Fingerprint — browser info থেকে consistent ID
// Frontend পাঠায়, backend hash করে store করে
// ============================================================
const hashDeviceId = (raw) => {
    if (!raw) return null;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
};

// ============================================================
// 1. SEND PORTAL LINK (WhatsApp)
// POST /api/portal/send-link/:customerId
// SR বা System call করবে — কাস্টমারের WhatsApp-এ লিংক যাবে
// নতুন লিংক পাঠালে আগের device lock সম্পূর্ণ রিসেট হয়
// ============================================================
const sendPortalLink = async (req, res) => {
    try {
        const { customerId } = req.params;

        const customer = await query(
            'SELECT id, shop_name, owner_name, whatsapp, email, customer_code FROM customers WHERE id = $1 AND is_active = true',
            [customerId]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        const cust = customer.rows[0];

        if (!cust.whatsapp) {
            return res.status(400).json({ success: false, message: 'কাস্টমারের WhatsApp নম্বর নেই।' });
        }

        const token     = generatePortalToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // নতুন লিংক পাঠালে bound_email ও bound_device_id সম্পূর্ণ রিসেট
        await query(
            `INSERT INTO customer_portal_tokens
                (customer_id, token, expires_at, bound_email, bound_device_id, bound_at)
             VALUES ($1, $2, $3, NULL, NULL, NULL)
             ON CONFLICT (customer_id) DO UPDATE SET
                token           = $2,
                expires_at      = $3,
                created_at      = NOW(),
                bound_email     = NULL,
                bound_device_id = NULL,
                bound_at        = NULL,
                last_login      = NULL,
                google_email    = NULL`,
            [customerId, token, expiresAt]
        );

        const frontendUrl = process.env.FRONTEND_URL || 'https://novatech-bd-kqrn.vercel.app';
        const portalLink  = `${frontendUrl}/customer/dashboard?token=${token}`;

        const rawPhone = cust.whatsapp.replace(/\D/g, '');
        const phone    = rawPhone.startsWith('880') ? rawPhone : '880' + rawPhone.replace(/^0/, '');
        const message  = encodeURIComponent(
            `আস্সালামু আলাইকুম ${cust.owner_name} ভাই,\n\n` +
            `আপনার *${cust.shop_name}* এর সকল ক্রয় তথ্য, বাকি ও পেমেন্ট ইতিহাস দেখতে নিচের লিংকে ক্লিক করুন:\n\n` +
            `🔗 ${portalLink}\n\n` +
            `👆 Google দিয়ে লগইন করুন\n` +
            `_(এই লিংক ৭ দিন কার্যকর থাকবে)_\n\n` +
            `_NovaTech BD_`
        );

        const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

        return res.status(200).json({
            success: true,
            message: 'পোর্টাল লিংক তৈরি হয়েছে।',
            data: {
                portal_link:   portalLink,
                whatsapp_url:  whatsappUrl,
                token,
                expires_at:    expiresAt,
                customer_name: cust.owner_name,
                shop_name:     cust.shop_name
            }
        });

    } catch (error) {
        console.error('❌ Send Portal Link Error:', error.message);
        return res.status(500).json({ success: false, message: 'লিংক তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2. VERIFY TOKEN (লিংক ক্লিক করলে)
// GET /api/portal/verify-token?token=xxx&device_id=xxx
// Frontend এ লিংক খুললে এই API call হবে
// device lock থাকলে জানাবে — Google login skip করা যাবে
// ============================================================
const verifyPortalToken = async (req, res) => {
    try {
        const { token, device_id } = req.query;

        if (!token) {
            return res.status(400).json({ success: false, message: 'টোকেন দেওয়া হয়নি।' });
        }

        const result = await query(
            `SELECT cpt.*, c.shop_name, c.owner_name, c.customer_code, c.email, c.whatsapp
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'লিংক পাওয়া যায়নি বা মেয়াদ শেষ।' });
        }

        const record = result.rows[0];

        if (new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ success: false, message: 'লিংকের মেয়াদ শেষ হয়ে গেছে। SR-কে নতুন লিংক পাঠাতে বলুন।' });
        }

        // ── Device Lock চেক ──────────────────────────────────
        // এই লিংক আগে কোনো ডিভাইসে lock হয়েছে কিনা
        const isLocked = !!record.bound_device_id;

        if (isLocked && device_id) {
            const hashedIncoming = hashDeviceId(device_id);
            const isSameDevice   = hashedIncoming === record.bound_device_id;

            if (!isSameDevice) {
                // ভিন্ন ডিভাইস — block
                return res.status(403).json({
                    success: false,
                    message: 'এই লিংক অন্য একটি ডিভাইসে ব্যবহার করা হয়েছে। নতুন লিংকের জন্য SR-এর সাথে যোগাযোগ করুন।',
                    error_code: 'DEVICE_LOCKED'
                });
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                customer_id:    record.customer_id,
                shop_name:      record.shop_name,
                owner_name:     record.owner_name,
                customer_code:  record.customer_code,
                email_linked:   !!record.email,
                token_valid:    true,
                // ── নতুন: এই ডিভাইস কি আগে lock হয়েছে?
                is_device_locked: isLocked,
                // lock হয়ে থাকলে আর Google login দরকার নেই — সরাসরি JWT দেওয়া যাবে
                can_skip_google:  isLocked && device_id ? hashDeviceId(device_id) === record.bound_device_id : false
            }
        });

    } catch (error) {
        console.error('❌ Verify Token Error:', error.message);
        return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2b. DEVICE RE-LOGIN (Google ছাড়া)
// POST /api/portal/device-login
// আগে lock হওয়া ডিভাইস → fingerprint match → সরাসরি JWT
// ============================================================
const deviceLogin = async (req, res) => {
    try {
        const { portal_token, device_id } = req.body;

        if (!portal_token || !device_id) {
            return res.status(400).json({ success: false, message: 'portal_token ও device_id দেওয়া হয়নি।' });
        }

        const result = await query(
            `SELECT cpt.*, c.id as cid, c.shop_name, c.owner_name, c.customer_code,
                    c.email, c.current_credit, c.credit_limit, c.credit_balance
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1 AND cpt.expires_at > NOW()`,
            [portal_token]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।' });
        }

        const record = result.rows[0];

        if (!record.bound_device_id) {
            return res.status(400).json({ success: false, message: 'এই লিংকে আগে Google login করা হয়নি।' });
        }

        const hashedIncoming = hashDeviceId(device_id);
        if (hashedIncoming !== record.bound_device_id) {
            return res.status(403).json({
                success: false,
                message: 'এই লিংক অন্য একটি ডিভাইসে lock করা আছে।',
                error_code: 'DEVICE_LOCKED'
            });
        }

        // ── Match! JWT issue করো ──
        const portalJWT = jwt.sign(
            {
                customer_id:    record.cid,
                email:          record.bound_email,
                google_name:    record.owner_name,
                type:           'customer_portal'
            },
            process.env.JWT_PORTAL_SECRET || process.env.JWT_ACCESS_SECRET,
            { expiresIn: '30d' }
        );

        await query(
            'UPDATE customer_portal_tokens SET last_login = NOW() WHERE token = $1',
            [portal_token]
        );

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল!',
            data: {
                portal_jwt: portalJWT,
                customer: {
                    id:             record.cid,
                    shop_name:      record.shop_name,
                    owner_name:     record.owner_name,
                    customer_code:  record.customer_code,
                    email:          record.bound_email,
                    current_credit: record.current_credit,
                    credit_limit:   record.credit_limit,
                    credit_balance: record.credit_balance
                }
            }
        });

    } catch (error) {
        console.error('❌ Device Login Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 3. GOOGLE OAUTH CALLBACK
// POST /api/portal/google-auth
// প্রথমবার login — Google email + device fingerprint lock হয়
// ============================================================
const googleAuth = async (req, res) => {
    try {
        const { google_token, portal_token, device_id } = req.body;

        if (!google_token || !portal_token) {
            return res.status(400).json({ success: false, message: 'Google token এবং portal token দেওয়া হয়নি।' });
        }

        if (!device_id) {
            return res.status(400).json({ success: false, message: 'Device ID পাওয়া যায়নি।' });
        }

        // Portal token যাচাই + existing lock চেক
        const tokenResult = await query(
            `SELECT cpt.*, c.id as cid, c.shop_name, c.owner_name, c.customer_code,
                    c.email, c.whatsapp, c.current_credit, c.credit_limit, c.credit_balance
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1 AND cpt.expires_at > NOW()`,
            [portal_token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।' });
        }

        const customerData   = tokenResult.rows[0];
        const hashedDeviceId = hashDeviceId(device_id);

        // ── Device Lock চেক ──────────────────────────────────
        if (customerData.bound_device_id) {
            // এই লিংক আগে lock হয়েছে
            if (hashedDeviceId !== customerData.bound_device_id) {
                return res.status(403).json({
                    success: false,
                    message: 'এই লিংক অন্য একটি ডিভাইসে ব্যবহার করা হয়েছে। নতুন লিংকের জন্য SR-এর সাথে যোগাযোগ করুন।',
                    error_code: 'DEVICE_LOCKED'
                });
            }
            // একই ডিভাইস কিন্তু Google login আবার করছে — Email চেক করো
            // (Google account বদলে login করার চেষ্টা রোধ)
        }

        // ── Google থেকে user info ────────────────────────────
        let googleUser;
        try {
            const googleRes = await axios.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                { headers: { Authorization: `Bearer ${google_token}` } }
            );
            googleUser = googleRes.data;
        } catch {
            return res.status(401).json({ success: false, message: 'Google যাচাই ব্যর্থ হয়েছে।' });
        }

        const { email, name, picture } = googleUser;

        // ── Email Lock চেক ───────────────────────────────────
        // একই ডিভাইস কিন্তু ভিন্ন Gmail দিয়ে login করার চেষ্টা
        if (customerData.bound_email && email.toLowerCase() !== customerData.bound_email.toLowerCase()) {
            return res.status(403).json({
                success: false,
                message: `এই লিংকে অন্য Gmail (${customerData.bound_email}) দিয়ে আগে login করা হয়েছে। একই Gmail ব্যবহার করুন।`,
                error_code: 'EMAIL_LOCKED'
            });
        }

        // ── প্রথমবার login → lock করো ────────────────────────
        const isFirstLogin = !customerData.bound_device_id;

        if (isFirstLogin) {
            await query(
                `UPDATE customer_portal_tokens SET
                    bound_email     = $1,
                    bound_device_id = $2,
                    bound_at        = NOW(),
                    last_login      = NOW(),
                    google_email    = $4
                 WHERE token = $3`,
                [email.toLowerCase(), hashedDeviceId, portal_token, email.toLowerCase()]
            );

            // কাস্টমারের email DB-তে সেভ (প্রথমবার)
            if (!customerData.email) {
                await query(
                    'UPDATE customers SET email = $1, updated_at = NOW() WHERE id = $2',
                    [email, customerData.cid]
                );
            }
        } else {
            // পুনরায় login — শুধু last_login আপডেট
            await query(
                'UPDATE customer_portal_tokens SET last_login = NOW() WHERE token = $1',
                [portal_token]
            );
        }

        // ── Portal JWT issue ─────────────────────────────────
        const portalJWT = jwt.sign(
            {
                customer_id:    customerData.cid,
                email,
                google_name:    name,
                google_picture: picture,
                type:           'customer_portal'
            },
            process.env.JWT_PORTAL_SECRET || process.env.JWT_ACCESS_SECRET,
            { expiresIn: '30d' }
        );

        return res.status(200).json({
            success: true,
            message: isFirstLogin ? 'প্রথমবার লগইন সফল! এই ডিভাইসে লক করা হয়েছে।' : 'লগইন সফল!',
            data: {
                portal_jwt: portalJWT,
                customer: {
                    id:             customerData.cid,
                    shop_name:      customerData.shop_name,
                    owner_name:     customerData.owner_name,
                    customer_code:  customerData.customer_code,
                    email,
                    google_name:    name,
                    google_picture: picture,
                    current_credit: customerData.current_credit,
                    credit_limit:   customerData.credit_limit,
                    credit_balance: customerData.credit_balance
                }
            }
        });

    } catch (error) {
        console.error('❌ Google Auth Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 4. CUSTOMER DASHBOARD DATA
// GET /api/portal/dashboard
// ============================================================
const getCustomerDashboard = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;

        const customer = await query(
            `SELECT c.shop_name, c.owner_name, c.customer_code, c.email,
                    c.credit_limit, c.current_credit, c.credit_balance,
                    c.business_type, c.whatsapp,
                    r.name AS route_name
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             WHERE c.id = $1`,
            [customer_id]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'তথ্য পাওয়া যায়নি।' });
        }

        const sales = await query(
            `SELECT st.invoice_number, st.items, st.total_amount,
                    st.discount_amount, st.net_amount,
                    st.payment_method, st.cash_received, st.credit_used,
                    st.replacement_value, st.credit_balance_used,
                    st.created_at,
                    u.name_bn AS sr_name
             FROM sales_transactions st
             JOIN users u ON st.worker_id = u.id
             WHERE st.customer_id = $1
               AND st.otp_verified = true
             ORDER BY st.created_at DESC
             LIMIT 30`,
            [customer_id]
        );

        const payments = await query(
            `SELECT cp.amount, cp.notes, cp.created_at,
                    u.name_bn AS collected_by
             FROM credit_payments cp
             JOIN users u ON cp.worker_id = u.id
             WHERE cp.customer_id = $1
             ORDER BY cp.created_at DESC
             LIMIT 20`,
            [customer_id]
        );

        const monthlySummary = await query(
            `SELECT
                COUNT(*)                          AS total_invoices,
                COALESCE(SUM(net_amount), 0)      AS total_purchase,
                COALESCE(SUM(cash_received), 0)   AS total_cash,
                COALESCE(SUM(credit_used), 0)     AS total_credit
             FROM sales_transactions
             WHERE customer_id = $1
               AND otp_verified = true
               AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
               AND EXTRACT(YEAR  FROM created_at) = EXTRACT(YEAR  FROM NOW())`,
            [customer_id]
        );

        const totalSummary = await query(
            `SELECT
                COUNT(*)                          AS total_invoices,
                COALESCE(SUM(net_amount), 0)      AS total_purchase,
                COALESCE(SUM(cash_received), 0)   AS total_cash,
                COALESCE(SUM(credit_used), 0)     AS total_credit
             FROM sales_transactions
             WHERE customer_id = $1
               AND otp_verified = true`,
            [customer_id]
        );

        return res.status(200).json({
            success: true,
            data: {
                customer:        customer.rows[0],
                sales:           sales.rows,
                credit_payments: payments.rows,
                monthly_summary: monthlySummary.rows[0],
                total_summary:   totalSummary.rows[0]
            }
        });

    } catch (error) {
        console.error('❌ Customer Dashboard Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/invoices?page=1&limit=15
// ============================================================
const getCustomerInvoices = async (req, res) => {
    try {
        const customer_id = req.portalUser.customer_id;
        const page        = Math.max(1, parseInt(req.query.page)  || 1);
        const limit       = Math.min(50, parseInt(req.query.limit) || 15);
        const offset      = (page - 1) * limit;

        const countResult = await query(
            'SELECT COUNT(*) AS total FROM sales_transactions WHERE customer_id = $1 AND otp_verified = true',
            [customer_id]
        );
        const total      = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        const sales = await query(
            `SELECT st.invoice_number, st.items, st.total_amount,
                    st.discount_amount, st.net_amount,
                    st.payment_method, st.cash_received, st.credit_used,
                    st.replacement_value, st.credit_balance_used,
                    st.created_at,
                    u.name_bn AS sr_name
             FROM sales_transactions st
             JOIN users u ON st.worker_id = u.id
             WHERE st.customer_id = $1
               AND st.otp_verified = true
             ORDER BY st.created_at DESC
             LIMIT $2 OFFSET $3`,
            [customer_id, limit, offset]
        );

        return res.status(200).json({
            success: true,
            data: sales.rows,
            pagination: { page, limit, total, totalPages }
        });

    } catch (error) {
        console.error('❌ Invoice List Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    sendPortalLink,
    verifyPortalToken,
    deviceLogin,
    googleAuth,
    getCustomerDashboard,
    getCustomerInvoices
};
