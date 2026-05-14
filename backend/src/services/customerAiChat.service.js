const { query } = require('../config/db');

// ============================================================
// Customer AI Chat — Tool-Calling Service
//
// নিরাপত্তার স্তর:
//   ১. প্রতিটি tool-এ customer_id hardcoded — SQL-এ সরাসরি বাঁধা
//   ২. AI শুধু tool name বলে, query লেখে না
//   ③. System prompt-এ সীমানা স্পষ্ট বলা আছে
//   ④. Customer শুধু নিজের data দেখতে পায় — অন্য customer বা
//      SR-এর salary/commission/contact কিছুই না
//
// Customer পাবে:
//   - নিজের invoice/purchase history
//   - নিজের বাকি (credit) তথ্য
//   - নিজের SR-এর নাম ও ফোন (contact-এর জন্য)
//   - নিজের assigned manager-এর নাম ও ফোন
//   - Payment history
//   - Order request status
//   - Product catalog (সবার জন্য একই)
// ============================================================

// ── Tools: Customer শুধু এগুলোই call করতে পারবে ─────────────

const CUSTOMER_TOOLS = [
    {
        name: 'get_my_credit_status',
        description: 'Customer-এর বর্তমান বাকি (credit), credit limit, এবং পরিশোধযোগ্য পরিমাণ দেখাও',
    },
    {
        name: 'get_my_recent_purchases',
        description: 'সাম্প্রতিক ক্রয়ের ইতিহাস — invoice নম্বর, পরিমাণ, তারিখ, SR-এর নাম',
    },
    {
        name: 'get_my_payment_history',
        description: 'কাস্টমার কবে কবে কত টাকা পরিশোধ করেছে তার তালিকা',
    },
    {
        name: 'get_my_monthly_summary',
        description: 'এই মাসে মোট ক্রয়, নগদ পরিশোধ, বাকি নেওয়া — সংক্ষিপ্ত সারসংক্ষেপ',
    },
    {
        name: 'get_my_sr_and_manager_contact',
        description: 'Customer-এর assigned SR এবং Manager-এর নাম ও ফোন নম্বর — যোগাযোগের জন্য',
    },
    {
        name: 'get_my_order_requests',
        description: 'Customer-এর দেওয়া order request-গুলোর status',
    },
    {
        name: 'get_product_catalog',
        description: 'কোম্পানির পণ্য তালিকা এবং মূল্য',
    },
];

// ── Tool Executor — সবসময় customer_id দিয়ে filter ────────────

const executeTool = async (toolName, customerId) => {
    // ⚠️ SECURITY: customerId সবসময় req.portalUser.customer_id থেকে আসে
    // AI বা user কখনো customer_id পরিবর্তন করতে পারবে না

    switch (toolName) {

        case 'get_my_credit_status': {
            const result = await query(
                `SELECT
                    shop_name,
                    owner_name,
                    COALESCE(current_credit, 0)  AS current_credit,
                    COALESCE(credit_limit, 0)    AS credit_limit,
                    COALESCE(credit_balance, 0)  AS credit_balance
                 FROM customers
                 WHERE id = $1`,
                [customerId]
            );
            if (!result.rows[0]) return { error: 'তথ্য পাওয়া যায়নি।' };
            const r = result.rows[0];
            return {
                shop_name:      r.shop_name,
                current_credit: parseFloat(r.current_credit),
                credit_limit:   parseFloat(r.credit_limit),
                credit_balance: parseFloat(r.credit_balance),
                available_credit: Math.max(0, parseFloat(r.credit_limit) - parseFloat(r.current_credit)),
                summary: `বর্তমান বাকি: ৳${parseFloat(r.current_credit).toLocaleString()}, সীমা: ৳${parseFloat(r.credit_limit).toLocaleString()}`
            };
        }

        case 'get_my_recent_purchases': {
            const result = await query(
                `SELECT
                    st.invoice_number,
                    st.total_amount,
                    COALESCE(st.net_amount, st.total_amount) AS net_amount,
                    st.cash_received,
                    st.credit_used,
                    st.payment_method,
                    TO_CHAR(st.created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS date,
                    u.name_bn AS sr_name
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 WHERE st.customer_id = $1
                   AND st.otp_verified = true
                 ORDER BY st.created_at DESC
                 LIMIT 10`,
                [customerId]
            );
            return {
                purchases: result.rows,
                total_count: result.rows.length,
                summary: `সাম্প্রতিক ${result.rows.length}টি ক্রয়`
            };
        }

        case 'get_my_payment_history': {
            const result = await query(
                `SELECT
                    cp.amount,
                    cp.notes,
                    TO_CHAR(cp.created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS date,
                    u.name_bn AS collected_by
                 FROM credit_payments cp
                 JOIN users u ON cp.worker_id = u.id
                 WHERE cp.customer_id = $1
                 ORDER BY cp.created_at DESC
                 LIMIT 15`,
                [customerId]
            );
            const total = result.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            return {
                payments: result.rows,
                total_paid: total,
                summary: `মোট ${result.rows.length}টি পেমেন্ট, মোট ৳${total.toLocaleString()} পরিশোধিত`
            };
        }

        case 'get_my_monthly_summary': {
            const result = await query(
                `SELECT
                    COUNT(*)                                  AS total_invoices,
                    COALESCE(SUM(net_amount), 0)             AS total_purchase,
                    COALESCE(SUM(cash_received), 0)          AS total_cash,
                    COALESCE(SUM(credit_used), 0)            AS total_credit,
                    TO_CHAR(NOW() AT TIME ZONE 'Asia/Dhaka', 'Month YYYY') AS month_name
                 FROM sales_transactions
                 WHERE customer_id = $1
                   AND otp_verified = true
                   AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
                   AND EXTRACT(YEAR  FROM created_at) = EXTRACT(YEAR  FROM NOW())`,
                [customerId]
            );
            const r = result.rows[0];
            return {
                month:          r.month_name?.trim(),
                total_invoices: parseInt(r.total_invoices),
                total_purchase: parseFloat(r.total_purchase),
                total_cash:     parseFloat(r.total_cash),
                total_credit:   parseFloat(r.total_credit),
                summary: `${r.month_name?.trim()}: ${r.total_invoices}টি ক্রয়, মোট ৳${parseFloat(r.total_purchase).toLocaleString()}`
            };
        }

        case 'get_my_sr_and_manager_contact': {
            // ⚠️ SECURITY: শুধু name + phone — salary/commission কিছুই না
            const result = await query(
                `SELECT
                    u.name_bn   AS sr_name,
                    u.phone     AS sr_phone,
                    m.name_bn   AS manager_name,
                    m.phone     AS manager_phone
                 FROM customer_assignments ca
                 JOIN users u  ON ca.worker_id   = u.id
                 LEFT JOIN users m ON u.manager_id = m.id
                 WHERE ca.customer_id = $1
                   AND ca.is_active = true
                 LIMIT 1`,
                [customerId]
            );
            if (!result.rows[0]) {
                return { message: 'SR তথ্য পাওয়া যায়নি। Admin-এর সাথে যোগাযোগ করুন।' };
            }
            const r = result.rows[0];
            return {
                sr: {
                    name:  r.sr_name,
                    phone: r.sr_phone || 'তথ্য নেই',
                },
                manager: r.manager_name ? {
                    name:  r.manager_name,
                    phone: r.manager_phone || 'তথ্য নেই',
                } : null,
                summary: `SR: ${r.sr_name} (${r.sr_phone || 'ফোন নেই'})`
            };
        }

        case 'get_my_order_requests': {
            const result = await query(
                `SELECT
                    cor.id,
                    cor.status,
                    cor.note,
                    TO_CHAR(cor.created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS date,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'product', p.name,
                                'quantity', cori.quantity
                            )
                        ) FILTER (WHERE p.id IS NOT NULL),
                        '[]'
                    ) AS items
                 FROM customer_order_requests cor
                 LEFT JOIN customer_order_request_items cori ON cori.request_id = cor.id
                 LEFT JOIN products p ON cori.product_id = p.id
                 WHERE cor.customer_id = $1
                 GROUP BY cor.id, cor.status, cor.note, cor.created_at
                 ORDER BY cor.created_at DESC
                 LIMIT 10`,
                [customerId]
            );
            return {
                orders:      result.rows,
                total_count: result.rows.length,
                summary:     `${result.rows.length}টি অর্ডার রিকোয়েস্ট`
            };
        }

        case 'get_product_catalog': {
            // সবার জন্য একই — customer-specific filter নেই
            const result = await query(
                `SELECT name, unit, price_per_unit AS price, category
                 FROM products
                 WHERE is_active = true
                 ORDER BY category, name
                 LIMIT 50`
            );
            return {
                products: result.rows,
                total:    result.rows.length,
                summary:  `${result.rows.length}টি পণ্য পাওয়া গেছে`
            };
        }

        default:
            return { error: `অজানা tool: ${toolName}` };
    }
};

// ── System Prompt builder ─────────────────────────────────────

const buildSystemPrompt = (customerInfo) => {
    const today = new Date().toLocaleDateString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric', month: 'long', day: 'numeric'
    });

    return `তুমি NovaTech BD-র Customer Support AI।
তুমি "${customerInfo.shop_name}" (${customerInfo.owner_name})-এর ব্যক্তিগত সহকারী।

আজকের তারিখ: ${today}

তোমার দায়িত্ব (দুটি ভূমিকা):
১. 🧑‍💼 Sales Support — ক্রয়, invoice, বাকি, payment সংক্রান্ত তথ্য দাও
২. 🏢 Company Support — পণ্য, অর্ডার, SR/Manager যোগাযোগে সাহায্য করো

ভাষার নিয়ম:
- Customer বাংলায় লিখলে বাংলায় উত্তর দাও
- Customer English-এ লিখলে English-এ উত্তর দাও
- সংখ্যায় সবসময় ৳ চিহ্ন ব্যবহার করো
- বাংলায় সম্মানজনক ভাষা (আপনি) ব্যবহার করো

কঠোর সীমানা (এগুলো কখনো করবে না):
- অন্য কোনো customer-এর তথ্য দেবে না
- SR বা Manager-এর salary, commission, বা আর্থিক তথ্য দেবে না
- কোম্পানির মোট বিক্রয় বা আর্থিক রিপোর্ট দেবে না
- Admin বা management-এর internal তথ্য দেবে না
- শুধু SR-এর নাম ও ফোন দেবে — আর কোনো personal তথ্য না

যদি কেউ সীমানার বাইরের তথ্য চায়:
"এই তথ্য দেখার সুযোগ নেই। আপনার SR বা Manager-এর সাথে যোগাযোগ করুন।"

তুমি সাহায্য করতে পারো:
✅ আপনার বাকি কত? → get_my_credit_status
✅ আমার invoice দেখাও → get_my_recent_purchases  
✅ আমি কত টাকা দিয়েছি? → get_my_payment_history
✅ এই মাসে কত কিনেছি? → get_my_monthly_summary
✅ SR-এর নম্বর কত? → get_my_sr_and_manager_contact
✅ আমার অর্ডার কোথায়? → get_my_order_requests
✅ পণ্যের দাম কত? → get_product_catalog`;
};

// ── Tool call parser — AI-এর JSON response parse করে ─────────

const parseToolCall = (text) => {
    try {
        // JSON block খোঁজো: {"tool": "...", "reason": "..."}
        const match = text.match(/\{[\s\S]*?"tool"\s*:\s*"([^"]+)"[\s\S]*?\}/);
        if (!match) return null;

        const parsed = JSON.parse(match[0]);
        const validTools = CUSTOMER_TOOLS.map(t => t.name);

        if (!validTools.includes(parsed.tool)) return null;
        return parsed.tool;
    } catch {
        return null;
    }
};

module.exports = {
    CUSTOMER_TOOLS,
    executeTool,
    buildSystemPrompt,
    parseToolCall,
};
