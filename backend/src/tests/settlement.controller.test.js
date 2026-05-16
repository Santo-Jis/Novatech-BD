/**
 * settlement.controller.test.js
 * ─────────────────────────────────────────────────────────────
 * Settlement Controller-এর Business Logic টেস্ট
 *
 * কভার করা হচ্ছে:
 * ✅ createSettlement  — duplicate check, cash mismatch validation,
 *                        shortage হিসাব, ৳৫০০+ পার্থক্যে কারণ বাধ্যতামূলক
 * ✅ approveSettlement — cash shortfall → outstanding_dues বৃদ্ধি
 * ✅ disputeSettlement — পণ্য ঘাটতি + নগদ ঘাটতি → dues হিসাব
 * ✅ payShortage       — dues কমানো, শূন্য হলে settlement approve
 *
 * DB mock করা হয়েছে — real DB connection ছাড়াই চলবে
 * ─────────────────────────────────────────────────────────────
 */

// ─── সব external dependency mock ─────────────────────────────
jest.mock('../config/db', () => ({
    query: jest.fn(),
    withTransaction: jest.fn(),
}));
jest.mock('../services/fcm.service',         () => ({ sendPushNotification: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/firebase.notify',     () => ({ firebaseNotify: jest.fn().mockResolvedValue({}) }));
jest.mock('../controllers/ledger.controller',() => ({ addLedgerEntry: jest.fn().mockResolvedValue({}) }));

const { query, withTransaction } = require('../config/db');

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const workerUser = {
    id:         'worker-uuid-1',
    role:       'worker',
    name_bn:    'আলী',
    manager_id: 'manager-uuid-1',
};

const managerUser = {
    id:      'manager-uuid-1',
    role:    'manager',
    name_bn: 'ম্যানেজার',
};

// ─────────────────────────────────────────────────────────────
// createSettlement
// ─────────────────────────────────────────────────────────────

describe('createSettlement — হিসাব জমার নিয়ম', () => {

    let createSettlement;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockResolvedValue({ rows: [{ id: 200 }] })
            };
            return await cb(client);
        });

        ({ createSettlement } = require('../controllers/settlement.controller'));
    });

    // ── Duplicate Check ─────────────────────────────────────

    test('আজকে আগেই settlement দেওয়া থাকলে 400', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 10, status: 'pending' }] }); // existing found

        const req = {
            body: { cash_collected: 5000 },
            user: workerUser
        };
        const res = mockRes();

        await createSettlement(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আগেই জমা') })
        );
    });

    // ── Required Field ──────────────────────────────────────

    test('cash_collected না দিলে 400', async () => {
        query
            .mockResolvedValueOnce({ rows: [] }) // no existing settlement
            .mockResolvedValueOnce({ rows: [] }); // no orders

        const req = {
            body: {},  // cash_collected নেই
            user: workerUser
        };
        const res = mockRes();

        await createSettlement(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('নগদ জমা') })
        );
    });

    // ── Cash Mismatch Validation ────────────────────────────

    test('৳৫০০+ পার্থক্যে কারণ ছাড়া 422', async () => {
        // system cash (sales data) = 5000, SR cash = 5600 → diff = 600 > 500
        query
            .mockResolvedValueOnce({ rows: [] })  // no existing
            .mockResolvedValueOnce({ rows: [] })  // no orders
            .mockResolvedValueOnce({              // sales data
                rows: [{ total_sales: 5000, cash_collected: 5000, credit_given: 0, replacement_value: 0, old_credit_collected: 0 }]
            })
            .mockResolvedValueOnce({ rows: [] })  // sold bulk
            .mockResolvedValueOnce({ rows: [] }); // replaced bulk

        const req = {
            body: {
                cash_collected:      5600,
                mismatch_explanation: '', // কারণ নেই
            },
            user: workerUser
        };
        const res = mockRes();

        await createSettlement(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('কারণ লেখা বাধ্যতামূলক') })
        );
    });

    test('৳৫০০+ পার্থক্যে কারণ দিলে সফল', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })  // no existing
            .mockResolvedValueOnce({ rows: [] })  // no orders (empty)
            .mockResolvedValueOnce({              // sales data
                rows: [{ total_sales: 5000, cash_collected: 5000, credit_given: 0, replacement_value: 0, old_credit_collected: 0 }]
            })
            .mockResolvedValueOnce({ rows: [] })  // sold bulk
            .mockResolvedValueOnce({ rows: [] }); // replaced bulk

        const req = {
            body: {
                cash_collected:      5600,
                mismatch_explanation: 'কাস্টমার ভুলে বেশি দিয়েছে',
            },
            user: workerUser
        };
        const res = mockRes();

        await createSettlement(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
    });

    test('৳৫০০ এর কম পার্থক্যে কারণ ছাড়াও সফল', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })  // no orders
            .mockResolvedValueOnce({
                rows: [{ total_sales: 5000, cash_collected: 5000, credit_given: 0, replacement_value: 0, old_credit_collected: 0 }]
            })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            body: { cash_collected: 5300 }, // diff = 300 < 500
            user: workerUser
        };
        const res = mockRes();

        await createSettlement(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    // ── Shortage Calculation ────────────────────────────────

    test('ঘাটতি সঠিক হিসাব হচ্ছে', async () => {
        // Order: পণ্য-A 10 pcs @ 500 = 5000
        // বিক্রয়: 6 pcs, replace: 2 pcs, ফেরত: 0 → shortage = 2 pcs = 1000 টাকা
        const orderItems = [{
            product_id: 'product-a', product_name: 'পণ্য-A',
            approved_qty: 10, price: 500, final_price: 500
        }];

        query
            .mockResolvedValueOnce({ rows: [] })  // no existing
            .mockResolvedValueOnce({ rows: [{ id: 'o1', items: JSON.stringify(orderItems), total_amount: 5000 }] }) // order
            .mockResolvedValueOnce({              // sales
                rows: [{ total_sales: 3000, cash_collected: 3000, credit_given: 0, replacement_value: 1000, old_credit_collected: 0 }]
            })
            .mockResolvedValueOnce({ rows: [{ product_id: 'product-a', qty: '6' }] }) // sold bulk
            .mockResolvedValueOnce({ rows: [{ product_id: 'product-a', qty: '2' }] }); // replaced bulk

        let capturedShortageValue;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('INSERT INTO daily_settlements')) {
                        capturedShortageValue = params[10]; // shortage_qty_value position
                        return { rows: [{ id: 200 }] };
                    }
                    return { rows: [] };
                })
            };
            return await cb(client);
        });

        const req = {
            body: { cash_collected: 3000, returned_items: [] },
            user: workerUser
        };
        const res = mockRes();

        await createSettlement(req, res);

        // shortage = 10-(6+2+0) = 2 pcs × 500 = 1000
        expect(capturedShortageValue).toBe(1000);
    });

    test('সব পণ্য বিক্রয় হলে shortage = 0', async () => {
        const orderItems = [{
            product_id: 'product-b', product_name: 'পণ্য-B',
            approved_qty: 5, price: 200, final_price: 200
        }];

        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'o2', items: JSON.stringify(orderItems), total_amount: 1000 }] })
            .mockResolvedValueOnce({
                rows: [{ total_sales: 1000, cash_collected: 1000, credit_given: 0, replacement_value: 0, old_credit_collected: 0 }]
            })
            .mockResolvedValueOnce({ rows: [{ product_id: 'product-b', qty: '5' }] }) // sold = 5 (all)
            .mockResolvedValueOnce({ rows: [] }); // no replacement

        let capturedShortageValue;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('INSERT INTO daily_settlements')) {
                        capturedShortageValue = params[10];
                        return { rows: [{ id: 201 }] };
                    }
                    return { rows: [] };
                })
            };
            return await cb(client);
        });

        const req = {
            body: { cash_collected: 1000 },
            user: workerUser
        };
        const res = mockRes();

        await createSettlement(req, res);

        expect(capturedShortageValue).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────
// approveSettlement
// ─────────────────────────────────────────────────────────────

describe('approveSettlement — হিসাব অনুমোদন', () => {

    let approveSettlement;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        ({ approveSettlement } = require('../controllers/settlement.controller'));
    });

    test('pending settlement না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: '999' }, body: {}, user: managerUser };
        const res = mockRes();

        await approveSettlement(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('নগদ ঘাটতি থাকলে outstanding_dues বাড়বে', async () => {
        // cash_collected = 4000 (SR দিয়েছে), cash_difference = -1000 (মানে ১০০০ কম)
        // systemCash = 4000 - (-1000) = 5000; cashShortfall = 1000
        const settlement = {
            id: '30', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '4000', cash_difference: '-1000'
        };
        query.mockResolvedValueOnce({ rows: [settlement] });

        let duesAdded = 0;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql, params) => {
                    if (sql.includes('UPDATE users') && sql.includes('outstanding_dues')) {
                        duesAdded = params[0]; // amount
                    }
                    return { rows: [] };
                })
            };
            await cb(client);
        });

        const req = { params: { id: '30' }, body: {}, user: managerUser };
        const res = mockRes();

        await approveSettlement(req, res);

        expect(duesAdded).toBe(1000);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ cashShortfall: 1000 })
        );
    });

    test('নগদ ঘাটতি নেই — dues বাড়বে না', async () => {
        // cash_collected=5000, cash_difference=0 → cashShortfall=0
        const settlement = {
            id: '31', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '5000', cash_difference: '0'
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
                })
            };
            await cb(client);
        });

        const req = { params: { id: '31' }, body: {}, user: managerUser };
        const res = mockRes();

        await approveSettlement(req, res);

        expect(duesUpdateCalled).toBe(false);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ cashShortfall: 0 })
        );
    });

    test('নগদ বেশি দিলে (positive difference) — dues বাড়বে না', async () => {
        // cash_collected=5200, cash_difference=+200 → SR বেশি দিয়েছে → শর্টফল 0
        const settlement = {
            id: '32', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '5200', cash_difference: '200'
        };
        query.mockResolvedValueOnce({ rows: [settlement] });

        let duesUpdateCalled = false;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql) => {
                    if (sql.includes('outstanding_dues + ')) duesUpdateCalled = true;
                    return { rows: [] };
                })
            };
            await cb(client);
        });

        const req = { params: { id: '32' }, body: {}, user: managerUser };
        const res = mockRes();

        await approveSettlement(req, res);

        expect(duesUpdateCalled).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────
// disputeSettlement
// ─────────────────────────────────────────────────────────────

describe('disputeSettlement — ঘাটতি চিহ্নিত', () => {

    let disputeSettlement;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        withTransaction.mockImplementation(async (cb) => {
            const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
            await cb(client);
        });
        ({ disputeSettlement } = require('../controllers/settlement.controller'));
    });

    test('settlement না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: '999' }, body: {}, user: managerUser };
        const res = mockRes();

        await disputeSettlement(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('পণ্য ঘাটতি + নগদ ঘাটতি — মোট dues সঠিক', async () => {
        // cash_difference = -500 → cashShortfall = 500
        // shortage_value = 1500 (manager দিয়েছে)
        // totalDues = 1500 + 500 = 2000
        const settlement = {
            id: '40', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '4500', cash_difference: '-500',
            shortage_qty_value: '0'
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
                })
            };
            await cb(client);
        });

        const req = {
            params: { id: '40' },
            body: { shortage_value: 1500 },
            user: managerUser
        };
        const res = mockRes();

        await disputeSettlement(req, res);

        expect(capturedTotalDues).toBe(2000);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ totalDues: 2000 })
        );
    });

    test('ঘাটতি নেই — dues 0, তবু status=disputed', async () => {
        const settlement = {
            id: '41', worker_id: 'w1', settlement_date: '2025-07-01',
            cash_collected: '5000', cash_difference: '0',
            shortage_qty_value: '0'
        };
        query.mockResolvedValueOnce({ rows: [settlement] });

        let duesUpdateCalled = false;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql) => {
                    if (sql.includes('outstanding_dues') && sql.includes('UPDATE')) duesUpdateCalled = true;
                    return { rows: [] };
                })
            };
            await cb(client);
        });

        const req = {
            params: { id: '41' },
            body: { shortage_value: 0 },
            user: managerUser
        };
        const res = mockRes();

        await disputeSettlement(req, res);

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

    let payShortage;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        ({ payShortage } = require('../controllers/settlement.controller'));
    });

    test('amount না দিলে 400', async () => {
        const req = { params: { id: '50' }, body: {}, user: managerUser };
        const res = mockRes();

        await payShortage(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('amount ≤ 0 হলে 400', async () => {
        const req = { params: { id: '50' }, body: { amount: 0 }, user: managerUser };
        const res = mockRes();

        await payShortage(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('settlement না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: '999' }, body: { amount: 500 }, user: managerUser };
        const res = mockRes();

        await payShortage(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('পরিশোধের পর dues শূন্য — settlement approve', async () => {
        query.mockResolvedValueOnce({ rows: [{ worker_id: 'w1' }] }); // settlement found

        let settlementApproved = false;
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockImplementation(async (sql) => {
                    if (sql.includes('SELECT outstanding_dues')) {
                        return { rows: [{ outstanding_dues: '0' }] }; // dues শূন্য হয়েছে
                    }
                    if (sql.includes("status = 'approved'") && sql.includes('daily_settlements')) {
                        settlementApproved = true;
                    }
                    return { rows: [{ settlement_date: '2025-07-01' }] };
                })
            };
            await cb(client);
        });

        const req = { params: { id: '50' }, body: { amount: 1000, payment_method: 'cash_paid' }, user: managerUser };
        const res = mockRes();

        await payShortage(req, res);

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
                        return { rows: [{ outstanding_dues: '500' }] }; // এখনো বাকি
                    }
                    if (sql.includes("status = 'approved'")) {
                        settlementApproved = true;
                    }
                    return { rows: [] };
                })
            };
            await cb(client);
        });

        const req = { params: { id: '51' }, body: { amount: 500, payment_method: 'cash_paid' }, user: managerUser };
        const res = mockRes();

        await payShortage(req, res);

        expect(settlementApproved).toBe(false);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ fully_paid: false })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// Settlement Business Logic — Pure Calculations
// ─────────────────────────────────────────────────────────────

describe('Settlement Business Logic — Pure Calculations', () => {

    /**
     * Bangladesh timezone helper test
     * UTC+6 offset সঠিকভাবে প্রয়োগ হচ্ছে কিনা
     */
    const getBDToday = () => {
        const bdOffset = 6 * 60 * 60 * 1000;
        const bdDate   = new Date(Date.now() + bdOffset);
        return bdDate.toISOString().split('T')[0];
    };

    test('getBDToday YYYY-MM-DD ফরম্যাট দেবে', () => {
        const today = getBDToday();
        expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('getBDToday valid date হবে', () => {
        const today = getBDToday();
        expect(isNaN(new Date(today).getTime())).toBe(false);
    });

    /**
     * Cash difference হিসাব
     * + হলে SR বেশি দিয়েছে
     * - হলে SR কম দিয়েছে (shortfall)
     */
    const calcCashDifference = (srCash, systemCash) =>
        parseFloat(srCash) - parseFloat(systemCash);

    test('SR বেশি দিলে positive', () => {
        expect(calcCashDifference(5200, 5000)).toBe(200);
    });

    test('SR কম দিলে negative', () => {
        expect(calcCashDifference(4800, 5000)).toBe(-200);
    });

    test('হুবহু মিললে 0', () => {
        expect(calcCashDifference(5000, 5000)).toBe(0);
    });

    /**
     * Cash shortfall হিসাব (approve-এ ব্যবহার)
     * cashDiff < 0 → |cashDiff| = shortfall
     */
    const calcCashShortfall = (cashDifference) =>
        cashDifference < 0 ? Math.abs(cashDifference) : 0;

    test('negative difference → shortfall = absolute value', () => {
        expect(calcCashShortfall(-1000)).toBe(1000);
    });

    test('positive difference → shortfall = 0', () => {
        expect(calcCashShortfall(200)).toBe(0);
    });

    test('zero difference → shortfall = 0', () => {
        expect(calcCashShortfall(0)).toBe(0);
    });

    /**
     * Shortage হিসাব
     * নেওয়া - (বিক্রয় + replace + ফেরত) = shortage
     */
    const calcShortage = (takenQty, soldQty, replacedQty, returnedQty) =>
        Math.max(0, takenQty - (soldQty + replacedQty + returnedQty));

    test('সব বিক্রয় — shortage = 0', () => {
        expect(calcShortage(10, 10, 0, 0)).toBe(0);
    });

    test('বিক্রয় + replace + ফেরত মিলিয়ে সব — shortage = 0', () => {
        expect(calcShortage(10, 5, 3, 2)).toBe(0);
    });

    test('কিছু বাকি — shortage আছে', () => {
        expect(calcShortage(10, 5, 2, 1)).toBe(2); // 10-(5+2+1)=2
    });

    test('shortage কখনো negative হবে না', () => {
        expect(calcShortage(5, 8, 0, 0)).toBe(0);
    });

    /**
     * Shortage টাকার মূল্য
     * qty × effectivePrice (VAT+Tax সহ)
     */
    const calcShortageValue = (shortageQty, effectivePrice) =>
        shortageQty * parseFloat(effectivePrice);

    test('২ পিস × ৫০০ = ১০০০', () => {
        expect(calcShortageValue(2, 500)).toBe(1000);
    });

    test('shortage = 0 → value = 0', () => {
        expect(calcShortageValue(0, 1150)).toBe(0);
    });

    test('VAT সহ final_price ব্যবহার হলেও সঠিক', () => {
        expect(calcShortageValue(3, 1150)).toBe(3450); // VAT সহ দাম
    });

    /**
     * Cash mismatch limit check (৳৫০০)
     */
    const requiresExplanation = (srCash, systemCash) =>
        Math.abs(srCash - systemCash) > 500;

    test('৫০০ এর কম — কারণ লাগবে না', () => {
        expect(requiresExplanation(5400, 5000)).toBe(false);
    });

    test('ঠিক ৫০০ — কারণ লাগবে না', () => {
        expect(requiresExplanation(5500, 5000)).toBe(false);
    });

    test('৫০১ — কারণ বাধ্যতামূলক', () => {
        expect(requiresExplanation(5501, 5000)).toBe(true);
    });

    test('SR কম দিলেও একই নিয়ম', () => {
        expect(requiresExplanation(4400, 5000)).toBe(true); // diff=600 > 500
    });

    /**
     * Dispute-এর মোট dues
     * totalDues = productShortage + cashShortfall
     */
    const calcTotalDues = (shortageValue, cashShortfall) =>
        shortageValue + cashShortfall;

    test('শুধু পণ্য ঘাটতি — dues = shortage value', () => {
        expect(calcTotalDues(1500, 0)).toBe(1500);
    });

    test('শুধু নগদ ঘাটতি — dues = cash shortfall', () => {
        expect(calcTotalDues(0, 800)).toBe(800);
    });

    test('উভয় ঘাটতি — dues = যোগফল', () => {
        expect(calcTotalDues(1500, 500)).toBe(2000);
    });

    test('কোনো ঘাটতি নেই — dues = 0', () => {
        expect(calcTotalDues(0, 0)).toBe(0);
    });
});
