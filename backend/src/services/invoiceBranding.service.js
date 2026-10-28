// ============================================================
// Invoice Branding Service
//
// সমস্যা: আগে PDF ও Email ইনভয়েসের হেডারে কোম্পানির নাম, ঠিকানা ও
// ইমেইল হার্ডকোড করা ছিল — তাই সব কোম্পানি/ডিস্টিবিউটরের ইনভয়েসে
// একই ঠিকানা যেত। পণ্যের ক্যাটাগরি/ব্র্যান্ডও ইনভয়েসে ছিল না।
//
// এখন: tenants টেবিল থেকে কোম্পানির তথ্য আর products + product_categories
// থেকে ক্যাটাগরি/ব্র্যান্ড এনে ইনভয়েসে বসানো হয়।
// ============================================================

const { query } = require('../config/db');
const logger = require('../config/logger');

// tenant সত্যিই খুঁজে না পেলে (পুরনো/ভাঙা ডেটা) আগের আচরণ বজায় রাখতে।
const LEGACY_COMPANY = {
    name:    'ZovoriX (Ltd.)',
    address: 'জানকি সিংহ রোড, বরিশাল সদর – ৮২০০',
    phone:   null,
    email:   'inf.novatechbd@gmail.com',
};

const clean = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
};

// sale / worker / customer / meta — যেটায় tenant_id পাওয়া যায় সেটা নেয়
const resolveTenantId = (sale, worker, customer, meta) =>
    (meta && meta.tenant_id) ||
    (sale && sale.tenant_id) ||
    (worker && worker.tenant_id) ||
    (customer && customer.tenant_id) ||
    null;

/**
 * ইনভয়েসের জন্য কোম্পানির তথ্য + প্রতিটি পণ্যের ক্যাটাগরি/ব্র্যান্ড আনে।
 * কখনো throw করে না — ব্যর্থ হলে ইনভয়েস যেন আটকে না যায়।
 *
 * @returns {{ company: {name,address,phone,email}, itemMeta: Object<string,{category,brand}> }}
 */
const loadInvoiceBranding = async ({ sale, worker, customer, items, meta } = {}) => {
    const result = { company: { ...LEGACY_COMPANY }, itemMeta: {} };

    try {
        const tenantId = resolveTenantId(sale, worker, customer, meta);

        if (tenantId) {
            const t = await query(
                `SELECT company_name, company_name_bn, company_address,
                        company_phone, company_email
                   FROM tenants WHERE id = $1`,
                [tenantId]
            );
            if (t.rows.length > 0) {
                const row = t.rows[0];
                // tenant পাওয়া গেলে শুধু তারই তথ্য — ফাঁকা ফিল্ডে অন্য কোম্পানির
                // ঠিকানা বসানো হয় না (এটাই মূল বাগ ছিল), ফাঁকা থাকলে লাইনটা বাদ।
                result.company = {
                    name:    clean(row.company_name) || clean(row.company_name_bn) || LEGACY_COMPANY.name,
                    address: clean(row.company_address),
                    phone:   clean(row.company_phone),
                    email:   clean(row.company_email),
                };
            }
        }

        const productIds = [...new Set(
            [...(items || []), ...((sale && sale.replacement_items) || [])]
                .map(i => i && i.product_id)
                .filter(Boolean)
        )];

        if (productIds.length > 0) {
            const params = [productIds];
            let tenantFilter = '';
            if (tenantId) {
                params.push(tenantId);
                tenantFilter = 'AND p.tenant_id = $2';
            }
            const p = await query(
                `SELECT p.id, p.brand,
                        COALESCE(c.name_bn, c.name) AS category_name
                   FROM products p
                   LEFT JOIN product_categories c ON c.id = p.category_id
                  WHERE p.id = ANY($1::uuid[]) ${tenantFilter}`,
                params
            );
            for (const r of p.rows) {
                result.itemMeta[r.id] = {
                    category: clean(r.category_name),
                    brand:    clean(r.brand),
                };
            }
        }
    } catch (err) {
        logger.warn(`⚠️ Invoice branding লোড ব্যর্থ — ডিফল্ট ব্যবহার হচ্ছে: ${err.message}`);
    }

    return result;
};

// "ক্যাটাগরি · ব্র্যান্ড" — যেটা আছে শুধু সেটাই
const itemSubtitle = (itemMeta, productId) => {
    const m = itemMeta && productId ? itemMeta[productId] : null;
    if (!m) return '';
    return [m.category, m.brand].filter(Boolean).join(' · ');
};

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = { loadInvoiceBranding, itemSubtitle, escapeHtml, LEGACY_COMPANY };
