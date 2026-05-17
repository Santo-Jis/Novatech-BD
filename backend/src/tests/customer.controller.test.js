/**
 * customer.controller.test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 1 — Unit Test  (DB ছাড়া, সব mock)
 *
 * কভার করা হচ্ছে (১৫টি function):
 *   getCustomers          — role-based filter, GPS distance, pagination
 *   getCustomer           — single fetch, manager route-check, 404
 *   createCustomer        — validation, GPS, customer-code, auto-assign
 *   updateCustomer        — GPS branch, partial update, 404
 *   getCustomerHistory    — manager route-check, history assembly
 *   setCreditLimit        — validation, audit log, 404
 *   collectCredit         — overpayment guard, DB insert
 *   getMyCustomerCount    — worker count
 *   requestCustomerEdit   — worker vs admin branch, pending-check, rollback
 *   getPendingCustomerEdits — manager filter
 *   approveCustomerEdit   — approve flow, audit log
 *   rejectCustomerEdit    — rollback fields, status update
 *   sendEmailVerifyOTP    — format validation, DB upsert
 *   confirmEmailVerifyOTP — expiry check, OTP match, delete
 *   updateVisitOrder      — bulk update query, input validation
 *
 * চালানোর কমান্ড:
 *   npm run test:unit -- --testPathPattern=customer.controller
 * ════════════════════════════════════════════════════════════════
 */

// ─── TOP-LEVEL MOCKS (file-এর একদম শুরুতে) ──────────────────────
jest.mock('../config/db', () => ({
    query:           jest.fn(),
    withTransaction: jest.fn(),
}));

jest.mock('../config/firebase', () => ({
    initializeFirebase: jest.fn(),
    getDB: jest.fn().mockReturnValue({
        ref: jest.fn().mockReturnValue({
            set:    jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
        }),
    }),
}));

jest.mock('../services/employee.service', () => ({
    uploadToCloudinary:   jest.fn().mockResolvedValue('https://cloudinary.test/shop.jpg'),
    generateCustomerCode: jest.fn().mockResolvedValue('C-2024-001'),
}));

jest.mock('../services/email.service', () => ({
    sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
    sendOTPEmail:     jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../config/encryption', () => ({
    generateOTP: jest.fn().mockReturnValue('123456'),
}));

// ─── IMPORTS (mock এর পরে) ────────────────────────────────────────
const { query } = require('../config/db');

const {
    getCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    getCustomerHistory,
    setCreditLimit,
    collectCredit,
    getMyCustomerCount,
    requestCustomerEdit,
    getPendingCustomerEdits,
    approveCustomerEdit,
    rejectCustomerEdit,
    sendEmailVerifyOTP,
    confirmEmailVerifyOTP,
    updateVisitOrder,
} = require('../controllers/customer.controller');

// ════════════════════════════════════════════════════════════════
// ─── SHARED HELPERS ──────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

/** mockRes() → Express res object (chainable) */
const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

// Sample users
const adminUser   = { id: 'admin-uuid-1',   role: 'admin',   name_bn: 'অ্যাডমিন' };
const managerUser = { id: 'manager-uuid-1', role: 'manager', name_bn: 'ম্যানেজার' };
const workerUser  = { id: 'worker-uuid-1',  role: 'worker',  name_bn: 'এসআর আলী' };

// Sample customer row (DB থেকে আসার মতো)
const sampleCustomer = {
    id:              'cust-uuid-1',
    customer_code:   'C-2024-001',
    shop_name:       'আলীর স্টোর',
    owner_name:      'আলী হোসেন',
    business_type:   'retail',
    whatsapp:        '01700000001',
    sms_phone:       '01700000001',
    email:           'ali@example.com',
    route_id:        'route-uuid-1',
    credit_limit:    5000,
    current_credit:  1500,
    credit_balance:  3500,
    has_pending_edit: false,
    is_active:       true,
    created_by:      adminUser.id,
};

beforeEach(() => {
    jest.resetAllMocks();
});

// ════════════════════════════════════════════════════════════════
// 1. getCustomers
// ════════════════════════════════════════════════════════════════

describe('getCustomers — কাস্টমার লিস্ট', () => {

    test('Admin — সব কাস্টমার পাবে (200)', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] }) // main query
            .mockResolvedValueOnce({ rows: [] });              // visit query

        const req = { query: {}, user: adminUser };
        const res = mockRes();
        await getCustomers(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: expect.any(Array) })
        );
    });

    test('Worker — শুধু assigned কাস্টমার পাবে (sub-query condition)', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ ...sampleCustomer, visited_today: false }] })
            .mockResolvedValueOnce({ rows: [] });

        const req = { query: {}, user: workerUser };
        const res = mockRes();
        await getCustomers(req, res);

        // query call-এ worker_id filter থাকবে
        const sqlCall = query.mock.calls[0][0];
        expect(sqlCall).toContain('customer_assignments');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('GPS coordinate থাকলে distance_meters select যুক্ত হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ ...sampleCustomer, distance_meters: 250 }] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            query: { lat: '23.8103', lng: '90.4125' },
            user: adminUser,
        };
        const res = mockRes();
        await getCustomers(req, res);

        const sqlCall = query.mock.calls[0][0];
        expect(sqlCall).toContain('ST_Distance');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('ভুল GPS coordinate (out of range) — distance query skip হবে', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            query: { lat: '999', lng: '999' }, // invalid
            user: adminUser,
        };
        const res = mockRes();
        await getCustomers(req, res);

        const sqlCall = query.mock.calls[0][0];
        expect(sqlCall).not.toContain('ST_Distance');
    });

    test('search parameter দিলে ILIKE condition যুক্ত হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const req = { query: { search: 'আলী' }, user: adminUser };
        const res = mockRes();
        await getCustomers(req, res);

        const sql = query.mock.calls[0][0];
        expect(sql).toContain('ILIKE');
    });

    test('visited_today flag সঠিকভাবে set হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ ...sampleCustomer, id: 'cust-uuid-1' }] })
            .mockResolvedValueOnce({ rows: [{ customer_id: 'cust-uuid-1' }] }); // today visit

        const req = { query: {}, user: workerUser };
        const res = mockRes();
        await getCustomers(req, res);

        const customers = res.json.mock.calls[0][0].data;
        expect(customers[0].visited_today).toBe(true);
    });

    test('DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('DB connection refused'));

        const req = { query: {}, user: adminUser };
        const res = mockRes();
        await getCustomers(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false })
        );
    });
});

// ════════════════════════════════════════════════════════════════
// 2. getCustomer
// ════════════════════════════════════════════════════════════════

describe('getCustomer — একটি কাস্টমারের তথ্য', () => {

    test('কাস্টমার পাওয়া গেলে 200', async () => {
        query.mockResolvedValueOnce({ rows: [sampleCustomer] });

        const req = { params: { id: 'cust-uuid-1' }, user: adminUser };
        const res = mockRes();
        await getCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: sampleCustomer })
        );
    });

    test('কাস্টমার না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: 'non-existent' }, user: adminUser };
        const res = mockRes();
        await getCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('Manager — নিজের রুটের কাস্টমার দেখতে পাবে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ ...sampleCustomer, route_id: 'route-uuid-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'route-uuid-1' }] }); // route check success

        const req = { params: { id: 'cust-uuid-1' }, user: managerUser };
        const res = mockRes();
        await getCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('Manager — অন্য রুটের কাস্টমার → 403', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ ...sampleCustomer, route_id: 'route-other' }] })
            .mockResolvedValueOnce({ rows: [] }); // route check fails

        const req = { params: { id: 'cust-uuid-1' }, user: managerUser };
        const res = mockRes();
        await getCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আপনার টিমে নেই') })
        );
    });

    test('DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('timeout'));

        const req = { params: { id: 'cust-uuid-1' }, user: adminUser };
        const res = mockRes();
        await getCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// 3. createCustomer
// ════════════════════════════════════════════════════════════════

describe('createCustomer — নতুন কাস্টমার তৈরি', () => {

    test('shop_name ছাড়া → 400', async () => {
        const req = {
            body: { owner_name: 'আলী হোসেন' },
            user: adminUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('দোকানের নাম') })
        );
    });

    test('owner_name ছাড়া → 400', async () => {
        const req = {
            body: { shop_name: 'আলীর স্টোর' },
            user: adminUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('GPS সহ সফল create → 201 (Admin)', async () => {
        query.mockResolvedValueOnce({ rows: [sampleCustomer] }); // INSERT RETURNING

        const req = {
            body: {
                shop_name:  'আলীর স্টোর',
                owner_name: 'আলী হোসেন',
                latitude:   '23.8103',
                longitude:  '90.4125',
                email:      null,
            },
            user: adminUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: expect.stringContaining('C-2024-001'),
            })
        );
    });

    test('GPS ছাড়া সফল create → 201', async () => {
        query.mockResolvedValueOnce({ rows: [sampleCustomer] });

        const req = {
            body: { shop_name: 'নতুন দোকান', owner_name: 'করিম' },
            user: adminUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        // GPS ছাড়া query তে ST_MakePoint থাকবে না
        const sql = query.mock.calls[0][0];
        expect(sql).not.toContain('ST_SetSRID');
        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('Worker create করলে auto-assignment হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ ...sampleCustomer, id: 'new-cust-uuid' }] }) // INSERT customer
            .mockResolvedValueOnce({ rows: [] }); // INSERT customer_assignments

        const req = {
            body: { shop_name: 'SR দোকান', owner_name: 'রহিম', route_id: 'route-uuid-1' },
            user: workerUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        // দ্বিতীয় query হলো assignment
        expect(query).toHaveBeenCalledTimes(2);
        const assignSql = query.mock.calls[1][0];
        expect(assignSql).toContain('customer_assignments');
        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('photo file থাকলে Cloudinary upload call হয়', async () => {
        const { uploadToCloudinary } = require('../services/employee.service');
        query.mockResolvedValueOnce({ rows: [sampleCustomer] });

        const req = {
            body: { shop_name: 'ফটো দোকান', owner_name: 'ফারুক' },
            user: adminUser,
            file: { buffer: Buffer.from('fake-image') },
        };
        const res = mockRes();
        await createCustomer(req, res);

        expect(uploadToCloudinary).toHaveBeenCalledWith(
            expect.any(Buffer),
            'shops',
            expect.stringContaining('shop_')
        );
    });

    test('email থাকলে welcome email পাঠানো হয়', async () => {
        const { sendWelcomeEmail } = require('../services/email.service');
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] }) // INSERT
            .mockResolvedValueOnce({ rows: [{ name_bn: 'আলী', name_en: 'Ali', phone: '017' }] }); // worker info

        const req = {
            body: { shop_name: 'ইমেইল দোকান', owner_name: 'নাসির', email: 'nasir@example.com' },
            user: workerUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        expect(sendWelcomeEmail).toHaveBeenCalledWith(
            'nasir@example.com',
            expect.any(Object),
            expect.anything()
        );
    });

    test('credit_limit না দিলে default 5000 সেট হয়', async () => {
        query.mockResolvedValueOnce({ rows: [sampleCustomer] });

        const req = {
            body: { shop_name: 'ডিফল্ট ক্রেডিট', owner_name: 'হাসান' },
            user: adminUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        const insertParams = query.mock.calls[0][1];
        expect(insertParams).toContain(5000);
    });

    test('invalid GPS (lat > 90) → location ছাড়া create', async () => {
        query.mockResolvedValueOnce({ rows: [sampleCustomer] });

        const req = {
            body: { shop_name: 'টেস্ট', owner_name: 'টেস্ট', latitude: '200', longitude: '90' },
            user: adminUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        const sql = query.mock.calls[0][0];
        expect(sql).not.toContain('ST_SetSRID');
    });

    test('DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('unique violation'));

        const req = {
            body: { shop_name: 'ডুপ্লিকেট', owner_name: 'করিম' },
            user: adminUser,
            file: null,
        };
        const res = mockRes();
        await createCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// 4. updateCustomer
// ════════════════════════════════════════════════════════════════

describe('updateCustomer — কাস্টমার আপডেট', () => {

    test('কাস্টমার না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] }); // SELECT current

        const req = {
            params: { id: 'non-existent' },
            body:   { shop_name: 'নতুন নাম' },
            user:   adminUser,
            file:   null,
        };
        const res = mockRes();
        await updateCustomer(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('GPS সহ আপডেট — ST_SetSRID যুক্ত হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] }) // SELECT current
            .mockResolvedValueOnce({ rows: [] });              // UPDATE

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { shop_name: 'আপডেট দোকান', owner_name: 'আলী', latitude: '23.8', longitude: '90.4' },
            user:   adminUser,
            file:   null,
        };
        const res = mockRes();
        await updateCustomer(req, res);

        const updateSql = query.mock.calls[1][0];
        expect(updateSql).toContain('ST_SetSRID');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('GPS ছাড়া আপডেট — location field নেই', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { shop_name: 'GPS-less Update' },
            user:   adminUser,
            file:   null,
        };
        const res = mockRes();
        await updateCustomer(req, res);

        const updateSql = query.mock.calls[1][0];
        expect(updateSql).not.toContain('ST_SetSRID');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('নতুন photo upload → Cloudinary call হয়', async () => {
        const { uploadToCloudinary } = require('../services/employee.service');
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { shop_name: 'ফটো আপডেট' },
            user:   adminUser,
            file:   { buffer: Buffer.from('img') },
        };
        const res = mockRes();
        await updateCustomer(req, res);

        expect(uploadToCloudinary).toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// 5. getCustomerHistory
// ════════════════════════════════════════════════════════════════

describe('getCustomerHistory — ক্রয় ও বাকির ইতিহাস', () => {

    test('Admin — সব history পাবে (200)', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 'sale-1', sale_status: 'verified' }] }) // sales
            .mockResolvedValueOnce({ rows: [{ id: 'pay-1', amount: 500 }] })              // credit_payments
            .mockResolvedValueOnce({ rows: [{ id: 'vis-1' }] })                           // visits
            .mockResolvedValueOnce({ rows: [{ shop_name: 'আলীর স্টোর', credit_limit: 5000 }] }); // customer info

        const req = { params: { id: 'cust-uuid-1' }, user: adminUser };
        const res = mockRes();
        await getCustomerHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const data = res.json.mock.calls[0][0].data;
        expect(data).toHaveProperty('sales');
        expect(data).toHaveProperty('credit_payments');
        expect(data).toHaveProperty('visits');
        expect(data).toHaveProperty('customer');
    });

    test('Manager — অন্য রুটের customer history → 403', async () => {
        query.mockResolvedValueOnce({ rows: [] }); // route check fails

        const req = { params: { id: 'cust-uuid-other' }, user: managerUser };
        const res = mockRes();
        await getCustomerHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('Manager — নিজের রুটের history দেখতে পাবে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 'cust-uuid-1' }] }) // route check success
            .mockResolvedValueOnce({ rows: [] }) // sales
            .mockResolvedValueOnce({ rows: [] }) // credit_payments
            .mockResolvedValueOnce({ rows: [] }) // visits
            .mockResolvedValueOnce({ rows: [{ shop_name: 'দোকান' }] }); // customer

        const req = { params: { id: 'cust-uuid-1' }, user: managerUser };
        const res = mockRes();
        await getCustomerHistory(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ════════════════════════════════════════════════════════════════
// 6. setCreditLimit
// ════════════════════════════════════════════════════════════════

describe('setCreditLimit — ক্রেডিট লিমিট সেট', () => {

    test('credit_limit না দিলে 400', async () => {
        const req = { params: { id: 'cust-uuid-1' }, body: {}, user: adminUser };
        const res = mockRes();
        await setCreditLimit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ক্রেডিট লিমিট') })
        );
    });

    test('negative credit_limit → 400', async () => {
        const req = { params: { id: 'cust-uuid-1' }, body: { credit_limit: -100 }, user: adminUser };
        const res = mockRes();
        await setCreditLimit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('কাস্টমার না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing

        const req = { params: { id: 'non-existent' }, body: { credit_limit: 10000 }, user: adminUser };
        const res = mockRes();
        await setCreditLimit(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('সফল update → 200, audit log লেখা হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ shop_name: 'আলীর স্টোর', credit_limit: 10000 }] }) // UPDATE
            .mockResolvedValueOnce({ rows: [] }); // audit log

        const req = { params: { id: 'cust-uuid-1' }, body: { credit_limit: 10000 }, user: adminUser };
        const res = mockRes();
        await setCreditLimit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        // audit log query
        expect(query).toHaveBeenCalledTimes(2);
        const auditSql = query.mock.calls[1][0];
        expect(auditSql).toContain('audit_logs');
        expect(auditSql).toContain('SET_CREDIT_LIMIT');
    });

    test('0 credit_limit → valid (zero limit allowed)', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ shop_name: 'দোকান', credit_limit: 0 }] })
            .mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: 'cust-uuid-1' }, body: { credit_limit: 0 }, user: adminUser };
        const res = mockRes();
        await setCreditLimit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ════════════════════════════════════════════════════════════════
// 7. collectCredit
// ════════════════════════════════════════════════════════════════

describe('collectCredit — বাকি আদায়', () => {

    test('amount না দিলে 400', async () => {
        const req = { params: { id: 'cust-uuid-1' }, body: {}, user: workerUser };
        const res = mockRes();
        await collectCredit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('পরিমাণ') })
        );
    });

    test('amount = 0 → 400', async () => {
        const req = { params: { id: 'cust-uuid-1' }, body: { amount: 0 }, user: workerUser };
        const res = mockRes();
        await collectCredit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('কাস্টমার না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: 'ghost' }, body: { amount: 500 }, user: workerUser };
        const res = mockRes();
        await collectCredit(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('current_credit এর বেশি amount দিলে 400', async () => {
        query.mockResolvedValueOnce({
            rows: [{ shop_name: 'আলীর স্টোর', current_credit: '1000' }],
        });

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { amount: 2000 }, // বাকির বেশি
            user:   workerUser,
        };
        const res = mockRes();
        await collectCredit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('বেশি') })
        );
    });

    test('ঠিক current_credit পরিমাণ → 200', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ shop_name: 'আলীর স্টোর', current_credit: '1000' }] })
            .mockResolvedValueOnce({ rows: [] }); // INSERT credit_payments

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { amount: 1000, notes: 'সম্পূর্ণ পরিশোধ' },
            user:   workerUser,
        };
        const res = mockRes();
        await collectCredit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(query).toHaveBeenCalledTimes(2);
        const insertSql = query.mock.calls[1][0];
        expect(insertSql).toContain('credit_payments');
    });

    test('আংশিক payment (কম amount) → 200', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ shop_name: 'দোকান', current_credit: '5000' }] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { amount: 500 },
            user:   workerUser,
        };
        const res = mockRes();
        await collectCredit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const msg = res.json.mock.calls[0][0].message;
        expect(msg).toContain('৳500');
    });
});

// ════════════════════════════════════════════════════════════════
// 8. getMyCustomerCount
// ════════════════════════════════════════════════════════════════

describe('getMyCustomerCount — Worker এর কাস্টমার সংখ্যা', () => {

    test('সফলভাবে count রিটার্ন করে', async () => {
        query.mockResolvedValueOnce({ rows: [{ total: '15' }] });

        const req = { user: workerUser };
        const res = mockRes();
        await getMyCustomerCount(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: 15 })
        );
    });

    test('assignment না থাকলে 0 রিটার্ন', async () => {
        query.mockResolvedValueOnce({ rows: [{ total: '0' }] });

        const req = { user: workerUser };
        const res = mockRes();
        await getMyCustomerCount(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: 0 })
        );
    });

    test('query result null হলেও 0 রিটার্ন', async () => {
        query.mockResolvedValueOnce({ rows: [{ total: null }] });

        const req = { user: workerUser };
        const res = mockRes();
        await getMyCustomerCount(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: 0 })
        );
    });
});

// ════════════════════════════════════════════════════════════════
// 9. requestCustomerEdit
// ════════════════════════════════════════════════════════════════

describe('requestCustomerEdit — এডিট রিকোয়েস্ট', () => {

    test('কাস্টমার না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = {
            params: { id: 'ghost' },
            body:   { shop_name: 'নতুন নাম' },
            user:   workerUser,
        };
        const res = mockRes();
        await requestCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('Admin → সরাসরি update (pending নয়)', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] }) // SELECT current
            .mockResolvedValueOnce({ rows: [] });              // UPDATE

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { shop_name: 'অ্যাডমিন নাম' },
            user:   adminUser,
        };
        const res = mockRes();
        await requestCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const updateSql = query.mock.calls[1][0];
        expect(updateSql).toContain('UPDATE customers');
    });

    test('Manager → সরাসরি update', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { owner_name: 'নতুন মালিক' },
            user:   managerUser,
        };
        const res = mockRes();
        await requestCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('Worker — pending request থাকলে আবার পাঠাতে পারবে না', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] })          // SELECT current
            .mockResolvedValueOnce({ rows: [{ id: 'existing-req' }] }); // pending check

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { shop_name: 'নতুন নাম' },
            user:   workerUser,
        };
        const res = mockRes();
        await requestCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('অপেক্ষায়') })
        );
    });

    test('Worker — কোনো পরিবর্তন না থাকলে 400', async () => {
        // same data as current
        const currentData = { ...sampleCustomer };
        query
            .mockResolvedValueOnce({ rows: [currentData] }) // SELECT current
            .mockResolvedValueOnce({ rows: [] });           // no pending

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   {
                shop_name:  sampleCustomer.shop_name,  // same
                owner_name: sampleCustomer.owner_name, // same
            },
            user: workerUser,
        };
        const res = mockRes();
        await requestCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('পরিবর্তন নেই') })
        );
    });

    test('Worker — নতুন shop_name → request insert + has_pending_edit = true', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleCustomer] })  // SELECT current
            .mockResolvedValueOnce({ rows: [] })                 // no pending
            .mockResolvedValueOnce({ rows: [{ id: 'req-1' }] }) // INSERT edit request
            .mockResolvedValueOnce({ rows: [] })                 // UPDATE has_pending_edit
            .mockResolvedValueOnce({ rows: [] });                // UPDATE customers fields

        const req = {
            params: { id: 'cust-uuid-1' },
            body:   { shop_name: 'একদম নতুন নাম' },
            user:   workerUser,
        };
        const res = mockRes();
        await requestCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('অনুমোদন') })
        );
    });
});

// ════════════════════════════════════════════════════════════════
// 10. getPendingCustomerEdits
// ════════════════════════════════════════════════════════════════

describe('getPendingCustomerEdits — অপেক্ষারত এডিট রিকোয়েস্ট', () => {

    test('Admin — সব pending edits দেখতে পাবে', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'req-1', new_data: {} }] });

        const req = { user: adminUser };
        const res = mockRes();
        await getPendingCustomerEdits(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const sql = query.mock.calls[0][0];
        // Admin-এর জন্য manager filter থাকবে না
        expect(sql).not.toContain('manager_id');
    });

    test('Manager — শুধু নিজের রুটের pending edits', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { user: managerUser };
        const res = mockRes();
        await getPendingCustomerEdits(req, res);

        const sql = query.mock.calls[0][0];
        expect(sql).toContain('manager_id');
    });
});

// ════════════════════════════════════════════════════════════════
// 11. approveCustomerEdit
// ════════════════════════════════════════════════════════════════

describe('approveCustomerEdit — এডিট অনুমোদন', () => {

    test('request না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { requestId: 'ghost-req' }, user: managerUser };
        const res = mockRes();
        await approveCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('সফল approve → request status = approved, has_pending_edit = false, audit log', async () => {
        const editReq = {
            id:          'req-1',
            customer_id: 'cust-uuid-1',
            new_data:    { shop_name: 'নতুন নাম' },
        };
        query
            .mockResolvedValueOnce({ rows: [editReq] }) // SELECT request
            .mockResolvedValueOnce({ rows: [] })         // UPDATE edit_request status
            .mockResolvedValueOnce({ rows: [] })         // UPDATE customers has_pending_edit
            .mockResolvedValueOnce({ rows: [] });        // INSERT audit_log

        const req = { params: { requestId: 'req-1' }, user: managerUser };
        const res = mockRes();
        await approveCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(query).toHaveBeenCalledTimes(4);

        const auditSql = query.mock.calls[3][0];
        expect(auditSql).toContain('APPROVE_CUSTOMER_EDIT');
    });
});

// ════════════════════════════════════════════════════════════════
// 12. rejectCustomerEdit
// ════════════════════════════════════════════════════════════════

describe('rejectCustomerEdit — এডিট প্রত্যাখ্যান ও rollback', () => {

    test('request না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { requestId: 'ghost' }, body: {}, user: managerUser };
        const res = mockRes();
        await rejectCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('reject → previous_data দিয়ে rollback হয়', async () => {
        const editReq = {
            id:            'req-1',
            customer_id:   'cust-uuid-1',
            new_data:      { shop_name: 'নতুন নাম' },
            previous_data: { shop_name: 'আলীর স্টোর', owner_name: 'আলী হোসেন' },
        };
        query
            .mockResolvedValueOnce({ rows: [editReq] }) // SELECT request
            .mockResolvedValueOnce({ rows: [] })         // UPDATE customers (rollback)
            .mockResolvedValueOnce({ rows: [] })         // UPDATE edit_request status
            .mockResolvedValueOnce({ rows: [] });        // UPDATE has_pending_edit

        const req = { params: { requestId: 'req-1' }, body: { reason: 'ভুল তথ্য' }, user: managerUser };
        const res = mockRes();
        await rejectCustomerEdit(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ rollback: editReq.previous_data })
        );

        // rollback query-তে previous_data এর field আছে কিনা
        const rollbackSql = query.mock.calls[1][0];
        expect(rollbackSql).toContain('UPDATE customers');
        expect(rollbackSql).toContain('shop_name');
    });

    test('reject message-এ reason না থাকলে default message ব্যবহার হয়', async () => {
        const editReq = {
            id: 'req-2',
            customer_id: 'cust-uuid-1',
            new_data: {},
            previous_data: {},
        };
        query
            .mockResolvedValueOnce({ rows: [editReq] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const req = { params: { requestId: 'req-2' }, body: {}, user: managerUser };
        const res = mockRes();
        await rejectCustomerEdit(req, res);

        // third call: UPDATE edit_request (reason)
        const rejectParams = query.mock.calls[2][1];
        expect(rejectParams[1]).toContain('বাতিল');
    });
});

// ════════════════════════════════════════════════════════════════
// 13. sendEmailVerifyOTP
// ════════════════════════════════════════════════════════════════

describe('sendEmailVerifyOTP — Email OTP পাঠানো', () => {

    test('email না দিলে 400', async () => {
        const req = { body: {} };
        const res = mockRes();
        await sendEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('invalid email format → 400', async () => {
        const req = { body: { email: 'not-an-email' } };
        const res = mockRes();
        await sendEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('Email') })
        );
    });

    test('valid email → OTP DB-তে upsert, email পাঠানো, 200', async () => {
        query.mockResolvedValueOnce({ rows: [] }); // UPSERT email_otps
        const { sendOTPEmail } = require('../services/email.service');

        const req = { body: { email: 'test@example.com' } };
        const res = mockRes();
        await sendEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        // DB upsert হয়েছে
        const upsertSql = query.mock.calls[0][0];
        expect(upsertSql).toContain('email_otps');
        expect(upsertSql).toContain('ON CONFLICT');
        // email পাঠানো হয়েছে
        expect(sendOTPEmail).toHaveBeenCalledWith('test@example.com', '123456', expect.any(String));
    });

    test('email lowercase-এ normalize হয়', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { body: { email: 'TEST@EXAMPLE.COM' } };
        const res = mockRes();
        await sendEmailVerifyOTP(req, res);

        const upsertParams = query.mock.calls[0][1];
        expect(upsertParams[0]).toBe('test@example.com');
    });
});

// ════════════════════════════════════════════════════════════════
// 14. confirmEmailVerifyOTP
// ════════════════════════════════════════════════════════════════

describe('confirmEmailVerifyOTP — OTP যাচাই', () => {

    test('email বা otp না দিলে 400', async () => {
        const req = { body: { email: 'test@example.com' } }; // otp নেই
        const res = mockRes();
        await confirmEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('OTP না পাঠানো হলে 400', async () => {
        query.mockResolvedValueOnce({ rows: [] }); // email_otps এ নেই

        const req = { body: { email: 'test@example.com', otp: '123456' } };
        const res = mockRes();
        await confirmEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('পাঠানো হয়নি') })
        );
    });

    test('expired OTP → 400, record delete হয়', async () => {
        const expiredDate = new Date(Date.now() - 60 * 60 * 1000); // ১ ঘণ্টা আগে
        query
            .mockResolvedValueOnce({ rows: [{ otp: '123456', expires_at: expiredDate }] })
            .mockResolvedValueOnce({ rows: [] }); // DELETE

        const req = { body: { email: 'test@example.com', otp: '123456' } };
        const res = mockRes();
        await confirmEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('মেয়াদ শেষ') })
        );
        // DELETE call হয়েছে
        const deleteSql = query.mock.calls[1][0];
        expect(deleteSql).toContain('DELETE');
    });

    test('ভুল OTP → 400', async () => {
        const futureDate = new Date(Date.now() + 10 * 60 * 1000);
        query.mockResolvedValueOnce({ rows: [{ otp: '999999', expires_at: futureDate }] });

        const req = { body: { email: 'test@example.com', otp: '123456' } }; // ভুল OTP
        const res = mockRes();
        await confirmEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ভুল') })
        );
    });

    test('সঠিক OTP → 200, record delete হয়', async () => {
        const futureDate = new Date(Date.now() + 10 * 60 * 1000);
        query
            .mockResolvedValueOnce({ rows: [{ otp: '123456', expires_at: futureDate }] })
            .mockResolvedValueOnce({ rows: [] }); // DELETE

        const req = { body: { email: 'test@example.com', otp: '123456' } };
        const res = mockRes();
        await confirmEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
        // record মুছে ফেলা হয়েছে
        expect(query).toHaveBeenCalledTimes(2);
        const deleteSql = query.mock.calls[1][0];
        expect(deleteSql).toContain('DELETE FROM email_otps');
    });

    test('OTP trim() করে match করে (whitespace tolerant)', async () => {
        const futureDate = new Date(Date.now() + 10 * 60 * 1000);
        query
            .mockResolvedValueOnce({ rows: [{ otp: '123456', expires_at: futureDate }] })
            .mockResolvedValueOnce({ rows: [] });

        const req = { body: { email: 'test@example.com', otp: '  123456  ' } }; // space সহ
        const res = mockRes();
        await confirmEmailVerifyOTP(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ════════════════════════════════════════════════════════════════
// 15. updateVisitOrder
// ════════════════════════════════════════════════════════════════

describe('updateVisitOrder — Visit ক্রম আপডেট', () => {

    test('route_id না দিলে 400', async () => {
        const req = { body: { orders: [{ customer_id: 'c1', visit_order: 1 }] }, user: adminUser };
        const res = mockRes();
        await updateVisitOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('orders empty array → 400', async () => {
        const req = { body: { route_id: 'route-uuid-1', orders: [] }, user: adminUser };
        const res = mockRes();
        await updateVisitOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('route_id') })
        );
    });

    test('orders undefined → 400', async () => {
        const req = { body: { route_id: 'route-uuid-1' }, user: adminUser };
        const res = mockRes();
        await updateVisitOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('সফল bulk update → 200, একটিমাত্র UPDATE query', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = {
            body: {
                route_id: 'route-uuid-1',
                orders: [
                    { customer_id: 'cust-1', visit_order: 1 },
                    { customer_id: 'cust-2', visit_order: 2 },
                    { customer_id: 'cust-3', visit_order: 3 },
                ],
            },
            user: adminUser,
        };
        const res = mockRes();
        await updateVisitOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        // শুধু ১টি query (bulk update)
        expect(query).toHaveBeenCalledTimes(1);
        const sql = query.mock.calls[0][0];
        expect(sql).toContain('UPDATE customer_assignments');
        expect(sql).toContain('VALUES');
    });

    test('bulk update query-তে সব customer_id parameterized', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const orders = [
            { customer_id: 'c-uuid-1', visit_order: 1 },
            { customer_id: 'c-uuid-2', visit_order: 2 },
        ];
        const req = { body: { route_id: 'route-uuid-1', orders }, user: adminUser };
        const res = mockRes();
        await updateVisitOrder(req, res);

        const params = query.mock.calls[0][1];
        // params: [c-uuid-1, 1, c-uuid-2, 2, route-uuid-1]
        expect(params).toContain('c-uuid-1');
        expect(params).toContain('c-uuid-2');
        expect(params).toContain('route-uuid-1');
    });

    test('visit_order null দিলে null param পাস হয়', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = {
            body: {
                route_id: 'route-uuid-1',
                orders: [{ customer_id: 'c-uuid-1', visit_order: null }],
            },
            user: adminUser,
        };
        const res = mockRes();
        await updateVisitOrder(req, res);

        const params = query.mock.calls[0][1];
        expect(params).toContain(null);
    });

    test('DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('constraint violation'));

        const req = {
            body: {
                route_id: 'route-uuid-1',
                orders: [{ customer_id: 'c-uuid-1', visit_order: 1 }],
            },
            user: adminUser,
        };
        const res = mockRes();
        await updateVisitOrder(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// PURE BUSINESS LOGIC — DB ছাড়া calculation tests
// ════════════════════════════════════════════════════════════════

describe('Customer Business Logic — Pure Calculations', () => {

    // GPS coordinate validation
    const isValidCoords = (lat, lng) => {
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        return !!(lat && lng
            && isFinite(parsedLat) && isFinite(parsedLng)
            && parsedLat >= -90  && parsedLat <= 90
            && parsedLng >= -180 && parsedLng <= 180);
    };

    describe('GPS Coordinate Validation', () => {
        test('valid Bangladesh coords → true', () => expect(isValidCoords('23.8103', '90.4125')).toBe(true));
        test('equator + prime meridian → true',  () => expect(isValidCoords('0', '0')).toBe(true));
        test('lat > 90 → false',                 () => expect(isValidCoords('91', '90')).toBe(false));
        test('lat < -90 → false',                () => expect(isValidCoords('-91', '90')).toBe(false));
        test('lng > 180 → false',                () => expect(isValidCoords('23', '181')).toBe(false));
        test('lng < -180 → false',               () => expect(isValidCoords('23', '-181')).toBe(false));
        test('NaN string → false',               () => expect(isValidCoords('abc', '90')).toBe(false));
        test('null → false',                     () => expect(isValidCoords(null, null)).toBe(false));
        test('empty string → false',             () => expect(isValidCoords('', '')).toBe(false));
    });

    // Credit collection guard
    const canCollectCredit = (amount, currentCredit) =>
        parseFloat(amount) <= parseFloat(currentCredit);

    describe('Credit Collection Guard', () => {
        test('amount = current_credit → allowed',        () => expect(canCollectCredit(1000, 1000)).toBe(true));
        test('amount < current_credit → allowed',        () => expect(canCollectCredit(500,  1000)).toBe(true));
        test('amount > current_credit → not allowed',    () => expect(canCollectCredit(1500, 1000)).toBe(false));
        test('amount = 0 → technically allowed',         () => expect(canCollectCredit(0, 1000)).toBe(true));
        test('string values → correct comparison',       () => expect(canCollectCredit('500', '1000')).toBe(true));
    });

    // Visit order bulk query params builder
    const buildBulkVisitParams = (orders, routeId) => {
        const values = [];
        const tuples = [];
        let i = 1;
        for (const { customer_id, visit_order } of orders) {
            tuples.push(`($${i}::uuid, $${i + 1}::int)`);
            values.push(customer_id, visit_order ?? null);
            i += 2;
        }
        values.push(routeId);
        return { values, tuples, routeParam: i };
    };

    describe('Bulk Visit Order Query Builder', () => {
        test('2 orders → 5 params (2×2 + routeId)', () => {
            const { values } = buildBulkVisitParams(
                [{ customer_id: 'c1', visit_order: 1 }, { customer_id: 'c2', visit_order: 2 }],
                'route-1'
            );
            expect(values).toHaveLength(5);
            expect(values[4]).toBe('route-1');
        });

        test('null visit_order → null in params', () => {
            const { values } = buildBulkVisitParams(
                [{ customer_id: 'c1', visit_order: null }],
                'route-1'
            );
            expect(values[1]).toBeNull();
        });

        test('3 orders → 3 tuples', () => {
            const { tuples } = buildBulkVisitParams(
                [
                    { customer_id: 'c1', visit_order: 1 },
                    { customer_id: 'c2', visit_order: 2 },
                    { customer_id: 'c3', visit_order: 3 },
                ],
                'route-1'
            );
            expect(tuples).toHaveLength(3);
        });

        test('routeParam index সঠিক (শেষ param)', () => {
            const { routeParam, values } = buildBulkVisitParams(
                [{ customer_id: 'c1', visit_order: 1 }],
                'route-x'
            );
            // 1 order → 2 params + 1 routeId = index 3
            expect(routeParam).toBe(3);
            expect(values[routeParam - 1]).toBe('route-x');
        });
    });

    // Email format validation
    const isValidEmail = (email) =>
        email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    describe('Email Format Validation', () => {
        test('valid email → true',            () => expect(isValidEmail('test@example.com')).toBeTruthy());
        test('subdomain email → true',        () => expect(isValidEmail('a@b.co.uk')).toBeTruthy());
        test('no @ → false',                  () => expect(isValidEmail('notanemail')).toBeFalsy());
        test('no domain → false',             () => expect(isValidEmail('test@')).toBeFalsy());
        test('space in email → false',        () => expect(isValidEmail('te st@ex.com')).toBeFalsy());
        test('empty string → false',          () => expect(isValidEmail('')).toBeFalsy());
        test('null → false',                  () => expect(isValidEmail(null)).toBeFalsy());
    });
});
