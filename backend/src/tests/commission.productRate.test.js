/**
 * commission.productRate.test.js
 * ─────────────────────────────────────────────────────────────
 * SR × প্রডাক্ট ভিত্তিক কমিশন — calculateDailyCommission ও breakdown
 *
 * অগ্রাধিকার: (SR, প্রডাক্ট) রেট → SR-এর নির্দিষ্ট রেট → স্ল্যাব
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
    calculateDailyCommission,
    getDailyCommissionBreakdown,
} = require('../services/commission.service');

const items = (...pairs) => JSON.stringify(pairs.map(([id, subtotal]) => ({
    product_id: id, qty: 1, price: subtotal, subtotal,
})));

// rates: { [workerId]: { [productId]: rate } }
const mockDb = ({ rates = {}, sales = [], colls = [], cps = [], allocs = [], slabRate = 1, bdSales = null }) => {
    query.mockImplementation(async (sql, params) => {
        if (sql.includes('sr_product_commission_rates')) {
            const m = rates[params[0]] || {};
            return { rows: Object.entries(m).map(([product_id, rate]) => ({ product_id, rate })) };
        }
        if (sql.includes('payment_allocations')) return { rows: allocs };
        if (sql.includes('FROM sales_transactions st')) return { rows: bdSales || [] };
        if (sql.includes('FROM collections co'))        return { rows: [] };
        if (sql.includes('FROM credit_payments cp'))    return { rows: [] };
        if (sql.includes('FROM sales_transactions'))    return { rows: sales };
        if (sql.includes('FROM collections'))           return { rows: colls };
        if (sql.includes('FROM credit_payments'))       return { rows: cps };
        if (sql.includes('commission_rate_override'))   return { rows: [{ commission_rate_override: null }] };
        return { rows: [] };
    });
    rlsQuery.mockResolvedValue({ rows: [{ rate: slabRate }] });
};

beforeEach(() => { query.mockReset(); rlsQuery.mockReset(); });

describe('calculateDailyCommission — SR × প্রডাক্ট রেট', () => {
    test('একই প্রডাক্ট, দুই SR-এর আলাদা রেট: Y=২%, Z=১.৩%', async () => {
        const sale = (id) => ({ id, items: items(['X', 10000]), payment_method: 'cash', total_amount: 10000, cash_received: null });
        mockDb({ rates: { Y: { X: 2 }, Z: { X: 1.3 } }, sales: [sale('s1')] });

        const y = await calculateDailyCommission('Y', '2026-11-01', 't1');
        const z = await calculateDailyCommission('Z', '2026-11-01', 't1');

        expect(y.amount).toBe(200);
        expect(y.rate).toBe(2);
        expect(z.amount).toBe(130);
        expect(z.rate).toBe(1.3);
        expect(y.productMode).toBe(true);
    });

    test('রেট-ছাড়া প্রডাক্ট স্ল্যাবে যায়, রেট-ওয়ালা নিজের রেটে', async () => {
        mockDb({
            rates: { Y: { X: 2 } },
            sales: [{ id: 's1', items: items(['X', 6000], ['W', 4000]), payment_method: 'cash', total_amount: 10000, cash_received: null }],
            slabRate: 1,
        });
        const r = await calculateDailyCommission('Y', '2026-11-01', 't1');
        expect(r.totalSales).toBe(10000);
        expect(r.amount).toBe(120 + 40);
        expect(r.rate).toBe(1.6);
    });

    test('আংশিক বাকি: নগদ-পাওয়া অংশ আইটেম-অনুপাতে ভাগ হয়', async () => {
        mockDb({
            rates: { Y: { X: 2 } },
            sales: [{ id: 's1', items: items(['X', 6000], ['W', 4000]), payment_method: 'credit', total_amount: 10000, cash_received: 5000 }],
            slabRate: 1,
        });
        const r = await calculateDailyCommission('Y', '2026-11-01', 't1');
        expect(r.totalSales).toBe(5000);
        expect(r.amount).toBe(60 + 20);             // X: ৩০০০×২%, W: ২০০০×১%
    });

    test('ফ্রি গিফট কমিশনে ধরা হয় না', async () => {
        const its = JSON.stringify([
            { product_id: 'X', qty: 1, price: 1000, subtotal: 1000 },
            { product_id: 'G', qty: 1, price: 0, subtotal: 0, is_free_gift: true },
        ]);
        mockDb({ rates: { Y: { X: 3, G: 50 } }, sales: [{ id: 's1', items: its, payment_method: 'cash', total_amount: 1000, cash_received: null }] });
        const r = await calculateDailyCommission('Y', '2026-11-01', 't1');
        expect(r.amount).toBe(30);
    });

    test('বাকি আদায়: যে ইনভয়েসের টাকা, তার প্রডাক্ট-রেটে; বরাদ্দহীন অংশ স্ল্যাবে', async () => {
        mockDb({
            rates: { Y: { X: 2 } },
            colls: [{ id: 'c1', amount: 2500 }],
            allocs: [{ payment_source: 'collection', payment_id: 'c1', amount: 2000, items: items(['X', 8000]) }],
            slabRate: 1,
        });
        const r = await calculateDailyCommission('Y', '2026-11-01', 't1');
        expect(r.totalSales).toBe(2500);
        expect(r.amount).toBe(40 + 5);              // ২০০০×২% + বরাদ্দহীন ৫০০×১%
    });

    test('SR-এর নির্দিষ্ট রেট (override) থাকলে রেট-ছাড়া প্রডাক্টে সেটাই', async () => {
        mockDb({
            rates: { Y: { X: 2 } },
            sales: [{ id: 's1', items: items(['X', 5000], ['W', 5000]), payment_method: 'cash', total_amount: 10000, cash_received: null }],
            slabRate: 1,
        });
        // override = ৪%
        query.mockImplementation(((orig) => async (sql, params) => {
            if (sql.includes('commission_rate_override')) return { rows: [{ commission_rate_override: 4 }] };
            return orig(sql, params);
        })(query.getMockImplementation()));
        const r = await calculateDailyCommission('Y', '2026-11-01', 't1');
        expect(r.amount).toBe(100 + 200);           // X ২% + W ৪%
    });

    test('প্রডাক্ট-রেট না থাকলে আগের পথ: পুরো দিনে একই রেট', async () => {
        query.mockImplementation(async (sql) => {
            if (sql.includes('sr_product_commission_rates')) return { rows: [] };
            if (sql.includes('FROM sales_transactions')) return { rows: [{ cash_sales: 10000 }] };
            if (sql.includes('FROM collections'))        return { rows: [{ collected: 0 }] };
            if (sql.includes('FROM credit_payments'))    return { rows: [{ collected: 0 }] };
            return { rows: [{ commission_rate_override: null }] };
        });
        rlsQuery.mockResolvedValue({ rows: [{ rate: 1.5 }] });
        const r = await calculateDailyCommission('Y', '2026-11-01', 't1');
        expect(r).toEqual({ totalSales: 10000, rate: 1.5, amount: 150, productMode: false });
    });

    test('টেবিল না থাকলে (42P01) আগের মতোই চলে', async () => {
        query.mockImplementation(async (sql) => {
            if (sql.includes('sr_product_commission_rates')) { const e = new Error('no table'); e.code = '42P01'; throw e; }
            if (sql.includes('FROM sales_transactions')) return { rows: [{ cash_sales: 1000 }] };
            if (sql.includes('FROM collections'))        return { rows: [{ collected: 0 }] };
            if (sql.includes('FROM credit_payments'))    return { rows: [{ collected: 0 }] };
            return { rows: [{ commission_rate_override: null }] };
        });
        rlsQuery.mockResolvedValue({ rows: [{ rate: 2 }] });
        const r = await calculateDailyCommission('Y', '2026-11-01', 't1');
        expect(r.amount).toBe(20);
        expect(r.productMode).toBe(false);
    });
});

describe('getDailyCommissionBreakdown — প্রডাক্ট মোড', () => {
    test('সারিগুলোর কমিশনের যোগফল দিনের মোটের সাথে হুবহু মেলে', async () => {
        const its1 = items(['X', 3333], ['W', 3334]);
        const its2 = items(['X', 1001]);
        mockDb({
            rates: { Y: { X: 1.7 } },
            sales: [
                { id: 'a', items: its1, payment_method: 'cash', total_amount: 6667, cash_received: null },
                { id: 'b', items: its2, payment_method: 'cash', total_amount: 1001, cash_received: null },
            ],
            bdSales: [
                { id: 'a', invoice_number: 'INV-a', payment_method: 'cash', total_amount: 6667, net_amount: 6667, cash_received: null, at: '2026-11-01T04:00:00Z', shop_name: 'A' },
                { id: 'b', invoice_number: 'INV-b', payment_method: 'cash', total_amount: 1001, net_amount: 1001, cash_received: null, at: '2026-11-01T05:00:00Z', shop_name: 'B' },
            ],
            slabRate: 1,
        });
        const r = await getDailyCommissionBreakdown('Y', '2026-11-01', 't1');
        const sum = r.entries.reduce((s, e) => s + e.commission, 0);

        expect(r.rate_mode).toBe('product');
        expect(sum).toBe(r.total_commission);
        // raw = 3333×1.7% + 3334×1% + 1001×1.7% = 56.661 + 33.34 + 17.017 = 107.018
        expect(r.total_commission).toBe(107);
        expect(r.entries[0].rate).toBeGreaterThan(1);
    });
});
