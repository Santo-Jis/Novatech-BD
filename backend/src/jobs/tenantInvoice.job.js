const cron   = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { getFallbackRate } = require('../constants/planRates');

// ============================================================
// Monthly Tenant Invoice Generation Job
// প্রতি মাসের ১ তারিখ, রাত ১:০০ (Asia/Dhaka)
//
// কেন দরকার:
//   Billing পেজে (pages/admin/Billing.jsx) "ইনভয়েস হিস্ট্রি" সেকশন
//   আছে। tenant_invoices-এ মাসিক সাবস্ক্রিপশন ফি-র রেকর্ড রাখে —
//   credit_transactions (wallet)-এর থেকে আলাদা, ওটা SMS/Email/AI
//   pay-as-you-go-র জন্য।
//
// আপডেট (v3) — ARREARS + PRORATION:
//   আগে (v1/v2) অ্যাডভান্সে বিল হতো ("এখন যা আছে তাই, পুরো মাসের
//   জন্য") — কারণ তখন সিট-সংখ্যার কোনো হিস্ট্রি ছিল না। এখন
//   tenant_seat_history (migration_tenant_seat_history.sql) থেকে
//   প্রতিটা role-এর সিট-সংখ্যা/রেট কখন বদলেছে তার রেকর্ড পাওয়া যায়
//   (হুক বসানো আছে onboarding.controller.js আর
//   planBooking.service.js-এর upsertSeats()-এ)। তাই এখন:
//     • ARREARS: প্রতি মাসের ১ তারিখে, ঠিক আগের (সম্পূর্ণ শেষ হওয়া)
//       মাসের জন্য ইনভয়েস — অ্যাডভান্সের বদলে, কারণ পুরো মাসের
//       ডেটা তখনই সম্পূর্ণ পাওয়া যায়।
//     • PRORATION: মাসের মধ্যে কোনো role-এর সিট-সংখ্যা/রেট বদলালে,
//       প্রতিটা "সেগমেন্ট" (যতদিন একটা নির্দিষ্ট মান ছিল) আলাদাভাবে
//       দিন-হিসেবে ভাগ করে বিল হয় — না বদলালে স্বাভাবিক পুরো-মাস
//       হিসাবই থাকে (একটা সেগমেন্ট = পুরো মাস)।
//
//   admin role এখন স্বাভাবিক role হিসেবেই হিস্ট্রিতে/বিলে থাকে (আগে
//   ভুল করে "tenant_seats-এ row নেই" ধরে নিয়ে আলাদা "implicit owner"
//   যোগ করছিলাম, যেটা আসল admin row-এর সাথে ডাবল-কাউন্ট হয়ে যেত —
//   এই সংশোধন billing.service.js/Billing.jsx-এও করা হয়েছে)।
//
// rate_locked history-তে থাকলে সেটাই আগে; না থাকলে (পুরনো/ব্যাকফিল
// ডেটা) constants/planRates.js ফলব্যাক — সেই ফাইলের হেডার কমেন্ট
// দেখো, এটা planPricing.js-এর ডুপ্লিকেট, ম্যানুয়ালি সিঙ্কে রাখতে হবে।
//
// status IN ('active', 'suspended') — trial/cancelled বাদ।
//
// ⚠️ জানা সীমাবদ্ধতা: booking flow-এ কোনো role-এর সিট ০-তে নামানোর
//   (সরিয়ে ফেলার) উপায় নেই (upsertSeats()-এ `count<=0` স্কিপ হয়) —
//   তাই history-তেও সেটা ধরা পড়বে না, শেষ জানা নন-জিরো মানই চলতে
//   থাকবে prorated হিসাবে। এটা তাদের বিদ্যমান booking flow-এরই
//   সীমাবদ্ধতা, এখানে নতুন করে তৈরি হয়নি।
//
// UNIQUE(tenant_id, period_start) + ON CONFLICT DO NOTHING —
// একই মাসে দুইবার (catch-up রান) চললে ডুপ্লিকেট হবে না।
//
// টেবিল না থাকলে: migration_tenant_invoices_table.sql +
// migration_tenant_seat_history.sql — দুটোই চালাতে হবে।
// ============================================================

const JOB_NAME  = 'monthly_tenant_invoice';
const DAY_MS    = 86400000;
const toDayNum  = (d) => Math.floor(new Date(d).getTime() / DAY_MS);

// একটা tenant-এর একটা role-এর history সেগমেন্ট থেকে period-এর সাথে
// ওভারল্যাপ বের করে প্রোরেটেড সাবটোটাল হিসাব করে।
const computeRoleSegments = (historyRows, plan, periodStartDay, periodEndDay, totalDays) => {
    const segments = [];
    for (let i = 0; i < historyRows.length; i++) {
        const row = historyRows[i];
        const segStartDay = Math.max(toDayNum(row.effective_from), periodStartDay);
        const nextFrom = historyRows[i + 1] ? toDayNum(historyRows[i + 1].effective_from) - 1 : periodEndDay;
        const segEndDay = Math.min(nextFrom, periodEndDay);
        if (segEndDay < segStartDay) continue; // period-এর সাথে ওভারল্যাপ নেই

        const days = segEndDay - segStartDay + 1;
        const rate = row.rate_locked ?? getFallbackRate(plan, row.role);
        if (rate == null) continue; // দাম জানা নেই — বাদ, ভুল রেট বসানো হয় না

        const subtotal = Math.round(row.seat_count * rate * days / totalDays);
        segments.push({
            role: row.role,
            seat_count: row.seat_count,
            rate,
            days,
            full_period: days === totalDays,
            subtotal,
        });
    }
    return segments;
};

// ── মূল কাজ ──────────────────────────────────────────────────
const runTenantInvoiceGeneration = async ({ reason = 'scheduled' } = {}) => {
    logger.info(`\n🧾 Monthly Tenant Invoice Generation (arrears) শুরু [${reason}]...`);

    let createdCount = 0;

    try {
        // ⚠️ ARREARS — আগের (গত, সম্পূর্ণ শেষ হওয়া) মাসের জন্য, চলতি মাসের জন্য না
        const periodResult = await query(`
            SELECT
                (date_trunc('month', NOW() AT TIME ZONE 'Asia/Dhaka') - INTERVAL '1 month')::date AS period_start,
                (date_trunc('month', NOW() AT TIME ZONE 'Asia/Dhaka') - INTERVAL '1 day')::date AS period_end
        `);
        const { period_start: periodStart, period_end: periodEnd } = periodResult.rows[0];
        const periodStartDay = toDayNum(periodStart);
        const periodEndDay   = toDayNum(periodEnd);
        const totalDays      = periodEndDay - periodStartDay + 1;

        const tenantsResult = await query(
            `SELECT id, plan FROM tenants WHERE status IN ('active', 'suspended')`
        );

        for (const tenant of tenantsResult.rows) {
            // period_end পর্যন্ত সব history — তার আগেই effective হয়েছে এমন সব
            // এন্ট্রি লাগবে (এমনকি period শুরুর অনেক আগেরটাও, যদি সেটাই সর্বশেষ হয়)
            const historyResult = await query(
                `SELECT role, seat_count, rate_locked, effective_from
                 FROM tenant_seat_history
                 WHERE tenant_id = $1 AND effective_from <= $2
                 ORDER BY role, effective_from ASC`,
                [tenant.id, periodEnd]
            );

            // role অনুযায়ী গ্রুপ করা
            const byRole = {};
            for (const row of historyResult.rows) {
                (byRole[row.role] ??= []).push(row);
            }

            let breakdown = [];
            let total = 0;
            for (const role of Object.keys(byRole)) {
                const segments = computeRoleSegments(byRole[role], tenant.plan, periodStartDay, periodEndDay, totalDays);
                breakdown = breakdown.concat(segments);
                total += segments.reduce((sum, s) => sum + s.subtotal, 0);
            }

            if (total <= 0) continue; // কোনো বিলযোগ্য সিট নেই এই পিরিয়ডে — ইনভয়েস স্কিপ

            const invoiceNumber = `INV-${periodStart.toISOString().slice(0, 7).replace('-', '')}-${tenant.id.slice(0, 8).toUpperCase()}`;

            const inserted = await query(
                `INSERT INTO tenant_invoices
                    (tenant_id, invoice_number, period_start, period_end, plan, seat_breakdown, total_amount, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
                 ON CONFLICT (tenant_id, period_start) DO NOTHING
                 RETURNING id`,
                [tenant.id, invoiceNumber, periodStart, periodEnd, tenant.plan, JSON.stringify(breakdown), total]
            );
            if (inserted.rows.length > 0) createdCount += 1;
        }

        logger.info(`✅ Tenant Invoice Generation সম্পন্ন — ${createdCount}টা নতুন ইনভয়েস তৈরি হয়েছে (পিরিয়ড: ${periodStart.toISOString().slice(0,10)} → ${periodEnd.toISOString().slice(0,10)})।`);

        await query(
            `INSERT INTO job_runs (job_name, ran_at, rows_affected) VALUES ($1, NOW(), $2)`,
            [JOB_NAME, createdCount]
        ).catch(err => {
            logger.warn('⚠️ job_runs লগ ব্যর্থ:', err.message);
        });

    } catch (error) {
        logger.error('❌ Tenant Invoice Generation ব্যর্থ:', error.message);
    }
};

// ── Startup-এ missed run চেক (এই ক্যালেন্ডার মাসে চলেছে কিনা) ────
const runIfMissedThisMonth = async () => {
    try {
        const result = await query(
            `SELECT ran_at FROM job_runs
             WHERE job_name = $1
               AND ran_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Dhaka')
             ORDER BY ran_at DESC
             LIMIT 1`,
            [JOB_NAME]
        );

        if (result.rows.length === 0) {
            logger.info('⚠️ Tenant Invoice Generation এই মাসে চলেনি — startup catch-up run শুরু হচ্ছে...');
            await runTenantInvoiceGeneration({ reason: 'startup-catchup' });
        } else {
            const lastRun = result.rows[0].ran_at;
            logger.info(`✅ Tenant Invoice Generation এই মাসে ইতোমধ্যে চলেছে (${lastRun.toISOString()}) — skip।`);
        }
    } catch (err) {
        if (err.message?.includes('job_runs') || err.message?.includes('tenant_invoices') || err.message?.includes('tenant_seat_history')) {
            logger.warn('⚠️ প্রয়োজনীয় টেবিল নেই (migration_tenant_invoices_table.sql / migration_tenant_seat_history.sql চালানো হয়নি?) — missed-run চেক বাদ দেওয়া হলো।');
        } else {
            logger.error('❌ Missed-run চেকে সমস্যা:', err.message);
        }
    }
};

// ── Job রেজিস্ট্রেশন ────────────────────────────────────────────
const startTenantInvoiceJob = () => {
    cron.schedule('0 1 1 * *', async () => {
        logger.info('🔔 Monthly Tenant Invoice Job ট্রিগার হয়েছে');
        await runTenantInvoiceGeneration({ reason: 'scheduled' });
    }, {
        timezone: 'Asia/Dhaka'
    });

    logger.info('⏰ Monthly Tenant Invoice Job নিবন্ধিত: প্রতি মাসের ১ তারিখ, রাত ১:০০ (arrears, আগের মাসের জন্য)');

    setImmediate(() => {
        runIfMissedThisMonth().catch(err =>
            logger.error('❌ Startup missed-run check error:', err.message)
        );
    });
};

module.exports = { startTenantInvoiceJob, runTenantInvoiceGeneration };
