const { query } = require('../config/db');
const { calcFinalPrice } = require('./price.utils');

// ============================================================
// Customer AI Chat — Tool-Calling Service
// ✅ UPDATED (Session 20): Multi-company aggregate support
//
// আগে প্রতিটা tool শুধু req.portalUser.customer_id (একটা নির্দিষ্ট
// কোম্পানির customer row) দিয়ে ফিল্টার করত — অর্থাৎ রহিম যদি নোভাটেক
// বিডি + ঢাকা ট্রেডিং দুটোতেই কানেক্টেড থাকে, AI চ্যাট শুধু portalJWT-এ
// embedded বর্তমান কোম্পানিরই তথ্য জানত, অন্যটার কিছুই না।
//
// এখন প্রতিটা tool person_id দিয়ে সব কানেক্টেড কোম্পানি জুড়ে অ্যাগ্রিগেট
// করে, company ট্যাগসহ (01-Requirements-Spec.md ধারা ৩.১-এর একই নীতি,
// শুধু UI-এর বদলে এখানে AI-এর প্রাকৃতিক ভাষার উত্তরে কোম্পানি নাম উল্লেখ
// হয়)। controller personId resolve করে executeTool(toolName, personId)
// আকারে কল করে (আগে customerId পাঠাত)।
//
// নিরাপত্তার স্তর অপরিবর্তিত:
//   ১. প্রতিটি tool-এ person_id hardcoded — SQL-এ সরাসরি বাঁধা,
//      শুধুই ccc.status = 'connected' কোম্পানিগুলোর ডেটা আসে
//   ২. AI শুধু tool name বলে, query লেখে না
//   ৩. System prompt-এ সীমানা স্পষ্ট বলা আছে
//   ৪. Customer শুধু নিজের data দেখতে পায় — অন্য customer বা
//      SR-এর salary/commission/contact কিছুই না
//
// ✅ FIX (Session 20): get_product_catalog আগে ভাঙা ছিল — অস্তিত্বহীন
// কলাম ব্যবহার করছিল (price_per_unit, category — products টেবিলে এগুলো
// নেই, আসল কলাম: price, vat, tax) এবং কোনো tenant_id ফিল্টার ছাড়াই
// সব কোম্পানির পণ্য একসাথে দেখাচ্ছিল। এখন সঠিক কলাম + শুধু কানেক্টেড
// কোম্পানিগুলোর পণ্য, company ট্যাগসহ।
// ============================================================

// ── Tools: Customer শুধু এগুলোই call করতে পারবে ─────────────

const CUSTOMER_TOOLS = [
    {
        name: 'get_my_connected_companies',
        description: 'Customer কতগুলো কোম্পানির সাথে সংযুক্ত এবং কোন কোন কোম্পানি — তালিকা দাও',
    },
    {
        name: 'get_my_credit_status',
        description: 'Customer-এর বর্তমান বাকি (credit), credit limit, এবং পরিশোধযোগ্য পরিমাণ দেখাও (সব সংযুক্ত কোম্পানি জুড়ে)',
    },
    {
        name: 'get_my_recent_purchases',
        description: 'সাম্প্রতিক ক্রয়ের ইতিহাস — invoice নম্বর, পরিমাণ, তারিখ, SR-এর নাম, কোম্পানি (সব সংযুক্ত কোম্পানি জুড়ে)',
    },
    {
        name: 'get_my_payment_history',
        description: 'কাস্টমার কবে কবে কত টাকা পরিশোধ করেছে তার তালিকা (সব সংযুক্ত কোম্পানি জুড়ে)',
    },
    {
        name: 'get_my_monthly_summary',
        description: 'এই মাসে মোট ক্রয়, নগদ পরিশোধ, বাকি নেওয়া — প্রতিটি কোম্পানির জন্য আলাদা সংক্ষিপ্ত সারসংক্ষেপ',
    },
    {
        name: 'get_my_sr_and_manager_contact',
        description: 'Customer-এর প্রতিটি কোম্পানির assigned SR এবং Manager-এর নাম ও ফোন নম্বর — যোগাযোগের জন্য',
    },
    {
        name: 'get_my_order_requests',
        description: 'Customer-এর দেওয়া order request-গুলোর status (সব সংযুক্ত কোম্পানি জুড়ে)',
    },
    {
        name: 'get_product_catalog',
        description: 'সংযুক্ত কোম্পানিগুলোর পণ্য তালিকা এবং মূল্য (company ট্যাগসহ)',
    },
];

// ── Helper: person-এর সব "connected" কোম্পানির customer_id + tenant তথ্য ──
const getConnectedCompanies = async (personId) => {
    const result = await query(
        `SELECT c.id AS customer_id, t.id AS tenant_id,
                t.company_name, t.company_name_bn
         FROM customer_company_connections ccc
         JOIN customers c ON c.id = ccc.customer_id
         JOIN tenants t   ON t.id = ccc.tenant_id
         WHERE ccc.person_id = $1 AND ccc.status = 'connected'
         ORDER BY ccc.created_at ASC`,
        [personId]
    );
    return result.rows;
};

const coName = (row) => row.company_name_bn || row.company_name;

// ── Tool Executor — সবসময় person_id দিয়ে filter (সব কানেক্টেড কোম্পানি) ──

const executeTool = async (toolName, personId) => {
    // ⚠️ SECURITY: personId সবসময় req.portalUser.customer_id → getPersonId() থেকে আসে
    // AI বা user কখনো person_id পরিবর্তন করতে পারবে না

    switch (toolName) {

        case 'get_my_connected_companies': {
            const companies = await getConnectedCompanies(personId);
            if (companies.length === 0) return { error: 'কোনো কোম্পানির সাথে সংযোগ পাওয়া যায়নি।' };
            return {
                companies: companies.map(c => ({ name: coName(c) })),
                total: companies.length,
                summary: companies.length === 1
                    ? `আপনি শুধু "${coName(companies[0])}"-এর সাথে সংযুক্ত।`
                    : `আপনি মোট ${companies.length}টি কোম্পানির সাথে সংযুক্ত: ${companies.map(coName).join(', ')}।`,
            };
        }

        case 'get_my_credit_status': {
            const result = await query(
                `SELECT c.shop_name, c.owner_name,
                        COALESCE(c.current_credit, 0) AS current_credit,
                        COALESCE(c.credit_limit, 0)   AS credit_limit,
                        COALESCE(c.credit_balance, 0) AS credit_balance,
                        t.company_name, t.company_name_bn
                 FROM customer_company_connections ccc
                 JOIN customers c ON c.id = ccc.customer_id
                 JOIN tenants t   ON t.id = ccc.tenant_id
                 WHERE ccc.person_id = $1 AND ccc.status = 'connected'
                 ORDER BY ccc.created_at ASC`,
                [personId]
            );
            if (result.rows.length === 0) return { error: 'তথ্য পাওয়া যায়নি।' };

            const perCompany = result.rows.map(r => ({
                company:          coName(r),
                current_credit:   parseFloat(r.current_credit),
                credit_limit:     parseFloat(r.credit_limit),
                credit_balance:   parseFloat(r.credit_balance),
                available_credit: Math.max(0, parseFloat(r.credit_limit) - parseFloat(r.current_credit)),
            }));

            const summary = perCompany.length === 1
                ? `বর্তমান বাকি: ৳${perCompany[0].current_credit.toLocaleString()}, সীমা: ৳${perCompany[0].credit_limit.toLocaleString()}`
                : perCompany.map(p => `${p.company}: বাকি ৳${p.current_credit.toLocaleString()} (সীমা ৳${p.credit_limit.toLocaleString()})`).join('; ');

            return { companies: perCompany, summary };
        }

        case 'get_my_recent_purchases': {
            const result = await query(
                `SELECT st.invoice_number, st.total_amount,
                        COALESCE(st.net_amount, st.total_amount) AS net_amount,
                        st.cash_received, st.credit_used, st.payment_method,
                        TO_CHAR(st.created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS date,
                        u.name_bn AS sr_name,
                        t.company_name, t.company_name_bn
                 FROM sales_transactions st
                 JOIN customers c ON c.id = st.customer_id
                 JOIN tenants t   ON t.id = c.tenant_id
                 JOIN users u     ON st.worker_id = u.id
                 WHERE c.person_id = $1
                   AND st.otp_verified = true
                 ORDER BY st.created_at DESC
                 LIMIT 10`,
                [personId]
            );
            const purchases = result.rows.map(r => ({ ...r, company: coName(r) }));
            return {
                purchases,
                total_count: purchases.length,
                summary: `সাম্প্রতিক ${purchases.length}টি ক্রয়` + (
                    new Set(purchases.map(p => p.company)).size > 1
                        ? ' (একাধিক কোম্পানি থেকে)' : ''
                ),
            };
        }

        case 'get_my_payment_history': {
            const result = await query(
                `SELECT cp.amount, cp.notes,
                        TO_CHAR(cp.created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS date,
                        u.name_bn AS collected_by,
                        t.company_name, t.company_name_bn
                 FROM credit_payments cp
                 JOIN customers c ON c.id = cp.customer_id
                 JOIN tenants t   ON t.id = c.tenant_id
                 JOIN users u     ON cp.worker_id = u.id
                 WHERE c.person_id = $1
                 ORDER BY cp.created_at DESC
                 LIMIT 15`,
                [personId]
            );
            const payments = result.rows.map(r => ({ ...r, company: coName(r) }));
            const total = payments.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
            return {
                payments,
                total_paid: total,
                summary: `মোট ${payments.length}টি পেমেন্ট, মোট ৳${total.toLocaleString()} পরিশোধিত`,
            };
        }

        case 'get_my_monthly_summary': {
            const result = await query(
                `SELECT COUNT(*)                        AS total_invoices,
                        COALESCE(SUM(st.net_amount), 0)  AS total_purchase,
                        COALESCE(SUM(st.cash_received),0) AS total_cash,
                        COALESCE(SUM(st.credit_used), 0) AS total_credit,
                        t.company_name, t.company_name_bn,
                        TO_CHAR(NOW() AT TIME ZONE 'Asia/Dhaka', 'Month YYYY') AS month_name
                 FROM sales_transactions st
                 JOIN customers c ON c.id = st.customer_id
                 JOIN tenants t   ON t.id = c.tenant_id
                 WHERE c.person_id = $1
                   AND st.otp_verified = true
                   AND EXTRACT(MONTH FROM st.created_at) = EXTRACT(MONTH FROM NOW())
                   AND EXTRACT(YEAR  FROM st.created_at) = EXTRACT(YEAR  FROM NOW())
                 GROUP BY t.id, t.company_name, t.company_name_bn`,
                [personId]
            );

            if (result.rows.length === 0) {
                return { summary: 'এই মাসে এখনো কোনো ক্রয় নেই।', companies: [] };
            }

            const monthName = result.rows[0].month_name?.trim();
            const perCompany = result.rows.map(r => ({
                company:        coName(r),
                total_invoices: parseInt(r.total_invoices),
                total_purchase: parseFloat(r.total_purchase),
                total_cash:     parseFloat(r.total_cash),
                total_credit:   parseFloat(r.total_credit),
            }));

            const summary = perCompany.length === 1
                ? `${monthName}: ${perCompany[0].total_invoices}টি ক্রয়, মোট ৳${perCompany[0].total_purchase.toLocaleString()}`
                : `${monthName}: ` + perCompany.map(p => `${p.company}-এ ${p.total_invoices}টি ক্রয় (৳${p.total_purchase.toLocaleString()})`).join('; ');

            return { month: monthName, companies: perCompany, summary };
        }

        case 'get_my_sr_and_manager_contact': {
            // ⚠️ SECURITY: শুধু name + phone — salary/commission কিছুই না
            const result = await query(
                `SELECT u.name_bn AS sr_name, u.phone AS sr_phone,
                        m.name_bn AS manager_name, m.phone AS manager_phone,
                        t.company_name, t.company_name_bn
                 FROM customer_assignments ca
                 JOIN customers c ON c.id = ca.customer_id
                 JOIN tenants t   ON t.id = c.tenant_id
                 JOIN users u     ON ca.worker_id = u.id
                 LEFT JOIN users m ON u.manager_id = m.id
                 WHERE c.person_id = $1 AND ca.is_active = true`,
                [personId]
            );
            if (result.rows.length === 0) {
                return { message: 'SR তথ্য পাওয়া যায়নি। Admin-এর সাথে যোগাযোগ করুন।' };
            }

            const contacts = result.rows.map(r => ({
                company: coName(r),
                sr:      { name: r.sr_name, phone: r.sr_phone || 'তথ্য নেই' },
                manager: r.manager_name ? { name: r.manager_name, phone: r.manager_phone || 'তথ্য নেই' } : null,
            }));

            const summary = contacts.length === 1
                ? `SR: ${contacts[0].sr.name} (${contacts[0].sr.phone})`
                : contacts.map(c => `${c.company} — SR: ${c.sr.name} (${c.sr.phone})`).join('; ');

            return { contacts, summary };
        }

        case 'get_my_order_requests': {
            const result = await query(
                `SELECT cor.id, cor.status, cor.note,
                        TO_CHAR(cor.created_at AT TIME ZONE 'Asia/Dhaka', 'DD Mon YYYY') AS date,
                        t.company_name, t.company_name_bn,
                        COALESCE(
                            json_agg(
                                json_build_object('product', p.name, 'quantity', cori.quantity)
                            ) FILTER (WHERE p.id IS NOT NULL),
                            '[]'
                        ) AS items
                 FROM customer_order_requests cor
                 JOIN customers c ON c.id = cor.customer_id
                 JOIN tenants t   ON t.id = c.tenant_id
                 LEFT JOIN customer_order_request_items cori ON cori.request_id = cor.id
                 LEFT JOIN products p ON cori.product_id = p.id
                 WHERE c.person_id = $1
                 GROUP BY cor.id, cor.status, cor.note, cor.created_at, t.id, t.company_name, t.company_name_bn
                 ORDER BY cor.created_at DESC
                 LIMIT 10`,
                [personId]
            );
            const orders = result.rows.map(r => ({ ...r, company: coName(r) }));
            return {
                orders,
                total_count: orders.length,
                summary: `${orders.length}টি অর্ডার রিকোয়েস্ট`,
            };
        }

        case 'get_product_catalog': {
            // ✅ FIX (Session 20): সঠিক কলাম (price, vat, tax — আগে price_per_unit/
            // category ব্যবহার হতো যা products টেবিলে নেই) + শুধু কানেক্টেড
            // কোম্পানিগুলোর পণ্য (আগে tenant_id ফিল্টার ছিলই না — সব কোম্পানির
            // পণ্য দেখা যেত)
            const companies = await getConnectedCompanies(personId);
            if (companies.length === 0) return { error: 'কোনো কোম্পানির সাথে সংযোগ পাওয়া যায়নি।' };

            const tenantIds = companies.map(c => c.tenant_id);
            const tenantNameMap = {};
            companies.forEach(c => { tenantNameMap[c.tenant_id] = coName(c); });

            const result = await query(
                `SELECT name, unit, price, vat, tax, tenant_id
                 FROM products
                 WHERE is_active = true
                   AND tenant_id = ANY($1)
                 ORDER BY name
                 LIMIT 50`,
                [tenantIds]
            );

            const products = result.rows.map(p => {
                const { finalPrice } = calcFinalPrice(p.price, p.vat, p.tax);
                return {
                    name:  p.name,
                    unit:  p.unit,
                    price: finalPrice,
                    company: tenantNameMap[p.tenant_id],
                };
            });

            return {
                products,
                total: products.length,
                summary: `${products.length}টি পণ্য পাওয়া গেছে` + (companies.length > 1 ? ' (আপনার সংযুক্ত কোম্পানিগুলো থেকে)' : ''),
            };
        }

        default:
            return { error: `অজানা tool: ${toolName}` };
    }
};

// ── System Prompt builder ─────────────────────────────────────
// ✅ UPDATED (Session 20): multi-company context যোগ হয়েছে, যাতে AI
// একাধিক কোম্পানির উত্তর মিশিয়ে না ফেলে, company নাম উল্লেখ করে

const buildSystemPrompt = (customerInfo, companies = []) => {
    const today = new Date().toLocaleDateString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric', month: 'long', day: 'numeric'
    });

    const companyNames = companies.map(coName);
    const companyContext = companyNames.length > 1
        ? `Customer একাধিক কোম্পানির সাথে সংযুক্ত: ${companyNames.join(', ')}। কোনো তথ্য একাধিক কোম্পানি থেকে আসলে, উত্তরে কোন তথ্যটা কোন কোম্পানির তা স্পষ্টভাবে উল্লেখ করবে — একসাথে মিশিয়ে ফেলবে না।`
        : `Customer "${companyNames[0] || customerInfo.shop_name}"-এর সাথে সংযুক্ত।`;

    return `তুমি ZovoriX-র Customer Support AI।
তুমি "${customerInfo.shop_name}" (${customerInfo.owner_name})-এর ব্যক্তিগত সহকারী।

আজকের তারিখ: ${today}
${companyContext}

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
✅ আমি কয়টা কোম্পানির সাথে সংযুক্ত? → get_my_connected_companies
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
    getConnectedCompanies,
};
