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

// ─── Imports ──────────────────────────────────────────────────
const { query, withTransaction } = require('../config/db');
const { firebaseNotify }       = require('../services/firebase.notify');
const { sendPushNotification } = require('../services/fcm.service');
const { addLedgerEntry }       = require('../controllers/ledger.controller');
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

    test('৳৫০০+ পার্থক্যে কারণ ছাড়া 422', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ total_sales: 5000, cash_collected: 5000, credit_given: 0, replacement_value: 0, old_credit_collected: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

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
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ total_sales: 5000, cash_collected: 5000, credit_given: 0, replacement_value: 0, old_credit_collected: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await createSettlement({
            body: { cash_collected: 5600, mismatch_explanation: 'কাস্টমার ভুলে বেশি দিয়েছে' },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('৳৫০০ এর কম পার্থক্যে কারণ ছাড়াও সফল', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ total_sales: 5000, cash_collected: 5000, credit_given: 0, replacement_value: 0, old_credit_collected: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await createSettlement({
            body: { cash_collected: 5300 },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('ঘাটতি সঠিক হিসাব হচ্ছে', async () => {
        const orderItems = [{
            product_id: 'product-a', product_name: 'পণ্য-A',
            approved_qty: 10, price: 500, final_price: 500,
        }];

        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'o1', items: JSON.stringify(orderItems), total_amount: 5000 }] })
            .mockResolvedValueOnce({ rows: [{ total_sales: 3000, cash_collected: 3000, credit_given: 0, replacement_value: 1000, old_credit_collected: 0 }] })
            .mockResolvedValueOnce({ rows: [{ product_id: 'product-a', qty: '6' }] })
            .mockResolvedValueOnce({ rows: [{ product_id: 'product-a', qty: '2' }] });

        let capturedShortageValue;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('INSERT INTO daily_settlements')) {
                        capturedShortageValue = params[10];
                        return { rows: [{ id: 200 }] };
                    }
                    return { rows: [] };
                }),
            };
            return await cb(client);
        });

        const res = mockRes();
        await createSettlement({
            body: { cash_collected: 3000, returned_items: [] },
            user: workerUser,
        }, res);

        expect(capturedShortageValue).toBe(1000);
    });

    test('সব পণ্য বিক্রয় হলে shortage = 0', async () => {
        const orderItems = [{
            product_id: 'product-b', product_name: 'পণ্য-B',
            approved_qty: 5, price: 200, final_price: 200,
        }];

        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'o2', items: JSON.stringify(orderItems), total_amount: 1000 }] })
            .mockResolvedValueOnce({ rows: [{ total_sales: 1000, cash_collected: 1000, credit_given: 0, replacement_value: 0, old_credit_collected: 0 }] })
            .mockResolvedValueOnce({ rows: [{ product_id: 'product-b', qty: '5' }] })
            .mockResolvedValueOnce({ rows: [] });

        let capturedShortageValue;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('INSERT INTO daily_settlements')) {
                        capturedShortageValue = params[10];
                        return { rows: [{ id: 201 }] };
                    }
                    return { rows: [] };
                }),
            };
            return await cb(client);
        });

        const res = mockRes();
        await createSettlement({
            body: { cash_collected: 1000 },
            user: workerUser,
        }, res);

        expect(capturedShortageValue).toBe(0);
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
