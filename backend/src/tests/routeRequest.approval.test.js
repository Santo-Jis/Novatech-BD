// SR-এর রুট আবেদন: তালিকা, অনুমোদন (রুট তৈরি + SR অ্যাসাইন), বাতিল
const mockClient = { query: jest.fn() };
jest.mock('../config/db', () => ({
    query: jest.fn(),
    withTransaction: jest.fn(async (cb) => cb(mockClient)),
}));
jest.mock('../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config/firebase', () => ({ getDB: jest.fn() }));
jest.mock('../services/fcm.service', () => ({ sendPushToMany: jest.fn().mockResolvedValue() }));

const { query, withTransaction } = require('../config/db');
const { sendPushToMany } = require('../services/fcm.service');
const ctrl = require('../controllers/route.controller');

const mockRes = () => { const r = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); return r; };
const flush = () => new Promise((r) => setImmediate(r));

const reqRow = (o = {}) => ({
    id: 'rq1', route_name: ' নতুন রুট ', description: 'বিবরণ', status: 'pending',
    requested_by: 'sr1', created_at: new Date('2026-11-01T00:00:00Z'),
    sr_name: 'রহিম', sr_status: 'active', sr_role: 'worker', sr_manager_id: 'mgr1', ...o,
});
const mgr  = { id: 'mgr1', role: 'manager' };
const admin = { id: 'adm1', role: 'admin' };
const mkReq = (user, o = {}) => ({ params: { id: 'rq1' }, body: {}, user, tenantId: 't1', ...o });

// ক্লায়েন্টের query-গুলো ক্রমানুসারে সাজাই: [লোড, reviewer নাম, (ডুপ্লিকেট চেক), ...বাকি]
const seq = (...rowsList) => {
    mockClient.query.mockReset();
    rowsList.forEach((rows) => mockClient.query.mockResolvedValueOnce({ rows }));
    mockClient.query.mockResolvedValue({ rows: [] });
};
const sqls = () => mockClient.query.mock.calls.map((c) => c[0]);

beforeEach(() => { sendPushToMany.mockClear(); withTransaction.mockClear(); query.mockReset(); });

describe('getPendingRoutes', () => {
    test('Admin (teamFilter নেই) → null পাঠায়, tenant দিয়ে সীমিত', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'rq1' }] });
        const res = mockRes();
        await ctrl.getPendingRoutes({ tenantId: 't1', teamFilter: null }, res);
        expect(query.mock.calls[0][0]).toMatch(/FROM route_requests/);
        expect(query.mock.calls[0][1]).toEqual(['t1', null]);
        expect(res.status).toHaveBeenCalledWith(200);
    });
    test('Manager → নিজের id দিয়ে টিম-ফিল্টার', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        await ctrl.getPendingRoutes({ tenantId: 't1', teamFilter: 'mgr1' }, mockRes());
        expect(query.mock.calls[0][1]).toEqual(['t1', 'mgr1']);
    });
});

describe('approveRouteRequest', () => {
    test('সফল: রুট তৈরি + SR অ্যাসাইন + আবেদন approved, SR-কে push', async () => {
        seq([reqRow()], [{ name_bn: 'ম্যানেজার' }], [] /* ডুপ্লিকেট নেই */, [{ id: 'route1', name: 'নতুন রুট' }]);
        const res = mockRes();
        await ctrl.approveRouteRequest(mkReq(mgr, { body: { note: 'ঠিক আছে' } }), res);
        await flush();

        expect(res.status).toHaveBeenCalledWith(200);
        const s = sqls();
        expect(s.some((q) => /INSERT INTO routes/.test(q))).toBe(true);
        expect(s.some((q) => /INSERT INTO customer_assignments/.test(q) && /ON CONFLICT \(worker_id, route_id\) WHERE customer_id IS NULL/.test(q))).toBe(true);
        expect(s.some((q) => /UPDATE route_requests/.test(q) && /'approved'/.test(q))).toBe(true);

        // রুট SR-এর নিজের ম্যানেজারের নামে, নাম trim করা
        const ins = mockClient.query.mock.calls.find(([q]) => /INSERT INTO routes/.test(q));
        expect(ins[1][0]).toBe('নতুন রুট');
        expect(ins[1][1]).toBe('mgr1');
        // অ্যাসাইন হয় আবেদনকারী SR
        const asg = mockClient.query.mock.calls.find(([q]) => /INSERT INTO customer_assignments/.test(q));
        expect(asg[1][0]).toBe('sr1');
        expect(sendPushToMany).toHaveBeenCalledWith(['sr1'], expect.objectContaining({ title: '✅ রুট অনুমোদিত' }));
    });

    test('Admin অনুমোদন করলেও রুটের manager = SR-এর ম্যানেজার (Admin নয়)', async () => {
        seq([reqRow()], [{ name_bn: 'অ্যাডমিন' }], [], [{ id: 'route1', name: 'ক' }]);
        await ctrl.approveRouteRequest(mkReq(admin), mockRes());
        const ins = mockClient.query.mock.calls.find(([q]) => /INSERT INTO routes/.test(q));
        expect(ins[1][1]).toBe('mgr1');
    });

    test('আবেদন না পেলে → ৪০৪', async () => {
        seq([]);
        const res = mockRes();
        await ctrl.approveRouteRequest(mkReq(mgr), res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('আগেই নিষ্পত্তি হয়ে থাকলে → ৪০৯, কিছু লেখা হয় না', async () => {
        seq([reqRow({ status: 'approved' })]);
        const res = mockRes();
        await ctrl.approveRouteRequest(mkReq(mgr), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(sqls().some((q) => /INSERT|UPDATE route_requests/.test(q))).toBe(false);
    });

    test('অন্য টিমের SR-এর আবেদন Manager অনুমোদন করতে পারে না → ৪০৩', async () => {
        seq([reqRow({ sr_manager_id: 'otherMgr' })]);
        const res = mockRes();
        await ctrl.approveRouteRequest(mkReq(mgr), res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(sqls().some((q) => /INSERT/.test(q))).toBe(false);
    });

    test('SR টিমে না থাকলে (manager_id NULL) → ৪০৯', async () => {
        seq([reqRow({ sr_manager_id: null })]);
        const res = mockRes();
        await ctrl.approveRouteRequest(mkReq(admin), res);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('SR নিষ্ক্রিয় হলে → ৪০৯', async () => {
        seq([reqRow({ sr_status: 'inactive' })]);
        const res = mockRes();
        await ctrl.approveRouteRequest(mkReq(mgr), res);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('একই নামে রুট আগে থাকলে → ৪০৯, রুট তৈরি হয় না', async () => {
        seq([reqRow()], [{ name_bn: 'ম' }], [{ '?column?': 1 }]);
        const res = mockRes();
        await ctrl.approveRouteRequest(mkReq(mgr), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(sqls().some((q) => /INSERT INTO routes/.test(q))).toBe(false);
    });

    test('ডাটাবেস ত্রুটি → ৫০০ (transaction rollback হয়)', async () => {
        withTransaction.mockRejectedValueOnce(new Error('db down'));
        const res = mockRes();
        await ctrl.approveRouteRequest(mkReq(mgr), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('rejectRouteRequest', () => {
    test('সফল: rejected, কারণসহ, রুট তৈরি হয় না, SR-কে push', async () => {
        seq([reqRow()], [{ name_bn: 'ম্যানেজার' }]);
        const res = mockRes();
        await ctrl.rejectRouteRequest(mkReq(mgr, { body: { note: 'নাম মিলছে না' } }), res);
        await flush();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(sqls().some((q) => /INSERT INTO routes/.test(q))).toBe(false);
        const upd = mockClient.query.mock.calls.find(([q]) => /UPDATE route_requests/.test(q));
        expect(upd[0]).toMatch(/'rejected'/);
        expect(upd[1][3]).toBe('নাম মিলছে না');
        expect(sendPushToMany).toHaveBeenCalledWith(['sr1'], expect.objectContaining({ title: '❌ রুট আবেদন বাতিল' }));
    });

    test('অন্য টিমের আবেদন Manager বাতিলও করতে পারে না → ৪০৩', async () => {
        seq([reqRow({ sr_manager_id: 'otherMgr' })]);
        const res = mockRes();
        await ctrl.rejectRouteRequest(mkReq(mgr), res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('ইতিমধ্যে বাতিল হলে → ৪০৯', async () => {
        seq([reqRow({ status: 'rejected' })]);
        const res = mockRes();
        await ctrl.rejectRouteRequest(mkReq(admin), res);
        expect(res.status).toHaveBeenCalledWith(409);
    });
});
