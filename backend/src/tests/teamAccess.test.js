/**
 * teamAccess.test.js
 * SR (worker) শুধু নিজের ম্যানেজারের টিমের কাস্টমার/রুট দেখতে পারবে —
 * একই টিমের সব SR সব কাস্টমার দেখবে, অন্য টিমের নয়।
 *
 * চালানোর কমান্ড:
 *   npm run test:unit -- --testPathPattern=teamAccess
 */

jest.mock('../config/db', () => ({
    query:           jest.fn(),
    withTransaction: jest.fn(),
}));
jest.mock('../config/firebase', () => ({
    initializeFirebase: jest.fn(),
    getDB: jest.fn().mockReturnValue({ ref: jest.fn().mockReturnValue({ set: jest.fn(), update: jest.fn() }) }),
    uploadToStorage: jest.fn(),
}));
jest.mock('../services/employee.service', () => ({
    uploadToCloudinary: jest.fn(), generateCustomerCode: jest.fn(),
}));
jest.mock('../services/email.service', () => ({
    sendWelcomeEmail: jest.fn(), sendOTPEmail: jest.fn(),
}));
jest.mock('../services/commission.service', () => ({
    updateCommissionRealtime: jest.fn(),
}));
jest.mock('../services/firebase.notify', () => ({ firebaseNotify: jest.fn() }));

const { query, withTransaction } = require('../config/db');
const {
    workerCanAccessCustomer,
    workerCanAccessRoute,
    denyWorkerOutsideTeam,
    denyWorkerOutsideTeamRoute,
} = require('../services/teamAccess.service');
const {
    getCustomers, getCustomer, getCustomerHistory, getCustomerCreditAlert,
    getMyPendingReturnRequests, collectCredit,
} = require('../controllers/customer.controller');
const { getCustomerCollections } = require('../controllers/collection.controller');
const { getSaleDetail }          = require('../controllers/sales.controller');

const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const CUST  = 'a1b2c3d4-e5f6-4789-abcd-ef1234567890';
const ROUTE = 'b2c3d4e5-f6a7-4890-bcde-f12345678901';
const worker  = { id: 'worker-1',  role: 'worker' };
const manager = { id: 'manager-1', role: 'manager' };
const admin   = { id: 'admin-1',   role: 'admin' };

beforeEach(() => { query.mockReset(); });

// ─────────────────────────────────────────────────────────────
describe('workerCanAccessCustomer / workerCanAccessRoute', () => {
    test('টিমের কাস্টমার (query একটি সারি দেয়) → true', async () => {
        query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        expect(await workerCanAccessCustomer('worker-1', 't1', CUST)).toBe(true);
        const [sql, params] = query.mock.calls[0];
        expect(sql).toContain('r.manager_id = (SELECT manager_id FROM users');
        expect(sql).toContain('c.tenant_id = $2');
        expect(params).toEqual([CUST, 't1', 'worker-1']);
    });

    test('অন্য টিমের কাস্টমার (কোনো সারি নেই) → false', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        expect(await workerCanAccessCustomer('worker-1', 't1', CUST)).toBe(false);
    });

    test('অবৈধ UUID → DB ছোঁয়ার আগেই false', async () => {
        expect(await workerCanAccessCustomer('worker-1', 't1', "x'; DROP TABLE customers;--")).toBe(false);
        expect(await workerCanAccessCustomer('worker-1', 't1', undefined)).toBe(false);
        expect(query).not.toHaveBeenCalled();
    });

    test('রুট: নিজের ম্যানেজারের রুট → true, অন্যথায় false', async () => {
        query.mockResolvedValueOnce({ rows: [{}] });
        expect(await workerCanAccessRoute('worker-1', 't1', ROUTE)).toBe(true);
        query.mockResolvedValueOnce({ rows: [] });
        expect(await workerCanAccessRoute('worker-1', 't1', ROUTE)).toBe(false);
        expect(await workerCanAccessRoute('worker-1', 't1', 'not-a-uuid')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────
describe('denyWorkerOutsideTeam — শুধু worker-এর ওপর কাজ করে', () => {
    test('admin/manager → DB ছোঁয় না, কিছু আটকায় না', async () => {
        for (const user of [admin, manager]) {
            const res = mockRes();
            expect(await denyWorkerOutsideTeam({ user, tenantId: 't1' }, res, CUST)).toBe(false);
            expect(await denyWorkerOutsideTeamRoute({ user, tenantId: 't1' }, res, ROUTE)).toBe(false);
        }
        expect(query).not.toHaveBeenCalled();
    });

    test('worker টিমের বাইরে → 403 পাঠায়, true ফেরত দেয়', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        expect(await denyWorkerOutsideTeam({ user: worker, tenantId: 't1' }, res, CUST)).toBe(true);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('worker টিমের ভেতরে → false, response পাঠায় না', async () => {
        query.mockResolvedValueOnce({ rows: [{}] });
        const res = mockRes();
        expect(await denyWorkerOutsideTeam({ user: worker, tenantId: 't1' }, res, CUST)).toBe(false);
        expect(res.status).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────
describe('controller-গুলো: অন্য টিমের কাস্টমারে worker → 403, ডাটা query-ই হয় না', () => {
    const outsideTeam = () => query.mockResolvedValueOnce({ rows: [] });

    test('GET /customers/:id/history', async () => {
        outsideTeam();
        const res = mockRes();
        await getCustomerHistory({ params: { id: CUST }, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(query).toHaveBeenCalledTimes(1); // শুধু টিম-চেক, sales/payments query হয়নি
    });

    test('GET /customers/:id', async () => {
        outsideTeam();
        const res = mockRes();
        await getCustomer({ params: { id: CUST }, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('GET /customers/:id/credit-alert', async () => {
        outsideTeam();
        const res = mockRes();
        await getCustomerCreditAlert({ params: { id: CUST }, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('GET /collections/customer/:customerId', async () => {
        outsideTeam();
        const res = mockRes();
        await getCustomerCollections({ params: { customerId: CUST }, query: {}, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('GET /customers?route_id=অন্য-টিমের-রুট', async () => {
        outsideTeam();
        const res = mockRes();
        await getCustomers({ query: { route_id: ROUTE }, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('GET /sales/:id — অন্য SR-এর, অন্য টিমের কাস্টমারের sale', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 's1', worker_id: 'other-sr', customer_id: CUST }] })
            .mockResolvedValueOnce({ rows: [] }); // টিম-চেক ব্যর্থ
        const res = mockRes();
        await getSaleDetail({ params: { id: 's1' }, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

describe('my-return-requests: assigned নয়, টিমের সব কাস্টমার', () => {
    test('SQL-এ টিম-ভিত্তিক শর্ত আছে (assigned OR route.manager == worker.manager), tenant সহ', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'crr-9', customer_id: CUST }] });
        const res = mockRes();
        await getMyPendingReturnRequests({ user: worker, query: {}, tenantId: 't1' }, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, total: 1 }));
        const [sql, params] = query.mock.calls[0];
        expect(sql).toContain('r.manager_id = (');
        expect(sql).toContain('SELECT manager_id FROM users WHERE id = $1 AND tenant_id = $2');
        expect(sql).toContain('customer_assignments');
        expect(params).toEqual([worker.id, 't1']);
    });
});

describe('controller-গুলো: টিমের ভেতরের কাস্টমারে worker → ডাটা পায়', () => {
    test('history: টিম-চেক পাস করলে sales/payments/visits আসে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{}] })                                  // টিম-চেক
            .mockResolvedValueOnce({ rows: [{ id: 'sale-of-colleague' }] })         // sales (অন্য SR-এর)
            .mockResolvedValueOnce({ rows: [{ id: 'pay-1' }] })                     // credit_payments
            .mockResolvedValueOnce({ rows: [{ id: 'v-1' }] })                       // visits
            .mockResolvedValueOnce({ rows: [{ shop_name: 'X' }] })                  // customer
            .mockResolvedValueOnce({ rows: [{ id: 'crr-1', type: 'replacement' }] }) // customer_return_requests
            .mockResolvedValueOnce({ rows: [{ id: 'rr-1', sr_name: 'সহকর্মী SR' }] }); // return_requests (SR)
        const res = mockRes();
        await getCustomerHistory({ params: { id: CUST }, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body.data.sales).toHaveLength(1);
        expect(body.data.credit_payments).toHaveLength(1);
        expect(body.data.customer_return_requests).toHaveLength(1);
        expect(body.data.sr_return_requests).toHaveLength(1);
        // customer query-তেও tenant filter আছে
        expect(query.mock.calls[4][0]).toContain('tenant_id = $2');
        // রিটার্ন/রিপ্লেসমেন্ট query দুটোতেও tenant filter আছে
        expect(query.mock.calls[5][0]).toContain('crr.tenant_id = $2');
        expect(query.mock.calls[6][0]).toContain('rr.tenant_id = $2');
    });

    test('sale detail: নিজের sale হলে আলাদা টিম-চেকই লাগে না', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 's1', worker_id: worker.id, customer_id: CUST }] });
        const res = mockRes();
        await getSaleDetail({ params: { id: 's1' }, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('manager/admin: আগের আচরণ অপরিবর্তিত (টিম-চেক query নেই)', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 's1', worker_id: 'sr-9', customer_id: CUST }] });
        const res = mockRes();
        await getSaleDetail({ params: { id: 's1' }, user: admin, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(query).toHaveBeenCalledTimes(1);
    });
});

// ─────────────────────────────────────────────────────────────
describe('collectCredit (POST /customers/:id/collect-credit) — SR শুধু নিজের টিমের কাস্টমারে', () => {
    const body = { amount: 500, idempotency_key: 'key-1' };

    test('অন্য টিমের কাস্টমারে worker → 403, কোনো transaction/লেখা হয় না', async () => {
        withTransaction.mockReset();
        query
            .mockResolvedValueOnce({ rows: [] })   // idempotency_key আগে ব্যবহার হয়নি
            .mockResolvedValueOnce({ rows: [] });  // টিম-চেক ব্যর্থ
        const res = mockRes();
        await collectCredit({ params: { id: CUST }, body, user: worker, tenantId: 't1' }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(withTransaction).not.toHaveBeenCalled();
    });

    test('টিমের কাস্টমারে worker → চেক পার হয়, আর lock-query-তে tenant_id আছে', async () => {
        const clientQuery = jest.fn().mockResolvedValueOnce({ rows: [] }); // কাস্টমার নেই → 404 (শুধু query দেখার জন্য)
        withTransaction.mockReset();
        withTransaction.mockImplementation(async (cb) => cb({ query: clientQuery }));
        query
            .mockResolvedValueOnce({ rows: [] })    // idempotency
            .mockResolvedValueOnce({ rows: [{}] }); // টিম-চেক সফল
        const res = mockRes();
        await collectCredit({ params: { id: CUST }, body, user: worker, tenantId: 't1', ip: '1.1.1.1' }, res);
        expect(res.status).toHaveBeenCalledWith(404);
        const [sql, params] = clientQuery.mock.calls[0];
        expect(sql).toContain('FOR UPDATE');
        expect(sql).toContain('tenant_id = ');
        expect(params).toEqual([CUST, 't1']);
    });

    test('admin → টিম-চেক query হয় না, তবে tenant ফিল্টার থাকে', async () => {
        const clientQuery = jest.fn().mockResolvedValueOnce({ rows: [] });
        withTransaction.mockReset();
        withTransaction.mockImplementation(async (cb) => cb({ query: clientQuery }));
        query.mockResolvedValueOnce({ rows: [] }); // শুধু idempotency
        const res = mockRes();
        await collectCredit({ params: { id: CUST }, body, user: admin, tenantId: 't1' }, res);
        expect(query).toHaveBeenCalledTimes(1);
        expect(clientQuery.mock.calls[0][1]).toEqual([CUST, 't1']);
    });
});
