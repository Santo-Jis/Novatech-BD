/**
 * commission.integration.test.js
 * ─────────────────────────────────────────────────────────────
 * Commission Service — Real DB Integration Test
 *
 * কী টেস্ট হচ্ছে:
 *   - commission_settings টেবিলে slab আছে কিনা
 *   - calculateCommissionRate সঠিক slab খুঁজে পায় কিনা
 *   - calculateCommission সঠিক amount দেয় কিনা
 *   - Edge case: slab-এর বাইরে গেলে rate = 0
 *
 * ⚠️  Real DB লাগবে — integration test only
 *     npm run test:integration দিয়ে চালাও
 *
 * ⚠️  RLS FIX: calculateCommissionRate/calculateCommission এখন
 *     withTenantScope (../../config/tenantScopedDb, app_backend role) দিয়ে
 *     কানেক্ট করে, plain query() (postgres role) দিয়ে না। এই টেস্ট চালানোর
 *     জন্য env-এ COMMISSION_DB_USER আর COMMISSION_DB_PASSWORD সেট থাকা
 *     লাগবে (app_backend role-এর ক্রেডেনশিয়াল) — নাহলে এই দুইটা ফাংশনের
 *     টেস্ট fail করবে, যদিও sanity-check queries (plain query() দিয়ে) ঠিকই
 *     চলবে।
 * ─────────────────────────────────────────────────────────────
 */

const { query, pool } = require('../../config/db');
const {
    calculateCommission,
    calculateCommissionRate,
} = require('../../services/commission.service');

// ─── DB connection cleanup ────────────────────────────────────
afterAll(async () => {
    await pool.end();
});

// ✅ P0 FIX: calculateCommissionRate/calculateCommission এখন tenantId
// বাধ্যতামূলক প্যারামিটার নেয় (দেখো commission.service.js-এর P0 FIX
// কমেন্ট)। এই ফাইলের সব কল তাই একটা বাস্তব tenant_id ব্যবহার করবে,
// আর নিচের sanity check-ও পুরো টেবিল জুড়ে না, সেই একটা tenant-এ scope
// করা হলো — আগে এই sanity check নিজেই tenant-blind ছিল।
let testTenantId = null;

beforeAll(async () => {
    const t = await query(
        `SELECT DISTINCT tenant_id FROM commission_settings WHERE is_active = true LIMIT 1`
    );
    testTenantId = t.rows[0]?.tenant_id || null;
});

// ─── Prerequisite: commission_settings টেবিলে ডাটা আছে? ─────

describe('commission_settings টেবিল — DB sanity check', () => {

    test('অন্তত একটা tenant-এ active slab থাকবে', async () => {
        expect(testTenantId).not.toBeNull();
    });

    test('টেস্ট tenant-এ অন্তত একটি active slab থাকবে', async () => {
        if (!testTenantId) return; // আগের টেস্টেই fail হয়ে গেছে, এখানে আর skip warning দরকার নেই
        const result = await query(
            `SELECT COUNT(*) AS cnt
             FROM commission_settings
             WHERE is_active = true AND tenant_id = $1`,
            [testTenantId]
        );
        const count = parseInt(result.rows[0].cnt);
        expect(count).toBeGreaterThan(0);
    });

    test('টেস্ট tenant-এর প্রতিটি active slab-এ rate >= 0 থাকবে (negative নয়)', async () => {
        if (!testTenantId) return;
        const result = await query(
            `SELECT id, slab_min, rate
             FROM commission_settings
             WHERE is_active = true AND tenant_id = $1 AND rate < 0`,
            [testTenantId]
        );
        // rate negative এমন কোনো active slab থাকা উচিত না
        expect(result.rows.length).toBe(0);
    });

    test('টেস্ট tenant-এর slab_min গুলো unique থাকবে (নিজের মধ্যে overlap নেই)', async () => {
        if (!testTenantId) return;
        const result = await query(
            `SELECT slab_min, COUNT(*) AS cnt
             FROM commission_settings
             WHERE is_active = true AND tenant_id = $1
             GROUP BY slab_min
             HAVING COUNT(*) > 1`,
            [testTenantId]
        );
        expect(result.rows.length).toBe(0);
    });
});

// ─── calculateCommissionRate — Real DB query ──────────────────

describe('calculateCommissionRate — Real DB slab query', () => {

    test('DB-তে থাকা slab-এর জন্য সঠিক rate আসে', async () => {
        if (!testTenantId) return;

        // এই tenant-এর প্রথম active slab নিয়ে test করি
        const slabResult = await query(
            `SELECT slab_min, slab_max, rate
             FROM commission_settings
             WHERE is_active = true AND tenant_id = $1 AND rate > 0
             ORDER BY slab_min ASC
             LIMIT 1`,
            [testTenantId]
        );

        if (slabResult.rows.length === 0) {
            console.warn('⚠️ এই tenant-এর commission_settings-এ rate > 0 কোনো slab নেই — test skip');
            return;
        }

        const slab = slabResult.rows[0];
        // slab_max থাকলে midpoint নাও, না থাকলে slab_min + 1000
        const testAmount = slab.slab_max
            ? (parseFloat(slab.slab_min) + parseFloat(slab.slab_max)) / 2
            : parseFloat(slab.slab_min) + 1000;

        const rate = await calculateCommissionRate(testAmount, testTenantId);
        expect(rate).toBe(parseFloat(slab.rate));
    });

    test('সব slab-এর বাইরে গেলে rate = 0', async () => {
        if (!testTenantId) return;
        // এত ছোট amount যে কোনো slab match করবে না
        const rate = await calculateCommissionRate(-1, testTenantId);
        expect(rate).toBe(0);
    });

    test('rate সবসময় number type হবে', async () => {
        if (!testTenantId) return;
        const rate = await calculateCommissionRate(50000, testTenantId);
        expect(typeof rate).toBe('number');
    });

    test('tenantId ছাড়া কল করলে throw করবে', async () => {
        await expect(calculateCommissionRate(50000)).rejects.toThrow(/tenantId/i);
    });
});

// ✅ P0 FIX (Bug #1) — মূল রিগ্রেশন গার্ড: এটাই আগে সবচেয়ে বড় ফাঁক ছিল।
// দুইটা ভিন্ন tenant-এর active slab থাকলে, প্রতিটা tenant নিজের rate-ই
// পাবে — একজন আরেকজনের slab structure দিয়ে প্রভাবিত হবে না।
describe('Tenant isolation — Real DB (Bug #1 regression guard)', () => {

    test('দুই ভিন্ন tenant একই salesAmount-এ নিজ নিজ tenant-এর rate-ই পায়', async () => {
        const tenantsRes = await query(
            `SELECT DISTINCT tenant_id FROM commission_settings WHERE is_active = true LIMIT 2`
        );

        if (tenantsRes.rows.length < 2) {
            console.warn('⚠️ এই DB-তে ২টার কম tenant-এর active commission_settings আছে — isolation test skip');
            return;
        }

        const [tenantA, tenantB] = tenantsRes.rows.map(r => r.tenant_id);
        const testAmount = 999999999; // যথেষ্ট বড় amount — সর্বোচ্চ bracket-এ পড়বে (slab_max IS NULL)

        const rateA = await calculateCommissionRate(testAmount, tenantA);
        const rateB = await calculateCommissionRate(testAmount, tenantB);

        // সরাসরি DB থেকে প্রতিটা tenant-এর real rate যাচাই — যাতে প্রমাণ
        // হয় ফাংশনটা নিজ নিজ tenant-এর slab থেকেই rate এনেছে
        const directRate = async (tenantId) => {
            const r = await query(
                `SELECT rate FROM commission_settings
                 WHERE is_active = true AND tenant_id = $1
                   AND slab_min <= $2 AND (slab_max IS NULL OR slab_max >= $2)
                 ORDER BY slab_min DESC LIMIT 1`,
                [tenantId, testAmount]
            );
            return parseFloat(r.rows[0]?.rate) || 0;
        };

        expect(rateA).toBe(await directRate(tenantA));
        expect(rateB).toBe(await directRate(tenantB));
    });
});

// ─── calculateCommission — end-to-end Real DB ────────────────

describe('calculateCommission — Real DB দিয়ে শেষ পর্যন্ত', () => {

    test('result-এ rate ও amount দুটোই আসে', async () => {
        if (!testTenantId) return;
        const result = await calculateCommission(50000, testTenantId);
        expect(result).toHaveProperty('rate');
        expect(result).toHaveProperty('amount');
    });

    test('amount সবসময় পূর্ণ সংখ্যা (Math.round)', async () => {
        if (!testTenantId) return;
        const result = await calculateCommission(33333, testTenantId);
        expect(Number.isInteger(result.amount)).toBe(true);
    });

    test('amount = salesAmount × rate / 100 (rounded)', async () => {
        if (!testTenantId) return;
        const salesAmount = 100000;
        const result = await calculateCommission(salesAmount, testTenantId);
        const expected = Math.round((salesAmount * result.rate) / 100);
        expect(result.amount).toBe(expected);
    });

    test('বিক্রয় 0 হলে amount = 0', async () => {
        if (!testTenantId) return;
        const result = await calculateCommission(0, testTenantId);
        expect(result.amount).toBe(0);
    });

    test('amount কখনো negative হবে না', async () => {
        if (!testTenantId) return;
        const result = await calculateCommission(5000, testTenantId);
        expect(result.amount).toBeGreaterThanOrEqual(0);
    });
});
