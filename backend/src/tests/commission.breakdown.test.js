/**
 * commission.breakdown.test.js
 * ─────────────────────────────────────────────────────────────
 * প্রতিটি বিক্রি/আদায় থেকে কত কমিশন — getDailyCommissionBreakdown-এর টেস্ট
 *
 * মূল ইনভেরিয়েন্ট:
 *  - সারিগুলোর commissionable যোগফল === getDailyCommissionableSales-এর ফল
 *  - সারিগুলোর commission যোগফল === দিনের মোট কমিশন (রাউন্ডিং সহ হুবহু)
 *  - বাকি বিক্রিতে শুধু নগদ-পাওয়া অংশ ধরা হয়
 * ─────────────────────────────────────────────────────────────
 */

jest.mock('../config/db', () => ({ query: jest.fn() }));

jest.mock('../config/tenantScopedDb', () => {
    const clientQuery = jest.fn();
    const withTenantScope = jest.fn(async (tenantId, cb) => cb({ query: clientQuery }));
    return { withTenantScope, __clientQuery: clientQuery };
});

const { query } = require('../config/db');
const { __clientQuery: rlsQuery } = require('../config/tenantScopedDb');
const {
    getDailyCommissionBreakdown,
    getSaleCommissionMap,
} = require('../services/commission.service');

// SQL টেক্সট দেখে সঠিক mock রেজাল্ট দেয়
const mockDb = ({ sales = [], colls = [], cps = [], stored = null, override = null, slabRate = 2 }) => {
    query.mockImplementation(async (sql) => {
        if (sql.includes('FROM sales_transactions st'))  return { rows: sales };
        if (sql.includes('FROM collections co'))         return { rows: colls };
        if (sql.includes('FROM credit_payments cp'))     return { rows: cps };
        if (sql.includes('FROM commission'))             return { rows: stored ? [stored] : [] };
        if (sql.includes('commission_rate_override'))    return { rows: [{ commission_rate_override: override }] };
        return { rows: [] };
    });
    rlsQuery.mockResolvedValue({ rows: [{ rate: slabRate }] });
};

const sale = (id, pm, total, cash = null, at = '2026-11-01T04:00:00Z') => ({
    id, invoice_number: `INV-${id}`, payment_method: pm,
    total_amount: total, net_amount: total, cash_received: cash, at, shop_name: `Shop ${id}`,
});

beforeEach(() => { query.mockReset(); rlsQuery.mockReset(); });

describe('getDailyCommissionBreakdown', () => {
    test('নগদ + আংশিক বাকি + আদায় — commissionable ও কমিশন মেলে', async () => {
        mockDb({
            sales: [sale('a', 'cash', 5000), sale('b', 'credit', 8000, 3000, '2026-11-01T05:00:00Z'), sale('c', 'credit', 4000, 0, '2026-11-01T06:00:00Z')],
            colls: [{ id: 'k1', amount: 2000, payment_mode: 'cash', at: '2026-11-01T07:00:00Z', shop_name: 'Shop X' }],
            slabRate: 2,
        });
        const r = await getDailyCommissionBreakdown('w1', '2026-11-01', 't1');

        expect(r.total_sales).toBe(10000);            // 5000 + 3000 + 0 + 2000
        expect(r.rate).toBe(2);
        expect(r.total_commission).toBe(200);
        expect(r.entries.map(e => e.commissionable)).toEqual([5000, 3000, 0, 2000]);
        expect(r.entries.map(e => e.commission)).toEqual([100, 60, 0, 40]);
        expect(r.entries.map(e => e.status)).toEqual(['cash', 'partial', 'due', 'collected']);
        expect(r.entries.reduce((s, e) => s + e.commission, 0)).toBe(r.total_commission);
    });

    test('রাউন্ডিং: সারির যোগফল হুবহু দিনের মোট কমিশনের সমান', async () => {
        mockDb({
            sales: [sale('a', 'cash', 3333), sale('b', 'cash', 3333, null, '2026-11-01T05:00:00Z'), sale('c', 'cash', 3334, null, '2026-11-01T06:00:00Z')],
            slabRate: 1.5,
        });
        const r = await getDailyCommissionBreakdown('w1', '2026-11-01', 't1');
        expect(r.total_commission).toBe(Math.round((10000 * 1.5) / 100)); // 150
        expect(r.entries.reduce((s, e) => s + e.commission, 0)).toBe(150);
        r.entries.forEach(e => expect(Number.isInteger(e.commission)).toBe(true));
    });

    test('রিপ্লেসমেন্ট বিক্রির status = replacement, পুরো মূল্য commissionable', async () => {
        mockDb({ sales: [sale('r', 'replacement', 2000)], slabRate: 2 });
        const r = await getDailyCommissionBreakdown('w1', '2026-11-01', 't1');
        expect(r.entries[0].status).toBe('replacement');
        expect(r.entries[0].commissionable).toBe(2000);
        expect(r.entries[0].commission).toBe(40);
    });

    test('SR-এর কাস্টম রেট থাকলে rate_mode = custom এবং সেই রেটই প্রযোজ্য', async () => {
        mockDb({ sales: [sale('a', 'cash', 10000)], override: '5.00', slabRate: 1 });
        const r = await getDailyCommissionBreakdown('w1', '2026-11-01', 't1');
        expect(r.rate_mode).toBe('custom');
        expect(r.rate).toBe(5);
        expect(r.entries[0].commission).toBe(500);
    });

    test('কিছুই না থাকলে খালি তালিকা, কমিশন ০', async () => {
        mockDb({});
        const r = await getDailyCommissionBreakdown('w1', '2026-11-01', 't1');
        expect(r.entries).toEqual([]);
        expect(r.total_commission).toBe(0);
        expect(r.rate).toBe(0);
    });

    test('পরিশোধিত দিনে DB-তে জমা রেট ব্যবহার হয়, নতুন স্ল্যাব না', async () => {
        mockDb({
            sales: [sale('a', 'cash', 10000)],
            stored: { sales_amount: 10000, commission_rate: 3, commission_amount: 300, paid: true },
            slabRate: 9,
        });
        const r = await getDailyCommissionBreakdown('w1', '2026-11-01', 't1');
        expect(r.paid).toBe(true);
        expect(r.rate).toBe(3);
        expect(r.total_commission).toBe(300);
        expect(r.mismatch).toBe(false);
    });

    test('পরিশোধের পরে আসা বিক্রি থাকলে mismatch = true', async () => {
        mockDb({
            sales: [sale('a', 'cash', 10000), sale('b', 'cash', 2000, null, '2026-11-01T20:00:00Z')],
            stored: { sales_amount: 10000, commission_rate: 3, commission_amount: 300, paid: true },
        });
        const r = await getDailyCommissionBreakdown('w1', '2026-11-01', 't1');
        expect(r.mismatch).toBe(true);
    });

    test('workerId/date/tenantId ছাড়া throw করে', async () => {
        await expect(getDailyCommissionBreakdown(null, '2026-11-01', 't1')).rejects.toThrow();
        await expect(getDailyCommissionBreakdown('w1', null, 't1')).rejects.toThrow();
        await expect(getDailyCommissionBreakdown('w1', '2026-11-01', null)).rejects.toThrow();
    });
});

describe('getSaleCommissionMap', () => {
    test('sale id → কমিশন ম্যাপ; Date অবজেক্ট ও স্ট্রিং দুটোই চলে', async () => {
        mockDb({ sales: [sale('a', 'cash', 5000)], slabRate: 2 });
        const map = await getSaleCommissionMap('w1', [new Date(2026, 10, 1), '2026-11-01'], 't1');
        expect(map.a.commission).toBe(100);
        expect(map.a.rate).toBe(2);
    });

    test('একটা দিন ব্যর্থ হলেও বাকিগুলো আসে (পুরো তালিকা ভাঙে না)', async () => {
        query.mockRejectedValue(new Error('db down'));
        const map = await getSaleCommissionMap('w1', ['2026-11-01'], 't1');
        expect(map).toEqual({});
    });
});
