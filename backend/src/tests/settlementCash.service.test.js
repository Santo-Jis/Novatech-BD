/**
 * settlementCash.service.test.js
 *
 * SR-এর "সিস্টেম নগদ" = বিক্রির নগদ + বাকি আদায়ের নগদ (collections + credit_payments)।
 * চালানো: npm run test:unit -- --testPathPattern=settlementCash
 */

jest.mock('../config/db', () => ({ query: jest.fn() }));

const { getTodayCashBreakdown, getStockSummary, getSettlementBreakdown } = require('../services/settlementCash.service');

// কলের ক্রম: lastSettled → বিক্রি → collections → credit_payments → আগের দিনের ভাঙা হিসাব
const mkDb = ({ sales = {}, col = {}, cp = {}, last = null, lastAt = '2026-11-10T11:00:00Z', carry = [] } = {}) => ({
    query: jest.fn()
        .mockResolvedValueOnce({ rows: last ? [{ last_date: last, last_at: lastAt }] : [] })
        .mockResolvedValueOnce({ rows: [{
            total_sales: 0, sales_cash: 0, credit_given: 0, replacement_value: 0, old_credit_collected: 0, ...sales }] })
        .mockResolvedValueOnce({ rows: [{
            count: 0, cash_amount: 0, non_cash_amount: 0, cash_count: 0, ...col }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, cash_amount: 0, ...cp }] })
        .mockResolvedValueOnce({ rows: carry }),
});

const args = (db) => ({ workerId: 'w1', tenantId: 't1', date: '2026-11-13', db });

describe('getTodayCashBreakdown', () => {
    test('শুধু বিক্রি — আগের আচরণ অপরিবর্তিত', async () => {
        const r = await getTodayCashBreakdown(args(mkDb({ sales: { total_sales: 5000, sales_cash: 5000 } })));
        expect(r.system_cash).toBe(5000);
        expect(r.due_collected_cash).toBe(0);
    });

    test('বিক্রির নগদ + collections-এর নগদ + credit_payments যোগ হয়', async () => {
        const r = await getTodayCashBreakdown(args(mkDb({
            sales: { total_sales: 3000, sales_cash: 3000 },
            col:   { count: 2, cash_count: 2, cash_amount: 1200 },
            cp:    { count: 1, cash_amount: 300 },
        })));
        expect(r.sales_cash).toBe(3000);
        expect(r.collections_cash).toBe(1200);
        expect(r.credit_payments_cash).toBe(300);
        expect(r.due_collected_cash).toBe(1500);
        expect(r.due_collected_count).toBe(3);
        expect(r.system_cash).toBe(4500);
    });

    test('চেক/বিকাশ/নগদ আদায় হাতের নগদে ধরা হয় না, আলাদা দেখায়', async () => {
        const r = await getTodayCashBreakdown(args(mkDb({
            sales: { sales_cash: 1000 },
            col:   { count: 1, cash_count: 0, cash_amount: 0, non_cash_amount: 700 },
        })));
        expect(r.non_cash_collected).toBe(700);
        expect(r.system_cash).toBe(1000);
    });

    test('রিপ্লেসমেন্ট মূল্য নগদ থেকে আলাদা করে কাটা হয় না (cash_received-এ আগেই বাদ)', async () => {
        // বিল ৪০০০ − রিপ্লেস ১০০০ = ৩০০০ নগদ
        const r = await getTodayCashBreakdown(args(mkDb({
            sales: { total_sales: 4000, replacement_value: 1000, sales_cash: 3000 },
        })));
        expect(r.replacement_value).toBe(1000);
        expect(r.system_cash).toBe(3000);
    });

    test('বাকি বিক্রি ও অগ্রিম ব্যালেন্স ব্যবহার নগদে ধরা হয় না', async () => {
        const r = await getTodayCashBreakdown(args(mkDb({
            sales: { total_sales: 5000, sales_cash: 1990, credit_given: 3010, old_credit_collected: 0 },
        })));
        expect(r.credit_given).toBe(3010);
        expect(r.system_cash).toBe(1990);
    });

    test('তারিখ BD timezone দিয়ে, tenant দিয়ে scope করা', async () => {
        const db = mkDb();
        await getTodayCashBreakdown(args(db));
        const [, , colCall, cpCall] = db.query.mock.calls;
        expect(colCall[0]).toMatch(/AT TIME ZONE 'Asia\/Dhaka'/);
        expect(cpCall[0]).toMatch(/AT TIME ZONE 'Asia\/Dhaka'/);
        expect(colCall[0]).toMatch(/status = 'pending'/); // শুধু জমা-না-হওয়া; rejected/submitted বাদ
        expect(colCall[1]).toEqual(['w1', '2026-11-13', 't1']);
    });
});

describe('জমা-না-দেওয়া দিনের হিসাব জমে থাকা (carry-over)', () => {
    test('আগে কখনো জমা না দিলে সময়সীমা সীমাহীন (1900 থেকে), window_from = null', async () => {
        const db = mkDb({ last: null });
        const r = await getTodayCashBreakdown(args(db));
        expect(r.window_from).toBeNull();
        const salesCall = db.query.mock.calls[1];
        expect(salesCall[1]).toEqual(['w1', '2026-11-13', 't1', '1900-01-01T00:00:00Z']);
    });

    test('সর্বশেষ জমার পরের তারিখ থেকে হিসাব (সর্বশেষ জমার দিন বাদ)', async () => {
        const db = mkDb({ last: '2026-11-10' });
        const r = await getTodayCashBreakdown(args(db));
        expect(r.window_from).toBe('2026-11-10');
        expect(db.query.mock.calls[1][0]).toMatch(/created_at > \$4::timestamptz AND date <= \$2::date/);
        expect(db.query.mock.calls[1][1][3]).toBe('2026-11-10T11:00:00Z'); // তারিখ নয়, জমার সঠিক সময়
    });

    test('জমা দেওয়ার পরে একই দিনে করা বিক্রি/আদায় হারায় না — সময় দিয়ে কাটা হয়, তারিখ দিয়ে নয়', async () => {
        const db = mkDb({ last: '2026-11-10', lastAt: '2026-11-10T11:00:00Z' });
        await getTodayCashBreakdown(args(db));
        const [, sales, , cp, carry] = db.query.mock.calls;
        expect(sales[0]).toMatch(/created_at > \$4::timestamptz/);
        expect(sales[0]).not.toMatch(/date > \$4/);
        expect(cp[0]).toMatch(/created_at > \$4::timestamptz/);
        expect(carry[0]).toMatch(/created_at > \$4::timestamptz/);
    });

    test('কয়েক দিনের নগদ একসাথে — আগের দিনগুলো আলাদা দেখায়, মোট সিস্টেম নগদে যোগ হয়', async () => {
        // ১১ ও ১২ নভেম্বর জমা দেয়নি; আজ ১৩ নভেম্বর
        const r = await getTodayCashBreakdown(args(mkDb({
            last: '2026-11-10',
            sales: { total_sales: 9000, sales_cash: 6000 },          // ৩ দিনের মোট
            col:   { count: 2, cash_count: 2, cash_amount: 1500 },   // pending সব
            carry: [{ day: '2026-11-11', cash: '2500' }, { day: '2026-11-12', cash: '3000' }],
        })));
        expect(r.system_cash).toBe(7500);
        expect(r.carried_days).toEqual([
            { date: '2026-11-11', cash: 2500 },
            { date: '2026-11-12', cash: 3000 },
        ]);
        expect(r.carried_cash).toBe(5500);
        expect(r.today_cash).toBe(2000);
    });

    test('আগের দিন কিছু না থাকলে carried শূন্য, today_cash = system_cash', async () => {
        const r = await getTodayCashBreakdown(args(mkDb({ last: '2026-11-12', sales: { sales_cash: 800 } })));
        expect(r.carried_cash).toBe(0);
        expect(r.carried_days).toEqual([]);
        expect(r.today_cash).toBe(800);
    });
});


describe('getStockSummary — পণ্যের প্রবাহ ও মূল্য', () => {
    const mk = (ledger, orderPrices = [], productPrices = []) => ({
        query: jest.fn()
            .mockResolvedValueOnce({ rows: ledger })
            .mockResolvedValueOnce({ rows: orderPrices })
            .mockResolvedValueOnce({ rows: productPrices }),
    });

    test('হিসাব মেলে: আগের হাতে + নেওয়া + কাস্টমার-পাওয়া − বিক্রি − ফেরত/ঘাটতি = এখন হাতে', async () => {
        // পণ্য A: আগে ২ ছিল, নেওয়া ১০, রিপ্লেসে পাওয়া ১, বিক্রি ৬, ফেরত ২ → এখন ৫
        const db = mk(
            [{ product_id: 'A', in_hand: '5', net_window: '3', taken: '10', customer_in: '1', sold: '6' }],
            [{ product_id: 'A', price: '100' }]
        );
        const r = await getStockSummary({ workerId: 'w1', tenantId: 't1', fromAt: '2026-11-10T11:00:00Z', db });
        expect(r.opening).toEqual({ qty: 2, value: 200 });
        expect(r.taken).toEqual({ qty: 10, value: 1000 });
        expect(r.customer_in).toEqual({ qty: 1, value: 100 });
        expect(r.sold).toEqual({ qty: 6, value: 600 });
        expect(r.out).toEqual({ qty: 2, value: 200 });
        expect(r.in_hand).toEqual({ qty: 5, value: 500 });
        expect(r.opening.qty + r.taken.qty + r.customer_in.qty - r.sold.qty - r.out.qty).toBe(r.in_hand.qty);
    });

    test('অর্ডারের দাম না থাকলে পণ্যের বিক্রয়মূল্য ব্যবহার হয়', async () => {
        const db = mk(
            [{ product_id: 'B', in_hand: '4', net_window: '4', taken: '4', customer_in: '0', sold: '0' }],
            [],
            [{ id: 'B', price: '250' }]
        );
        const r = await getStockSummary({ workerId: 'w1', tenantId: 't1', db });
        expect(r.in_hand.value).toBe(1000);
    });

    test('লেজারে কিছু না থাকলে সব শূন্য', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) };
        const r = await getStockSummary({ workerId: 'w1', tenantId: 't1', db });
        expect(r.in_hand).toEqual({ qty: 0, value: 0 });
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});


describe('getSettlementBreakdown — ম্যানেজারের বিস্তারিত', () => {
    const S = {
        id: 's2', worker_id: 'w1', created_at: '2026-11-14T13:34:26Z',
        cash_collected: '7000', cash_difference: '-500',
        items_taken: [
            { product_id: 'A', name: 'A', price: 100, taken_qty: 5, returned_qty: 2, carry_forward_qty: 2, shortage_qty: 1 },
        ],
    };

    const mkDb = () => ({
        query: jest.fn()
            // আগের settlement
            .mockResolvedValueOnce({ rows: [{ created_at: '2026-11-10T11:00:00Z' }] })
            // sales
            .mockResolvedValueOnce({ rows: [
                { day: '2026-11-11', customer_id: 'c1', shop_name: 'দোকান-১', invoice_number: 'INV1',
                  total_amount: '3000', cash_received: '1000', credit_used: '2000', replacement_value: '0', replacement_items: null },
                { day: '2026-11-12', customer_id: 'c2', shop_name: 'দোকান-২', invoice_number: 'INV2',
                  total_amount: '4000', cash_received: '3000', credit_used: '1000', replacement_value: '130',
                  replacement_items: [{ product_name: 'চার্জার', qty: 1 }] },
            ] })
            // collections (এই settlement-এ জমা)
            .mockResolvedValueOnce({ rows: [
                { day: '2026-11-12', customer_id: 'c1', shop_name: 'দোকান-১', amount: '2500', payment_mode: 'cash', status: 'submitted' },
                { day: '2026-11-12', customer_id: 'c1', shop_name: 'দোকান-১', amount: '700',  payment_mode: 'cheque', status: 'submitted' },
            ] })
            // credit_payments
            .mockResolvedValueOnce({ rows: [{ day: '2026-11-13', customer_id: 'c2', shop_name: 'দোকান-২', amount: '500' }] })
            // return receipts
            .mockResolvedValueOnce({ rows: [{ product_name: 'A', qty_claimed: 2, qty_received: 1, status: 'discrepancy',
                discrepancy_note: null, resolution: 'charged', resolution_note: null, price: '100' }] })
            // stock ledger → দাম → products
            .mockResolvedValueOnce({ rows: [{ product_id: 'A', in_hand: '5', net_window: '5', taken: '8', customer_in: '0', sold: '3' }] })
            .mockResolvedValueOnce({ rows: [{ product_id: 'A', price: '100' }] })
            .mockResolvedValueOnce({ rows: [] }),
    });

    test('নগদের উৎস, দিনভিত্তিক ও দোকানভিত্তিক ভাঙা সঠিক', async () => {
        const r = await getSettlementBreakdown({ settlement: S, tenantId: 't1', db: mkDb() });

        expect(r.window.from_at).toBe('2026-11-10T11:00:00Z');
        expect(r.cash.sales_cash).toBe(4000);
        expect(r.cash.collections_cash).toBe(3000);          // ২৫০০ (collections) + ৫০০ (credit_payments)
        expect(r.cash.non_cash_collected).toBe(700);         // চেক নগদে নয়
        expect(r.cash.recorded_system_cash).toBe(7500);      // ৭০০০ − (−৫০০)
        expect(r.cash.sales_cash + r.cash.collections_cash).toBe(7000);
        expect(r.cash.credit_given).toBe(3000);

        expect(r.days.map(d => d.date)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
        expect(r.days[1].total_cash).toBe(5500);             // ৩০০০ বিক্রির নগদ + ২৫০০ আদায়

        const shop1 = r.shops.find(x => x.shop_name === 'দোকান-১');
        expect(shop1.credit_given).toBe(2000);
        expect(shop1.collected_cash).toBe(2500);
        expect(shop1.collected_non_cash).toBe(700);
    });

    test('রিপ্লেসমেন্ট তালিকা ও রিটার্ন রসিদ', async () => {
        const r = await getSettlementBreakdown({ settlement: S, tenantId: 't1', db: mkDb() });
        expect(r.replacements).toEqual([
            { date: '2026-11-12', shop_name: 'দোকান-২', invoice_number: 'INV2', value: 130, items: [{ name: 'চার্জার', qty: 1 }] },
        ]);
        expect(r.return_receipts[0]).toEqual(expect.objectContaining({
            qty_claimed: 2, qty_received: 1, status: 'discrepancy', resolution: 'charged', value: 200,
        }));
    });

    test('পণ্যের প্রবাহ: হাতের পণ্য ফেরত / কাল রাখা / ঘাটতিতে ভাগ, মূল্যসহ', async () => {
        const r = await getSettlementBreakdown({ settlement: S, tenantId: 't1', db: mkDb() });
        expect(r.stock.in_hand).toEqual({ qty: 5, value: 500 });
        expect(r.stock.returned).toEqual({ qty: 2, value: 200 });
        expect(r.stock.carry).toEqual({ qty: 2, value: 200 });
        expect(r.stock.shortage).toEqual({ qty: 1, value: 100 });
        expect(r.stock.opening.qty + r.stock.taken.qty + r.stock.customer_in.qty - r.stock.sold.qty - r.stock.out.qty)
            .toBe(r.stock.in_hand.qty);
    });

    test('আগে কোনো settlement না থাকলে সময়সীমা সীমাহীন (from_at = null)', async () => {
        const db = mkDb();
        db.query.mockReset();
        db.query.mockResolvedValueOnce({ rows: [] })
                .mockResolvedValue({ rows: [] });
        const r = await getSettlementBreakdown({ settlement: S, tenantId: 't1', db });
        expect(r.window.from_at).toBeNull();
        expect(r.days).toEqual([]);
    });
});
