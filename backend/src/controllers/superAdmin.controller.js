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

// ✅ Phase 2 (Security Hardening, 19 July 2026): Audit logging।
// "Novatech BD - Support Role & Panel" প্রজেক্টের বানানো
// platform_audit_log টেবিল পুনঃব্যবহার করা হচ্ছে (নতুন টেবিল না,
// coordinate করেই এই সিদ্ধান্ত — দেখো Technical Architecture Doc §২)।
// staff_id = null, staff_email = 'super-admin-key' — placeholder,
// যতক্ষণ না key-based auth individual platform_staff login-এ migrate হয়।
// লগ ব্যর্থ হলেও মূল action (tenant create/suspend/delete) যেন আটকে না
// যায় সেজন্য try/catch দিয়ে wrap করা (fail-open, শুধু console এ warn)।
const logAudit = async (req, action, targetId, details) => {
  try {
    await query(
      `INSERT INTO platform_audit_log (staff_id, staff_email, action, target_type, target_id, details, ip_address)
       VALUES (NULL, 'super-admin-key', $1, 'tenant', $2, $3, $4)`,
      [action, targetId, JSON.stringify(details || {}), req.ip || null]
    );
  } catch (err) {
    console.error('[superAdmin.logAudit] audit log ব্যর্থ (মূল action অব্যাহত):', err.message);
  }
};

// ─── সব Tenant দেখো (✅ Phase 3 TICKET-05: pagination + search) ──
const getAllTenants = async (req, res) => {
  try {
    // page/limit — ইউজার ভুল/malicious value দিলেও safe default-এ পড়ে
    let page  = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(page)  || page  < 1) page  = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100; // অতিরিক্ত বড় limit দিয়ে DB-তে চাপ দেওয়া রোধ

    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();

    const conditions = [];
    const params     = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(t.slug ILIKE $${params.length} OR t.company_name ILIKE $${params.length} OR t.company_name_bn ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM tenants t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    params.push(limit);
    params.push(offset);
    const result = await query(`
      SELECT
        t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id)     AS employee_count,
        (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) AS customer_count
      FROM tenants t
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page, limit, total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
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

    // ৫. Audit log (Phase 2)
    await logAudit(req, 'tenant.create', tenant.id, { slug, company_name, plan });

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
    const before = await query(`SELECT status FROM tenants WHERE id = $1`, [tenantId]);
    const oldStatus = before.rows[0]?.status || null;

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

    // Audit log (Phase 2) — reason সহ, কেন suspend/cancel করা হলো সেটা ধরা থাকে
    await logAudit(req, 'tenant.status_change', tenantId, { old_status: oldStatus, new_status: status, reason: reason || null });

    return res.json({ success: true, message: `Tenant status updated to ${status}` });
  } catch (err) {
    console.error('[superAdmin.updateTenantStatus]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Tenant plan পরিবর্তন ────────────────────────────────────
const updateTenantPlan = async (req, res) => {
  const { tenantId } = req.params;
  const { plan, max_employees, max_customers, ai_tokens_monthly, payment_reference, force_no_payment } = req.body;

  // ✅ Phase 3 TICKET-07: blind ৩০-দিন extension বন্ধ — হয় payment_reference
  // দিতে হবে, নাহলে সচেতনভাবে force_no_payment:true (যেমন: বিনামূল্যে upgrade/
  // discount দেওয়ার সিদ্ধান্ত) পাঠাতে হবে। কোনোটাই না দিলে 400।
  if (!payment_reference && force_no_payment !== true) {
    return res.status(400).json({
      success: false,
      message: 'payment_reference দিন, অথবা সচেতনভাবে বিনামূল্যে extend করতে চাইলে force_no_payment: true পাঠান',
    });
  }
  const paymentCheck = payment_reference
    ? await verifyPlanPayment(payment_reference)
    : { verified: false, reason: 'force_no_payment override — payment_reference দেওয়া হয়নি' };

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

    // Audit log (Phase 2) + payment verification result (Phase 3 TICKET-07)
    await logAudit(req, 'tenant.plan_change', tenantId, {
      old_plan: oldPlan,
      new_plan: plan,
      max_employees: max_employees || defaults.max_employees,
      max_customers: max_customers || defaults.max_customers,
      ai_tokens_monthly: ai_tokens_monthly || defaults.ai_tokens_monthly,
      payment_reference: payment_reference || null,
      payment_verified: paymentCheck.verified,
      payment_verification_note: paymentCheck.reason,
    });

    return res.json({
      success: true,
      message: `Plan updated to ${plan}`,
      payment_verification: paymentCheck,
    });
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
    // Delete-এর আগে snapshot নেওয়া — row চলে গেলেও audit log-এ কী ডিলিট হলো সেটা থাকবে
    const before = await query(`SELECT slug, company_name, plan, status FROM tenants WHERE id = $1`, [tenantId]);
    const tenantSnapshot = before.rows[0] || null;

    // CASCADE delete হবে (সব related data চলে যাবে)
    await query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    clearTenantCache();

    // Audit log (Phase 2) — response পাঠানোর আগে synchronously commit,
    // যাতে delete হয়ে গেলেও log commit না হওয়ার race condition না ঘটে
    await logAudit(req, 'tenant.delete', tenantId, tenantSnapshot);

    return res.json({ success: true, message: 'Tenant and all data deleted' });
  } catch (err) {
    console.error('[superAdmin.deleteTenant]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Phase 3 TICKET-06: Tenant admin password reset ──────────
// Direct email/SMS পাঠানোর infra এই ফাইলে নেই বলে (existing forgot-password
// flow user নিজে ট্রিগার করে, এখানে super admin অন্য কারো হয়ে করছে),
// একটা নিরাপদ, সাময়িক random password জেনারেট করে দেওয়া হচ্ছে —
// super admin সেটা তারপর client-কে (ফোন/হোয়াটসঅ্যাপে) জানাবে,
// client প্রথম লগইনের পরই normal change-password ফিচার দিয়ে বদলে নেবে।
const crypto = require('crypto');

const resetTenantAdminPassword = async (req, res) => {
  const { tenantId } = req.params;
  const { admin_email } = req.body; // একাধিক admin থাকলে নির্দিষ্ট করে দিতে পারবে, না দিলে প্রথম active admin

  try {
    const tenantCheck = await query(`SELECT id, company_name FROM tenants WHERE id = $1`, [tenantId]);
    if (tenantCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tenant পাওয়া যায়নি' });
    }

    const params = admin_email
      ? [tenantId, admin_email]
      : [tenantId];

    const adminQuery = admin_email
      ? `SELECT id, name_bn, email, phone FROM users WHERE tenant_id = $1 AND email = $2 AND role = 'admin' AND status = 'active' LIMIT 1`
      : `SELECT id, name_bn, email, phone FROM users WHERE tenant_id = $1 AND role = 'admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1`;

    const adminResult = await query(adminQuery, params);
    if (adminResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'এই tenant-এ কোনো active admin ইউজার পাওয়া যায়নি' });
    }
    const admin = adminResult.rows[0];

    // ১২-ক্যারেক্টার cryptographically-random সাময়িক পাসওয়ার্ড
    const tempPassword = crypto.randomBytes(16).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
    const hashedPass   = await bcrypt.hash(tempPassword, 10);

    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hashedPass, admin.id]);

    // Audit log — পাসওয়ার্ড নিজেই log-এ যাবে না, শুধু কার জন্য reset হলো সেটা
    await logAudit(req, 'tenant.admin_password_reset', tenantId, { admin_user_id: admin.id, admin_email: admin.email });

    return res.json({
      success: true,
      message: 'সাময়িক পাসওয়ার্ড তৈরি হয়েছে — client-কে জানিয়ে দিন, প্রথম লগইনের পরই এটা বদলে ফেলার পরামর্শ দিন',
      data: {
        admin_name:     admin.name_bn,
        admin_email:    admin.email,
        admin_phone:    admin.phone,
        temp_password:  tempPassword, // ⚠️ শুধু এই একবারই response-এ আসবে, DB-তে plaintext সংরক্ষণ হয় না
      },
    });
  } catch (err) {
    console.error('[superAdmin.resetTenantAdminPassword]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Phase 3 TICKET-07: Plan-upgrade payment verification hook ──
// আসল payment gateway integration আলাদা প্রজেক্ট — এখানে শুধু একটা
// verification placeholder, যাতে blind ৩০-দিন extension বন্ধ হয় এবং
// অন্তত manual verification ট্র্যাক করা যায়।
const verifyPlanPayment = async (paymentReference) => {
  if (!paymentReference || typeof paymentReference !== 'string' || paymentReference.trim().length < 4) {
    return { verified: false, reason: 'payment_reference missing/invalid — manual verification প্রয়োজন' };
  }
  // TODO: আসল payment gateway (bKash/Nagad/Stripe ইত্যাদি) API দিয়ে যাচাই এখানে বসবে
  return { verified: true, reason: 'placeholder — manual verification assumed OK, real gateway যুক্ত হলে বদলাবে' };
};

// ============================================================
// ✅ Phase 4 (Super Admin Frontend follow-up): Dashboard aggregate stats
// — একটামাত্র query, tenant সংখ্যা যতই বাড়ুক না কেন cost একই থাকে।
// আগে Dashboard.jsx client-side এ limit=100 টেন্যান্ট টেনে aggregate
// করত, যেটা ১০০+ টেন্যান্ট হলে ভুল সংখ্যা দেখাত — এই endpoint সেটা
// প্রতিস্থাপন করে।
// ============================================================
const getDashboardStats = async (req, res) => {
  try {
    const [tenantStats, usageStats] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                     AS total_tenants,
          COUNT(*) FILTER (WHERE status = 'active')    AS active,
          COUNT(*) FILTER (WHERE status = 'trial')     AS trial,
          COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
        FROM tenants
      `),
      query(`
        SELECT
          (SELECT COUNT(*) FROM users)              AS total_employees,
          (SELECT COUNT(*) FROM customers)          AS total_customers,
          (SELECT COUNT(*) FROM sales_transactions) AS total_sales,
          (SELECT COALESCE(SUM(net_amount), 0) FROM sales_transactions) AS total_revenue
      `),
    ]);

    return res.json({
      success: true,
      data: { ...tenantStats.rows[0], ...usageStats.rows[0] },
    });
  } catch (err) {
    console.error('[superAdmin.getDashboardStats]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================================
// ✅ Phase 4: প্ল্যাটফর্ম-ওয়াইড Audit Log viewer
// platform_audit_log-এ platform_staff (Support Panel) আর super-admin
// (staff_email='super-admin-key') দুই ধরনের action-ই একসাথে থাকে —
// এই endpoint দুটোই একসাথে দেখায়, filter দিয়ে আলাদা করা যায়।
// ============================================================
const getAuditLog = async (req, res) => {
  try {
    let page  = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(page)  || page  < 1) page  = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 30;
    if (limit > 100) limit = 100;
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (req.query.action) {
      params.push(`%${req.query.action.trim()}%`);
      conditions.push(`action ILIKE $${params.length}`);
    }
    if (req.query.staff_email) {
      params.push(`%${req.query.staff_email.trim()}%`);
      conditions.push(`staff_email ILIKE $${params.length}`);
    }
    if (req.query.target_type) {
      params.push(req.query.target_type.trim());
      conditions.push(`target_type = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) AS total FROM platform_audit_log ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total, 10);

    params.push(limit);
    params.push(offset);
    const result = await query(`
      SELECT id, staff_id, staff_email, action, target_type, target_id, details, ip_address, created_at
      FROM platform_audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    console.error('[superAdmin.getAuditLog]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================================
// ✅ Phase 4: Platform Staff (Support Panel-এর মানুষ) ম্যানেজমেন্ট।
// ⚠️ এটা tenant-এর নিজস্ব ইউজার/কাস্টমার থেকে সম্পূর্ণ আলাদা বিষয় —
// প্ল্যাটফর্মের নিজস্ব সাপোর্ট স্টাফ অ্যাকাউন্ট, platform_staff টেবিলে
// কোনো self-registration নেই, তাই এদের তৈরি/পরিবর্তনের একমাত্র বৈধ
// জায়গা এটাই (Super Admin)। Tenant-এর ভেতরের user/customer কখনোই এখান
// থেকে touch করা হয় না।
// ============================================================
const VALID_STAFF_SCOPES = ['full', 'support'];

const getAllStaff = async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, email, scope, status, last_login_at, created_at
      FROM platform_staff
      ORDER BY created_at DESC
    `);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[superAdmin.getAllStaff]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createStaff = async (req, res) => {
  try {
    const { name, email, password, scope } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email, password আবশ্যক' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'পাসওয়ার্ড কমপক্ষে ৮ ক্যারেক্টার হতে হবে' });
    }
    const finalScope = VALID_STAFF_SCOPES.includes(scope) ? scope : 'support';

    const existing = await query(`SELECT id FROM platform_staff WHERE email = $1`, [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'এই email দিয়ে আগেই একটা স্টাফ অ্যাকাউন্ট আছে' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(`
      INSERT INTO platform_staff (name, email, password_hash, scope, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING id, name, email, scope, status, created_at
    `, [name, email, passwordHash, finalScope]);

    await logAudit(req, 'staff.create', result.rows[0].id, { name, email, scope: finalScope });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'এই email দিয়ে আগেই একটা স্টাফ অ্যাকাউন্ট আছে' });
    }
    console.error('[superAdmin.createStaff]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { name, scope, status } = req.body;

    if (scope && !VALID_STAFF_SCOPES.includes(scope)) {
      return res.status(400).json({ success: false, message: `scope অবশ্যই এইগুলোর একটা হতে হবে: ${VALID_STAFF_SCOPES.join(', ')}` });
    }
    if (status && !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status অবশ্যই active বা suspended হতে হবে' });
    }
    if (!name && !scope && !status) {
      return res.status(400).json({ success: false, message: 'name, scope, বা status — অন্তত একটা দিন' });
    }

    const existing = await query(`SELECT id, name, scope, status FROM platform_staff WHERE id = $1`, [staffId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'স্টাফ পাওয়া যায়নি' });
    }
    const before = existing.rows[0];

    const result = await query(`
      UPDATE platform_staff
      SET name = $1, scope = $2, status = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, name, email, scope, status, updated_at
    `, [name || before.name, scope || before.scope, status || before.status, staffId]);

    await logAudit(req, 'staff.update', staffId, { before, after: result.rows[0] });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[superAdmin.updateStaff]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const resetStaffPassword = async (req, res) => {
  try {
    const { staffId } = req.params;
    const existing = await query(`SELECT id, name, email FROM platform_staff WHERE id = $1`, [staffId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'স্টাফ পাওয়া যায়নি' });
    }
    const staff = existing.rows[0];

    // resetTenantAdminPassword-এ ধরা পড়া bug-fix pattern পুনঃব্যবহার:
    // বেশি বাইট নিয়ে strip-এর পরও ঠিক ১২ ক্যারেক্টার নিশ্চিত করা।
    const tempPassword = crypto.randomBytes(16).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await query(`UPDATE platform_staff SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, staffId]);
    await logAudit(req, 'staff.reset_password', staffId, { staff_email: staff.email }); // প্লেইনটেক্সট পাসওয়ার্ড কখনো লগ হয় না

    return res.json({
      success: true,
      data: { staff_name: staff.name, staff_email: staff.email, temp_password: tempPassword },
    });
  } catch (err) {
    console.error('[superAdmin.resetStaffPassword]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================================
// ✅ Phase 4: Tenant System Settings (view/edit)
// ⚠️ ইচ্ছাকৃতভাবে "company" গ্রুপ (company_name/address/phone/email)
// বাদ দেওয়া হয়েছে — এগুলো tenant-এর নিজস্ব ব্যবসায়িক পরিচয়/যোগাযোগ
// তথ্য, শুধু তাদের নিজের local admin panel থেকেই বদলানো উচিত।
// বাকি অপারেশনাল সেটিংস (attendance/expense/credit/sales/vat/notice/sms)
// support প্রয়োজনে Super Admin থেকে বদলানো যুক্তিসঙ্গত।
// ============================================================
const SETTINGS_EXCLUDED_KEYS = ['company_name', 'company_address', 'company_phone', 'company_email'];
const SETTINGS_MASKED_KEYS   = ['sms_api_key'];

const getTenantSettings = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenantCheck = await query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
    if (tenantCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tenant পাওয়া যায়নি' });
    }

    const result = await query(
      `SELECT id, key, value, description, updated_at FROM system_settings WHERE tenant_id = $1 ORDER BY key`,
      [tenantId]
    );

    const data = result.rows
      .filter((s) => !SETTINGS_EXCLUDED_KEYS.includes(s.key))
      .map((s) => ({
        ...s,
        value: SETTINGS_MASKED_KEYS.includes(s.key) && s.value ? s.value.slice(0, 4) + '****' : s.value,
      }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[superAdmin.getTenantSettings]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateTenantSettings = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { settings } = req.body;

    if (!settings || !Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ success: false, message: 'settings array দিন: [{key, value}]' });
    }

    const blocked = settings.filter((s) => SETTINGS_EXCLUDED_KEYS.includes(s.key));
    if (blocked.length > 0) {
      return res.status(403).json({
        success: false,
        message: `কোম্পানির তথ্য (${blocked.map((b) => b.key).join(', ')}) Super Admin থেকে বদলানো যাবে না — এটা tenant-এর নিজস্ব admin panel থেকে করতে হবে।`,
      });
    }

    const tenantCheck = await query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
    if (tenantCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tenant পাওয়া যায়নি' });
    }

    for (const s of settings) {
      if (!s.key || s.value === undefined) continue;
      await query(
        `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE tenant_id = $2 AND key = $3`,
        [String(s.value), tenantId, s.key]
      );
    }

    await logAudit(req, 'tenant.settings_update', tenantId, {
      settings: settings.map((s) => ({ key: s.key, value: SETTINGS_MASKED_KEYS.includes(s.key) ? '***' : s.value })),
    });

    return res.json({ success: true, message: 'সেটিংস আপডেট হয়েছে' });
  } catch (err) {
    console.error('[superAdmin.updateTenantSettings]', err);
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
  resetTenantAdminPassword,
  verifyPlanPayment,
  getDashboardStats,
  getAuditLog,
  getAllStaff,
  createStaff,
  updateStaff,
  resetStaffPassword,
  getTenantSettings,
  updateTenantSettings,
};
