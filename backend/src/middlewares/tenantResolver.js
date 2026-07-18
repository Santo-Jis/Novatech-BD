/**
 * tenantResolver.js — নতুন ফাইল
 * Copy করো: backend/src/middlewares/tenantResolver.js
 *
 * ⚠️ এই middleware কোনো route-এ mount করা হচ্ছে না (এখনই না)।
 * কারণ: tenant resolution এখন JWT থেকে হয় (req.tenantId — দেখো
 * middlewares/auth.js)। X-Tenant-Slug header বা subdomain লাগে না,
 * তাই existing APK/client-এ কোনো পরিবর্তন দরকার নেই।
 *
 * এই ফাইল আছে শুধু `clearTenantCache` export করার জন্য, যেটা
 * superAdmin.controller.js (tenant status/plan আপডেট হলে) ব্যবহার করে।
 * `tenantResolver` middleware future-এ public/branding route-এ
 * mount করা যাবে — তখন এই cache কাজে লাগবে।
 *
 * কাজ: slug দিয়ে tenant lookup, এবং req.tenantId/req.tenant সেট করে
 * (যদি mount করা হয়)।
 */

const { query } = require('../config/db');

// Tenant cache (memory) — বারবার DB hit কমাতে
const tenantCache = new Map();
const CACHE_TTL   = 5 * 60 * 1000; // 5 মিনিট

const getTenantBySlug = async (slug) => {
  const cached = tenantCache.get(slug);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  const result = await query(
    `SELECT id, slug, company_name, company_name_bn, status, plan,
            max_employees, max_customers, ai_tokens_monthly, ai_tokens_used
     FROM tenants WHERE slug = $1`,
    [slug]
  );

  if (result.rows.length === 0) return null;

  const tenant = result.rows[0];
  tenantCache.set(slug, { data: tenant, time: Date.now() });
  return tenant;
};

// ─── Tenant cache (by ID) ───────────────────────────────────
// ✅ SaaS Phase 1 (Super Admin suspend fix): auth.js middleware, login
// (auth.controller.js), refresh (auth.service.js), portalAuthShared.js —
// এই সবাই প্রতি-request DB query এড়াতে এই cache ব্যবহার করে tenant.status
// চেক করবে। TTL ছোট (৬০ সেকেন্ড) রাখা হয়েছে যাতে super admin suspend করলে
// দ্রুত effect হয়, আর superAdmin.controller.js status/plan আপডেটের পর
// clearTenantCache() ডাকে বলে সেক্ষেত্রে সাথে সাথেই effect হবে।
const tenantByIdCache  = new Map();
const CACHE_TTL_BY_ID  = 60 * 1000; // ৬০ সেকেন্ড

const getTenantById = async (tenantId) => {
  if (!tenantId) return null;

  const cached = tenantByIdCache.get(tenantId);
  if (cached && Date.now() - cached.time < CACHE_TTL_BY_ID) {
    return cached.data;
  }

  const result = await query(
    `SELECT id, slug, company_name, status, plan FROM tenants WHERE id = $1`,
    [tenantId]
  );

  // Tenant row না পেলে null (caller fail-open সিদ্ধান্ত নেবে — DB-তে
  // row missing মানেই suspended না, তাই এখানে জোর করে block করা হচ্ছে না)।
  const tenant = result.rows.length ? result.rows[0] : null;
  tenantByIdCache.set(tenantId, { data: tenant, time: Date.now() });
  return tenant;
};

// Cache clear করার function (tenant update হলে call করো)
// slugOrId দিলে শুধু সেই এন্ট্রি (দুই cache থেকেই) মুছবে, না দিলে সব মুছবে।
const clearTenantCache = (slugOrId) => {
  if (slugOrId) {
    tenantCache.delete(slugOrId);
    tenantByIdCache.delete(slugOrId);
  } else {
    tenantCache.clear();
    tenantByIdCache.clear();
  }
};

// ─── Middleware (এখনো mount করা হয়নি) ──────────────────────
// Subdomain / X-Tenant-Slug / ?tenant= থেকে slug বের করে tenant resolve করে।
// req.tenantId, req.tenantSlug, req.tenant সেট করে।
const tenantResolver = async (req, res, next) => {
  try {
    let slug = null;

    const host = req.hostname || req.headers.host || '';
    const parts = host.split('.');
    if (parts.length >= 3) {
      slug = parts[0];
    }

    if (!slug || slug === 'www' || slug === 'api') {
      slug = req.headers['x-tenant-slug'];
    }

    if (!slug && process.env.NODE_ENV === 'development') {
      slug = req.query.tenant;
    }

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Tenant not specified. Use X-Tenant-Slug header or subdomain.',
      });
    }

    const tenant = await getTenantBySlug(slug);

    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    if (tenant.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended. Please contact support.' });
    }

    if (tenant.status === 'cancelled') {
      return res.status(403).json({ success: false, message: 'Subscription cancelled.' });
    }

    req.tenantId   = tenant.id;
    req.tenantSlug = tenant.slug;
    req.tenant     = tenant;

    next();
  } catch (err) {
    console.error('[tenantResolver]', err.message);
    return res.status(500).json({ success: false, message: 'Tenant resolution failed.' });
  }
};

module.exports = { tenantResolver, getTenantBySlug, getTenantById, clearTenantCache };
