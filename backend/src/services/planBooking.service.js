const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { query, withTransaction } = require('../config/db');

// ============================================================
// SEAT-COUNT vs বর্তমান HEADCOUNT ভ্যালিডেশন — নতুন, ৯ আগস্ট ২০২৬
// ------------------------------------------------------------
// আগে কোনো role-এর নতুন seat_count কমিয়ে সাবমিট করলে (upgrade রিকোয়েস্টে)
// কোনো বাধা ছিল না — approve হলে tenant_seats.seat_count নেমে যেত, কিন্তু
// বিদ্যমান active কর্মচারীরা কেউ সরানো হতো না (সিস্টেম কাউকে জোর করে বের
// করে না)। ফলে বাস্তবে যত কর্মচারী আছে তার চেয়ে কম সিটের দামে বিল হতো
// (jobs/tenantInvoice.job.js, tenant_seat_history-ভিত্তিক) — একটা নীরব
// রেভিনিউ-লিক, আর Admin/Super Admin কেউই কোথাও কোনো সংকেত পেতেন না।
//
// এই ফাংশন employee.controller.js-এর assertSeatAvailable()-এর ঠিক একই
// কোয়েরি-প্যাটার্ন ব্যবহার করে (status != 'archived' গণনা — active+suspended
// দুটোই "ব্যবহৃত" ধরা হয়) যাতে দুই জায়গায় "headcount" এর সংজ্ঞা না মেলার
// ঝুঁকি না থাকে।
//
// দুই জায়গায় কল হয় (দুটোই দরকার — submission আর approval-এর মাঝে
// headcount বদলে যেতে পারে):
//   ১. createBooking() — সাবমিট করার সাথে সাথেই Admin-কে জানিয়ে দেওয়া
//   ২. approveBooking() — শেষ মুহূর্তের নিরাপত্তা, transaction-এর ভিতরে
//      (upsertSeats()-এর ঠিক আগে), FOR UPDATE লক দিয়ে race-condition এড়ানো
//
// queryFn প্যারামিটার — createBooking-এ module-level query, approveBooking-এ
// client.query (transaction-এর মধ্যে) — দুটোই (text, params) => Promise<{rows}>
// একই সিগনেচার, তাই একই ফাংশন দুই জায়গাতেই কাজ করে।
const assertSeatCountsNotBelowHeadcount = async (queryFn, tenantId, seatCounts) => {
  const problems = [];
  for (const [role, requestedRaw] of Object.entries(seatCounts || {})) {
    const requested = Number(requestedRaw) || 0;
    if (requested <= 0) continue; // ০ বা খালি — এই role নতুন বুকিং-এ নেই, স্কিপ

    const usedRes = await queryFn(
      `SELECT COUNT(*)::int AS used FROM users
       WHERE tenant_id = $1 AND role::text = $2 AND status != 'archived'`,
      [tenantId, role]
    );
    const used = usedRes.rows[0]?.used ?? 0;

    if (requested < used) {
      problems.push({ role, current_active: used, requested });
    }
  }

  if (problems.length > 0) {
    const roleLabels = { worker: 'SR', manager: 'ম্যানেজার', stock_keeper: 'স্টক কিপার', shop_keeper: 'শপ কিপার', admin: 'অ্যাডমিন' };
    const detail = problems
      .map((p) => `${roleLabels[p.role] || p.role}: বর্তমানে ${p.current_active} জন সক্রিয়, রিকোয়েস্টে ${p.requested}`)
      .join('; ');
    throw Object.assign(
      new Error(`নতুন সিট-সংখ্যা বর্তমান সক্রিয় কর্মচারীর চেয়ে কম হতে পারবে না। ${detail}। আগে অতিরিক্ত কর্মচারী সাসপেন্ড/আর্কাইভ করুন, অথবা বেশি সিট রিকোয়েস্ট করুন।`),
      { status: 400, code: 'SEAT_BELOW_HEADCOUNT', problems }
    );
  }
};

// ============================================================
// PLAN BOOKING — কাস্টমার-facing "প্ল্যান বুক করুন" ফ্লো-র backend।
// ------------------------------------------------------------
// দুই এন্ট্রি পয়েন্ট, একই টেবিল (plan_booking_requests):
//   ১. নতুন কাস্টমার (tenant_id = NULL) — approve হলে নতুন tenant+admin তৈরি হয়
//   ২. বিদ্যমান trial tenant upgrade (tenant_id সেট) — approve হলে সেই
//      tenant-এর প্ল্যান/সিট/billing info আপডেট হয়
//
// কোনো payment gateway নেই (superAdmin.controller.js-এর verifyPlanPayment
// দ্রষ্টব্য) — TrxID স্ব-রিপোর্ট করে কাস্টমার, Super Admin ম্যানুয়ালি
// verify করে approve করে। তাই submit করামাত্র কিছু activate হয় না,
// সবসময় 'pending' হয়ে জমা থাকে।
//
// ⚠️ ইচ্ছাকৃতভাবে superAdmin.controller.js-এর createTenant/updateTenantPlan
// ফাংশন দুটো import/reuse করা হয়নি — ওই দুটো লাইভ, ইতিমধ্যে ব্যবহৃত হচ্ছে
// (আগের screenshot-এ দেখা গেছে)। ভুল করে ভেঙে ফেলার ঝুঁকি এড়াতে এখানে
// একই লজিক আলাদাভাবে লেখা হলো (ছোট duplication, কিন্তু zero regression risk)।
// ============================================================

const isValidSlug = (slug) => /^[a-z0-9-]{3,30}$/.test(slug);

// planPricing.js-এর ৪-টায়ার + seat-provisioning-এ ব্যবহৃত আসল role — মেলানো।
// admin ইচ্ছাকৃতভাবে এখানে নেই — SEAT_EXEMPT (employee.controller.js/
// tenantDiagnostics.service.js দেখো), tenant তৈরির সময় ঠিক ১টা admin
// (owner) এমনিতেই তৈরি হয়, আলাদা সিট-হিসেবে গণনা/বুক করা হয় না।
const BOOKABLE_ROLES = ['worker', 'manager', 'stock_keeper', 'shop_keeper'];

// planPricing.js-এর PLANS-এর সাথে duplicate না করে backend-এ শুধু rate-lock
// এর জন্য ন্যূনতম দরকারি সংখ্যাটাই রাখা হলো (৳/সিট/মাস, role অনুযায়ী,
// প্ল্যান-টায়ার অনুযায়ী) — approve করার সময় tenant_seats.rate_locked-এ বসবে।
const SEAT_RATE_PAISA = {
  standard: { worker: 29900, manager: 59900, stock_keeper: 29900, shop_keeper: 29900 },
  pro:      { worker: 49900, manager: 79900, stock_keeper: 44900, shop_keeper: 44900 },
  max:      { worker: 69900, manager: 99900, stock_keeper: 59900, shop_keeper: 59900 },
  erp:      { worker: 89900, manager: 129900, stock_keeper: 69900, shop_keeper: 69900 },
};

const BILLING_CYCLE_DAYS = { monthly: 30, '1yr': 365, '2yr': 730 };

const logAudit = async (action, targetId, details, ip) => {
  try {
    await query(
      `INSERT INTO platform_audit_log (staff_id, staff_email, action, target_type, target_id, details, ip_address)
       VALUES (NULL, 'super-admin-key', $1, 'tenant', $2, $3, $4)`,
      [action, targetId, JSON.stringify(details || {}), ip || null]
    );
  } catch (err) {
    console.error('[planBooking.logAudit] audit log ব্যর্থ (মূল action অব্যাহত):', err.message);
  }
};

// ─── নতুন বুকিং রিকোয়েস্ট জমা করো (দুই এন্ট্রি পয়েন্টই এখানে আসে) ───
const createBooking = async (payload) => {
  const {
    tenant_id = null, requested_plan, seat_counts = {}, billing_cycle = 'monthly',
    estimated_total_paisa = null, company_name = null, company_name_bn = null, slug = null,
    contact_name, contact_phone, contact_email = null,
    company_address = null, company_phone = null, company_email = null,
    billing_name = null, billing_email = null,
    // StartTrial.jsx-এর ধাপ ২-এর একই ফিল্ড — নতুন কাস্টমার মোডে consistency-র জন্য
    industry = null, company_size = null, country = null, division = null,
    city = null, timezone = null, website = null, referral_source = null,
    payment_method = null, trx_id,
  } = payload;

  if (!requested_plan || !['standard', 'pro', 'max', 'erp'].includes(requested_plan)) {
    throw Object.assign(new Error('সঠিক প্ল্যান বেছে নিন (standard/pro/max/erp)।'), { status: 400 });
  }
  if (!contact_name || !contact_phone || !trx_id) {
    throw Object.assign(new Error('নাম, ফোন, ও TrxID আবশ্যক।'), { status: 400 });
  }
  if (!tenant_id && (!company_name || !slug)) {
    throw Object.assign(new Error('নতুন কোম্পানির জন্য company_name ও slug আবশ্যক।'), { status: 400 });
  }
  if (!tenant_id && !isValidSlug(slug)) {
    throw Object.assign(new Error('Slug শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন — ৩-৩০ ক্যারেক্টার।'), { status: 400 });
  }
  if (tenant_id) {
    // শুধু existing tenant upgrade-এ প্রযোজ্য — নতুন সাইনআপে তুলনা করার
    // মতো কোনো বিদ্যমান headcount নেই।
    await assertSeatCountsNotBelowHeadcount(query, tenant_id, seat_counts);
  }

  const result = await query(
    `INSERT INTO plan_booking_requests
       (tenant_id, requested_plan, seat_counts, billing_cycle, estimated_total_paisa,
        company_name, company_name_bn, slug, contact_name, contact_phone, contact_email,
        company_address, company_phone, company_email, billing_name, billing_email,
        industry, company_size, country, division, city, timezone, website, referral_source,
        payment_method, trx_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     RETURNING *`,
    [tenant_id, requested_plan, JSON.stringify(seat_counts), billing_cycle, estimated_total_paisa,
     company_name, company_name_bn, slug, contact_name, contact_phone, contact_email,
     company_address, company_phone, company_email, billing_name, billing_email,
     industry, company_size, country, division, city, timezone, website, referral_source,
     payment_method, trx_id]
  );

  return result.rows[0];
};

// ─── Super Admin panel-এর লিস্টের জন্য ──────────────────────────
const listBookings = async ({ status = null, page = 1, limit = 20 } = {}) => {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`b.status = $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM plan_booking_requests b ${whereClause}`, params);
  const total = countRes.rows[0]?.total ?? 0;

  params.push(limit, (page - 1) * limit);
  const result = await query(
    `SELECT b.*, t.company_name AS existing_company_name, t.plan AS existing_plan
     FROM plan_booking_requests b
     LEFT JOIN tenants t ON t.id = b.tenant_id
     ${whereClause}
     ORDER BY b.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: result.rows, total, page, limit, total_pages: Math.max(1, Math.ceil(total / limit)) };
};

const getBooking = async (id) => {
  const result = await query(`SELECT * FROM plan_booking_requests WHERE id = $1`, [id]);
  return result.rows[0] || null;
};

// tenant_seats upsert — onboarding.controller.js-এর trial-signup সিট-রিজার্ভেশনের
// সাথে হুবহু মেলানো প্যাটার্ন (ON CONFLICT DO UPDATE), শুধু rate টা trial-এর
// SEAT_RATES-এর বদলে বাছাই করা প্ল্যানের আসল রেট।
const upsertSeats = async (client, tenantId, plan, seatCounts) => {
  const rates = SEAT_RATE_PAISA[plan];
  for (const role of BOOKABLE_ROLES) {
    const count = Number(seatCounts?.[role] || 0);
    if (count <= 0) continue;
    const rateLocked = (rates[role] || 0) / 100; // ৳-এ (paisa না)
    await client.query(
      `INSERT INTO tenant_seats (tenant_id, role, seat_count, rate_locked)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, role) DO UPDATE SET seat_count = EXCLUDED.seat_count, rate_locked = EXCLUDED.rate_locked`,
      [tenantId, role, count, rateLocked]
    );
    // নতুন: seat history লগ — jobs/tenantInvoice.job.js-এর arrears/prorated
    // বিলিং-এর জন্য (migration_tenant_seat_history.sql)। একই ট্রানজেকশনে।
    await client.query(
      `INSERT INTO tenant_seat_history (tenant_id, role, seat_count, rate_locked, changed_reason)
       VALUES ($1, $2, $3, $4, 'plan_upgrade')`,
      [tenantId, role, count, rateLocked]
    );
  }
};

// ─── Approve — TrxID verify করে Super Admin কনফার্ম করলে এখানে আসে ───
const approveBooking = async (id, { reviewerLabel = 'super-admin-key', adminNote = null, ip = null } = {}) => {
  const booking = await getBooking(id);
  if (!booking) throw Object.assign(new Error('বুকিং রিকোয়েস্ট পাওয়া যায়নি।'), { status: 404 });
  if (booking.status !== 'pending') {
    throw Object.assign(new Error(`এই রিকোয়েস্ট আগেই "${booking.status}" হয়ে গেছে।`), { status: 409 });
  }

  const subscriptionDays = BILLING_CYCLE_DAYS[booking.billing_cycle] || 30;
  const seatCounts = booking.seat_counts || {};

  const outcome = await withTransaction(async (client) => {
    let tenant;
    let tempPassword = null;
    let isNewTenant = false;

    if (booking.tenant_id) {
      // ── বিদ্যমান tenant upgrade ──
      const tenantRes = await client.query(`SELECT * FROM tenants WHERE id = $1 FOR UPDATE`, [booking.tenant_id]);
      if (tenantRes.rows.length === 0) {
        throw Object.assign(new Error('এই বুকিং-এর tenant আর খুঁজে পাওয়া যায়নি।'), { status: 404 });
      }
      const before = tenantRes.rows[0];

      const updated = await client.query(
        `UPDATE tenants SET
           plan = $1, status = 'active',
           subscription_ends_at = NOW() + ($2 || ' days')::interval,
           company_address  = COALESCE($3, company_address),
           company_phone    = COALESCE($4, company_phone),
           company_email    = COALESCE($5, company_email),
           billing_name     = COALESCE($6, billing_name),
           billing_email    = COALESCE($7, billing_email),
           updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [booking.requested_plan, String(subscriptionDays), booking.company_address, booking.company_phone,
         booking.company_email, booking.billing_name, booking.billing_email, booking.tenant_id]
      );
      tenant = updated.rows[0];

      // শেষ মুহূর্তের রি-চেক — submission আর approval-এর মাঝে সময় গ্যাপ
      // থাকতে পারে (TrxID ম্যানুয়ালি ভেরিফাই করা হয়), এই ফাঁকে headcount
      // বদলে যেতে পারে। client.query দিয়ে — একই ট্রানজেকশনে, atomic।
      await assertSeatCountsNotBelowHeadcount(
        (text, params) => client.query(text, params),
        tenant.id,
        seatCounts
      );

      await upsertSeats(client, tenant.id, booking.requested_plan, seatCounts);

      await client.query(
        `INSERT INTO tenant_subscription_logs (tenant_id, action, old_plan, new_plan, notes)
         VALUES ($1, 'upgraded', $2, $3, $4)`,
        [tenant.id, before.plan, booking.requested_plan, `Plan booking #${booking.id} অনুযায়ী, TrxID: ${booking.trx_id}`]
      );
    } else {
      // ── নতুন কাস্টমার — নতুন tenant + admin ──
      tempPassword = crypto.randomBytes(16).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
      const hashedPass = await bcrypt.hash(tempPassword, 10);

      const tenantRes = await client.query(
        `INSERT INTO tenants
           (slug, company_name, company_name_bn, plan, max_employees, max_customers, ai_tokens_monthly,
            status, subscription_ends_at, company_address, company_phone, company_email,
            billing_name, billing_email, industry, company_size, country, division, city,
            timezone, website, referral_source)
         VALUES ($1,$2,$3,$4, NULL, NULL, NULL, 'active', NOW() + ($5 || ' days')::interval,
                 $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [booking.slug, booking.company_name, booking.company_name_bn, booking.requested_plan,
         String(subscriptionDays), booking.company_address, booking.company_phone, booking.company_email,
         booking.billing_name, booking.billing_email, booking.industry, booking.company_size,
         booking.country, booking.division, booking.city, booking.timezone, booking.website,
         booking.referral_source]
      );
      tenant = tenantRes.rows[0];
      isNewTenant = true;

      await client.query(
        `INSERT INTO users (tenant_id, role, name_bn, name_en, email, phone, password_hash, status, join_date)
         VALUES ($1, 'admin', $2, $2, $3, $4, $5, 'active', CURRENT_DATE)`,
        [tenant.id, booking.contact_name, booking.contact_email, booking.contact_phone, hashedPass]
      );

      await client.query(
        `INSERT INTO system_settings (tenant_id, key, value)
         SELECT $1, key, value FROM system_settings
         WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        [tenant.id]
      );

      await upsertSeats(client, tenant.id, booking.requested_plan, seatCounts);

      await client.query(
        `INSERT INTO tenant_subscription_logs (tenant_id, action, new_plan, notes)
         VALUES ($1, 'subscribed', $2, $3)`,
        [tenant.id, booking.requested_plan, `Plan booking #${booking.id} অনুযায়ী, TrxID: ${booking.trx_id}`]
      );
    }

    await client.query(
      `UPDATE plan_booking_requests
       SET status = 'approved', admin_note = $1, reviewed_by = $2, reviewed_at = NOW(), created_tenant_id = $3
       WHERE id = $4`,
      [adminNote, reviewerLabel, isNewTenant ? tenant.id : null, booking.id]
    );

    return { tenant, tempPassword, isNewTenant };
  });

  await logAudit('plan_booking.approve', outcome.tenant.id, {
    booking_id: booking.id, plan: booking.requested_plan, trx_id: booking.trx_id, is_new_tenant: outcome.isNewTenant,
  }, ip);

  return outcome;
};

const rejectBooking = async (id, { reviewerLabel = 'super-admin-key', adminNote = null, ip = null } = {}) => {
  const booking = await getBooking(id);
  if (!booking) throw Object.assign(new Error('বুকিং রিকোয়েস্ট পাওয়া যায়নি।'), { status: 404 });
  if (booking.status !== 'pending') {
    throw Object.assign(new Error(`এই রিকোয়েস্ট আগেই "${booking.status}" হয়ে গেছে।`), { status: 409 });
  }

  await query(
    `UPDATE plan_booking_requests
     SET status = 'rejected', admin_note = $1, reviewed_by = $2, reviewed_at = NOW()
     WHERE id = $3`,
    [adminNote, reviewerLabel, id]
  );

  await logAudit('plan_booking.reject', booking.tenant_id, { booking_id: booking.id, reason: adminNote }, ip);

  return { booking_id: id, status: 'rejected' };
};

// ─── লগইন করা tenant admin upgrade করতে গেলে ফর্ম pre-fill করার জন্য ───
// trial signup-এ (StartTrial.jsx) যদি বিলিং তথ্য আগে থেকেই দেওয়া থাকে,
// upgrade ফর্মে সেটা আবার নতুন করে চাওয়া হয় না।
const getTenantProfile = async (tenantId) => {
  const result = await query(
    `SELECT company_name, company_address, company_phone, company_email,
            billing_name, billing_email, industry, company_size, country,
            division, city, timezone, website
     FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return result.rows[0] || null;
};

module.exports = {
  BOOKABLE_ROLES,
  createBooking,
  listBookings,
  getBooking,
  getTenantProfile,
  approveBooking,
  rejectBooking,
};
