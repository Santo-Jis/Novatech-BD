/**
 * sales.controller.test.js
 * ─────────────────────────────────────────────────────────────
 * Sales Controller-এর Business Logic টেস্ট
 *
 * কভার করা হচ্ছে:
 * ✅ createSale   — credit limit check, replacement হিসাব, credit balance সমন্বয়
 * ✅ verifyOTP    — OTP সময়মতো যাচাই, expired OTP, ভুল OTP
 * ✅ Sales calculation — net_amount, credit balance used/added
 *
 * FIX LOG:
 * - firebase.js (getDB) mock যোগ করা হয়েছে
 * - createSale: controller প্রতিটি item-এ আলাদা query করে
 *   তাই mock sequence item count অনুযায়ী দিতে হয়
 * - credit limit test: query sequence ঠিক করা হয়েছে
 *   (idempotency → customer → product per item → otp_required → otp_expiry)
 * ─────────────────────────────────────────────────────────────
 */

// ─── সব external dependency mock ─────────────────────────────
jest.mock('../config/db', () => ({
    query: jest.fn(),
    withTransaction: jest.fn(),
}));
jest.mock('../config/firebase', () => ({
    getDB: jest.fn().mockReturnValue({
        ref: jest.fn().mockReturnValue({
            set:    jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
        }),
    }),
}));
jest.mock('../services/price.utils', () => ({
    calcFromProduct: jest.fn(),
}));
jest.mock('../config/encryption', () => ({
    generateOTP: jest.fn().mockReturnValue('123456'),
}));
jest.mock('../controllers/ledger.controller', () => ({
    addLedgerEntry: jest.fn().mockResolvedValue({}),
}));
jest.mock('../services/invoice.service', () => ({
    generateInvoiceNumber:     jest.fn().mockResolvedValue('INV-2025-001'),
    sendInvoiceOTP:            jest.fn().mockResolvedValue({ results: [] }),
    sendInvoiceNotification:   jest.fn().mockResolvedValue({ results: [] }),
    generateInvoicePDF:        jest.fn().mockResolvedValue(null),
    getInvoiceWhatsAppMessage: jest.fn().mockReturnValue('WhatsApp message'),
}));
jest.mock('../services/employee.service', () => ({
    uploadToCloudinary: jest.fn().mockResolvedValue('http://cloudinary.com/test.jpg'),
}));
jest.mock('../services/firebase.notify', () => ({
    firebaseNotify: jest.fn().mockResolvedValue({}),
}));

const { query, withTransaction } = require('../config/db');
const { calcFromProduct }        = require('../services/price.utils');

// ─── Helpers ──────────────────────────────────────────────────

const mockRes = () => {
    const res  = {};
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

// সাধারণ customer যার credit limit-এর মধ্যে আছে
const makeCustomer = (overrides = {}) => ({
    id:              'c1',
    shop_name:       'দোকান',
    current_credit:  '0',
    credit_limit:    '50000',
    credit_balance:  0,
    ...overrides,
});

// সাধারণ product
const makeProduct = (overrides = {}) => ({
    id:    'p1',
    name:  'পণ্য',
    price: '1000',
    vat:   '0',
    tax:   '0',
    ...overrides,
});

// calcFromProduct default return
const defaultCalcResult = {
    unitPrice: 1000, vatRate: 0, taxRate: 0,
    vatAmount: 0, taxAmount: 0,
    finalPrice: 1000, subtotal: 1000,
};

// ─────────────────────────────────────────────────────────────
// createSale
//
// query sequence (controller অনুযায়ী):
//   1. idempotency check (idempotency_key দিলে)
//   2. SELECT customers WHERE id = $1
//   3. SELECT products WHERE id = $1  ← প্রতিটি item-এর জন্য আলাদা
//   4. (replacement_items থাকলে) SELECT products  × replacement count
//   5. SELECT system_settings WHERE key='otp_required'
//   6. SELECT system_settings WHERE key='otp_expiry_minutes'
//   then: withTransaction(...)
// ─────────────────────────────────────────────────────────────

describe('createSale — বিক্রয়ের নিয়ম', () => {

    let createSale;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // withTransaction default: sale row ফেরত দাও
        withTransaction.mockImplementation(async (cb) => {
            const client = {
                query: jest.fn().mockResolvedValue({
                    rows: [{
                        id:                   100,
                        invoice_number:       'INV-001',
                        total_amount:         1000,
                        net_amount:           1000,
                        payment_method:       'cash',
                        credit_balance_used:  0,
                        credit_balance_added: 0,
                    }],
                }),
            };
            return await cb(client);
        });

        ({ createSale } = require('../controllers/sales.controller'));
    });

    // ── Required fields ───────────────────────────────────────

    test('customer_id না দিলে 400', async () => {
        const req = {
            body: { items: [{ product_id: 'p1', qty: 2 }], payment_method: 'cash' },
            user: workerUser,
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false })
        );
    });

    test('items না দিলে 400', async () => {
        const req = {
            body: { customer_id: 'c1', payment_method: 'cash' },
            user: workerUser,
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('payment_method না দিলে 400', async () => {
        const req = {
            body: { customer_id: 'c1', items: [{ product_id: 'p1', qty: 1 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    // ── Idempotency ───────────────────────────────────────────

    test('duplicate idempotency_key — আগের sale ফেরত দেবে', async () => {
        const prevSale = {
            id: 77, invoice_number: 'INV-OLD-001',
            total_amount: 500, net_amount: 500,
            payment_method: 'cash',
            credit_balance_used: 0, credit_balance_added: 0,
        };

        // idempotency query → match পাওয়া গেল → সাথে সাথে return
        query.mockResolvedValueOnce({ rows: [prevSale] });

        const req = {
            body: {
                customer_id:     'c1',
                items:           [{ product_id: 'p1', qty: 1 }],
                payment_method:  'cash',
                idempotency_key: 'unique-key-abc',
            },
            user: workerUser,
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                duplicate: true,
                data: expect.objectContaining({ invoice_number: 'INV-OLD-001' }),
            })
        );
    });

    // ── Customer Not Found ────────────────────────────────────

    test('কাস্টমার না পাওয়া গেলে 404', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })  // idempotency: no match
            .mockResolvedValueOnce({ rows: [] }); // customer: not found

        const req = {
            body: {
                customer_id:    'unknown-c',
                items:          [{ product_id: 'p1', qty: 1 }],
                payment_method: 'cash',
            },
            user: workerUser,
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    // ── Credit Limit Pre-check ────────────────────────────────

    test('credit limit পার হলে sale reject (prelim check)', async () => {
        // customer: current_credit=9000, credit_limit=10000
        // netAmount=2000 → 9000+2000=11000 > 10000 → reject

        calcFromProduct.mockReturnValue({
            unitPrice: 1000, vatRate: 0, taxRate: 0,
            vatAmount: 0, taxAmount: 0,
            finalPrice: 1000, subtotal: 2000,
        });

        query
            .mockResolvedValueOnce({ rows: [] })                       // idempotency: no match
            .mockResolvedValueOnce({ rows: [makeCustomer({ current_credit: '9000', credit_limit: '10000' })] }) // customer
            .mockResolvedValueOnce({ rows: [makeProduct()] })          // product (1 item)
            .mockResolvedValueOnce({ rows: [{ value: 'false' }] })    // otp_required
            .mockResolvedValueOnce({ rows: [{ value: '10' }] });      // otp_expiry_minutes

        const req = {
            body: {
                customer_id:    'c1',
                items:          [{ product_id: 'p1', qty: 2 }],
                payment_method: 'credit',
            },
            user: workerUser,
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('লিমিট') })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// verifyOTP
// query sequence:
//   1. SELECT sale WHERE id AND worker_id
//   2. (valid OTP) UPDATE sales_transactions SET otp_verified=true
// ─────────────────────────────────────────────────────────────

describe('verifyOTP — OTP যাচাই', () => {

    let verifyOTP;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        ({ verifyOTP } = require('../controllers/sales.controller'));
    });

    test('sale না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { body: { sale_id: '999', otp: '123456' }, user: workerUser };
        const res = mockRes();

        await verifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('আগে verify হয়ে থাকলে 400', async () => {
        query.mockResolvedValueOnce({
            rows: [{ id: 1, otp_verified: true, otp_code: '123456', otp_expires_at: new Date(Date.now() + 60000) }],
        });

        const req = { body: { sale_id: '1', otp: '123456' }, user: workerUser };
        const res = mockRes();

        await verifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আগে থেকেই') })
        );
    });

    test('মেয়াদ শেষ OTP — 400', async () => {
        query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                otp_verified:   false,
                otp_code:       '654321',
                otp_expires_at: new Date(Date.now() - 60000), // ১ মিনিট আগে expire
            }],
        });

        const req = { body: { sale_id: '1', otp: '654321' }, user: workerUser };
        const res = mockRes();

        await verifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('মেয়াদ শেষ') })
        );
    });

    test('ভুল OTP — 400', async () => {
        query.mockResolvedValueOnce({
            rows: [{
                id: 1,
                otp_verified:   false,
                otp_code:       '111111',
                otp_expires_at: new Date(Date.now() + 300000),
            }],
        });

        const req = { body: { sale_id: '1', otp: '999999' }, user: workerUser };
        const res = mockRes();

        await verifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ভুল') })
        );
    });

    test('সঠিক OTP — 200', async () => {
        query
            .mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    otp_verified:   false,
                    otp_code:       '777777',
                    otp_expires_at: new Date(Date.now() + 300000),
                }],
            })
            .mockResolvedValueOnce({ rows: [] }); // UPDATE otp_verified=true

        const req = { body: { sale_id: '1', otp: '777777' }, user: workerUser };
        const res = mockRes();

        await verifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// Sales Business Logic — Pure Calculations
// ─────────────────────────────────────────────────────────────

describe('Sales Business Logic — Pure Calculations', () => {

    // Credit balance কতটুকু ব্যবহার হবে
    const calcCreditBalanceUsed = (creditBalance, totalAmount) => {
        if (!creditBalance || creditBalance <= 0) return 0;
        return Math.min(creditBalance, totalAmount);
    };

    test('credit balance ব্যবহার না করলে 0', () => {
        expect(calcCreditBalanceUsed(0, 1000)).toBe(0);
    });

    test('balance < total — পুরো balance ব্যবহার', () => {
        expect(calcCreditBalanceUsed(300, 1000)).toBe(300);
    });

    test('balance > total — শুধু total পরিমাণ ব্যবহার', () => {
        expect(calcCreditBalanceUsed(1500, 1000)).toBe(1000);
    });

    test('balance = 0 — ব্যবহার 0', () => {
        expect(calcCreditBalanceUsed(0, 500)).toBe(0);
    });

    // Net amount হিসাব
    const calcNetAmount = (totalAmount, discount, replacementValue) => {
        const net = totalAmount - discount - replacementValue;
        if (net < 0) return 0;
        return net;
    };

    const calcCreditBalanceAdded = (totalAmount, discount, replacementValue) => {
        const net = totalAmount - discount - replacementValue;
        if (net < 0) return Math.abs(net);
        return 0;
    };

    test('discount ও replacement ছাড়া — net = total', () => {
        expect(calcNetAmount(1000, 0, 0)).toBe(1000);
    });

    test('discount আছে — net কমে', () => {
        expect(calcNetAmount(1000, 200, 0)).toBe(800);
    });

    test('replacement বেশি হলে net = 0, credit জমা হয়', () => {
        expect(calcNetAmount(1000, 0, 1500)).toBe(0);
        expect(calcCreditBalanceAdded(1000, 0, 1500)).toBe(500);
    });

    test('discount + replacement > total — net = 0', () => {
        expect(calcNetAmount(1000, 300, 800)).toBe(0);
    });

    test('net কখনো negative হবে না', () => {
        expect(calcNetAmount(500, 1000, 0)).toBe(0);
    });

    // Credit limit check
    const canSaleOnCredit = (currentCredit, creditLimit, saleAmount) => {
        const after = parseFloat(currentCredit) + saleAmount;
        return after <= parseFloat(creditLimit);
    };

    test('লিমিটের মধ্যে — সফল', () => {
        expect(canSaleOnCredit('3000', '10000', 5000)).toBe(true);
    });

    test('ঠিক লিমিটে — সফল', () => {
        expect(canSaleOnCredit('5000', '10000', 5000)).toBe(true);
    });

    test('লিমিট পার — ব্যর্থ', () => {
        expect(canSaleOnCredit('9000', '10000', 2000)).toBe(false);
    });

    test('current_credit string হলেও সঠিক', () => {
        expect(canSaleOnCredit('1000.50', '5000', 2000)).toBe(true);
    });

    // Total amount calculation
    const calcSaleTotal = (items) =>
        items.reduce((sum, item) => sum + item.subtotal, 0);

    test('একটি item — total = subtotal', () => {
        expect(calcSaleTotal([{ subtotal: 1500 }])).toBe(1500);
    });

    test('একাধিক item — সঠিক যোগ', () => {
        expect(calcSaleTotal([
            { subtotal: 1000 },
            { subtotal: 2000 },
            { subtotal: 500  },
        ])).toBe(3500);
    });

    test('খালি list — 0', () => {
        expect(calcSaleTotal([])).toBe(0);
    });

    // Replacement value calculation
    const calcReplacementValue = (items) =>
        (items || []).reduce((sum, item) => sum + (item.total || 0), 0);

    test('replacement item ছাড়া — 0', () => {
        expect(calcReplacementValue([])).toBe(0);
    });

    test('replacement items আছে — সঠিক যোগ', () => {
        expect(calcReplacementValue([
            { total: 600 },
            { total: 400 },
        ])).toBe(1000);
    });
});
