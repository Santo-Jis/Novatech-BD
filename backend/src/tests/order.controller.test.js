/**
 * order.controller.test.js
 * ─────────────────────────────────────────────────────────────
 * Order Controller-এর Business Logic টেস্ট
 *
 * কভার করা হচ্ছে:
 * ✅ createOrder  — item validation, stock check, daily limit, VAT/Tax হিসাব
 * ✅ approveOrder — team check, stock deduction, total amount হিসাব
 * ✅ rejectOrder  — team check, reserved stock মুক্ত করা
 * ✅ cancelOrder  — শুধু নিজের pending order cancel
 *
 * DB mock করা হয়েছে — real DB connection ছাড়াই চলবে
 *
 * FIX LOG:
 * - firebase.js mock যোগ করা হয়েছে (getDB import fail ঠেকাতে)
 * - createOrder: controller এখন একটাই query-তে ALL products আনে
 *   (WHERE id = ANY($1)) — mock sequence ঠিক করা হয়েছে
 * - rejectOrder: items array-এ object থাকে, string নয়
 * - cancelOrder: response message-এ 'slot' আছে কিনা যাচাই ঠিক করা হয়েছে
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
jest.mock('../services/email.service',        () => ({ sendOrderNotificationEmail: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/fcm.service',          () => ({ sendPushNotification:        jest.fn().mockResolvedValue({}) }));
jest.mock('../services/firebase.notify',      () => ({ firebaseNotify:              jest.fn().mockResolvedValue({}) }));
jest.mock('../controllers/ledger.controller', () => ({ addLedgerEntry:              jest.fn().mockResolvedValue({}) }));

const { query, withTransaction } = require('../config/db');

// ─── Helpers ──────────────────────────────────────────────────

// withTransaction: callback কে fake client দিয়ে চালাও
const makeFakeClient = () => ({
    query: jest.fn().mockResolvedValue({ rows: [{ id: 99 }] }),
});

const mockRes = () => {
    const res   = {};
    res.status  = jest.fn().mockReturnValue(res);
    res.json    = jest.fn().mockReturnValue(res);
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

// ─────────────────────────────────────────────────────────────
// createOrder
// query sequence (controller অনুযায়ী):
//   1. COUNT — আজকের order কতটি
//   2. SELECT products WHERE id = ANY($1) — সব product একসাথে
//   3. SELECT admin emails (transaction এর বাইরে)
//   4. SELECT manager email (transaction এর বাইরে)
// withTransaction এর ভেতরে client.query:
//   - INSERT INTO orders → RETURNING id
//   - UPDATE products (reserved_stock) × item count
// ─────────────────────────────────────────────────────────────

describe('createOrder — অর্ডার তৈরির নিয়ম', () => {

    let createOrder;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockResolvedValue({ rows: [{ id: 99 }] });
            await cb(client);
        });

        ({ createOrder } = require('../controllers/order.controller'));
    });

    // ── ইনপুট যাচাই ──────────────────────────────────────────

    test('items না দিলে 400', async () => {
        const req = { body: { items: [] }, user: workerUser };
        const res = mockRes();

        await createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false })
        );
    });

    // ── Daily Limit ───────────────────────────────────────────

    test('আজকে ৩টি অর্ডার থাকলে আর দেওয়া যাবে না', async () => {
        // query 1: COUNT → 3
        query.mockResolvedValueOnce({ rows: [{ count: '3' }] });

        const req = {
            body: { items: [{ product_id: 'p1', qty: 2 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('৩টি অর্ডার'),
            })
        );
    });

    // ── Stock Validation ──────────────────────────────────────

    test('অজানা product_id দিলে 400', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })  // COUNT
            .mockResolvedValueOnce({ rows: [] });                 // products — empty (not found)

        const req = {
            body: { items: [{ product_id: 'unknown-id', qty: 2 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('পাওয়া যায়নি') })
        );
    });

    test('stock-এর বেশি qty চাইলে 400', async () => {
        // stock=10, reserved=5 → available=5, কিন্তু qty=10 চাচ্ছে
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({
                rows: [makeProduct({ id: 'p1', stock: 10, reserved_stock: 5 })],
            });

        const req = {
            body: { items: [{ product_id: 'p1', qty: 10 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('স্টক নেই') })
        );
    });

    test('পর্যাপ্ত stock থাকলে available = stock - reserved', async () => {
        // stock=50, reserved=5 → available=45, qty=10 → সফল
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [makeProduct({ id: 'product-uuid-1', stock: 50, reserved_stock: 5 })] })
            .mockResolvedValueOnce({ rows: [] })  // admin emails
            .mockResolvedValueOnce({ rows: [] }); // manager email

        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockResolvedValue({ rows: [{ id: 42 }] });
            await cb(client);
        });

        const req = {
            body: { items: [{ product_id: 'product-uuid-1', qty: 10 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
    });

    // ── VAT/Tax হিসাব ─────────────────────────────────────────

    test('VAT 15% সহ total_amount সঠিক', async () => {
        // price=1000, vat=15% → finalPrice=1150, qty=2 → total=2300
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
                    capturedTotal = params[2]; // total_amount is 3rd param
                    return { rows: [{ id: 55 }] };
                }
                return { rows: [] };
            });
            await cb(client);
        });

        const req = {
            body: { items: [{ product_id: 'product-uuid-1', qty: 2 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createOrder(req, res);

        // 1000 + (1000×15%) = 1150; 1150×2 = 2300
        expect(capturedTotal).toBeCloseTo(2300, 1);
    });

    test('VAT এবং Tax উভয় থাকলে সঠিক total', async () => {
        // price=1000, vat=10%, tax=5% → 1150; qty=3 → 3450
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

        const req = {
            body: { items: [{ product_id: 'product-uuid-1', qty: 3 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createOrder(req, res);

        // 1000 + 100(vat) + 50(tax) = 1150; ×3 = 3450
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

        const req = {
            body: { items: [{ product_id: 'product-uuid-1', qty: 4 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createOrder(req, res);

        expect(capturedTotal).toBeCloseTo(2000, 1); // 500×4
    });

    // ── Daily Limit Boundary ──────────────────────────────────

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

        const req = {
            body: { items: [{ product_id: 'product-uuid-1', qty: 1 }] },
            user: workerUser,
        };
        const res = mockRes();

        await createOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
    });
});

// ─────────────────────────────────────────────────────────────
// approveOrder
// query sequence:
//   1. SELECT order WHERE id AND status='pending'
//   2. (manager only) SELECT manager_id FROM users WHERE id = worker_id
// withTransaction client.query:
//   - UPDATE products (stock/reserved) × item count
//   - UPDATE orders SET status='approved'
//   - addLedgerEntry (mocked)
// ─────────────────────────────────────────────────────────────

describe('approveOrder — অনুমোদনের নিয়ম', () => {

    let approveOrder;

    const managerUser = {
        id:      'manager-uuid-1',
        role:    'manager',
        name_bn: 'ম্যানেজার',
    };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockResolvedValue({ rows: [] });
            await cb(client);
        });
        ({ approveOrder } = require('../controllers/order.controller'));
    });

    test('pending অর্ডার না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] }); // order not found

        const req = { params: { id: '99' }, body: {}, user: managerUser };
        const res = mockRes();

        await approveOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('অন্য টিমের order approve করতে পারবে না (403)', async () => {
        const orderItems = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 5, approved_qty: 5, price: 500 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '10', worker_id: 'worker-2', items: JSON.stringify(orderItems), total_amount: 0 }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'other-manager-id' }] }); // team check fail

        const req = { params: { id: '10' }, body: {}, user: managerUser };
        const res = mockRes();

        await approveOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আপনার টিমের নয়') })
        );
    });

    test('নিজের টিমের order — approve সফল', async () => {
        const orderItems = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 5, approved_qty: 5, price: 500 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '10', worker_id: 'worker-1', items: JSON.stringify(orderItems), total_amount: 2500 }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'manager-uuid-1' }] }); // team check ✅

        const req = { params: { id: '10' }, body: {}, user: managerUser };
        const res = mockRes();

        await approveOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
    });

    test('Manager approved_qty কমালে total_amount সঠিক হিসাব হবে', async () => {
        // Original: 10 pcs × 500 = 5000
        // Manager approved: 6 pcs × 500 = 3000
        const origItems = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 10, approved_qty: 10, price: 500 }];
        const newItems  = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 10, approved_qty: 6,  price: 500 }];

        query
            .mockResolvedValueOnce({ rows: [{ id: '11', worker_id: 'worker-1', items: JSON.stringify(origItems) }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'manager-uuid-1' }] });

        let capturedTotal;
        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockImplementation(async (sql, params) => {
                if (sql.includes('UPDATE orders')) {
                    capturedTotal = params[2]; // total_amount is 3rd param
                }
                return { rows: [] };
            });
            await cb(client);
        });

        const req = { params: { id: '11' }, body: { items: newItems }, user: managerUser };
        const res = mockRes();

        await approveOrder(req, res);

        expect(capturedTotal).toBeCloseTo(3000, 1); // 6 × 500
    });

    test('admin যেকোনো order approve করতে পারবে (team check নেই)', async () => {
        const orderItems = [{ product_id: 'p1', product_name: 'পণ্য', requested_qty: 3, approved_qty: 3, price: 200 }];
        // admin-এর জন্য শুধু ১টি query (order fetch) — manager team check query নেই
        query.mockResolvedValueOnce({
            rows: [{ id: '15', worker_id: 'any-worker', items: JSON.stringify(orderItems), total_amount: 600 }],
        });

        const adminUser = { id: 'admin-1', role: 'admin', name_bn: 'অ্যাডমিন' };
        const req = { params: { id: '15' }, body: {}, user: adminUser };
        const res = mockRes();

        await approveOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ─────────────────────────────────────────────────────────────
// rejectOrder
// query sequence:
//   1. SELECT order WHERE id AND status='pending'
//   2. (manager only) SELECT manager_id — team check
//   3. UPDATE products (reserved_stock) × items length
//   4. UPDATE orders SET status='rejected'
//
// ⚠️ items loop: controller iterates order.rows[0].items directly
//    তাই items must be an array of objects, NOT a JSON string
// ─────────────────────────────────────────────────────────────

describe('rejectOrder — বাতিলের নিয়ম', () => {

    let rejectOrder;

    const managerUser = { id: 'manager-uuid-1', role: 'manager', name_bn: 'ম্যানেজার' };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        ({ rejectOrder } = require('../controllers/order.controller'));
    });

    test('pending অর্ডার না থাকলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: '999' }, body: { reason: 'কারণ' }, user: managerUser };
        const res = mockRes();

        await rejectOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('অন্য টিমের order reject করতে পারবে না (403)', async () => {
        // items must be array (controller iterates it directly)
        const items = [{ product_id: 'p1', requested_qty: 3 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '20', worker_id: 'w1', items }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'other-manager' }] }); // team check fail

        const req = { params: { id: '20' }, body: { reason: 'কারণ' }, user: managerUser };
        const res = mockRes();

        await rejectOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('নিজের টিমের order — reject সফল, reserved stock মুক্ত', async () => {
        const items = [{ product_id: 'p1', requested_qty: 4 }];
        query
            .mockResolvedValueOnce({ rows: [{ id: '21', worker_id: 'w1', items }] })
            .mockResolvedValueOnce({ rows: [{ manager_id: 'manager-uuid-1' }] }) // team ✅
            .mockResolvedValueOnce({ rows: [] })  // UPDATE products (reserved_stock)
            .mockResolvedValueOnce({ rows: [] }); // UPDATE orders

        const req = { params: { id: '21' }, body: { reason: 'স্টক নেই' }, user: managerUser };
        const res = mockRes();

        await rejectOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// cancelOrder
// query sequence:
//   1. SELECT order WHERE id AND worker_id AND status='pending'
// withTransaction client.query:
//   - UPDATE products (reserved_stock) × item count
//   - UPDATE orders SET status='cancelled'
// ─────────────────────────────────────────────────────────────

describe('cancelOrder — SR নিজের order বাতিল', () => {

    let cancelOrder;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        withTransaction.mockImplementation(async (cb) => {
            const client = makeFakeClient();
            client.query.mockResolvedValue({ rows: [] });
            await cb(client);
        });
        ({ cancelOrder } = require('../controllers/order.controller'));
    });

    test('নিজের pending order না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: '50' }, user: workerUser };
        const res = mockRes();

        await cancelOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('নিজের pending order cancel — সফল, reserved মুক্ত', async () => {
        // items as array (parsedItems loop চলবে)
        const items = [{ product_id: 'p1', requested_qty: 3, approved_qty: 3 }];
        query.mockResolvedValueOnce({ rows: [{ id: '51', worker_id: workerUser.id, items }] });

        const req = { params: { id: '51' }, user: workerUser };
        const res = mockRes();

        await cancelOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, message: expect.stringContaining('slot') })
        );
    });
});

// ─────────────────────────────────────────────────────────────
// Order Business Logic — Pure functions
// ─────────────────────────────────────────────────────────────

describe('Order Business Logic — Pure Calculations', () => {

    const calcOrderItemPrice = (basePrice, vatRate, taxRate) => {
        const price  = Number(basePrice)    || 0;
        const vat    = parseFloat(vatRate)  || 0;
        const tax    = parseFloat(taxRate)  || 0;
        const vatAmt = parseFloat((price * vat  / 100).toFixed(2));
        const taxAmt = parseFloat((price * tax  / 100).toFixed(2));
        return parseFloat((price + vatAmt + taxAmt).toFixed(2));
    };

    test('১০০০ টাকায় ১৫% VAT — final price = ১১৫০', () => {
        expect(calcOrderItemPrice(1000, 15, 0)).toBe(1150);
    });

    test('১০০০ টাকায় ১০% VAT + ৫% Tax — final = ১১৫০', () => {
        expect(calcOrderItemPrice(1000, 10, 5)).toBe(1150);
    });

    test('VAT/Tax = 0 — base price-ই final', () => {
        expect(calcOrderItemPrice(500, 0, 0)).toBe(500);
    });

    test('string price — সঠিক হিসাব', () => {
        expect(calcOrderItemPrice('800', '10', '0')).toBe(880);
    });

    const calcAvailableStock = (stock, reservedStock) =>
        (stock || 0) - (reservedStock || 0);

    test('stock=50, reserved=10 → available=40', () => {
        expect(calcAvailableStock(50, 10)).toBe(40);
    });

    test('reserved=null → available=stock', () => {
        expect(calcAvailableStock(30, null)).toBe(30);
    });

    test('reserved=0 → available=stock', () => {
        expect(calcAvailableStock(20, 0)).toBe(20);
    });

    const canPlaceOrder = (todayCount) => todayCount < 3;

    test('count=0 — order দেওয়া যাবে', () => {
        expect(canPlaceOrder(0)).toBe(true);
    });

    test('count=2 — order দেওয়া যাবে', () => {
        expect(canPlaceOrder(2)).toBe(true);
    });

    test('count=3 — আর order দেওয়া যাবে না', () => {
        expect(canPlaceOrder(3)).toBe(false);
    });

    test('count=4 — অবশ্যই block', () => {
        expect(canPlaceOrder(4)).toBe(false);
    });

    const calcOrderTotal = (items) =>
        items.reduce((sum, item) => {
            const finalPrice = calcOrderItemPrice(item.price, item.vatRate, item.taxRate);
            return sum + (finalPrice * item.qty);
        }, 0);

    test('একাধিক item — total সঠিক', () => {
        const items = [
            { price: 1000, vatRate: 15, taxRate: 0, qty: 2 }, // 1150×2 = 2300
            { price: 500,  vatRate: 0,  taxRate: 0, qty: 3 }, // 500×3  = 1500
        ];
        expect(calcOrderTotal(items)).toBe(3800);
    });

    test('qty=0 হলে total কমে', () => {
        const items = [{ price: 1000, vatRate: 0, taxRate: 0, qty: 0 }];
        expect(calcOrderTotal(items)).toBe(0);
    });
});
