/**
 * auth.middleware.test.js
 * ─────────────────────────────────────────────────────────────
 * JWT Authentication Middleware এর টেস্ট
 * লগিন, token যাচাই, suspended/pending account block
 * ─────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');

// DB mock — middleware এ DB call নেই, তবু safe রাখতে
jest.mock('../config/db', () => ({
    query: jest.fn()
}));

const { auth } = require('../middlewares/auth');

// টেস্টে ব্যবহারের জন্য valid token তৈরির helper
const makeToken = (payload, secret = 'test_secret') =>
    jwt.sign(payload, secret, { expiresIn: '15m' });

// প্রতিটি টেস্টের আগে env set করি
beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test_secret';
});

// ─── Helper: fake req/res/next ────────────────────────────────
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

// ─── Token নেই ───────────────────────────────────────────────

describe('auth middleware — token না থাকলে', () => {

    test('Authorization header না পাঠালে 401', async () => {
        const req  = { headers: {} };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('"Bearer " ছাড়া header — 401', async () => {
        const req  = { headers: { authorization: 'Token abc123' } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
    });
});

// ─── Token ভুল বা মেয়াদ শেষ ─────────────────────────────────

describe('auth middleware — invalid token', () => {

    test('ভুল token দিলে 401', async () => {
        const req  = { headers: { authorization: 'Bearer invalidtoken123' } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('মেয়াদ শেষ token — TOKEN_EXPIRED code', async () => {
        // 1 সেকেন্ড আগে expire হওয়া token
        const expiredToken = jwt.sign(
            { userId: '1', role: 'worker', status: 'active' },
            'test_secret',
            { expiresIn: -1 }
        );

        const req  = { headers: { authorization: `Bearer ${expiredToken}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'TOKEN_EXPIRED' })
        );
    });

    test('customer_portal token দিয়ে employee route — 403', async () => {
        const token = makeToken({
            userId: '99',
            role: 'customer',
            status: 'active',
            type: 'customer_portal'
        });

        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'WRONG_TOKEN_TYPE' })
        );
    });
});

// ─── Account Status ───────────────────────────────────────────

describe('auth middleware — account status check', () => {

    test('suspended account — 403', async () => {
        const token = makeToken({
            userId: '1', role: 'worker', status: 'suspended', name_bn: 'রহিম'
        });

        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('pending account — 403', async () => {
        const token = makeToken({
            userId: '2', role: 'worker', status: 'pending', name_bn: 'করিম'
        });

        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('archived account — 403', async () => {
        const token = makeToken({
            userId: '3', role: 'worker', status: 'archived', name_bn: 'জলিল'
        });

        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
    });
});

// ─── Valid Token ──────────────────────────────────────────────

describe('auth middleware — valid token', () => {

    test('active worker token — req.user সেট হবে, next() চলবে', async () => {
        const token = makeToken({
            userId:        'worker-1',
            role:          'worker',
            status:        'active',
            name_bn:       'আলী',
            name_en:       'Ali',
            manager_id:    'mgr-1',
            employee_code: 'EMP001',
            phone:         '01700000000'
        });

        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toMatchObject({
            id:            'worker-1',
            role:          'worker',
            status:        'active',
            name_bn:       'আলী',
            manager_id:    'mgr-1',
            employee_code: 'EMP001'
        });
    });

    test('active admin token — next() চলবে', async () => {
        const token = makeToken({
            userId: 'admin-1', role: 'admin', status: 'active', name_bn: 'Admin'
        });

        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user.role).toBe('admin');
    });

    test('manager_id না থাকলে null হবে', async () => {
        const token = makeToken({
            userId: 'admin-1', role: 'admin', status: 'active', name_bn: 'Admin'
        });

        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(req.user.manager_id).toBeNull();
    });
});
