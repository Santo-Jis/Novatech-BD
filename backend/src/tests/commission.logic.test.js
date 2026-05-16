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
const { calculateCommission, calculateCommissionRate } = require('../services/commission.service');

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
// এই লজিক commission.job.js এ আছে, তাই pure logic টেস্ট করি

describe('Credit বাকির উপর commission বিজনেস নিয়ম', () => {

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
