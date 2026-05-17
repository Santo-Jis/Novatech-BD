/**
 * order.controller.test.js
 *
 * FIX: jest.resetModules() বাদ দেওয়া হয়েছে।
 * কারণ: resetModules() mock registry clear করে দেয়,
 * ফলে পরের require()-এ real firebase/db load হয় → crash → 500।
 * jest.clearAllMocks() যথেষ্ট — শুধু call history reset করে।
 */

// ─── Mocks — file top-level এ, কোনো beforeEach-এর বাইরে ─────
jest.mock('../config/db', () => ({
    query:           jest.fn(),
    withTransaction: jest.fn(),
}));
jest.mock('../config/firebase', () => ({
    initializeFirebase: jest.fn(),
    getDB:              jest.fn().mockReturnValue({
        ref: jest.fn().mockReturnValue({
            set:    jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
        }),
    }),
}));
jest.mock('../services/email.service',        () => ({ sendOrderNotificationEmail: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/fcm.service',          () => ({ sendPushNotification:        jest.fn().mockResolvedValue({}) }));
jest.mock('../services/firebase.notify',      () => ({ firebaseNotify:              jest.fn().mockResolvedValue({}) }));
jest.mock('../controllers/ledger.controller', () => ({ addLedgerEntry:              jest.fn().mockResolvedValue({}) }));

// ─── Imports — mock এর পরে ────────────────────────────────────
const { query, withTransaction } = require('../config/db');
const { createOrder, approveOrder, rejectOrder, cancelOrder } =
    require('../controllers/order.controller');

// ─── Helpers ──────────────────────────────────────────────────
const makeFakeClient = () => ({
    query: jest.fn().mockResolvedValue({ rows: [{ id: 99 }] }),
});

const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const workerUser = {
    id:            'worker-uuid-1',
    role:          'worker',
    name_bn:       'আলী',
    manager_id:    'manager-uuid-1',
    employee_code: 'EMP001',
    phone:         '01700000000',
};

const makeProduct = (overrides = {}) => ({
    id:             'product-uuid-1',
    name:           'পণ্য ১',
    price:          '1000',
    stock:          50,
    reserved_stock: 5,
    vat:            '15',
    tax:            '0',
    ...overrides,
});

// প্রতিটি test এর আগে শুধু call history reset
beforeEach(() => {
    jest.clearAllMocks();

    withTransaction.mockImplementation(async (cb) => {
        const client = makeFakeClient();
        client.query.mockResolvedValue({ rows: [{ id: 99 }] });
        await cb(client);
    });
});

// ─────────────────────────────────────────────────────────────
// createOrder
// query sequence:
//   1. COUNT today orders
//   2. SELECT products WHERE id = ANY($1)
//   3. SELECT admin emails
//   4. SELECT manager email
// ─────────────────────────────────────────────────────────────

describe('createOrder — অর্ডার তৈরির নিয়ম', () => {

    test('items না দিলে 400', async () => {
        const res = mockRes();
        await createOrder({ body: { items: [] }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('আজকে ৩টি অর্ডার থাকলে আর দেওয়া যাবে না', async () => {
        query.mockResolvedValueOnce({ rows: [{ count: '3' }] });

        const res = mockRes();
        await createOrder({
            body: { items: [{ product_id: 'p1', qty: 2 }] },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('৩টি অর্ডার') })
        );
    });

    test('অজানা product_id দিলে 400', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await createOrder({
            body: { items: [{ product_id: 'unknown-id', qty: 2 }] },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('পাওয়া যায়নি') })
        );
    });

    test('stock-এর বেশি qty চাইলে 400', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [makeProduct({ id: 'p1', stock: 10, reserved_stock: 5 })] });

        const res = mockRes();
        await createOrder({
            body: { items: [{ product_id: 'p1', qty: 10 }] },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('স্টক নেই') })
        );
    });

    test('পর্যাপ্ত stock থাকলে 201', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [makeProduct({ id: 'product-uuid-1', stock: 50, reserved_stock: 5 })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockResolvedValue({ rows: [{ id: 42 }] });
            await cb(client);
        });

        const res = mockRes();
        await createOrder({
            body: { items: [{ product_id: 'product-uuid-1', qty: 10 }] },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('VAT 15% সহ total_amount সঠিক', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [makeProduct({ id: 'product-uuid-1', price: '1000', vat: '15', tax: '0' })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        let capturedTotal;
        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockImplementation(async (sql, params) => {
                if (sql.includes('INSERT INTO orders')) {
                    capturedTotal = params[2];
                    return { rows: [{ id: 55 }] };
                }
                return { rows: [] };
            });
            await cb(client);
        });

        await createOrder({
            body: { items: [{ product_id: 'product-uuid-1', qty: 2 }] },
            user: workerUser,
        }, mockRes());

        expect(capturedTotal).toBeCloseTo(2300, 1);
    });

    test('VAT এবং Tax উভয় থাকলে সঠিক total', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [makeProduct({ id: 'product-uuid-1', price: '1000', vat: '10', tax: '5' })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        let capturedTotal;
        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockImplementation(async (sql, params) => {
                if (sql.includes('INSERT INTO orders')) {
                    capturedTotal = params[2];
                    return { rows: [{ id: 56 }] };
                }
                return { rows: [] };
            });
            await cb(client);
        });

        await createOrder({
            body: { items: [{ product_id: 'product-uuid-1', qty: 3 }] },
            user: workerUser,
        }, mockRes());

        expect(capturedTotal).toBeCloseTo(3450, 1);
    });

    test('VAT/Tax ছাড়া product — base price-ই final', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [makeProduct({ id: 'product-uuid-1', price: '500', vat: '0', tax: '0' })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        let capturedTotal;
        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockImplementation(async (sql, params) => {
                if (sql.includes('INSERT INTO orders')) {
                    capturedTotal = params[2];
                    return { rows: [{ id: 57 }] };
                }
                return { rows: [] };
            });
            await cb(client);
        });

        await createOrder({
            body: { items: [{ product_id: 'product-uuid-1', qty: 4 }] },
            user: workerUser,
        }, mockRes());

        expect(capturedTotal).toBeCloseTo(2000, 1);
    });

    test('ঠিক ২টি অর্ডার থাকলে ৩য়টি দেওয়া যাবে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '2' }] })
            .mockResolvedValueOnce({ rows: [makeProduct({ id: 'product-uuid-1' })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockResolvedValue({ rows: [{ id: 58 }] });
            await cb(client);
        });

        const res = mockRes();
        await createOrder({
            body: { items: [{ product_id: 'product-uuid-1', qty: 1 }] },
            user: workerUser,
        }, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });
});

// ─────────────────────────────────────────────────────────────
// approveOrder
// ─────────────────────────────────────────────────────────────

describe('approveOrder — অনুমোদনের নিয়ম', () => {

    const managerUser = { id: 'manager-uuid-1', role: 'manager', name_bn: 'ম্যানেজার' };

    test('pending অর্ডার না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await approveOrder({ params: { id: '99' }, body: {}, user: managerUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('অন্য টিমের order approve করতে পারবে না (403)', async () => {
        const items = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 5, approved_qty: 5, price: 500 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '10', worker_id: 'worker-2', items: JSON.stringify(items), total_amount: 0 }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'other-manager' }] });

        const res = mockRes();
        await approveOrder({ params: { id: '10' }, body: {}, user: managerUser }, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আপনার টিমের নয়') })
        );
    });

    test('নিজের টিমের order — approve সফল', async () => {
        const items = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 5, approved_qty: 5, price: 500 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '10', worker_id: 'worker-1', items: JSON.stringify(items), total_amount: 2500 }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'manager-uuid-1' }] });

        const res = mockRes();
        await approveOrder({ params: { id: '10' }, body: {}, user: managerUser }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('Manager approved_qty কমালে total_amount সঠিক', async () => {
        const origItems = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 10, approved_qty: 10, price: 500 }];
        const newItems  = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 10, approved_qty: 6,  price: 500 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '11', worker_id: 'worker-1', items: JSON.stringify(origItems) }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'manager-uuid-1' }] });

        let capturedTotal;
        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockImplementation(async (sql, params) => {
                if (sql.includes('UPDATE orders')) capturedTotal = params[2];
                return { rows: [] };
            });
            await cb(client);
        });

        await approveOrder(
            { params: { id: '11' }, body: { items: newItems }, user: managerUser },
            mockRes()
        );

        expect(capturedTotal).toBeCloseTo(3000, 1);
    });

    test('admin যেকোনো order approve করতে পারবে', async () => {
        const items = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 3, approved_qty: 3, price: 200 }];
        query.mockResolvedValueOnce({
            rows: [{ id: '15', worker_id: 'any-worker', items: JSON.stringify(items), total_amount: 600 }],
        });

        const res = mockRes();
        await approveOrder(
            { params: { id: '15' }, body: {}, user: { id: 'admin-1', role: 'admin', name_bn: 'অ্যাডমিন' } },
            res
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ─────────────────────────────────────────────────────────────
// rejectOrder
// ─────────────────────────────────────────────────────────────

describe('rejectOrder — বাতিলের নিয়ম', () => {

    const managerUser = { id: 'manager-uuid-1', role: 'manager', name_bn: 'ম্যানেজার' };

    test('pending অর্ডার না থাকলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await rejectOrder({ params: { id: '999' }, body: { reason: 'কারণ' }, user: managerUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('অন্য টিমের order reject করতে পারবে না (403)', async () => {
        const items = [{ product_id: 'p1', requested_qty: 3 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '20', worker_id: 'w1', items }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'other-manager' }] });

        const res = mockRes();
        await rejectOrder({ params: { id: '20' }, body: { reason: 'কারণ' }, user: managerUser }, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('নিজের টিমের order — reject সফল', async () => {
        const items = [{ product_id: 'p1', requested_qty: 4 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '21', worker_id: 'w1', items }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'manager-uuid-1' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await rejectOrder({ params: { id: '21' }, body: { reason: 'স্টক নেই' }, user: managerUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

// ─────────────────────────────────────────────────────────────
// cancelOrder
// ─────────────────────────────────────────────────────────────

describe('cancelOrder — SR নিজের order বাতিল', () => {

    test('নিজের pending order না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await cancelOrder({ params: { id: '50' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('নিজের pending order cancel — সফল', async () => {
        const items = [{ product_id: 'p1', requested_qty: 3, approved_qty: 3 }];
        query.mockResolvedValueOnce({ rows: [{ id: '51', worker_id: workerUser.id, items }] });

        const res = mockRes();
        await cancelOrder({ params: { id: '51' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, message: expect.stringContaining('slot') })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// Pure Business Logic
// ─────────────────────────────────────────────────────────────

describe('Order Business Logic — Pure Calculations', () => {

    const calcOrderItemPrice = (basePrice, vatRate, taxRate) => {
        const price  = Number(basePrice)   || 0;
        const vat    = parseFloat(vatRate) || 0;
        const tax    = parseFloat(taxRate) || 0;
        const vatAmt = parseFloat((price * vat / 100).toFixed(2));
        const taxAmt = parseFloat((price * tax / 100).toFixed(2));
        return parseFloat((price + vatAmt + taxAmt).toFixed(2));
    };

    test('১০০০ টাকায় ১৫% VAT — final price = ১১৫০', () => expect(calcOrderItemPrice(1000, 15, 0)).toBe(1150));
    test('১০০০ টাকায় ১০% VAT + ৫% Tax — final = ১১৫০', () => expect(calcOrderItemPrice(1000, 10, 5)).toBe(1150));
    test('VAT/Tax = 0 — base price-ই final', () => expect(calcOrderItemPrice(500, 0, 0)).toBe(500));
    test('string price — সঠিক হিসাব', () => expect(calcOrderItemPrice('800', '10', '0')).toBe(880));

    const calcAvailableStock = (stock, reserved) => (stock || 0) - (reserved || 0);
    test('stock=50, reserved=10 → available=40', () => expect(calcAvailableStock(50, 10)).toBe(40));
    test('reserved=null → available=stock',       () => expect(calcAvailableStock(30, null)).toBe(30));
    test('reserved=0 → available=stock',           () => expect(calcAvailableStock(20, 0)).toBe(20));

    const canPlaceOrder = (count) => count < 3;
    test('count=0 — order দেওয়া যাবে',     () => expect(canPlaceOrder(0)).toBe(true));
    test('count=2 — order দেওয়া যাবে',     () => expect(canPlaceOrder(2)).toBe(true));
    test('count=3 — আর order দেওয়া যাবে না', () => expect(canPlaceOrder(3)).toBe(false));
    test('count=4 — অবশ্যই block',          () => expect(canPlaceOrder(4)).toBe(false));

    const calcOrderTotal = (items) =>
        items.reduce((sum, item) => sum + calcOrderItemPrice(item.price, item.vatRate, item.taxRate) * item.qty, 0);

    test('একাধিক item — total সঠিক', () => {
        expect(calcOrderTotal([
            { price: 1000, vatRate: 15, taxRate: 0, qty: 2 },
            { price: 500,  vatRate: 0,  taxRate: 0, qty: 3 },
        ])).toBe(3800);
    });
    test('qty=0 হলে total = 0', () => {
        expect(calcOrderTotal([{ price: 1000, vatRate: 0, taxRate: 0, qty: 0 }])).toBe(0);
    });
});
