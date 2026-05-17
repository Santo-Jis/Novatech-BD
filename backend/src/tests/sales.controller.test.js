/**
 * sales.controller.test.js
 *
 * FIX: সব transitive dependency mock করা হয়েছে।
 * sales.controller → invoice.service → sms.service + email.service + pdfkit
 * sales.controller → employee.service → pdfkit + sms.service
 * এগুলো সব top-level এ mock না থাকলে module load-এই crash → 500।
 */

// ─── Direct mocks ─────────────────────────────────────────────
jest.mock('../config/db', () => ({
    query:           jest.fn(),
    withTransaction: jest.fn(),
}));
jest.mock('../config/firebase', () => ({
    initializeFirebase: jest.fn(),
    getDB: jest.fn().mockReturnValue({
        ref: jest.fn().mockReturnValue({
            set: jest.fn().mockResolvedValue({}),
        }),
    }),
}));
jest.mock('../services/price.utils',     () => ({ calcFromProduct: jest.fn() }));
jest.mock('../config/encryption',        () => ({
    generateOTP: jest.fn().mockReturnValue('123456'),
    encrypt:     jest.fn().mockReturnValue('encrypted'),
    decrypt:     jest.fn().mockReturnValue('decrypted'),
}));
jest.mock('../controllers/ledger.controller', () => ({ addLedgerEntry: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/firebase.notify',      () => ({ firebaseNotify: jest.fn().mockResolvedValue({}) }));

// ─── Transitive mocks (invoice.service এর dependencies) ───────
jest.mock('pdfkit', () => {
    const mockDoc = {
        pipe:      jest.fn().mockReturnThis(),
        fontSize:  jest.fn().mockReturnThis(),
        font:      jest.fn().mockReturnThis(),
        text:      jest.fn().mockReturnThis(),
        moveDown:  jest.fn().mockReturnThis(),
        end:       jest.fn().mockReturnThis(),
        on:        jest.fn().mockImplementation((event, cb) => {
            if (event === 'end') setTimeout(cb, 0);
            return mockDoc;
        }),
    };
    return jest.fn().mockImplementation(() => mockDoc);
});
jest.mock('axios', () => ({
    post: jest.fn().mockResolvedValue({ data: { status: 'success' } }),
    get:  jest.fn().mockResolvedValue({ data: {} }),
}));
jest.mock('../services/sms.service', () => ({
    sendOTP:              jest.fn().mockResolvedValue({ success: true }),
    sendInvoice:          jest.fn().mockResolvedValue({ success: true }),
    getWhatsAppInvoiceLink: jest.fn().mockReturnValue('https://wa.me/test'),
    sendLoginCredentials: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../services/email.service', () => ({
    sendOTPEmail:              jest.fn().mockResolvedValue({}),
    sendOTPWithInvoiceEmail:   jest.fn().mockResolvedValue({}),
    sendInvoiceEmail:          jest.fn().mockResolvedValue({}),
    sendOrderNotificationEmail: jest.fn().mockResolvedValue({}),
    sendLoginCredentials:      jest.fn().mockResolvedValue({}),
}));
jest.mock('../services/invoice.service', () => ({
    generateInvoiceNumber:     jest.fn().mockResolvedValue('INV-2025-001'),
    sendInvoiceOTP:            jest.fn().mockResolvedValue({ results: [] }),
    sendInvoiceNotification:   jest.fn().mockResolvedValue({ results: [] }),
    generateInvoicePDF:        jest.fn().mockResolvedValue(null),
    getInvoiceWhatsAppMessage: jest.fn().mockReturnValue('msg'),
}));
jest.mock('../services/employee.service', () => ({
    uploadToCloudinary:   jest.fn().mockResolvedValue('http://img.jpg'),
    sendLoginCredentials: jest.fn().mockResolvedValue({}),
}));
jest.mock('bcryptjs', () => ({
    hash:    jest.fn().mockResolvedValue('hashed'),
    compare: jest.fn().mockResolvedValue(true),
}));

// ─── Imports ──────────────────────────────────────────────────
const { query, withTransaction } = require('../config/db');
const { calcFromProduct }        = require('../services/price.utils');
const { createSale, verifyOTP }  = require('../controllers/sales.controller');

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

const makeCustomer = (overrides = {}) => ({
    id:             'c1',
    shop_name:      'দোকান',
    current_credit: '0',
    credit_limit:   '50000',
    credit_balance: 0,
    ...overrides,
});

const makeProduct = (overrides = {}) => ({
    id:    'p1',
    name:  'পণ্য',
    price: '1000',
    vat:   '0',
    tax:   '0',
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();

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
});

// ─────────────────────────────────────────────────────────────
// createSale
// query sequence:
//   1. idempotency check (key দিলে)
//   2. SELECT customers WHERE id = $1
//   3. SELECT products WHERE id = $1 (প্রতিটি item আলাদা)
//   4. SELECT system_settings otp_required
//   5. SELECT system_settings otp_expiry_minutes
// ─────────────────────────────────────────────────────────────

describe('createSale — বিক্রয়ের নিয়ম', () => {

    test('customer_id না দিলে 400', async () => {
        const res = mockRes();
        await createSale({
            body: { items: [{ product_id: 'p1', qty: 2 }], payment_method: 'cash' },
            user: workerUser,
        }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('items না দিলে 400', async () => {
        const res = mockRes();
        await createSale({
            body: { customer_id: 'c1', payment_method: 'cash' },
            user: workerUser,
        }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('payment_method না দিলে 400', async () => {
        const res = mockRes();
        await createSale({
            body: { customer_id: 'c1', items: [{ product_id: 'p1', qty: 1 }] },
            user: workerUser,
        }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('duplicate idempotency_key — আগের sale ফেরত দেবে', async () => {
        const prevSale = {
            id: 77, invoice_number: 'INV-OLD-001',
            total_amount: 500, net_amount: 500,
            payment_method: 'cash',
            credit_balance_used: 0, credit_balance_added: 0,
        };
        query.mockResolvedValueOnce({ rows: [prevSale] });

        const res = mockRes();
        await createSale({
            body: {
                customer_id:     'c1',
                items:           [{ product_id: 'p1', qty: 1 }],
                payment_method:  'cash',
                idempotency_key: 'unique-key-abc',
            },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                duplicate: true,
                data: expect.objectContaining({ invoice_number: 'INV-OLD-001' }),
            })
        );
    });

    test('কাস্টমার না পাওয়া গেলে 404', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })  // idempotency: no match
            .mockResolvedValueOnce({ rows: [] }); // customer: not found

        const res = mockRes();
        await createSale({
            body: {
                customer_id:    'unknown-c',
                items:          [{ product_id: 'p1', qty: 1 }],
                payment_method: 'cash',
            },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('credit limit পার হলে sale reject', async () => {
        calcFromProduct.mockReturnValue({
            unitPrice: 1000, vatRate: 0, taxRate: 0,
            vatAmount: 0, taxAmount: 0,
            finalPrice: 1000, subtotal: 2000,
        });

        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [makeCustomer({ current_credit: '9000', credit_limit: '10000' })] })
            .mockResolvedValueOnce({ rows: [makeProduct()] })
            .mockResolvedValueOnce({ rows: [{ value: 'false' }] })
            .mockResolvedValueOnce({ rows: [{ value: '10' }] });

        const res = mockRes();
        await createSale({
            body: {
                customer_id:    'c1',
                items:          [{ product_id: 'p1', qty: 2 }],
                payment_method: 'credit',
            },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('লিমিট') })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// verifyOTP
// ─────────────────────────────────────────────────────────────

describe('verifyOTP — OTP যাচাই', () => {

    test('sale না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await verifyOTP({ body: { sale_id: '999', otp: '123456' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('আগে verify হয়ে থাকলে 400', async () => {
        query.mockResolvedValueOnce({
            rows: [{ id: 1, otp_verified: true, otp_code: '123456', otp_expires_at: new Date(Date.now() + 60000) }],
        });
        const res = mockRes();
        await verifyOTP({ body: { sale_id: '1', otp: '123456' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আগে থেকেই') })
        );
    });

    test('মেয়াদ শেষ OTP — 400', async () => {
        query.mockResolvedValueOnce({
            rows: [{ id: 1, otp_verified: false, otp_code: '654321', otp_expires_at: new Date(Date.now() - 60000) }],
        });
        const res = mockRes();
        await verifyOTP({ body: { sale_id: '1', otp: '654321' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('মেয়াদ শেষ') })
        );
    });

    test('ভুল OTP — 400', async () => {
        query.mockResolvedValueOnce({
            rows: [{ id: 1, otp_verified: false, otp_code: '111111', otp_expires_at: new Date(Date.now() + 300000) }],
        });
        const res = mockRes();
        await verifyOTP({ body: { sale_id: '1', otp: '999999' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ভুল') })
        );
    });

    test('সঠিক OTP — 200', async () => {
        query
            .mockResolvedValueOnce({
                rows: [{ id: 1, otp_verified: false, otp_code: '777777', otp_expires_at: new Date(Date.now() + 300000) }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await verifyOTP({ body: { sale_id: '1', otp: '777777' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

// ─────────────────────────────────────────────────────────────
// Pure Business Logic
// ─────────────────────────────────────────────────────────────

describe('Sales Business Logic — Pure Calculations', () => {

    const calcCreditBalanceUsed = (balance, total) => {
        if (!balance || balance <= 0) return 0;
        return Math.min(balance, total);
    };

    test('credit balance ব্যবহার না করলে 0',      () => expect(calcCreditBalanceUsed(0, 1000)).toBe(0));
    test('balance < total — পুরো balance ব্যবহার', () => expect(calcCreditBalanceUsed(300, 1000)).toBe(300));
    test('balance > total — শুধু total ব্যবহার',  () => expect(calcCreditBalanceUsed(1500, 1000)).toBe(1000));
    test('balance = 0 — ব্যবহার 0',               () => expect(calcCreditBalanceUsed(0, 500)).toBe(0));

    const calcNetAmount  = (total, discount, replacement) => Math.max(0, total - discount - replacement);
    const calcCreditAdded = (total, discount, replacement) => {
        const net = total - discount - replacement;
        return net < 0 ? Math.abs(net) : 0;
    };

    test('discount ও replacement ছাড়া — net = total',  () => expect(calcNetAmount(1000, 0, 0)).toBe(1000));
    test('discount আছে — net কমে',                      () => expect(calcNetAmount(1000, 200, 0)).toBe(800));
    test('replacement বেশি হলে net = 0',               () => expect(calcNetAmount(1000, 0, 1500)).toBe(0));
    test('replacement বেশি হলে credit জমা হয়',         () => expect(calcCreditAdded(1000, 0, 1500)).toBe(500));
    test('discount + replacement > total — net = 0',    () => expect(calcNetAmount(1000, 300, 800)).toBe(0));
    test('net কখনো negative হবে না',                    () => expect(calcNetAmount(500, 1000, 0)).toBe(0));

    const canSaleOnCredit = (current, limit, amount) =>
        parseFloat(current) + amount <= parseFloat(limit);

    test('লিমিটের মধ্যে — সফল',          () => expect(canSaleOnCredit('3000', '10000', 5000)).toBe(true));
    test('ঠিক লিমিটে — সফল',             () => expect(canSaleOnCredit('5000', '10000', 5000)).toBe(true));
    test('লিমিট পার — ব্যর্থ',           () => expect(canSaleOnCredit('9000', '10000', 2000)).toBe(false));
    test('current_credit string হলেও সঠিক', () => expect(canSaleOnCredit('1000.50', '5000', 2000)).toBe(true));

    const calcSaleTotal = (items) => items.reduce((s, i) => s + i.subtotal, 0);
    const calcReplValue = (items) => (items || []).reduce((s, i) => s + (i.total || 0), 0);

    test('একটি item — total = subtotal',  () => expect(calcSaleTotal([{ subtotal: 1500 }])).toBe(1500));
    test('একাধিক item — সঠিক যোগ',       () => expect(calcSaleTotal([{ subtotal: 1000 }, { subtotal: 2000 }, { subtotal: 500 }])).toBe(3500));
    test('খালি list — 0',                 () => expect(calcSaleTotal([])).toBe(0));
    test('replacement item ছাড়া — 0',    () => expect(calcReplValue([])).toBe(0));
    test('replacement items আছে — সঠিক', () => expect(calcReplValue([{ total: 600 }, { total: 400 }])).toBe(1000));
});
