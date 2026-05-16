/**
 * roleCheck.middleware.test.js
 * ─────────────────────────────────────────────────────────────
 * Role-Based Access Control এর টেস্ট
 * কে কোন কাজ করতে পারবে — এটা ভুল হলে security breach হবে
 * ─────────────────────────────────────────────────────────────
 */

jest.mock('../config/db', () => ({
    query: jest.fn()
}));

const { query } = require('../config/db');
const {
    allowRoles,
    checkTeamAccess,
    selfOrAdmin,
    workerSelfOnly
} = require('../middlewares/roleCheck');

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const makeReq = (role, extra = {}) => ({
    user: { id: 'user-1', role, status: 'active', ...extra },
    params: {},
    ...extra
});

// ─── allowRoles ───────────────────────────────────────────────

describe('allowRoles — নির্দিষ্ট role-এর access', () => {

    test('সঠিক role — next() চলবে', () => {
        const middleware = allowRoles('admin', 'manager');
        const req  = makeReq('admin');
        const res  = mockRes();
        const next = jest.fn();

        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('ভুল role — 403', () => {
        const middleware = allowRoles('admin');
        const req  = makeReq('worker');
        const res  = mockRes();
        const next = jest.fn();

        middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('req.user নেই — 401', () => {
        const middleware = allowRoles('admin');
        const req  = { user: null };
        const res  = mockRes();
        const next = jest.fn();

        middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('worker শুধু worker route-এ যেতে পারবে', () => {
        const middleware = allowRoles('worker');
        const req  = makeReq('worker');
        const res  = mockRes();
        const next = jest.fn();

        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('manager salary page (admin only) — 403', () => {
        const middleware = allowRoles('admin');
        const req  = makeReq('manager');
        const res  = mockRes();
        const next = jest.fn();

        middleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

// ─── checkTeamAccess ──────────────────────────────────────────

describe('checkTeamAccess — টিম filter', () => {

    test('admin — teamFilter null (সব দেখবে)', () => {
        const req  = makeReq('admin');
        const res  = mockRes();
        const next = jest.fn();

        checkTeamAccess(req, res, next);

        expect(req.teamFilter).toBeNull();
        expect(next).toHaveBeenCalled();
    });

    test('asm — teamFilter null (সব দেখবে)', () => {
        const req  = makeReq('asm');
        const res  = mockRes();
        const next = jest.fn();

        checkTeamAccess(req, res, next);

        expect(req.teamFilter).toBeNull();
    });

    test('manager — teamFilter = নিজের id (শুধু নিজের টিম)', () => {
        const req  = { user: { id: 'mgr-5', role: 'manager' } };
        const res  = mockRes();
        const next = jest.fn();

        checkTeamAccess(req, res, next);

        expect(req.teamFilter).toBe('mgr-5');
        expect(next).toHaveBeenCalled();
    });

    test('supervisor — teamFilter = নিজের id', () => {
        const req  = { user: { id: 'sup-3', role: 'supervisor' } };
        const res  = mockRes();
        const next = jest.fn();

        checkTeamAccess(req, res, next);

        expect(req.teamFilter).toBe('sup-3');
    });
});

// ─── selfOrAdmin ──────────────────────────────────────────────

describe('selfOrAdmin — নিজের বা admin-এর access', () => {

    test('admin — যেকোনো user-এর data দেখতে পারবে', async () => {
        const req  = { user: { id: 'admin-1', role: 'admin' }, params: { id: 'worker-99' } };
        const res  = mockRes();
        const next = jest.fn();

        await selfOrAdmin(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('নিজের data — যেকোনো role দেখতে পারবে', async () => {
        const req  = { user: { id: 'worker-1', role: 'worker' }, params: { id: 'worker-1' } };
        const res  = mockRes();
        const next = jest.fn();

        await selfOrAdmin(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('manager — নিজের টিমের SR-এর data দেখতে পারবে', async () => {
        query.mockResolvedValueOnce({
            rows: [{ manager_id: 'mgr-1' }]
        });

        const req  = {
            user:   { id: 'mgr-1', role: 'manager' },
            params: { id: 'worker-5' }
        };
        const res  = mockRes();
        const next = jest.fn();

        await selfOrAdmin(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('manager — অন্য টিমের SR-এর data দেখতে পারবে না (403)', async () => {
        query.mockResolvedValueOnce({
            rows: [{ manager_id: 'mgr-99' }] // অন্য manager-এর SR
        });

        const req  = {
            user:   { id: 'mgr-1', role: 'manager' },
            params: { id: 'worker-5' }
        };
        const res  = mockRes();
        const next = jest.fn();

        await selfOrAdmin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('worker — অন্য worker-এর data দেখতে পারবে না (403)', async () => {
        const req  = {
            user:   { id: 'worker-1', role: 'worker' },
            params: { id: 'worker-2' } // অন্যজনের id
        };
        const res  = mockRes();
        const next = jest.fn();

        await selfOrAdmin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});

// ─── workerSelfOnly ───────────────────────────────────────────

describe('workerSelfOnly — worker শুধু নিজের data', () => {

    test('worker — req.workerId সেট হবে', () => {
        const req  = { user: { id: 'worker-7', role: 'worker' } };
        const res  = mockRes();
        const next = jest.fn();

        workerSelfOnly(req, res, next);

        expect(req.workerId).toBe('worker-7');
        expect(next).toHaveBeenCalled();
    });

    test('admin — next() চলবে, workerId সেট হবে না', () => {
        const req  = { user: { id: 'admin-1', role: 'admin' } };
        const res  = mockRes();
        const next = jest.fn();

        workerSelfOnly(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.workerId).toBeUndefined();
    });

    test('manager — next() চলবে', () => {
        const req  = { user: { id: 'mgr-1', role: 'manager' } };
        const res  = mockRes();
        const next = jest.fn();

        workerSelfOnly(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});
