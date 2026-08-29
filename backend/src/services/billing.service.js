const PDFDocument = require('pdfkit');
const { query } = require('../config/db');

// ============================================================
// BILLING SERVICE
// Admin-এর নিজের সাবস্ক্রিপশন (প্ল্যান/সিট) সামারি — নতুন ফিচার,
// এখনো শুধু "টপ সামারি" সেকশনের জন্য দরকারি raw ডেটা রিটার্ন করে।
//
// ⚠️ ইচ্ছাকৃতভাবে এখানে কোনো দাম/৳ ক্যালকুলেশন নেই — সেটা ফ্রন্টএন্ডে
// constants/planPricing.js (single source of truth) দিয়ে হয়, যাতে
// রেট দুই জায়গায় ডুপ্লিকেট না হয়। এই ফাংশন শুধু raw fact গুলো দেয়:
// plan, status, তারিখ, আর প্রতি-রোলে কয়টা সিট কেনা আছে + rate_locked।
//
// ⚠️ সংশোধন: 'admin'-এর জন্য tenant_seats-এ row নেই ধরে নিয়েছিলাম — ভুল
// ছিল। onboarding.controller.js ট্রায়াল সাইনআপেই admin-এর row বসায়
// (seat_count=1, rate_locked=৳১৬৯৯ ফিক্সড)। কিন্তু upgrade flow-এর
// upsertSeats() BOOKABLE_ROLES-এ admin না থাকায় এই row upgrade-এ কখনো
// রিফ্রেশ হয় না — তাই admin স্বাভাবিক role হিসেবেই নিচে থাকবে,
// আলাদা কোনো "implicit owner" হ্যান্ডলিং নেই এখন।
//
// 'asm' role এখনো tenant_seats-এ ট্র্যাক হয় না (ROLE_LABELS-এ নেই,
// employee.controller.js এখনো এই role enforce করে না) — যদিও
// planPricing.js-এ Max/ERP-এ ASM-এর দাম আছে। তাই asm এখানে কখনো
// আসবে না, এটা আপাতত একটা real gap (ফিচার হিসেবে এখনো লাইভ না)।
// ============================================================

const getBillingSummary = async (tenantId) => {
  const tenantResult = await query(
    `SELECT plan, status, trial_ends_at, subscription_ends_at, max_customers
     FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const tenant = tenantResult.rows[0];
  if (!tenant) return null;

  // seat_count > 0 — যেই role-এ কোনো সিটই কেনা হয়নি সেটা বাদ (noise কমাতে)
  const seatResult = await query(
    `SELECT role, seat_count, rate_locked
     FROM tenant_seats
     WHERE tenant_id = $1 AND seat_count > 0
     ORDER BY role`,
    [tenantId]
  );

  // ⚠️ এই COUNT টা tenantLimits.service.js-এর assertCustomerLimitAvailable-এর
  // সাথে হুবহু মিলিয়ে রাখা হয়েছে (is_active = true) — নাহলে এখানে দেখানো
  // ব্যবহার আর আসল enforcement আলাদা সংখ্যা দেখাবে।
  const customersResult = await query(
    `SELECT COUNT(*)::int AS used FROM customers WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );

  // এই ক্যালেন্ডার মাসের AI ব্যবহার, source-ভিত্তিক (admin_chat/customer_chat/
  // insight_job...) — ai.service.js-এর callAI() প্রতিটা কলে ai_usage_logs-এ
  // লেখে (দেখো ai.service.js লাইন ~265), তাই এটা আসল ডেটা।
  // ⚠️ এখানে ইচ্ছাকৃতভাবে কোনো "free quota"/"used vs free" নেই —
  // aiPricing.service.js-এর calculateChargePaisa() কোনো মাসিক ফ্রি
  // এলাউয়েন্স চেক করে না, platform key দিয়ে প্রতিটা টোকেনই charge হয়।
  // তাই planPricing.js-এর freeAiCreditM আসলে এখনো enforce হয় না —
  // সেটা দেখানো হলে মিথ্যা প্রতিশ্রুতি দেখানো হতো।
  const aiUsageResult = await query(
    `SELECT source,
            COUNT(*)::int AS request_count,
            COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
            COALESCE(SUM(charge_paisa), 0)::int AS charge_paisa
     FROM ai_usage_logs
     WHERE tenant_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)
     GROUP BY source
     ORDER BY charge_paisa DESC`,
    [tenantId]
  );

  return {
    plan: tenant.plan,
    status: tenant.status,
    trial_ends_at: tenant.trial_ends_at,
    subscription_ends_at: tenant.subscription_ends_at,
    seats: seatResult.rows.map((r) => ({
      role: r.role,
      seat_count: r.seat_count,
      rate_locked: r.rate_locked, // null হতে পারে — তখন ফ্রন্টএন্ড plan-এর লিস্টেড রেট ফলব্যাক হিসেবে দেখাবে
    })),
    // max_customers = NULL মানে সীমাহীন (tenantLimits.service.js-এর মতোই সেমান্টিক্স)।
    // ⚠️ এটা tenants.max_customers (আসল enforced ভ্যালু) থেকে আসছে, planPricing.js-এর
    // maxCustomers থেকে না — কোনো তফাত থাকলে (super admin ম্যানুয়াল override) এটাই সঠিক।
    max_customers: tenant.max_customers,
    customers_used: customersResult.rows[0]?.used ?? 0,
    ai_usage: aiUsageResult.rows.map((r) => ({
      source: r.source,
      request_count: r.request_count,
      total_tokens: Number(r.total_tokens),
      charge_paisa: r.charge_paisa,
    })),
  };
};

// ============================================================
// INVOICE HISTORY
// tenant_invoices — jobs/tenantInvoice.job.js প্রতি মাসের ১ তারিখে
// রেকর্ড বসায় (migration_tenant_invoices_table.sql)।
// ============================================================

const PAGE_SIZE_DEFAULT = 12;

const listInvoices = async (tenantId, { page = 1, limit = PAGE_SIZE_DEFAULT } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || PAGE_SIZE_DEFAULT, 1), 50);
  const safePage  = Math.max(Number(page) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT id, invoice_number, period_start, period_end, plan, total_amount, status, paid_at, created_at
       FROM tenant_invoices
       WHERE tenant_id = $1
       ORDER BY period_start DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, safeLimit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM tenant_invoices WHERE tenant_id = $1`, [tenantId]),
  ]);

  const total = countResult.rows[0]?.total ?? 0;
  return {
    invoices: rowsResult.rows,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(Math.ceil(total / safeLimit), 1) },
  };
};

// tenantId মিলিয়ে নেওয়া হচ্ছে যাতে একজনের ইনভয়েস আরেকজন id গেস করে
// ডাউনলোড না করতে পারে।
const getInvoiceById = async (tenantId, invoiceId) => {
  const result = await query(
    `SELECT ti.*, t.billing_name, t.billing_email, t.company_name, t.company_address
     FROM tenant_invoices ti
     JOIN tenants t ON t.id = ti.tenant_id
     WHERE ti.id = $1 AND ti.tenant_id = $2`,
    [invoiceId, tenantId]
  );
  return result.rows[0] || null;
};

// ইংরেজি লেবেল ইচ্ছাকৃতভাবে — pdfkit-এর বেস-১৪ ফন্ট (Helvetica) দিয়ে
// বাংলা রেন্ডার হয় না (glyph নেই)। ⚠️ services/invoice.service.js
// (কাস্টমার-facing sale invoice)-ও একই বেস ফন্ট দিয়ে সরাসরি বাংলা
// টেক্সট বসায় — অর্থাৎ ওখানেও সম্ভবত একই রেন্ডারিং সমস্যা আছে
// (আলাদা বাগ, এই কাজের স্কোপের বাইরে, কিন্তু জানিয়ে রাখা দরকার)।
// এটা ঠিকভাবে সমাধান করতে হলে একটা বাংলা-সাপোর্টেড TTF ফন্ট
// (যেমন Noto Sans Bengali) doc.registerFont() দিয়ে যোগ করতে হবে।
const ROLE_LABEL_EN = {
  manager: 'Manager', worker: 'Sr (Worker)', shop_keeper: 'Shop Keeper',
  stock_keeper: 'Stock Keeper', admin: 'Admin',
};

const fmtBDT = (amount) => `BDT ${Number(amount || 0).toLocaleString('en-US')}`;

const generateInvoicePdfBuffer = (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      doc.fontSize(18).font('Helvetica-Bold').text('Subscription Invoice');
      doc.fontSize(9).font('Helvetica').fillColor('#666666')
         .text(invoice.company_name || 'NovaTech BD Platform');
      doc.moveDown(1);

      doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text(`Invoice: ${invoice.invoice_number}`);
      doc.font('Helvetica').fontSize(9)
         .text(`Period: ${invoice.period_start.toISOString().slice(0, 10)} to ${invoice.period_end.toISOString().slice(0, 10)}`)
         .text(`Plan: ${String(invoice.plan).toUpperCase()}`)
         .text(`Status: ${String(invoice.status).toUpperCase()}`);

      if (invoice.billing_name || invoice.billing_email) {
        doc.moveDown(0.5).font('Helvetica-Bold').text('Bill To:');
        doc.font('Helvetica');
        if (invoice.billing_name) doc.text(invoice.billing_name);
        if (invoice.billing_email) doc.text(invoice.billing_email);
      }

      doc.moveDown(1);
      const tableTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Role', 50, tableTop, { width: 180 });
      doc.text('Seats', 230, tableTop, { width: 60, align: 'right' });
      doc.text('Rate (BDT)', 290, tableTop, { width: 100, align: 'right' });
      doc.text('Subtotal (BDT)', 390, tableTop, { width: 120, align: 'right' });
      doc.moveTo(50, doc.y + 4).lineTo(510, doc.y + 4).stroke();
      doc.moveDown(0.8);

      doc.font('Helvetica').fontSize(9);
      const seats = Array.isArray(invoice.seat_breakdown) ? invoice.seat_breakdown : [];
      seats.forEach((s) => {
        const y = doc.y;
        // ⚠️ পুরো মাস না হলে (মাসের মাঝে সিট/রেট বদলেছে) role নামের পাশে
        // "(N days)" দেখানো — নাহলে একই role-এর একাধিক লাইন কনফিউজিং লাগবে।
        const roleLabel = ROLE_LABEL_EN[s.role] || s.role;
        const label = s.full_period === false ? `${roleLabel} (${s.days} days)` : roleLabel;
        doc.text(label, 50, y, { width: 180 });
        doc.text(String(s.seat_count), 230, y, { width: 60, align: 'right' });
        doc.text(Number(s.rate).toLocaleString('en-US'), 290, y, { width: 100, align: 'right' });
        doc.text(Number(s.subtotal).toLocaleString('en-US'), 390, y, { width: 120, align: 'right' });
        doc.moveDown(0.6);
      });

      doc.moveTo(50, doc.y + 4).lineTo(510, doc.y + 4).stroke();
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(11)
         .text(`Total: ${fmtBDT(invoice.total_amount)}`, { align: 'right' });

      doc.moveDown(2);
      doc.font('Helvetica').fontSize(7).fillColor('#999999')
         .text('Auto-generated invoice. Billed in arrears for the period above; mid-period seat/rate changes are shown pro-rated by days.', { width: 460 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// ============================================================
// TENANT STATUS (lightweight)
// GET /api/admin/tenant-status
// শুধু {status, trial_ends_at} — AdminLayout.jsx-এর trial-expiry গেটের
// জন্য, প্রতি admin সেশনে একবার চেক হয়। getBillingSummary()-এর মতো
// ভারী (seats/customers/ai_usage query) না, ইচ্ছাকৃতভাবে আলাদা রাখা হলো।
// ============================================================
const getTenantStatus = async (tenantId) => {
  const result = await query(
    `SELECT status, trial_ends_at FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return result.rows[0] || null;
};

module.exports = { getBillingSummary, listInvoices, getInvoiceById, generateInvoicePdfBuffer, getTenantStatus };

