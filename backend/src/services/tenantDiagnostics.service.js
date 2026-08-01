const { query } = require('../config/db');
const walletService = require('./wallet.service');

// ============================================================
// TENANT DIAGNOSTICS — Support Panel-এর জন্য (Phase: Support visibility)
// ------------------------------------------------------------
// লক্ষ্য: "আমার কোম্পানিতে আর কাস্টমার/কর্মচারী যোগ করা যাচ্ছে না",
// "SMS/OTP পৌঁছাচ্ছে না" — এই ধরনের প্রশ্নের কারণ Support যেন এক
// কলেই বুঝতে পারে, tenants/tenant_seats/tenant_wallets/customers/
// users/sms_logs — ৫টা আলাদা জায়গায় ছড়ানো ডেটা নিজে জোড়া না লাগিয়ে।
//
// এই ফাইলটা পুরোপুরি READ-ONLY — কোথাও কোনো UPDATE/INSERT নেই, তাই
// আসল enforcement লজিকের (tenantLimits.service.js / employee.controller.js-এর
// assertSeatAvailable) কোনো আচরণ বদলায় না।
// ============================================================

// ⚠️ ইচ্ছাকৃত duplication: employee.controller.js-এর ROLE_LABELS/
// SEAT_EXEMPT_ROLES/NOT_YET_LIVE_ROLES_DISPLAY এখানে কপি করা হলো,
// import করা হলো না — যাতে এই read-only diagnostics ফিচার বানাতে
// গিয়ে আসল seat-enforcement কোডটা (assertSeatAvailable, যেখানে
// FOR UPDATE লক আছে) কোনোভাবে touch/আমদানি করে ভাঙার ঝুঁকি না থাকে।
// ⚠️ role list বদলালে (নতুন role/label যোগ হলে) দুই জায়গাতেই আপডেট
// করতে হবে — employee.controller.js আর এই ফাইল।
const ROLE_LABELS = {
  admin:        'Admin',
  manager:      'Manager',
  worker:       'Sr (Worker)',
  shop_keeper:  'Shop Keeper',
  stock_keeper: 'Stock Keeper',
};
const SEAT_EXEMPT_ROLES      = ['admin'];
const NOT_YET_LIVE_ROLES     = ['shop_keeper', 'stock_keeper'];

// wallet.service.js-এর LOW_BALANCE_THRESHOLD_PAISA-এর সাথে মিলিয়ে (৳১০০)
// — সরাসরি import না করে সংখ্যাটা এখানেও রাখা হলো, কারণ ওটা import করলে
// wallet.service.js-এর বাকি (deduct/recharge) ফাংশনগুলোও অপ্রয়োজনে
// require chain-এ চলে আসে। মান বদলালে দুই জায়গাতেই বদলাতে হবে।
const LOW_BALANCE_THRESHOLD_PAISA = 10000;

// ─── কাস্টমার: active count vs max_customers ───────────────────
// ⚠️ tenantLimits.service.js-এর assertCustomerLimitAvailable-এর
// সাথে হুবহু মেলানো — শুধু is_active=true কাস্টমার গোনা হয়, কারণ
// আসল লিমিট-চেকও তাই করে (deactivated কাস্টমার স্লট খরচ করে না)।
const getCustomerUsage = async (tenantId, maxCustomers) => {
  const usedRes = await query(
    `SELECT COUNT(*)::int AS used FROM customers WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );
  const used  = usedRes.rows[0]?.used ?? 0;
  const limit = (maxCustomers === null || maxCustomers === undefined) ? null : maxCustomers;

  return {
    used,
    limit,
    unlimited: limit === null,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    percent:   (limit === null || limit === 0) ? null : Math.min(Math.round((used / limit) * 100), 100),
  };
};

// ─── কর্মচারী: role-ভিত্তিক সিট (tenant_seats) vs actual active count ──
// employee.controller.js-এর getSeatStatus-এর মতোই, শুধু tenant-admin
// auth-এর বদলে platform-staff context থেকে কল হয়।
const getSeatUsage = async (tenantId) => {
  const roles = Object.keys(ROLE_LABELS);

  const [seatRows, usedRows] = await Promise.all([
    query(`SELECT role, seat_count FROM tenant_seats WHERE tenant_id = $1`, [tenantId]),
    query(
      // role::text cast — users.role একটা Postgres ENUM, আর shop_keeper/
      // stock_keeper এখনো সেই enum-এ নেই বলে সরাসরি তুলনায় ফেইল করতে
      // পারে (employee.controller.js-এর একই কমেন্ট দেখো)।
      `SELECT role::text AS role, COUNT(*)::int AS used FROM users
       WHERE tenant_id = $1 AND status != 'archived'
       GROUP BY role::text`,
      [tenantId]
    ),
  ]);

  const limitByRole = {};
  seatRows.rows.forEach((r) => { limitByRole[r.role] = r.seat_count; });
  const usedByRole = {};
  usedRows.rows.forEach((r) => { usedByRole[r.role] = r.used; });

  return roles.map((role) => {
    const unlimited = SEAT_EXEMPT_ROLES.includes(role);
    const limit     = unlimited ? null : (limitByRole[role] ?? 0);
    const used      = usedByRole[role] ?? 0;

    return {
      role,
      label: ROLE_LABELS[role],
      unlimited,
      limit,
      used,
      remaining: unlimited ? null : Math.max(limit - used, 0),
      live: !NOT_YET_LIVE_ROLES.includes(role),
    };
  });
};

// ─── সাম্প্রতিক SMS লগ (tenant-wide, বা নির্দিষ্ট phone দিয়ে filter) ──
const getRecentSms = async (tenantId, phone, limit = 15) => {
  const conditions = ['tenant_id = $1'];
  const params     = [tenantId];

  if (phone && phone.trim()) {
    params.push(`%${phone.trim()}%`);
    conditions.push(`phone ILIKE $${params.length}`);
  }

  params.push(limit);
  const result = await query(
    `SELECT id, phone, message_type, provider, status, error_message, sent_at
     FROM sms_logs
     WHERE ${conditions.join(' AND ')}
     ORDER BY sent_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
};

// ─── সাম্প্রতিক Email লগ (tenant-wide, বা নির্দিষ্ট email দিয়ে filter) ──
// email.service.js-এর logEmail-এর সাথে মেলানো (email, subject, message_type,
// status, error_message, tenant_id)। ⚠️ email_logs-এর timestamp কলামের নাম
// কোনো SELECT-এ কোথাও confirm করা যায়নি (শুধু INSERT-এই আছে কোডে) — sms_logs-এর
// sent_at কনভেনশন ধরে নেওয়া হলো (একই ডেভেলপার, একই Phase 3/26 July 2026-এ
// বানানো)। deploy-এর আগে verify করে নিও — না মিললে শুধু এই ORDER BY লাইনটা বদলাতে হবে।
const getRecentEmails = async (tenantId, email, limit = 15) => {
  const conditions = ['tenant_id = $1'];
  const params     = [tenantId];

  if (email && email.trim()) {
    params.push(`%${email.trim()}%`);
    conditions.push(`email ILIKE $${params.length}`);
  }

  params.push(limit);
  const result = await query(
    `SELECT id, email, subject, message_type, status, error_message, sent_at
     FROM email_logs
     WHERE ${conditions.join(' AND ')}
     ORDER BY sent_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
};

/**
 * একটা tenant-এর জন্য পূর্ণ diagnostics স্ন্যাপশট।
 * options.includeBilling — wallet/AI token ব্যবহার শুধু তখনই যোগ হবে
 *   যখন true (platform_staff scope==='full' হলেই কলার এটা true পাঠাবে —
 *   billing_email/billing_name-এর মতোই এগুলো billing-sensitive বলে
 *   support scope-এ বাদ)।
 * options.phone — দিলে SMS লগ শুধু সেই নম্বরে filter হবে।
 * options.email — দিলে Email লগ শুধু সেই ঠিকানায় filter হবে।
 */
const getTenantDiagnostics = async (tenantId, { includeBilling = false, phone = null, email = null } = {}) => {
  const tenantRes = await query(
    `SELECT id, slug, company_name, status, plan, max_customers,
            ai_tokens_monthly, ai_tokens_used, trial_ends_at, subscription_ends_at
     FROM tenants WHERE id = $1`,
    [tenantId]
  );
  if (tenantRes.rows.length === 0) return null;
  const tenant = tenantRes.rows[0];

  const [customers, seats, smsRecent, emailRecent, wallet] = await Promise.all([
    getCustomerUsage(tenantId, tenant.max_customers),
    getSeatUsage(tenantId),
    getRecentSms(tenantId, phone),
    getRecentEmails(tenantId, email),
    includeBilling ? walletService.getWallet(tenantId) : Promise.resolve(null),
  ]);

  const aiTokens = includeBilling ? (() => {
    const limit = tenant.ai_tokens_monthly === null || tenant.ai_tokens_monthly === undefined
      ? null : Number(tenant.ai_tokens_monthly);
    const used = Number(tenant.ai_tokens_used || 0);
    return {
      used,
      limit,
      unlimited: limit === null,
      percent: (limit === null || limit === 0) ? null : Math.min(Math.round((used / limit) * 100), 100),
    };
  })() : null;

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      company_name: tenant.company_name,
      status: tenant.status,
      plan: tenant.plan,
      trial_ends_at: tenant.trial_ends_at,
      subscription_ends_at: tenant.subscription_ends_at,
    },
    customers,
    seats,
    sms_recent: smsRecent,
    email_recent: emailRecent,
    wallet: wallet ? {
      balance_paisa: Number(wallet.balance_paisa),
      low_balance:   Number(wallet.balance_paisa) < LOW_BALANCE_THRESHOLD_PAISA,
    } : null,
    ai_tokens: aiTokens,
  };
};

module.exports = { getTenantDiagnostics };
