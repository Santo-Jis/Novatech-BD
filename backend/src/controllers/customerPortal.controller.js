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
// 1. SEND PORTAL LINK (WhatsApp)
// POST /api/portal/send-link/:customerId
// SR বা System call করবে — কাস্টমারের WhatsApp-এ লিংক যাবে
// ============================================================
const sendPortalLink = async (req, res) => {
    try {
        const { customerId } = req.params;

        // কাস্টমার তথ্য
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

        // Unique Portal Token তৈরি (৭ দিন মেয়াদ)
        const token    = generatePortalToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // DB-তে token সেভ
        await query(
            `INSERT INTO customer_portal_tokens (customer_id, token, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (customer_id)
             DO UPDATE SET token = $2, expires_at = $3, created_at = NOW()`,
            [customerId, token, expiresAt]
        );

        const frontendUrl = process.env.FRONTEND_URL || 'https://novatech-bd-kqrn.vercel.app';
        const portalLink  = `${frontendUrl}/customer/dashboard?token=${token}`;

        // WhatsApp Custom Link Message
        // ✅ FIX: Bangladesh country code যোগ করো
        // 01XXXXXXXX → 8801XXXXXXXX
        // +8801XXXXXXXX → 8801XXXXXXXX
        const rawPhone = cust.whatsapp.replace(/\D/g, ''); // শুধু সংখ্যা
        const phone = rawPhone.startsWith('880') ? rawPhone : '880' + rawPhone.replace(/^0/, '');
        const message = encodeURIComponent(
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
// GET /api/portal/verify-token?token=xxx
// Frontend এ লিংক খুললে এই API call হবে — কাস্টমার তথ্য দেবে
// ============================================================
const verifyPortalToken = async (req, res) => {
    try {
        const { token } = req.query;

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

        return res.status(200).json({
            success: true,
            data: {
                customer_id:   record.customer_id,
                shop_name:     record.shop_name,
                owner_name:    record.owner_name,
                customer_code: record.customer_code,
                email_linked:  !!record.email,
                token_valid:   true
            }
        });

    } catch (error) {
        console.error('❌ Verify Token Error:', error.message);
        return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 3. GOOGLE OAUTH CALLBACK
// POST /api/portal/google-auth
// Frontend থেকে Google access_token পাঠাবে → কাস্টমার লগইন
// ============================================================
const googleAuth = async (req, res) => {
    try {
        const { google_token, portal_token } = req.body;

        if (!google_token || !portal_token) {
            return res.status(400).json({ success: false, message: 'Google token এবং portal token দেওয়া হয়নি।' });
        }

        // Portal token যাচাই
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

        const customerData = tokenResult.rows[0];

        // Google থেকে user info নিই
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

        // কাস্টমারের Email আপডেট করো (যদি আগে না থাকে)
        if (!customerData.email && email) {
            await query(
                'UPDATE customers SET email = $1, updated_at = NOW() WHERE id = $2',
                [email, customerData.cid]
            );
        }

        // Portal JWT token তৈরি (কাস্টমার ড্যাশবোর্ডের জন্য)
        const portalJWT = jwt.sign(
            {
                customer_id:   customerData.cid,
                email,
                google_name:   name,
                google_picture: picture,
                type:          'customer_portal'
            },
            process.env.JWT_PORTAL_SECRET || process.env.JWT_ACCESS_SECRET,
            { expiresIn: '30d' }
        );

        // Login log
        await query(
            `UPDATE customer_portal_tokens
             SET last_login = NOW(), google_email = $1
             WHERE token = $2`,
            [email, portal_token]
        );

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল!',
            data: {
                portal_jwt:    portalJWT,
                customer: {
                    id:            customerData.cid,
                    shop_name:     customerData.shop_name,
                    owner_name:    customerData.owner_name,
                    customer_code: customerData.customer_code,
                    email,
                    google_name:   name,
                    google_picture: picture,
                    current_credit: customerData.current_credit,
                    credit_limit:  customerData.credit_limit,
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
// Portal JWT দিয়ে কাস্টমার তার সব তথ্য দেখবে
// ============================================================
const getCustomerDashboard = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;

        // কাস্টমারের মূল তথ্য
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

        // বিক্রয় ইতিহাস (শেষ ৩০টি)
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

        // বাকি পরিশোধ ইতিহাস
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

        // মাসভিত্তিক সারসংক্ষেপ (বর্তমান মাস)
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

        // সর্বমোট সারসংক্ষেপ
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
// কাস্টমারের paginated invoice list
// ============================================================
const getCustomerInvoices = async (req, res) => {
    try {
        const customer_id = req.portalUser.customer_id;
        const page        = Math.max(1, parseInt(req.query.page)  || 1);
        const limit       = Math.min(50, parseInt(req.query.limit) || 15);
        const offset      = (page - 1) * limit;

        // মোট invoice count
        const countResult = await query(
            `SELECT COUNT(*) AS total
             FROM sales_transactions
             WHERE customer_id = $1 AND otp_verified = true`,
            [customer_id]
        );
        const total      = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        // Paginated invoice list
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
    googleAuth,
    getCustomerDashboard,
    getCustomerInvoices
};
