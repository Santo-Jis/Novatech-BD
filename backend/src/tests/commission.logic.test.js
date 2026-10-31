/**
 * commission.logic.test.js
 * ─────────────────────────────────────────────────────────────
 * Commission হিসাবের টেস্ট
 *
 * বিজনেস নিয়ম:
 * - বিক্রয়ের উপর commission হয়
 * - বাকি (credit) আদায় না হওয়া পর্যন্ত সেই অংশের commission গণনা হয় না
 * - Slab অনুযায়ী rate DB থেকে আসে
 * - Attendance bonus আলাদা (৮ মাস পূর্ণ উপস্থিতিতে)
 * ─────────────────────────────────────────────────────────────
 */

jest.mock('../config/db', () => ({
    query: jest.fn()
}));

// ✅ RLS FIX: calculateCommissionRate/calculateCommission এখন withTenantScope
// (../config/tenantScopedDb, app_backend role) দিয়ে কানেক্ট করে, plain query()
// দিয়ে না — commission_settings-এ RLS policy আছে। getDailyCommissionableSales
// এখনো পুরনো pool-ই ব্যবহার করে (sales_transactions/collections/credit_payments
// — এই iteration-এর scope-এর বাইরে, দেখো RLS migration-এর নোট)।
jest.mock('../config/tenantScopedDb', () => {
    const clientQuery = jest.fn();
    const withTenantScope = jest.fn(async (tenantId, callback) => {
        if (!tenantId) {
            throw new Error('withTenantScope: tenantId বাধ্যতামূলক (RLS-এর জন্য)');
        }
        return callback({ query: clientQuery });
    });
    return { withTenantScope, __clientQuery: clientQuery };
});

const { query } = require('../config/db');
const { withTenantScope, __clientQuery: rlsQuery } = require('../config/tenantScopedDb');
const { calculateCommission, calculateCommissionRate, getDailyCommissionableSales } = require('../services/commission.service');

beforeEach(() => {
    rlsQuery.mockReset();
    withTenantScope.mockClear();
});

// ─── calculateCommissionRate ──────────────────────────────────

describe('calculateCommissionRate — বিক্রয় অনুযায়ী rate বের করা', () => {

    test('slab পাওয়া গেলে সেই rate ফেরত দেবে', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [{ rate: 10 }] });

        const rate = await calculateCommissionRate(50000, 'tenant-1');
        expect(rate).toBe(10);
    });

    test('কোনো slab না পাওয়া গেলে rate = 0', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [] });

        const rate = await calculateCommissionRate(50000, 'tenant-1');
        expect(rate).toBe(0);
    });

    test('বিক্রয় 0 হলে rate = 0 (slab নেই)', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [] });

        const rate = await calculateCommissionRate(0, 'tenant-1');
        expect(rate).toBe(0);
    });

    // ✅ P0 FIX (Bug #1) প্রমাণ: tenantId ছাড়া কল করলে এখন throw করবে —
    // চুপচাপ অন্য tenant-এর slab নিয়ে আসার আগেই ভুলটা ধরা পড়বে।
    test('tenantId ছাড়া কল করলে error throw করবে (tenant isolation guard)', async () => {
        await expect(calculateCommissionRate(50000)).rejects.toThrow(/tenantId/i);
        await expect(calculateCommissionRate(50000, null)).rejects.toThrow(/tenantId/i);
    });

    // ✅ P0 FIX (Bug #1) প্রমাণ: query-তে tenant_id ঠিকভাবে filter হিসেবে
    // যাচ্ছে কিনা — এটাই সেই প্রপার্টি যেটা আগে কোথাও টেস্ট করা হয়নি এবং
    // যার কারণে cross-tenant rate leak ধরা পড়েনি।
    test('SQL-এ tenant_id ফিল্টার থাকে, এবং tenantId ঠিক param হিসেবে যায়', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [{ rate: 8 }] });

        await calculateCommissionRate(75000, 'tenant-42');

        const [sql, params] = rlsQuery.mock.calls[0];
        expect(sql).toEqual(expect.stringContaining('tenant_id'));
        expect(params).toEqual([75000, 'tenant-42']);
    });

    // ✅ Regression guard: দুই tenant-এর slab আলাদা হলে দুইজন আলাদা rate পাবে,
    // একজন আরেকজনের rate "দেখতে" পাবে না — mock দিয়ে সরাসরি এই প্রপার্টি প্রমাণ।
    test('একই salesAmount-এ দুই ভিন্ন tenant ভিন্ন rate পেতে পারে (leak নেই)', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [{ rate: 5 }] });  // tenant A-র slab
        const rateA = await calculateCommissionRate(60000, 'tenant-A');

        rlsQuery.mockResolvedValueOnce({ rows: [{ rate: 9 }] });  // tenant B-র slab
        const rateB = await calculateCommissionRate(60000, 'tenant-B');

        expect(rateA).toBe(5);
        expect(rateB).toBe(9);
        expect(rateA).not.toBe(rateB);

        // প্রতিটা কল নিজের tenantId-ই পাঠিয়েছে, একটা আরেকটার সাথে মিশে যায়নি
        expect(rlsQuery.mock.calls[0][1]).toEqual([60000, 'tenant-A']);
        expect(rlsQuery.mock.calls[1][1]).toEqual([60000, 'tenant-B']);
    });
});

// ─── calculateCommission ──────────────────────────────────────

describe('calculateCommission — rate ও amount হিসাব', () => {

    test('৫০,০০০ টাকা বিক্রয়ে ১০% rate — commission ৫,০০০', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [{ rate: 10 }] });

        const result = await calculateCommission(50000, 'tenant-1');
        expect(result.rate).toBe(10);
        expect(result.amount).toBe(5000);
    });

    test('commission Math.round দিয়ে পূর্ণ সংখ্যা হবে', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [{ rate: 7 }] });

        // 30000 × 7% = 2100 (এটা সঠিক)
        const result = await calculateCommission(30000, 'tenant-1');
        expect(Number.isInteger(result.amount)).toBe(true);
        expect(result.amount).toBe(2100);
    });

    test('rate 0 হলে commission 0', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [{ rate: 0 }] });

        const result = await calculateCommission(100000, 'tenant-1');
        expect(result.amount).toBe(0);
    });

    test('বিক্রয় 0 হলে commission 0', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [] }); // no slab

        const result = await calculateCommission(0, 'tenant-1');
        expect(result.amount).toBe(0);
        expect(result.rate).toBe(0);
    });

    test('result object-এ rate ও amount দুটোই আছে', async () => {
        rlsQuery.mockResolvedValueOnce({ rows: [{ rate: 5 }] });

        const result = await calculateCommission(20000, 'tenant-1');
        expect(result).toHaveProperty('rate');
        expect(result).toHaveProperty('amount');
    });
});

// ─── Credit বাকি থাকলে Commission গণনা হবে না ───────────────
// বিজনেস নিয়ম: বাকি আদায় না হওয়া পর্যন্ত সেই অংশের commission নেই
// আসল implementation: commission.service.js::getDailyCommissionableSales
// (নিচের প্রথম describe ব্লক শুধু arithmetic-টা isolation-এ দেখায়;
//  দ্বিতীয় ব্লকটা আসল ফাংশন DB mock দিয়ে টেস্ট করে — এইটা মিসিং ছিল
//  বলেই আগে rule-টা টেস্ট-এ ছিল কিন্তু বাস্তবে wire হয়নি)

describe('Credit বাকির উপর commission বিজনেস নিয়ম (arithmetic concept)', () => {

    /**
     * কমিশনযোগ্য বিক্রয় হিসাব
     * মোট বিক্রয় থেকে এখনো আদায় না হওয়া credit বাদ দেওয়া হয়
     */
    const calcCommissionableSales = (totalSales, pendingCredit) => {
        return Math.max(0, totalSales - pendingCredit);
    };

    test('সব নগদ বিক্রয় — পুরো amount commission-যোগ্য', () => {
        const commissionable = calcCommissionableSales(50000, 0);
        expect(commissionable).toBe(50000);
    });

    test('আংশিক credit — শুধু নগদ অংশে commission', () => {
        // ৫০,০০০ বিক্রয়ের মধ্যে ১৫,০০০ বাকি → ৩৫,০০০ এ commission
        const commissionable = calcCommissionableSales(50000, 15000);
        expect(commissionable).toBe(35000);
    });

    test('সব credit বাকি — commission 0', () => {
        const commissionable = calcCommissionableSales(30000, 30000);
        expect(commissionable).toBe(0);
    });

    test('commissionable sales কখনো negative হবে না', () => {
        const commissionable = calcCommissionableSales(10000, 15000);
        expect(commissionable).toBe(0);
    });

    test('credit আদায় হলে commission গণনায় যোগ হবে', () => {
        // আগের মাসে ১৫,০০০ বাকি ছিল, এই মাসে ১০,০০০ আদায় হলো
        const previousPending = 15000;
        const collectedNow    = 10000;
        const remainingCredit = previousPending - collectedNow;

        const commissionable = calcCommissionableSales(50000, remainingCredit);
        expect(commissionable).toBe(45000); // 50000 - 5000 বাকি
    });
});

// ─── getDailyCommissionableSales — আসল ফাংশন, DB mock দিয়ে ────
// query() তিনবার call হয়: sales_transactions, collections, credit_payments
// (Promise.all — mock-এর অর্ডার = call-এর অর্ডার)।
// sales query-তে 'credit' sale-এর শুধু cash_received অংশ commissionable
// (আংশিক পেমেন্ট), বাকি অংশ নয় — SQL নিজেই এই হিসাব করে cash_sales ফেরত দেয়।

describe('getDailyCommissionableSales — আসল implementation (DB mocked)', () => {

    const mockAll = (cashSales, viaCollections = '0', viaCreditPay = '0') => {
        query
            .mockResolvedValueOnce({ rows: cashSales === null ? [] : [{ cash_sales: cashSales }] })
            .mockResolvedValueOnce({ rows: cashSales === null ? [] : [{ collected: viaCollections }] })
            .mockResolvedValueOnce({ rows: cashSales === null ? [] : [{ collected: viaCreditPay }] });
    };

    beforeEach(() => {
        query.mockReset();
    });

    test('শুধু নগদ বিক্রয় — পুরো amount commissionable', async () => {
        mockAll('50000');
        expect(await getDailyCommissionableSales('worker-1', '2026-09-08')).toBe(50000);
    });

    test('আংশিক পেমেন্ট — ৫০০০ বিলে ৪৫০০ নগদ হলে শুধু ৪৫০০ commissionable (SQL ফল)', async () => {
        mockAll('4500');
        expect(await getDailyCommissionableSales('worker-1', '2026-09-08')).toBe(4500);
    });

    test('পুরো বাকি বিক্রয় — commissionable ০', async () => {
        mockAll('0');
        expect(await getDailyCommissionableSales('worker-1', '2026-09-08')).toBe(0);
    });

    test('আজ verified হওয়া collection যোগ হয়', async () => {
        mockAll('20000', '15000');
        expect(await getDailyCommissionableSales('worker-1', '2026-09-08')).toBe(35000);
    });

    test('credit_payments (সরাসরি বাকি আদায়) যোগ হয়', async () => {
        mockAll('20000', '0', '5000');
        expect(await getDailyCommissionableSales('worker-1', '2026-09-08')).toBe(25000);
    });

    test('row না পাওয়া গেলেও crash না করে 0 ধরবে', async () => {
        mockAll(null);
        expect(await getDailyCommissionableSales('worker-1', '2026-09-08')).toBe(0);
    });

    test('collections query status=verified দিয়ে ফিল্টার করে', async () => {
        mockAll('0');
        await getDailyCommissionableSales('worker-1', '2026-09-08');
        const args = query.mock.calls[1];
        expect(args[0]).toEqual(expect.stringContaining("status = 'verified'"));
        expect(args[1]).toEqual(['worker-1', '2026-09-08']);
    });

    test("sales query 'credit' sale-এ cash_received ব্যবহার করে, total_amount নয়", async () => {
        mockAll('0');
        await getDailyCommissionableSales('worker-1', '2026-09-08');
        const sql = query.mock.calls[0][0];
        expect(sql).toEqual(expect.stringContaining("payment_method = 'credit'"));
        expect(sql).toEqual(expect.stringContaining('cash_received'));
    });
});

// ─── Attendance Bonus নিয়ম ───────────────────────────────────

describe('Attendance Bonus — ৮ মাস পূর্ণ উপস্থিতি', () => {

    /**
     * Bonus পাওয়ার যোগ্যতা যাচাই
     * ৮ মাস পূর্ণ উপস্থিতি (কোনো absent নেই) হলে bonus
     */
    const isPerfectMonth = (workingDays, presentDays) => {
        return presentDays >= workingDays && workingDays > 0;
    };

    const countPerfectMonths = (monthlyRecords) => {
        return monthlyRecords.filter(m => isPerfectMonth(m.workingDays, m.presentDays)).length;
    };

    test('সব দিন উপস্থিত — perfect month', () => {
        expect(isPerfectMonth(26, 26)).toBe(true);
    });

    test('একদিন অনুপস্থিত — perfect month নয়', () => {
        expect(isPerfectMonth(26, 25)).toBe(false);
    });

    test('৮ মাসের মধ্যে ৮ টি perfect — bonus eligible', () => {
        const records = Array(8).fill({ workingDays: 26, presentDays: 26 });
        expect(countPerfectMonths(records)).toBe(8);
    });

    test('৮ মাসের মধ্যে ৭ টি perfect — bonus নয়', () => {
        const records = [
            ...Array(7).fill({ workingDays: 26, presentDays: 26 }),
            { workingDays: 26, presentDays: 24 } // একমাস miss
        ];
        expect(countPerfectMonths(records)).toBe(7);
    });

    test('workingDays = 0 হলে perfect নয় (invalid data)', () => {
        expect(isPerfectMonth(0, 0)).toBe(false);
    });
});
