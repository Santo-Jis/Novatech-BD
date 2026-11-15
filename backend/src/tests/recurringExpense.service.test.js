jest.mock('../config/db', () => ({ query: jest.fn() }));
jest.mock('../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { query } = require('../config/db');
const { dueDates, installments, generatePrepaidExpenses, generateRecurringExpenses } = require('../services/recurringExpense.service');

describe('dueDates', () => {
    const t = (o) => ({ start_date: '2026-09-01', end_date: null, day_of_month: 5, ...o });

    test('শুরুর মাস থেকে চলতি মাস পর্যন্ত প্রতি মাসে একটা', () => {
        expect(dueDates(t(), '2026-11-15')).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
    });
    test('চলতি মাসের তারিখ এখনো আসেনি হলে বাদ', () => {
        expect(dueDates(t({ day_of_month: 20 }), '2026-11-15')).toEqual(['2026-09-20', '2026-10-20']);
    });
    test('শুরুর তারিখের আগের দিন বাদ (মাসের মাঝে শুরু)', () => {
        expect(dueDates(t({ start_date: '2026-10-10' }), '2026-11-15')).toEqual(['2026-11-05']);
    });
    test('end_date-এর পরে আর নয়', () => {
        expect(dueDates(t({ end_date: '2026-10-31' }), '2026-11-15')).toEqual(['2026-09-05', '2026-10-05']);
    });
    test('বছর পার হওয়া', () => {
        expect(dueDates(t({ start_date: '2026-11-01', day_of_month: 1 }), '2027-02-01'))
            .toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
    });
    test('ভবিষ্যতের start_date → কিছু নয়', () => {
        expect(dueDates(t({ start_date: '2027-01-01' }), '2026-11-15')).toEqual([]);
    });
});

describe('generateRecurringExpenses', () => {
    beforeEach(() => query.mockReset());

    test('শুধু নতুন row গোনে (ON CONFLICT হলে rowCount 0)', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-11-15T06:00:00Z'));
        query.mockResolvedValueOnce({ rows: [{
            id: 'r1', tenant_id: 't1', category_id: 'c1', expense_type: 'অফিস ভাড়া', amount: '20000',
            day_of_month: 5, start_date: '2026-10-01', end_date: null, created_by: 'u1',
            payment_method: 'bank', paid_to: 'বাড়িওয়ালা', note: null,
        }] });
        query.mockResolvedValueOnce({ rowCount: 0 }); // অক্টোবর — আগেই আছে
        query.mockResolvedValueOnce({ rowCount: 1 }); // নভেম্বর — নতুন
        expect(await generateRecurringExpenses()).toBe(1);
        expect(query).toHaveBeenCalledTimes(3);
        jest.useRealTimers();
    });

    test('created_by না থাকলে টেমপ্লেট বাদ', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'r1', created_by: null, start_date: '2026-10-01', day_of_month: 5 }] });
        expect(await generateRecurringExpenses()).toBe(0);
        expect(query).toHaveBeenCalledTimes(1);
    });
});

describe('installments (অগ্রিম খরচ ভাগ)', () => {
    test('সমান ভাগ, প্রতি মাসের ১ তারিখ', () => {
        expect(installments({ total_amount: '12000', months: 3, start_month: '2026-11-01' })).toEqual([
            { date: '2026-11-01', amount: 4000 }, { date: '2026-12-01', amount: 4000 }, { date: '2027-01-01', amount: 4000 },
        ]);
    });
    test('ভাগ না মিললে শেষ কিস্তিতে অবশিষ্ট, মোট ঠিক থাকে', () => {
        const r = installments({ total_amount: '10000', months: 3, start_month: '2026-01-01' });
        expect(r.map(x => x.amount)).toEqual([3333.33, 3333.33, 3333.34]);
        expect(Math.round(r.reduce((s, x) => s + x.amount, 0) * 100)).toBe(1000000);
    });
    test('১২ মাস, বছর পার', () => {
        const r = installments({ total_amount: '24000', months: 12, start_month: '2026-07-01' });
        expect(r[0].date).toBe('2026-07-01'); expect(r[11].date).toBe('2027-06-01');
    });
});

describe('generatePrepaidExpenses', () => {
    beforeEach(() => query.mockReset());
    test('শুধু আজ পর্যন্ত আসা কিস্তি ঢোকে', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-11-15T06:00:00Z'));
        query.mockResolvedValueOnce({ rows: [{ id: 'p1', tenant_id: 't', created_by: 'u', months: 4, total_amount: '12000',
            start_month: '2026-10-01', expense_type: 'বিমা', note: null }] });
        query.mockResolvedValue({ rowCount: 1 });
        expect(await generatePrepaidExpenses()).toBe(2); // অক্টোবর, নভেম্বর; ডিসেম্বর-জানুয়ারি ভবিষ্যৎ
        jest.useRealTimers();
    });
});
