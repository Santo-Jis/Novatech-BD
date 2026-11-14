/**
 * settlement.controller.test.js
 *
 * FIX: jest.resetModules() বাদ দেওয়া হয়েছে।
 * কারণ: resetModules() mock registry clear করে → real modules load → crash → 500।
 * সব jest.mock() file top-level এ, controller একবারই require()।
 */

// ─── Mocks — file top-level এ ────────────────────────────────
jest.mock('../config/db', () => ({
    query:           jest.fn(),
    withTransaction: jest.fn(),
}));
jest.mock('axios', () => ({
    post: jest.fn().mockResolvedValue({ data: {} }),
    get:  jest.fn().mockResolvedValue({ data: {} }),
}));
jest.mock('../services/fcm.service',          () => ({ sendPushNotification: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/firebase.notify',      () => ({ firebaseNotify:       jest.fn().mockResolvedValue({}) }));
jest.mock('../controllers/ledger.controller', () => ({ addLedgerEntry:       jest.fn().mockResolvedValue({}) }));
// collection.controller → commission.service → tenantScopedDb প্রথমেই DB_SSL_CA চায়; unit test-এ DB লাগে না
jest.mock('../controllers/collection.controller', () => ({ submitCollectionsWithSettlement: jest.fn() }));
jest.mock('../services/settlementCash.service', () => ({ getTodayCashBreakdown: jest.fn() }));

// ─── Imports ──────────────────────────────────────────────────
const { query, withTransaction } = require('../config/db');
const { firebaseNotify }       = require('../services/firebase.notify');
const { sendPushNotification } = require('../services/fcm.service');
const { addLedgerEntry }       = require('../controllers/ledger.controller');
const { getTodayCashBreakdown } = require('../services/settlementCash.service');

// সিস্টেম নগদ ব্রেকডাউনের টেস্ট-ডাবল (বিক্রির নগদ + বাকি আদায়)
const cashBreakdown = (o = {}) => ({
    total_sales: 0, credit_given: 0, replacement_value: 0, old_credit_collected: 0,
    sales_cash: 0, due_collected_cash: 0, non_cash_collected: 0, system_cash: 0,
    window_from: null, carried_cash: 0, carried_days: [], today_cash: 0,
    ...o,
});
const {
    createSettlement,
    approveSettlement,
    disputeSettlement,
    payShortage,
} = require('../controllers/settlement.controller');

// ─── Helpers ──────────────────────────────────────────────────
const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const workerUser  = { id: 'worker-uuid-1', role: 'worker',  name_bn: 'আলী',      manager_id: 'manager-uuid-1' };
const managerUser = { id: 'manager-uuid-1', role: 'manager', name_bn: 'ম্যানেজার' };

beforeEach(() => {
    // resetAllMocks — call history ও mockResolvedValueOnce queue দুটোই পরিষ্কার করে।
    // ফলে একটা test-এর বাড়তি mock পরের test-এ যায় না।
    // সতর্কতা: এটা jest.mock() factory-তে দেওয়া initial implementation-ও মুছে দেয়,
    // তাই নিচে service mock গুলো আবার সেট করতে হচ্ছে।
    jest.resetAllMocks();

    // ─── Service mock restore ────────────────────────────────
    // resetAllMocks() এর পরে firebaseNotify/sendPushNotification/addLedgerEntry
    // সব undefined হয়ে যায় → controller-এ await করলে crash → 500।
    // প্রতিটা test-এর আগে resolved mock ফিরিয়ে দিচ্ছি।
    firebaseNotify.mockResolvedValue({});
    sendPushNotification.mockResolvedValue({});
    addLedgerEntry.mockResolvedValue({});
    getTodayCashBreakdown.mockResolvedValue(cashBreakdown());

    // ─── DB mock defaults ────────────────────────────────────
    // query-এর default: { rows: [] } — mockResolvedValueOnce দিয়ে override করা যাবে
    query.mockResolvedValue({ rows: [] });

    // withTransaction default: cb কে client দিয়ে চালায় এবং result return করে
    withTransaction.mockImplementation(async (cb) => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 200 }] }) };
        return await cb(client);
    });
});

// ─────────────────────────────────────────────────────────────
// createSettlement
// ─────────────────────────────────────────────────────────────

describe('createSettlement — হিসাব জমার নিয়ম', () => {

    test('আজকে আগেই settlement দেওয়া থাকলে 400', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 10, status: 'pending' }] });

        const res = mockRes();
        await createSettlement({ body: { cash_collected: 5000 }, user: workerUser }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আগেই জমা') })
        );
    });

    test('cash_collected না দিলে 400', async () => {
        query
            .mockResolvedValueOnce({ rows: [] }) // no existing
            .mockResolvedValueOnce({ rows: [] }); // no orders

        const res = mockRes();
        await createSettlement({ body: {}, user: workerUser }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('নগদ জমা') })
        );
    });

    // সাধারণ চেইন: existing → orders → ledger → price (তারপর sold/replaced bulk default {rows:[]})
    const baseQueries = ({ ledger = [], price = [], sold = [], replaced = [] } = {}) => {
        query
            .mockResolvedValueOnce({ rows: [] })       // existing settlement check
            .mockResolvedValueOnce({ rows: [] })       // ordersResult (reference only)
            .mockResolvedValueOnce({ rows: ledger })   // ledgerRes
            .mockResolvedValueOnce({ rows: price })    // priceRes
            .mockResolvedValueOnce({ rows: sold })     // soldBulkRes
            .mockResolvedValueOnce({ rows: replaced });// replacedBulkRes
    };

    const captureInsert = () => {
        const captured = {};
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('INSERT INTO daily_settlements')) {
                        captured.shortageValue    = params[10];
                        captured.cashCollected    = params[5];
                        captured.cashDifference   = params[6];
                        return { rows: [{ id: 200 }] };
                    }
                    return { rows: [] };
                }),
            };
            return await cb(client);
        });
        return captured;
    };

    test('৳৫০০+ পার্থক্যে কারণ ছাড়া 422', async () => {
        getTodayCashBreakdown.mockResolvedValue(cashBreakdown({ total_sales: 5000, sales_cash: 5000, system_cash: 5000 }));
        baseQueries();

        const res = mockRes();
        await createSettlement({
            body: { cash_collected: 5600, mismatch_explanation: '' },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('কারণ লেখা বাধ্যতামূলক') })
        );
    });

    test('৳৫০০+ পার্থক্যে কারণ দিলে সফল', async () => {
        getTodayCashBreakdown.mockResolvedValue(cashBreakdown({ total_sales: 5000, sales_cash: 5000, system_cash: 5000 }));
        baseQueries();

        const res = mockRes();
        await createSettlement({
            body: { cash_collected: 5600, mismatch_explanation: 'কাস্টমার ভুলে বেশি দিয়েছে' },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('৳৫০০ এর কম পার্থক্যে কারণ ছাড়াও সফল', async () => {
        getTodayCashBreakdown.mockResolvedValue(cashBreakdown({ total_sales: 5000, sales_cash: 5000, system_cash: 5000 }));
        baseQueries();

        const res = mockRes();
        await createSettlement({ body: { cash_collected: 5300 }, user: workerUser }, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('ঋণাত্মক নগদ জমা দিলে 400', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
             .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await createSettlement({ body: { cash_collected: -50 }, user: workerUser }, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    // ── সিস্টেম নগদ = বিক্রির নগদ + বাকি আদায় ───────────────────
    test('বাকি আদায় সিস্টেম নগদে ধরা হয় — বিক্রি ৩০০০ + আদায় ১২০০ জমা দিলে পার্থক্য ০', async () => {
        getTodayCashBreakdown.mockResolvedValue(cashBreakdown({
            total_sales: 3000, sales_cash: 3000, due_collected_cash: 1200, system_cash: 4200,
        }));
        baseQueries();
        const captured = captureInsert();

        const res = mockRes();
        await createSettlement({ body: { cash_collected: 4200 }, user: workerUser }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(captured.cashDifference).toBe(0);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ system_cash: 4200, cash_difference: 0 }),
        }));
    });

    test('আগের দিনের হিসাব না দিলে পরের জমায় একসাথে ধরা হয় (carry-over)', async () => {
        // ১১ ও ১২ নভেম্বরের ৳৫৫০০ + আজকের ৳২০০০ = ৳৭৫০০
        getTodayCashBreakdown.mockResolvedValue(cashBreakdown({
            window_from: '2026-11-10', sales_cash: 6000, due_collected_cash: 1500, system_cash: 7500,
            carried_cash: 5500,
            carried_days: [{ date: '2026-11-11', cash: 2500 }, { date: '2026-11-12', cash: 3000 }],
        }));
        baseQueries();
        const captured = captureInsert();

        const res = mockRes();
        await createSettlement({ body: { cash_collected: 7500 }, user: workerUser }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(captured.cashDifference).toBe(0);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ system_cash: 7500, carried_cash: 5500 }),
        }));
    });

    test('শুধু আজকের নগদ দিলে আগের দিনের জমে থাকা টাকা নগদ ঘাটতি হিসেবে ধরা পড়ে', async () => {
        getTodayCashBreakdown.mockResolvedValue(cashBreakdown({
            window_from: '2026-11-10', sales_cash: 4000, system_cash: 4000, carried_cash: 2500,
            carried_days: [{ date: '2026-11-11', cash: 2500 }],
        }));
        baseQueries();
        const captured = captureInsert();

        const res = mockRes();
        await createSettlement({
            body: { cash_collected: 1500, mismatch_explanation: 'আগের দিনের টাকা পরে দেব' },
            user: workerUser,
        }, res);

        expect(captured.cashDifference).toBe(-2500);
    });

    test('আদায়ের নগদ লুকালে (শুধু বিক্রির নগদ দিলে) নগদ কম ধরা পড়ে', async () => {
        getTodayCashBreakdown.mockResolvedValue(cashBreakdown({
            total_sales: 3000, sales_cash: 3000, due_collected_cash: 400, system_cash: 3400,
        }));
        baseQueries();
        const captured = captureInsert();

        const res = mockRes();
        await createSettlement({ body: { cash_collected: 3000 }, user: workerUser }, res);

        expect(captured.cashDifference).toBe(-400);
    });

    test('রিপ্লেসমেন্ট বিল থেকে আগেই বাদ — সিস্টেম নগদ থেকে দ্বিতীয়বার কাটা হয় না', async () => {
        // বিক্রি ৪০০০, রিপ্লেসমেন্ট ১০০০ → নেট বিল ৩০০০ → cash_received ৩০০০ (service সেটাই দেয়)
        getTodayCashBreakdown.mockResolvedValue(cashBreakdown({
            total_sales: 4000, replacement_value: 1000, sales_cash: 3000, system_cash: 3000,
        }));
        baseQueries();
        const captured = captureInsert();

        const res = mockRes();
        await createSettlement({ body: { cash_collected: 3000 }, user: workerUser }, res);

        expect(captured.cashDifference).toBe(0);
    });

    // ── পণ্য ঘাটতি: লেজারের ব্যালেন্স ইতিমধ্যে বিক্রি-বাদ, রিপ্লেস/রিটার্ন-যোগ ──
    test('ঘাটতি সঠিক হিসাব হচ্ছে — হাতে ১০, ফেরত ০, কাল ০ → ১০টাই ঘাটতি (৳৫০০০)', async () => {
        baseQueries({
            ledger:   [{ product_id: 'product-a', product_name: 'পণ্য-A', in_hand_qty: 10 }],
            price:    [{ product_id: 'product-a', product_name: 'পণ্য-A', effective_price: 500 }],
            sold:     [{ product_id: 'product-a', qty: '6' }],
            replaced: [{ product_id: 'product-a', qty: '2' }],
        });
        const captured = captureInsert();

        const res = mockRes();
        await createSettlement({ body: { cash_collected: 0, returned_items: [] }, user: workerUser }, res);

        // বিক্রি (৬) ও রিপ্লেস (২) লেজারে আগেই হিসাব হয়েছে — আবার বাদ যাবে না
        expect(captured.shortageValue).toBe(5000);
    });

    test('রিপ্লেসমেন্টে কাস্টমারের কাছ থেকে নেওয়া পণ্য গুদামে ফেরত না দিলে ঘাটতি', async () => {
        // ধরা যাক SR ২টি রিপ্লেসমেন্ট পণ্য নিয়েছে; হাতে মোট ৩ (১ নতুন স্টকের + ২ রিপ্লেসের)
        baseQueries({
            ledger:   [{ product_id: 'product-c', product_name: 'পণ্য-C', in_hand_qty: 3 }],
            price:    [{ product_id: 'product-c', product_name: 'পণ্য-C', effective_price: 100 }],
            replaced: [{ product_id: 'product-c', qty: '2' }],
        });
        const captured = captureInsert();

        const res = mockRes();
        // ১টা ফেরত দিল — বাকি ২টা (রিপ্লেসে পাওয়া) হিসাবহীন
        await createSettlement({
            body: { cash_collected: 0, returned_items: [{ product_id: 'product-c', qty: 1 }] },
            user: workerUser,
        }, res);

        expect(captured.shortageValue).toBe(200);
    });

    test('হাতের সব পণ্য ফেরত/কাল রাখলে shortage = 0 (রিপ্লেস/রিটার্নের পণ্যসহ)', async () => {
        baseQueries({
            ledger: [{ product_id: 'product-b', product_name: 'পণ্য-B', in_hand_qty: 5 }],
            price:  [{ product_id: 'product-b', product_name: 'পণ্য-B', effective_price: 200 }],
            sold:   [{ product_id: 'product-b', qty: '5' }],
        });
        const captured = captureInsert();

        const res = mockRes();
        await createSettlement({
            body: {
                cash_collected: 0,
                returned_items:      [{ product_id: 'product-b', qty: 3 }],
                carry_forward_items: [{ product_id: 'product-b', qty: 2 }],
            },
            user: workerUser,
        }, res);

        expect(captured.shortageValue).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────
// approveSettlement
// ─────────────────────────────────────────────────────────────

describe('approveSettlement — হিসাব অনুমোদন', () => {

    test('pending settlement না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await approveSettlement({ params: { id: '999' }, body: {}, user: managerUser }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('নগদ ঘাটতি থাকলে outstanding_dues বাড়বে', async () => {
        const settlement = {
            id: '30', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '4000', cash_difference: '-1000',
        };
        query.mockResolvedValueOnce({ rows: [settlement] });

        let duesAdded = 0;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('UPDATE users') && sql.includes('outstanding_dues')) {
                        duesAdded = params[0];
                    }
                    return { rows: [] };
                }),
            };
            await cb(client);
        });

        const res = mockRes();
        await approveSettlement({ params: { id: '30' }, body: {}, user: managerUser }, res);

        expect(duesAdded).toBe(1000);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ cashShortfall: 1000 })
        );
    });

    test('নগদ ঘাটতি নেই — dues বাড়বে না', async () => {
        const settlement = {
            id: '31', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '5000', cash_difference: '0',
        };
        query.mockResolvedValueOnce({ rows: [settlement] });

        let duesUpdateCalled = false;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql) => {
                    if (sql.includes('UPDATE users') && sql.includes('outstanding_dues')) {
                        duesUpdateCalled = true;
                    }
                    return { rows: [] };
                }),
            };
            await cb(client);
        });

        const res = mockRes();
        await approveSettlement({ params: { id: '31' }, body: {}, user: managerUser }, res);

        expect(duesUpdateCalled).toBe(false);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ cashShortfall: 0 })
        );
    });

    test('নগদ বেশি দিলে — dues বাড়বে না', async () => {
        const settlement = {
            id: '32', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '5200', cash_difference: '200',
        };
        query.mockResolvedValueOnce({ rows: [settlement] });

        let duesUpdateCalled = false;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql) => {
                    if (sql.includes('outstanding_dues + ')) duesUpdateCalled = true;
                    return { rows: [] };
                }),
            };
            await cb(client);
        });

        const res = mockRes();
        await approveSettlement({ params: { id: '32' }, body: {}, user: managerUser }, res);

        expect(duesUpdateCalled).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────
// disputeSettlement
// ─────────────────────────────────────────────────────────────

describe('disputeSettlement — ঘাটতি চিহ্নিত', () => {

    test('settlement না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await disputeSettlement({ params: { id: '999' }, body: {}, user: managerUser }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('পণ্য ঘাটতি + নগদ ঘাটতি — মোট dues সঠিক', async () => {
        const settlement = {
            id: '40', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '4500', cash_difference: '-500',
            shortage_qty_value: '0',
        };
        query.mockResolvedValueOnce({ rows: [settlement] });

        let capturedTotalDues = 0;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('outstanding_dues') && sql.includes('UPDATE')) {
                        capturedTotalDues = params[0];
                    }
                    return { rows: [] };
                }),
            };
            await cb(client);
        });

        const res = mockRes();
        await disputeSettlement({
            params: { id: '40' },
            body:   { shortage_value: 1500 },
            user:   managerUser,
        }, res);

        expect(capturedTotalDues).toBe(2000);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ totalDues: 2000 })
        );
    });

    test('ঘাটতি নেই — dues 0, তবু status=disputed', async () => {
        const settlement = {
            id: '41', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '5000', cash_difference: '0',
            shortage_qty_value: '0',
        };
        query.mockResolvedValueOnce({ rows: [settlement] });

        let duesUpdateCalled = false;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql) => {
                    if (sql.includes('outstanding_dues') && sql.includes('UPDATE')) {
                        duesUpdateCalled = true;
                    }
                    return { rows: [] };
                }),
            };
            await cb(client);
        });

        const res = mockRes();
        await disputeSettlement({
            params: { id: '41' },
            body:   { shortage_value: 0 },
            user:   managerUser,
        }, res);

        expect(duesUpdateCalled).toBe(false);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ totalDues: 0 })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// payShortage
// ─────────────────────────────────────────────────────────────

describe('payShortage — ঘাটতি পরিশোধ', () => {

    test('amount না দিলে 400', async () => {
        const res = mockRes();
        await payShortage({ params: { id: '50' }, body: {}, user: managerUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('amount ≤ 0 হলে 400', async () => {
        const res = mockRes();
        await payShortage({ params: { id: '50' }, body: { amount: 0 }, user: managerUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('settlement না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await payShortage({ params: { id: '999' }, body: { amount: 500 }, user: managerUser }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('পরিশোধের পর dues শূন্য — settlement approve', async () => {
        query.mockResolvedValueOnce({ rows: [{ worker_id: 'w1' }] });

        let settlementApproved = false;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql) => {
                    if (sql.includes('SELECT outstanding_dues')) {
                        return { rows: [{ outstanding_dues: '0' }] };
                    }
                    if (sql.includes("status = 'approved'") && sql.includes('daily_settlements')) {
                        settlementApproved = true;
                    }
                    return { rows: [{ settlement_date: '2025-07-01' }] };
                }),
            };
            await cb(client);
        });

        const res = mockRes();
        await payShortage({
            params: { id: '50' },
            body:   { amount: 1000, payment_method: 'cash_paid' },
            user:   managerUser,
        }, res);

        expect(settlementApproved).toBe(true);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ fully_paid: true })
        );
    });

    test('পরিশোধের পর dues বাকি — settlement pending থাকবে', async () => {
        query.mockResolvedValueOnce({ rows: [{ worker_id: 'w1' }] });

        let settlementApproved = false;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql) => {
                    if (sql.includes('SELECT outstanding_dues')) {
                        return { rows: [{ outstanding_dues: '500' }] };
                    }
                    if (sql.includes("status = 'approved'")) {
                        settlementApproved = true;
                    }
                    return { rows: [] };
                }),
            };
            await cb(client);
        });

        const res = mockRes();
        await payShortage({
            params: { id: '51' },
            body:   { amount: 500, payment_method: 'cash_paid' },
            user:   managerUser,
        }, res);

        expect(settlementApproved).toBe(false);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ fully_paid: false })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// Pure Business Logic
// ─────────────────────────────────────────────────────────────

describe('Settlement Business Logic — Pure Calculations', () => {

    const getBDToday = () => {
        const bdDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
        return bdDate.toISOString().split('T')[0];
    };

    test('getBDToday YYYY-MM-DD ফরম্যাট দেবে', () => {
        expect(getBDToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('getBDToday valid date হবে', () => {
        expect(isNaN(new Date(getBDToday()).getTime())).toBe(false);
    });

    const calcCashDifference = (srCash, systemCash) => parseFloat(srCash) - parseFloat(systemCash);
    test('SR বেশি দিলে positive',  () => expect(calcCashDifference(5200, 5000)).toBe(200));
    test('SR কম দিলে negative',    () => expect(calcCashDifference(4800, 5000)).toBe(-200));
    test('হুবহু মিললে 0',          () => expect(calcCashDifference(5000, 5000)).toBe(0));

    const calcCashShortfall = (diff) => diff < 0 ? Math.abs(diff) : 0;
    test('negative → shortfall = absolute',  () => expect(calcCashShortfall(-1000)).toBe(1000));
    test('positive → shortfall = 0',         () => expect(calcCashShortfall(200)).toBe(0));
    test('zero → shortfall = 0',             () => expect(calcCashShortfall(0)).toBe(0));

    const calcShortage = (taken, sold, replaced, returned) =>
        Math.max(0, taken - (sold + replaced + returned));
    test('সব বিক্রয় — shortage = 0',              () => expect(calcShortage(10, 10, 0, 0)).toBe(0));
    test('বিক্রয়+replace+ফেরত মিলিয়ে সব — 0',   () => expect(calcShortage(10, 5, 3, 2)).toBe(0));
    test('কিছু বাকি — shortage আছে',              () => expect(calcShortage(10, 5, 2, 1)).toBe(2));
    test('shortage কখনো negative হবে না',         () => expect(calcShortage(5, 8, 0, 0)).toBe(0));

    const calcShortageValue = (qty, price) => qty * parseFloat(price);
    test('২ পিস × ৫০০ = ১০০০',          () => expect(calcShortageValue(2, 500)).toBe(1000));
    test('shortage = 0 → value = 0',    () => expect(calcShortageValue(0, 1150)).toBe(0));
    test('VAT সহ final_price হলেও সঠিক', () => expect(calcShortageValue(3, 1150)).toBe(3450));

    const requiresExplanation = (srCash, systemCash) => Math.abs(srCash - systemCash) > 500;
    test('৫০০ এর কম — কারণ লাগবে না', () => expect(requiresExplanation(5400, 5000)).toBe(false));
    test('ঠিক ৫০০ — কারণ লাগবে না',  () => expect(requiresExplanation(5500, 5000)).toBe(false));
    test('৫০১ — কারণ বাধ্যতামূলক',    () => expect(requiresExplanation(5501, 5000)).toBe(true));
    test('SR কম দিলেও একই নিয়ম',      () => expect(requiresExplanation(4400, 5000)).toBe(true));

    const calcTotalDues = (shortage, cashShortfall) => shortage + cashShortfall;
    test('শুধু পণ্য ঘাটতি',    () => expect(calcTotalDues(1500, 0)).toBe(1500));
    test('শুধু নগদ ঘাটতি',    () => expect(calcTotalDues(0, 800)).toBe(800));
    test('উভয় ঘাটতি',         () => expect(calcTotalDues(1500, 500)).toBe(2000));
    test('কোনো ঘাটতি নেই — 0', () => expect(calcTotalDues(0, 0)).toBe(0));
});
