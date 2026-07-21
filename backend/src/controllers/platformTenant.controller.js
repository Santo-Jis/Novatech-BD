/**
 * platformTenant.controller.js — নতুন ফাইল
 * Copy করো: backend/src/controllers/platformTenant.controller.js
 *
 * ✅ Support Role & Panel — TICKET-04 (partial): platform_staff login
 * (scope: full/support) দিয়ে Tenant List/Detail READ অ্যাক্সেস।
 *
 * ⚠️ ইচ্ছাকৃতভাবে শুধু READ-ONLY (GET) — create/status/plan/delete
 * এখনো superAdmin.routes.js-এই থাকছে (X-Super-Admin-Key), এই ফাইল
 * সেগুলোকে প্রতিস্থাপন করে না, ডুপ্লিকেটও করে না।
 *
 * Security Doc §২ অনুযায়ী: 'support' scope billing ফিল্ড (billing_email,
 * billing_name) দেখতে পারবে না — serializer দিয়ে filter করা হয়েছে।
 * 'full' scope সব ফিল্ড দেখে।
 */

const { query } = require('../config/db');

const BILLING_FIELDS = ['billing_email', 'billing_name'];

// scope অনুযায়ী billing ফিল্ড বাদ দিয়ে সেফ অবজেক্ট বানায়
const serializeTenant = (tenant, scope) => {
  if (!tenant) return tenant;
  if (scope === 'full') return tenant;

  const safe = { ...tenant };
  for (const field of BILLING_FIELDS) delete safe[field];
  return safe;
};

// ─── সব Tenant দেখো (pagination + search + status filter) ───
const listTenants = async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(t.slug ILIKE $${params.length} OR t.company_name ILIKE $${params.length} OR t.company_name_bn ILIKE $${params.length})`
      );
    }
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) AS total FROM tenants t ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    params.push(limit);
    params.push(offset);
    const result = await query(
      `
      SELECT
        t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id)     AS employee_count,
        (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) AS customer_count
      FROM tenants t
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    const scope = req.platformStaff.scope;
    const data = result.rows.map((t) => serializeTenant(t, scope));

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error('[platformTenant.listTenants]', err);
    return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
  }
};

// ─── Tenant Detail (stats সহ) ─────────────────────────────────
const getTenantDetail = async (req, res) => {
  const { tenantId } = req.params;

  try {
    const [tenantRes, statsRes] = await Promise.all([
      query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]),
      query(
        `
        SELECT
          (SELECT COUNT(*) FROM users       WHERE tenant_id = $1) AS employees,
          (SELECT COUNT(*) FROM customers   WHERE tenant_id = $1) AS customers,
          (SELECT COUNT(*) FROM sales_transactions WHERE tenant_id = $1) AS total_sales,
          (SELECT COALESCE(SUM(net_amount),0) FROM sales_transactions WHERE tenant_id = $1) AS total_revenue
        `,
        [tenantId]
      ),
    ]);

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tenant পাওয়া যায়নি।' });
    }

    const scope = req.platformStaff.scope;

    return res.json({
      success: true,
      data: {
        tenant: serializeTenant(tenantRes.rows[0], scope),
        stats: statsRes.rows[0],
      },
    });
  } catch (err) {
    console.error('[platformTenant.getTenantDetail]', err);
    return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
  }
};

module.exports = { listTenants, getTenantDetail };
