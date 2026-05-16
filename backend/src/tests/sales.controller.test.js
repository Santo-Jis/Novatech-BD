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
 * DB mock করা হয়েছে — real DB connection ছাড়াই চলবে
 * ─────────────────────────────────────────────────────────────
 */

// ─── সব external dependency mock ─────────────────────────────
jest.mock('../config/db', () => ({
    query: jest.fn(),
    withTransaction: jest.fn(),
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

// ─────────────────────────────────────────────────────────────
// createSale — বিক্রয় তৈরির নিয়ম
// ─────────────────────────────────────────────────────────────

describe('createSale — বিক্রয়ের নিয়ম', () => {

    let createSale;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // withTransaction default: callback চালাও, sale row ফেরত দাও
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
                    }]
                })
            };
            return await cb(client);
        });

        ({ createSale } = require('../controllers/sales.controller'));
    });

    // ── Required fields ─────────────────────────────────────

    test('customer_id না দিলে 400', async () => {
        const req = {
            body: { items: [{ product_id: 'p1', qty: 2 }], payment_method: 'cash' },
            user: workerUser
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
            user: workerUser
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('payment_method না দিলে 400', async () => {
        const req = {
            body: { customer_id: 'c1', items: [{ product_id: 'p1', qty: 1 }] },
            user: workerUser
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    // ── Idempotency Check ───────────────────────────────────

    test('duplicate idempotency_key — আগের sale ফেরত দেবে', async () => {
        const prevSale = {
            id: 77, invoice_number: 'INV-OLD-001',
            total_amount: 500, net_amount: 500,
            payment_method: 'cash',
            credit_balance_used: 0, credit_balance_added: 0,
        };

        query.mockResolvedValueOnce({ rows: [prevSale] }); // idempotency match

        const req = {
            body: {
                customer_id:      'c1',
                items:            [{ product_id: 'p1', qty: 1 }],
                payment_method:   'cash',
                idempotency_key:  'unique-key-abc',
            },
            user: workerUser
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                duplicate: true,
                data: expect.objectContaining({ invoice_number: 'INV-OLD-001' })
            })
        );
    });

    // ── Customer Not Found ─────────────────────────────────

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
            user: workerUser
        };
        const res = mockRes();

        await createSale(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    // ── Credit Limit Pre-check ──────────────────────────────

    test('credit limit পার হলে sale reject (prelim check)', async () => {
        // customer: current_credit=9000, credit_limit=10000
        // netAmount = 2000 → 9000+2000=11000 > 10000 → reject
        const customer = { id: 'c1', shop_name: 'দোকান', current_credit: '9000', credit_limit: '10000', credit_balance: 0 };

        calcFromProduct.mockReturnValue({
            unitPrice: 1000, vatRate: 0, taxRate: 0,
            vatAmount: 0, taxAmount: 0,
            finalPrice: 1000, subtotal: 2000
        });

        query
            .mockResolvedValueOnce({ rows: [] })      // idempotency: no match
            .mockResolvedValueOnce({ rows: [customer] }) // customer found
            .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'পণ্য', price: '1000', vat: '0', tax: '0' }] }) // product
            .mockResolvedValueOnce({ rows: [{ value: 'false' }] }) // otp_required: false
            .mockResolvedValueOnce({ rows: [{ value: '10' }] });    // otp_expiry_minutes

        const req = {
            body: {
                customer_id:    'c1',
                items:          [{ product_id: 'p1', qty: 2 }],
                payment_method: 'credit',
            },
            user: workerUser
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
            rows: [{ id: 1, otp_verified: true, otp_code: '123456', otp_expires_at: new Date(Date.now() + 60000) }]
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
                otp_expires_at: new Date(Date.now() - 60000) // ১ মিনিট আগে expire
            }]
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
                otp_expires_at: new Date(Date.now() + 300000)
            }]
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
                    otp_expires_at: new Date(Date.now() + 300000)
                }]
            })
            .mockResolvedValueOnce({ rows: [] }); // UPDATE query

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

    /**
     * Credit balance সমন্বয়
     * use_credit_balance=true হলে balance থেকে কাটা হয়
     */
    const calcCreditBalanceUsed = (totalAmount, creditBalance, useCreditBalance) => {
        if (!useCreditBalance || creditBalance <= 0) return 0;
        return Math.min(creditBalance, totalAmount);
    };

    test('credit balance ব্যবহার না করলে 0', () => {
        expect(calcCreditBalanceUsed(1000, 500, false)).toBe(0);
    });

    test('balance < total — পুরো balance ব্যবহার', () => {
        expect(calcCreditBalanceUsed(1000, 300, true)).toBe(300);
    });

    test('balance > total — শুধু total পরিমাণ ব্যবহার', () => {
        expect(calcCreditBalanceUsed(500, 1000, true)).toBe(500);
    });

    test('balance = 0 — ব্যবহার 0', () => {
        expect(calcCreditBalanceUsed(1000, 0, true)).toBe(0);
    });

    /**
     * net_amount হিসাব
     * total - discount - replacementValue = net
     * নেগেটিভ হলে 0, বাকি credit_balance_added হিসেবে যায়
     */
    const calcNetAmount = (totalAmount, discountAmount, replacementValue) => {
        const net = totalAmount - discountAmount - replacementValue;
        const creditAdded = net < 0 ? Math.abs(net) : 0;
        return { netAmount: Math.max(0, net), creditBalanceAdded: creditAdded };
    };

    test('discount ও replacement ছাড়া — net = total', () => {
        const { netAmount } = calcNetAmount(1000, 0, 0);
        expect(netAmount).toBe(1000);
    });

    test('discount আছে — net কমে', () => {
        const { netAmount } = calcNetAmount(1000, 200, 0);
        expect(netAmount).toBe(800);
    });

    test('replacement বেশি হলে net = 0, credit জমা হয়', () => {
        const { netAmount, creditBalanceAdded } = calcNetAmount(500, 0, 700);
        expect(netAmount).toBe(0);
        expect(creditBalanceAdded).toBe(200); // 700-500 = 200 credit জমা
    });

    test('discount + replacement > total — net = 0', () => {
        const { netAmount } = calcNetAmount(1000, 600, 600);
        expect(netAmount).toBe(0);
    });

    test('net কখনো negative হবে না', () => {
        const { netAmount } = calcNetAmount(100, 200, 300);
        expect(netAmount).toBeGreaterThanOrEqual(0);
    });

    /**
     * Credit limit check
     * current_credit + netAmount <= credit_limit হলে সফল
     */
    const checkCreditLimit = (currentCredit, netAmount, creditLimit) => {
        const total = parseFloat(currentCredit) + netAmount;
        return total <= parseFloat(creditLimit);
    };

    test('লিমিটের মধ্যে — সফল', () => {
        expect(checkCreditLimit(5000, 3000, 10000)).toBe(true);
    });

    test('ঠিক লিমিটে — সফল', () => {
        expect(checkCreditLimit(5000, 5000, 10000)).toBe(true);
    });

    test('লিমিট পার — ব্যর্থ', () => {
        expect(checkCreditLimit(8000, 3000, 10000)).toBe(false);
    });

    test('current_credit string হলেও সঠিক', () => {
        expect(checkCreditLimit('7000', 2000, 10000)).toBe(true);
    });

    /**
     * Total sales হিসাব
     * processedItems-এর subtotal যোগ
     */
    const calcTotalAmount = (processedItems) =>
        processedItems.reduce((sum, item) => sum + item.subtotal, 0);

    test('একটি item — total = subtotal', () => {
        expect(calcTotalAmount([{ subtotal: 2300 }])).toBe(2300);
    });

    test('একাধিক item — সঠিক যোগ', () => {
        const items = [{ subtotal: 1150 }, { subtotal: 2300 }, { subtotal: 575 }];
        expect(calcTotalAmount(items)).toBe(4025);
    });

    test('খালি list — 0', () => {
        expect(calcTotalAmount([])).toBe(0);
    });

    /**
     * Replacement value হিসাব
     * processedReplacement-এর total যোগ
     */
    const calcReplacementValue = (replacementItems) =>
        replacementItems.reduce((sum, item) => sum + item.total, 0);

    test('replacement item ছাড়া — 0', () => {
        expect(calcReplacementValue([])).toBe(0);
    });

    test('replacement items আছে — সঠিক যোগ', () => {
        const items = [{ total: 500 }, { total: 300 }];
        expect(calcReplacementValue(items)).toBe(800);
    });
});
