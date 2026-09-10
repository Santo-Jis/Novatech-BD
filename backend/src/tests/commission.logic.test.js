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

const { query } = require('../config/db');
const { calculateCommission, calculateCommissionRate, getDailyCommissionableSales } = require('../services/commission.service');

// ─── calculateCommissionRate ──────────────────────────────────

describe('calculateCommissionRate — বিক্রয় অনুযায়ী rate বের করা', () => {

    test('slab পাওয়া গেলে সেই rate ফেরত দেবে', async () => {
        query.mockResolvedValueOnce({ rows: [{ rate: 10 }] });

        const rate = await calculateCommissionRate(50000);
        expect(rate).toBe(10);
    });

    test('কোনো slab না পাওয়া গেলে rate = 0', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const rate = await calculateCommissionRate(50000);
        expect(rate).toBe(0);
    });

    test('বিক্রয় 0 হলে rate = 0 (slab নেই)', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const rate = await calculateCommissionRate(0);
        expect(rate).toBe(0);
    });
});

// ─── calculateCommission ──────────────────────────────────────

describe('calculateCommission — rate ও amount হিসাব', () => {

    test('৫০,০০০ টাকা বিক্রয়ে ১০% rate — commission ৫,০০০', async () => {
        query.mockResolvedValueOnce({ rows: [{ rate: 10 }] });

        const result = await calculateCommission(50000);
        expect(result.rate).toBe(10);
        expect(result.amount).toBe(5000);
    });

    test('commission Math.round দিয়ে পূর্ণ সংখ্যা হবে', async () => {
        query.mockResolvedValueOnce({ rows: [{ rate: 7 }] });

        // 30000 × 7% = 2100 (এটা সঠিক)
        const result = await calculateCommission(30000);
        expect(Number.isInteger(result.amount)).toBe(true);
        expect(result.amount).toBe(2100);
    });

    test('rate 0 হলে commission 0', async () => {
        query.mockResolvedValueOnce({ rows: [{ rate: 0 }] });

        const result = await calculateCommission(100000);
        expect(result.amount).toBe(0);
    });

    test('বিক্রয় 0 হলে commission 0', async () => {
        query.mockResolvedValueOnce({ rows: [] }); // no slab

        const result = await calculateCommission(0);
        expect(result.amount).toBe(0);
        expect(result.rate).toBe(0);
    });

    test('result object-এ rate ও amount দুটোই আছে', async () => {
        query.mockResolvedValueOnce({ rows: [{ rate: 5 }] });

        const result = await calculateCommission(20000);
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
// এখানে query() দুইবার call হয় (sales_transactions + collections),
// Promise.all ব্যবহার হয় বলে mockResolvedValueOnce-এর অর্ডার হবে
// query() কল হওয়ার অর্ডার অনুযায়ী: প্রথমে sales, তারপর collections।

describe('getDailyCommissionableSales — আসল implementation (DB mocked)', () => {

    beforeEach(() => {
        query.mockReset();
    });

    test('শুধু নগদ বিক্রয় — পুরো amount commissionable, credit query 0', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ cash_sales: '50000' }] })  // sales_transactions
            .mockResolvedValueOnce({ rows: [{ collected:  '0'     }] }); // collections

        const result = await getDailyCommissionableSales('worker-1', '2026-09-08');
        expect(result).toBe(50000);
    });

    test('credit বিক্রয় বাদ যায় — FILTER (WHERE payment_method != \'credit\') ধরে নিয়ে cash_sales-ই কম আসে', async () => {
        // ৫০,০০০ মোট বিক্রয়ের মধ্যে ১৫,০০০ credit — DB query নিজেই ৩৫,০০০ ফেরত দেবে
        // (FILTER ক্লজ credit বাদ দেয়), তাই cash_sales = 35000 আসাটাই আসল প্যাটার্ন
        query
            .mockResolvedValueOnce({ rows: [{ cash_sales: '35000' }] })
            .mockResolvedValueOnce({ rows: [{ collected:  '0'     }] });

        const result = await getDailyCommissionableSales('worker-1', '2026-09-08');
        expect(result).toBe(35000);
    });

    test('আজ verified হওয়া collection যোগ হয় cash sales-এর সাথে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ cash_sales: '20000' }] })
            .mockResolvedValueOnce({ rows: [{ collected:  '15000' }] }); // আজ verify হওয়া বাকি আদায়

        const result = await getDailyCommissionableSales('worker-1', '2026-09-08');
        expect(result).toBe(35000); // 20000 + 15000
    });

    test('sales বা collection কোনোটাই না থাকলে 0', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ cash_sales: '0' }] })
            .mockResolvedValueOnce({ rows: [{ collected:  '0' }] });

        const result = await getDailyCommissionableSales('worker-1', '2026-09-08');
        expect(result).toBe(0);
    });

    test('row না পাওয়া গেলেও (undefined) crash না করে 0 ধরবে', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await getDailyCommissionableSales('worker-1', '2026-09-08');
        expect(result).toBe(0);
    });

    test('collections query worker_id ও status=verified দিয়ে ফিল্টার করে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ cash_sales: '0' }] })
            .mockResolvedValueOnce({ rows: [{ collected:  '0' }] });

        await getDailyCommissionableSales('worker-1', '2026-09-08');

        const collectionsCallArgs = query.mock.calls[1];
        expect(collectionsCallArgs[0]).toEqual(expect.stringContaining("status = 'verified'"));
        expect(collectionsCallArgs[1]).toEqual(['worker-1', '2026-09-08']);
    });

    test('sales query credit বাদ দিতে payment_method != \'credit\' ব্যবহার করে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ cash_sales: '0' }] })
            .mockResolvedValueOnce({ rows: [{ collected:  '0' }] });

        await getDailyCommissionableSales('worker-1', '2026-09-08');

        const salesCallArgs = query.mock.calls[0];
        expect(salesCallArgs[0]).toEqual(expect.stringContaining("payment_method != 'credit'"));
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
