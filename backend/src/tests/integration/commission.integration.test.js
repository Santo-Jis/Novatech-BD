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

// ─── Prerequisite: commission_settings টেবিলে ডাটা আছে? ─────

describe('commission_settings টেবিল — DB sanity check', () => {

    test('টেবিলে অন্তত একটি active slab থাকবে', async () => {
        const result = await query(
            `SELECT COUNT(*) AS cnt
             FROM commission_settings
             WHERE is_active = true`
        );
        const count = parseInt(result.rows[0].cnt);
        expect(count).toBeGreaterThan(0);
    });

    test('প্রতিটি active slab-এ rate > 0 থাকবে', async () => {
        const result = await query(
            `SELECT id, slab_min, rate
             FROM commission_settings
             WHERE is_active = true AND rate <= 0`
        );
        // rate <= 0 এমন কোনো active slab থাকা উচিত না
        expect(result.rows.length).toBe(0);
    });

    test('slab_min গুলো unique থাকবে (overlap নেই)', async () => {
        const result = await query(
            `SELECT slab_min, COUNT(*) AS cnt
             FROM commission_settings
             WHERE is_active = true
             GROUP BY slab_min
             HAVING COUNT(*) > 1`
        );
        expect(result.rows.length).toBe(0);
    });
});

// ─── calculateCommissionRate — Real DB query ──────────────────

describe('calculateCommissionRate — Real DB slab query', () => {

    test('DB-তে থাকা slab-এর জন্য সঠিক rate আসে', async () => {
        // প্রথম active slab নিয়ে test করি
        const slabResult = await query(
            `SELECT slab_min, slab_max, rate
             FROM commission_settings
             WHERE is_active = true
             ORDER BY slab_min ASC
             LIMIT 1`
        );

        if (slabResult.rows.length === 0) {
            console.warn('⚠️ commission_settings-এ কোনো slab নেই — test skip');
            return;
        }

        const slab = slabResult.rows[0];
        // slab_min এর মাঝামাঝি একটা value দিই
        const testAmount = parseFloat(slab.slab_min) + 1000;

        const rate = await calculateCommissionRate(testAmount);
        expect(rate).toBe(parseFloat(slab.rate));
    });

    test('সব slab-এর বাইরে গেলে rate = 0', async () => {
        // এত ছোট amount যে কোনো slab match করবে না
        const rate = await calculateCommissionRate(-1);
        expect(rate).toBe(0);
    });

    test('rate সবসময় number type হবে', async () => {
        const rate = await calculateCommissionRate(50000);
        expect(typeof rate).toBe('number');
    });
});

// ─── calculateCommission — end-to-end Real DB ────────────────

describe('calculateCommission — Real DB দিয়ে শেষ পর্যন্ত', () => {

    test('result-এ rate ও amount দুটোই আসে', async () => {
        const result = await calculateCommission(50000);
        expect(result).toHaveProperty('rate');
        expect(result).toHaveProperty('amount');
    });

    test('amount সবসময় পূর্ণ সংখ্যা (Math.round)', async () => {
        const result = await calculateCommission(33333);
        expect(Number.isInteger(result.amount)).toBe(true);
    });

    test('amount = salesAmount × rate / 100 (rounded)', async () => {
        const salesAmount = 100000;
        const result = await calculateCommission(salesAmount);
        const expected = Math.round((salesAmount * result.rate) / 100);
        expect(result.amount).toBe(expected);
    });

    test('বিক্রয় 0 হলে amount = 0', async () => {
        const result = await calculateCommission(0);
        expect(result.amount).toBe(0);
    });

    test('amount কখনো negative হবে না', async () => {
        const result = await calculateCommission(5000);
        expect(result.amount).toBeGreaterThanOrEqual(0);
    });
});
