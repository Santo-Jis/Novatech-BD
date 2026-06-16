/**
 * superAdmin.controller.js — নতুন ফাইল
 * Copy করো: backend/src/controllers/superAdmin.controller.js
 *
 * Super Admin = তুমি নিজে। সব tenant manage করো।
 * Route prefix: /superadmin/api/...
 * আলাদা SUPER_ADMIN_SECRET_KEY দিয়ে protect করা (routes ফাইল দেখো)।
 *
 * ✅ Adapted: users টেবিলের actual column অনুযায়ী
 *   (name → name_bn/name_en, is_active → status='active' + join_date)
 */

const { query } = require('../config/db');
const bcrypt    = require('bcryptjs');
const { clearTenantCache } = require('../middlewares/tenantResolver');

// ─── সব Tenant দেখো ────────────────────────────────────────
const getAllTenants = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id)     AS employee_count,
        (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) AS customer_count
      FROM tenants t
      ORDER BY t.created_at DESC
    `);

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[superAdmin.getAllTenants]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── নতুন Tenant তৈরি করো (admin সরাসরি, trial ছাড়া) ───────
const createTenant = async (req, res) => {
  const {
    slug, company_name, company_name_bn,
    plan = 'basic', admin_phone, admin_name, admin_email, admin_password,
    max_employees = 10, max_customers = 200,
  } = req.body;

  if (!slug || !company_name || !admin_phone || !admin_password) {
    return res.status(400).json({ success: false, message: 'slug, company_name, admin_phone, admin_password আবশ্যক' });
  }

  try {
    // ১. Tenant তৈরি
    const tenantResult = await query(
      `INSERT INTO tenants (slug, company_name, company_name_bn, plan, max_employees, max_customers, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [slug, company_name, company_name_bn || null, plan, max_employees, max_customers]
    );
    const tenant = tenantResult.rows[0];

    // ২. First admin user তৈরি — users টেবিলের actual column অনুযায়ী
    const hashedPass = await bcrypt.hash(admin_password, 10);
    await query(
      `INSERT INTO users
         (tenant_id, role, name_bn, name_en, email, phone, password_hash, status, join_date)
       VALUES ($1, 'admin', $2, $3, $4, $5, $6, 'active', CURRENT_DATE)`,
      [
        tenant.id,
        admin_name || company_name,
        admin_name || null,
        admin_email || null,
        admin_phone,
        hashedPass,
      ]
    );

    // ৩. Default system_settings copy করো (default tenant থেকে)
    await query(
      `INSERT INTO system_settings (tenant_id, key, value)
       SELECT $1, key, value FROM system_settings
       WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
       ON CONFLICT (tenant_id, key) DO NOTHING`,
      [tenant.id]
    );

    // ৪. Log
    await query(
      `INSERT INTO tenant_subscription_logs (tenant_id, action, new_plan, notes)
       VALUES ($1, 'subscribed', $2, 'Created by super admin')`,
      [tenant.id, plan]
    );

    return res.status(201).json({
      success: true,
      message: `Tenant "${company_name}" created!`,
      data: { tenant },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Slug অথবা phone/email আগেই ব্যবহার হয়েছে' });
    }
    console.error('[superAdmin.createTenant]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Tenant status পরিবর্তন (active/suspended/cancelled/trial) ──
const updateTenantStatus = async (req, res) => {
  const { tenantId } = req.params;
  const { status, reason } = req.body;

  const valid = ['trial', 'active', 'suspended', 'cancelled'];
  if (!valid.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${valid.join(', ')}` });
  }

  try {
    await query(
      `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, tenantId]
    );

    await query(
      `INSERT INTO tenant_subscription_logs (tenant_id, action, notes)
       VALUES ($1, $2, $3)`,
      [tenantId, status === 'suspended' ? 'suspended' : 'status_changed', reason || null]
    );

    clearTenantCache();

    return res.json({ success: true, message: `Tenant status updated to ${status}` });
  } catch (err) {
    console.error('[superAdmin.updateTenantStatus]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Tenant plan পরিবর্তন ────────────────────────────────────
const updateTenantPlan = async (req, res) => {
  const { tenantId } = req.params;
  const { plan, max_employees, max_customers, ai_tokens_monthly } = req.body;

  const planDefaults = {
    basic:      { max_employees: 10,   max_customers: 200,   ai_tokens_monthly: 50000   },
    pro:        { max_employees: 50,   max_customers: 2000,  ai_tokens_monthly: 200000  },
    enterprise: { max_employees: 1000, max_customers: 50000, ai_tokens_monthly: 1000000 },
  };

  const defaults = planDefaults[plan] || planDefaults.basic;

  try {
    const before = await query(`SELECT plan FROM tenants WHERE id = $1`, [tenantId]);
    const oldPlan = before.rows[0]?.plan || null;

    await query(
      `UPDATE tenants SET
         plan = $1,
         max_employees = $2,
         max_customers = $3,
         ai_tokens_monthly = $4,
         subscription_ends_at = NOW() + INTERVAL '30 days',
         updated_at = NOW()
       WHERE id = $5`,
      [
        plan,
        max_employees     || defaults.max_employees,
        max_customers     || defaults.max_customers,
        ai_tokens_monthly || defaults.ai_tokens_monthly,
        tenantId,
      ]
    );

    await query(
      `INSERT INTO tenant_subscription_logs (tenant_id, action, old_plan, new_plan)
       VALUES ($1, 'upgraded', $2, $3)`,
      [tenantId, oldPlan, plan]
    );

    clearTenantCache();

    return res.json({ success: true, message: `Plan updated to ${plan}` });
  } catch (err) {
    console.error('[superAdmin.updateTenantPlan]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Tenant details (dashboard card) ───────────────────────
const getTenantDetails = async (req, res) => {
  const { tenantId } = req.params;

  try {
    const [tenantRes, statsRes] = await Promise.all([
      query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]),
      query(`
        SELECT
          (SELECT COUNT(*) FROM users       WHERE tenant_id = $1) AS employees,
          (SELECT COUNT(*) FROM customers   WHERE tenant_id = $1) AS customers,
          (SELECT COUNT(*) FROM sales_transactions WHERE tenant_id = $1) AS total_sales,
          (SELECT COALESCE(SUM(net_amount),0) FROM sales_transactions WHERE tenant_id = $1) AS total_revenue
      `, [tenantId]),
    ]);

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    return res.json({
      success: true,
      data: {
        tenant: tenantRes.rows[0],
        stats:  statsRes.rows[0],
      },
    });
  } catch (err) {
    console.error('[superAdmin.getTenantDetails]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Tenant delete (সাবধানে!) ────────────────────────────────
const deleteTenant = async (req, res) => {
  const { tenantId } = req.params;
  const { confirm } = req.body;

  if (confirm !== 'DELETE') {
    return res.status(400).json({ success: false, message: 'Confirm করতে { confirm: "DELETE" } পাঠাও' });
  }

  // Default tenant delete করা যাবে না
  if (tenantId === '00000000-0000-0000-0000-000000000001') {
    return res.status(403).json({ success: false, message: 'Default tenant ডিলিট করা যাবে না' });
  }

  try {
    // CASCADE delete হবে (সব related data চলে যাবে)
    await query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    clearTenantCache();
    return res.json({ success: true, message: 'Tenant and all data deleted' });
  } catch (err) {
    console.error('[superAdmin.deleteTenant]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllTenants,
  createTenant,
  updateTenantStatus,
  updateTenantPlan,
  getTenantDetails,
  deleteTenant,
};
