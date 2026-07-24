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
const { query, withTransaction } = require('../config/db');

// Slug valid কিনা চেক করো (company identifier, future branding/reporting-এ কাজে লাগবে)
const isValidSlug = (slug) => /^[a-z0-9-]{3,30}$/.test(slug);

// ─── Per-seat rate (৳/মাস) — NovaTechBD_Pricing_Policy.docx সংস্করণ ১.০ ───
// ⚠️ Draft/internal নীতিমালা — বাজার-যাচাই সাপেক্ষে বদলাতে পারে (docx §১০)।
//    বদলালে frontend/src/constants/pricing.js-ও একসাথে আপডেট করতে হবে,
//    কারণ দুই জায়গায় আলাদাভাবে রাখা আছে (ভবিষ্যতে একটা shared config/API
//    এন্ডপয়েন্ট দিয়ে একীভূত করা উচিত)।
const SEAT_RATES = {
  admin:        1699,
  manager:      1299,
  worker:       899,   // SR
  shop_keeper:  799,   // এখনো live না (roleCheck.js-এ নেই) — সিট বুক করা যায়, ব্যবহার এখনো না
  stock_keeper: 499,   // এখনো live না
};

// এখনো ফিচার-হিসেবে বাস্তবায়িত হয়নি এমন role — client যাই পাঠাক, backend জোর করে ০
const NOT_YET_LIVE_ROLES = ['shop_keeper', 'stock_keeper'];

const MAX_SEATS_PER_ROLE = 50; // ট্রায়াল সাইনআপে reasonable ceiling — এর বেশি হলে sales-এর সাথে কথা বলা উচিত

// ইনকামিং seats object normalize + validate করো
// ইনপুট: { manager: 1, worker: 4, shop_keeper: 2, stock_keeper: 2 } (admin বাদে, কারণ admin সবসময় ১ — যে সাইনআপ করছে সে নিজেই)
// আউটপুট: প্রতিটা role-এর জন্য একটা safe non-negative integer, cap সহ, not-yet-live role জোর করে ০
const normalizeSeats = (seatsInput = {}) => {
  const normalized = {};
  for (const role of Object.keys(SEAT_RATES)) {
    if (role === 'admin') continue; // admin আলাদাভাবে হ্যান্ডেল হয়, নিচে দেখো
    if (NOT_YET_LIVE_ROLES.includes(role)) {
      normalized[role] = 0; // ফিচার রেডি না হওয়া পর্যন্ত জোর করে ০, client override করতে পারবে না
      continue;
    }
    const raw = Number(seatsInput?.[role]);
    const safe = Number.isFinite(raw) ? Math.trunc(raw) : 0;
    normalized[role] = Math.min(Math.max(safe, 0), MAX_SEATS_PER_ROLE);
  }
  return normalized;
};

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
    seats,           // { manager, worker, shop_keeper, stock_keeper } — ঐচ্ছিক, না দিলে সব ০ ধরা হয় (শুধু admin seat = ১)
  } = req.body;

  const normalizedSeats = normalizeSeats(seats);

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

    // ⚠️ নিচের ৩টা INSERT একটা transaction-এ wrap করা — কোনো একটা fail করলে
    //    সব rollback হবে, তাই কখনো "orphaned" tenant (admin user ছাড়া)
    //    তৈরি হবে না, আর সেই slug আটকে থাকবে না।
    const tenant = await withTransaction(async (client) => {
      // ১. Tenant তৈরি (৩ মাসের trial)
      const tenantResult = await client.query(
        `INSERT INTO tenants
           (slug, company_name, company_name_bn, status, plan,
            trial_ends_at, max_employees, max_customers)
         VALUES ($1, $2, $3, 'trial', 'basic',
                 NOW() + INTERVAL '3 months', 10, 200)
         RETURNING *`,
        [slug, company_name, company_name_bn || null]
      );
      const newTenant = tenantResult.rows[0];

      // ২. Admin user তৈরি — users টেবিলের actual column অনুযায়ী
      // emergency_contact explicit NULL — column-এর DB-level check
      // constraint (chk_emergency_contact_not_object) default ভ্যালুতে
      // fail করে, তাই বাকি user-creation flow-গুলোর মতোই explicit NULL।
      const hashedPass = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO users
           (tenant_id, role, name_bn, name_en, email, phone, password_hash, status, join_date, emergency_contact)
         VALUES ($1, 'admin', $2, $3, $4, $5, $6, 'active', CURRENT_DATE, $7)`,
        [
          newTenant.id,
          admin_name || company_name,   // name_bn — null হতে পারবে না
          admin_name || null,           // name_en
          admin_email || null,
          admin_phone,
          hashedPass,
          null,                        // emergency_contact
        ]
      );

      // ৩. Seat allocation সেভ করো — trial সাইনআপে গ্রাহক নিজে যে role-মিক্স
      //    বেছে নিয়েছে সেটা রেকর্ড থাকলো (policy doc §৮: "সিট নির্বাচন")।
      //    rate_locked = সাইনআপের দিনের rate, পরে policy বদলালেও এই
      //    tenant-এর জন্য এই rate-ই থাকবে।
      const seatRows = [['admin', 1], ...Object.entries(normalizedSeats)];
      for (const [role, count] of seatRows) {
        await client.query(
          `INSERT INTO tenant_seats (tenant_id, role, seat_count, rate_locked)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, role) DO UPDATE SET seat_count = EXCLUDED.seat_count`,
          [newTenant.id, role, count, SEAT_RATES[role]]
        );
      }

      // ৪. Default system_settings copy (default tenant থেকে)
      await client.query(
        `INSERT INTO system_settings (tenant_id, key, value)
         SELECT $1, key, value FROM system_settings
         WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        [newTenant.id]
      );

      return newTenant;
    });

    return res.status(201).json({
      success: true,
      message: '৩ মাসের free trial শুরু হয়েছে! এখন App-এর login screen থেকে phone ও password দিয়ে লগইন করো।',
      data: {
        tenantId:  tenant.id,
        slug:      tenant.slug,
        trialEnds: tenant.trial_ends_at,
        seats:     { admin: 1, ...normalizedSeats },
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

module.exports = { registerCompany, checkSlugAvailability, SEAT_RATES };
