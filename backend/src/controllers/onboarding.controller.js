/**
 * onboarding.controller.js — নতুন ফাইল
 * Copy করো: backend/src/controllers/onboarding.controller.js
 *
 * Public route — নতুন কোম্পানি (tenant) register করার জন্য
 * Route: POST /api/register (tenant middleware ছাড়া — দরকার নেই,
 * কারণ এটা নতুন tenant *তৈরি* করছে, কোনো existing tenant-এর data
 * access করছে না)
 *
 * ✅ Adapted: users টেবিলের actual column অনুযায়ী
 *   (name → name_bn/name_en, is_active → status='active', + join_date)
 * ✅ subdomain-based loginUrl বাদ দেওয়া হলো — এই app subdomain
 *   routing ব্যবহার করছে না। নতুন admin existing app/login screen-এ
 *   গিয়ে phone + password দিয়ে লগইন করবে (identifier লগইন globally
 *   unique phone/email/employee_code দিয়ে কাজ করে, tenant জানার
 *   দরকার নেই)।
 */

const bcrypt   = require('bcryptjs');
const { query } = require('../config/db');

// Slug valid কিনা চেক করো (company identifier, future branding/reporting-এ কাজে লাগবে)
const isValidSlug = (slug) => /^[a-z0-9-]{3,30}$/.test(slug);

// ─── নতুন Company Register ──────────────────────────────────
const registerCompany = async (req, res) => {
  const {
    company_name,
    company_name_bn,
    slug,            // company identifier, e.g. "acmebd"
    admin_name,
    admin_phone,
    admin_email,
    password,
  } = req.body;

  // Validation
  if (!company_name || !slug || !admin_phone || !password) {
    return res.status(400).json({
      success: false,
      message: 'company_name, slug, admin_phone, password আবশ্যক',
    });
  }

  if (!isValidSlug(slug)) {
    return res.status(400).json({
      success: false,
      message: 'Slug শুধু 3-30 character (lowercase letters, numbers, hyphen) হতে পারবে',
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password কমপক্ষে 6 character হতে হবে',
    });
  }

  try {
    // Slug আগে নেওয়া হয়েছে কিনা চেক
    const existingSlug = await query(`SELECT id FROM tenants WHERE slug = $1`, [slug]);
    if (existingSlug.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'এই Company ID (slug) আগেই ব্যবহার হয়েছে' });
    }

    // Phone আগে register হয়েছে কিনা (global — login phone/email/code দিয়ে হয়,
    // tenant জানা থাকে না, তাই এগুলো সব tenant-এ unique হতে হবে)
    const existingPhone = await query(`SELECT id FROM users WHERE phone = $1`, [admin_phone]);
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'এই Phone Number আগেই register করা আছে' });
    }

    if (admin_email) {
      const existingEmail = await query(`SELECT id FROM users WHERE email = $1`, [admin_email]);
      if (existingEmail.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'এই Email আগেই register করা আছে' });
      }
    }

    // ১. Tenant তৈরি (14-day trial)
    const tenantResult = await query(
      `INSERT INTO tenants
         (slug, company_name, company_name_bn, status, plan,
          trial_ends_at, max_employees, max_customers)
       VALUES ($1, $2, $3, 'trial', 'basic',
               NOW() + INTERVAL '14 days', 10, 200)
       RETURNING *`,
      [slug, company_name, company_name_bn || null]
    );
    const tenant = tenantResult.rows[0];

    // ২. Admin user তৈরি — users টেবিলের actual column অনুযায়ী
    const hashedPass = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users
         (tenant_id, role, name_bn, name_en, email, phone, password_hash, status, join_date)
       VALUES ($1, 'admin', $2, $3, $4, $5, $6, 'active', CURRENT_DATE)`,
      [
        tenant.id,
        admin_name || company_name,   // name_bn — null হতে পারবে না
        admin_name || null,           // name_en
        admin_email || null,
        admin_phone,
        hashedPass,
      ]
    );

    // ৩. Default system_settings copy (default tenant থেকে)
    await query(
      `INSERT INTO system_settings (tenant_id, key, value)
       SELECT $1, key, value FROM system_settings
       WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
       ON CONFLICT (tenant_id, key) DO NOTHING`,
      [tenant.id]
    );

    return res.status(201).json({
      success: true,
      message: '14 দিনের free trial শুরু হয়েছে! এখন App-এর login screen থেকে phone ও password দিয়ে লগইন করো।',
      data: {
        tenantId:  tenant.id,
        slug:      tenant.slug,
        trialEnds: tenant.trial_ends_at,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'এই তথ্য আগেই ব্যবহার হয়েছে (slug/phone/email)' });
    }
    console.error('[onboarding.registerCompany]', err);
    return res.status(500).json({ success: false, message: 'Server error — পরে আবার চেষ্টা করো।' });
  }
};

// ─── Slug available কিনা check ──────────────────────────────
const checkSlugAvailability = async (req, res) => {
  const { slug } = req.params;

  if (!isValidSlug(slug)) {
    return res.json({ available: false, reason: 'Invalid format' });
  }

  const result = await query(`SELECT id FROM tenants WHERE slug = $1`, [slug]);
  return res.json({ available: result.rows.length === 0 });
};

// ─── নিজের Tenant Info (Admin Settings-এ ব্যবহার হয়) ──────────
// GET /api/admin/tenant-info — auth + isAdmin (দেখো admin.routes.js)
// কাস্টমার সেলফ-রেজিস্ট্রেশন লিংক বানাতে slug লাগবে:
//   https://<app-domain>/customer-register/<slug>
const getMyTenant = async (req, res) => {
  try {
    const result = await query(
      `SELECT slug, company_name, company_name_bn FROM tenants WHERE id = $1`,
      [req.tenantId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tenant পাওয়া যায়নি।' });
    }
    return res.json({ success: true, ...result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
  }
};

module.exports = { registerCompany, checkSlugAvailability, getMyTenant };
