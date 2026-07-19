/**
 * auth.tenantSecurity.test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 1 — Unit Test  (DB ছাড়া, সব mock)
 *
 * ✅ Phase 4 (TICKET-09) — REGRESSION GUARD
 *
 * এই ফাইলটা বিশেষভাবে Phase 1 (19 July 2026)-এ পাওয়া দুটো critical
 * বাগ যেন ভবিষ্যতে আবার ফিরে না আসে তা নিশ্চিত করার জন্য লেখা:
 *
 *   ১. Login SQL operator-precedence বাগ:
 *      আগে `WHERE email=$1 OR phone=$1 OR employee_code=$1 AND tenant_id=$2`
 *      লেখা ছিল — SQL-এ AND, OR-এর চেয়ে বেশি প্রাধান্য পায় বলে email/phone
 *      login-এ tenant_id filter কার্যত কাজ করতো না (cross-tenant leak)।
 *      এখানে সরাসরি query string-এ bracket সঠিক আছে কিনা assert করা হয়।
 *
 *   ২. Tenant suspend/cancel enforcement:
 *      Super admin কোনো tenant suspend করলে সেই tenant-এর ইউজাররা যেন
 *      login/refresh করতে না পারে (fail-open: DB/lookup সমস্যা হলে
 *      ব্লক না করে, শুধু নিশ্চিত suspended/cancelled হলেই ব্লক করে)।
 *
 * কভার করা হচ্ছে:
 *   - auth.controller.js → login()
 *   - middlewares/auth.js → auth()
 *   - services/auth.service.js → verifyRefreshToken()
 *
 * চালানোর কমান্ড:
 *   npm run test:unit -- --testPathPattern=auth.tenantSecurity
 * ════════════════════════════════════════════════════════════════
 */

const jwt = require('jsonwebtoken');

// ─── TOP-LEVEL MOCKS ──────────────────────────────────────────────
jest.mock('../config/db', () => ({
    query: jest.fn(),
}));

jest.mock('../middlewares/tenantResolver', () => ({
    getTenantById:     jest.fn(),
    getTenantBySlug:   jest.fn(),
    clearTenantCache:  jest.fn(),
}));

jest.mock('../config/redis', () => ({
    getRedisClient:  jest.fn().mockResolvedValue({ get: jest.fn(), set: jest.fn(), del: jest.fn() }),
    blockUserTokens: jest.fn().mockResolvedValue(undefined),
    isUserBlocked:   jest.fn().mockResolvedValue(false),
    unblockUser:     jest.fn().mockResolvedValue(undefined),
}));

jest.mock('bcryptjs', () => ({
    compare: jest.fn(),
    hash:    jest.fn().mockResolvedValue('hash_xyz'),
}));

// ⚠️ auth.service.js আংশিক মক করা হচ্ছে (jest.requireActual দিয়ে):
// generateAccessToken/generateRefreshToken/saveRefreshToken মক থাকবে
// (login()-এর dependency হিসেবে, DB/JWT সাইড-ইফেক্ট এড়াতে), কিন্তু
// verifyRefreshToken() **আসল** ফাংশনই থাকবে — কারণ সেটাই এই ফাইলের
// ৪ নং সেকশনে সরাসরি টেস্ট করা হচ্ছে (tenant enforcement regression)।
jest.mock('../services/auth.service', () => {
    const actual = jest.requireActual('../services/auth.service');
    return {
        ...actual,
        generateAccessToken:  jest.fn().mockReturnValue('fake-access-token'),
        generateRefreshToken: jest.fn().mockReturnValue('fake-refresh-token'),
        saveRefreshToken:     jest.fn().mockResolvedValue(undefined),
    };
});

jest.mock('../services/fcm.service', () => ({
    saveFCMToken: jest.fn(),
    clearFCMToken: jest.fn(),
}));

jest.mock('../config/encryption', () => ({
    generateOTP: jest.fn().mockReturnValue('123456'),
}));

// ─── IMPORTS (mock এর পরে) ────────────────────────────────────────
const { query } = require('../config/db');
const { getTenantById } = require('../middlewares/tenantResolver');
const { isUserBlocked } = require('../config/redis');
const bcrypt = require('bcryptjs');

const { login } = require('../controllers/auth.controller');
const { auth } = require('../middlewares/auth');

// verifyRefreshToken এখানে আসল (unmocked) ফাংশনটাই আসবে — উপরের
// jest.mock factory-তে ...actual spread করা আছে বলে।
const { verifyRefreshToken } = require('../services/auth.service');

// ─── Helpers ──────────────────────────────────────────────────────
const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    return res;
};

const TENANT_A = '00000000-0000-0000-0000-000000000001';
const activeUser = {
    id: 'user-1', role: 'admin', employee_code: 'EMP1', name_bn: 'টেস্ট',
    email: 'test@example.com', phone: '01700000000', password_hash: 'hash',
    status: 'active', profile_photo: null, tenant_id: TENANT_A,
};

beforeEach(() => {
    jest.clearAllMocks();
    bcrypt.compare.mockResolvedValue(true);
    isUserBlocked.mockResolvedValue(false);
});

// ════════════════════════════════════════════════════════════════
// ১. Login SQL — bracket regression guard
// ════════════════════════════════════════════════════════════════

describe('login() — SQL tenant-isolation bracket (Phase 1 regression guard)', () => {
    test('user query-তে (email OR phone OR employee_code) AND tenant_id — সঠিক bracket আছে', async () => {
        query.mockResolvedValueOnce({ rows: [activeUser] });
        getTenantById.mockResolvedValue({ status: 'active' });

        const req = { body: { identifier: 'test@example.com', password: 'pass123' }, tenantId: TENANT_A };
        const res = mockRes();
        await login(req, res);

        const sql = query.mock.calls[0][0];
        // ✅ regression guard: bracket ঠিক থাকলে এই pattern মিলবে।
        // কেউ ভুলে আবার bracket সরিয়ে ফেললে এই assertion ব্যর্থ হবে।
        expect(sql.replace(/\s+/g, ' ')).toContain(
            '(email = $1 OR phone = $1 OR employee_code = $1) AND tenant_id = $2'
        );
    });

    test('tenant_id parameter সবসময় req.tenantId থেকে পাঠানো হয়', async () => {
        query.mockResolvedValueOnce({ rows: [activeUser] });
        getTenantById.mockResolvedValue({ status: 'active' });

        const req = { body: { identifier: 'test@example.com', password: 'pass123' }, tenantId: TENANT_A };
        const res = mockRes();
        await login(req, res);

        const params = query.mock.calls[0][1];
        expect(params).toEqual(['test@example.com', TENANT_A]);
    });
});

// ════════════════════════════════════════════════════════════════
// ২. Login — Tenant suspend/cancel enforcement
// ════════════════════════════════════════════════════════════════

describe('login() — tenant suspend/cancel enforcement (Phase 1)', () => {
    test('Tenant suspended হলে — সঠিক password দিলেও 403 TENANT_INACTIVE', async () => {
        query.mockResolvedValueOnce({ rows: [activeUser] });
        getTenantById.mockResolvedValue({ status: 'suspended' });

        const req = { body: { identifier: 'test@example.com', password: 'pass123' }, tenantId: TENANT_A };
        const res = mockRes();
        await login(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, code: 'TENANT_INACTIVE' })
        );
    });

    test('Tenant cancelled হলে — 403 TENANT_INACTIVE', async () => {
        query.mockResolvedValueOnce({ rows: [activeUser] });
        getTenantById.mockResolvedValue({ status: 'cancelled' });

        const req = { body: { identifier: 'test@example.com', password: 'pass123' }, tenantId: TENANT_A };
        const res = mockRes();
        await login(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'TENANT_INACTIVE' })
        );
    });

    test('Tenant active হলে — স্বাভাবিকভাবে login সফল হয় (200)', async () => {
        query.mockResolvedValueOnce({ rows: [activeUser] });
        getTenantById.mockResolvedValue({ status: 'active' });

        const req = { body: { identifier: 'test@example.com', password: 'pass123' }, tenantId: TENANT_A };
        const res = mockRes();
        await login(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('fail-open: getTenantById lookup error হলেও login ব্লক হয় না', async () => {
        query.mockResolvedValueOnce({ rows: [activeUser] });
        getTenantById.mockRejectedValue(new Error('DB timeout'));

        const req = { body: { identifier: 'test@example.com', password: 'pass123' }, tenantId: TENANT_A };
        const res = mockRes();
        await login(req, res);

        // lookup error হলেও fail-open — login সফল হওয়া উচিত, 403 না
        expect(res.status).not.toHaveBeenCalledWith(403);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('fail-open: tenant row না পাওয়া গেলেও (null) login ব্লক হয় না', async () => {
        query.mockResolvedValueOnce({ rows: [activeUser] });
        getTenantById.mockResolvedValue(null);

        const req = { body: { identifier: 'test@example.com', password: 'pass123' }, tenantId: TENANT_A };
        const res = mockRes();
        await login(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ════════════════════════════════════════════════════════════════
// ৩. auth middleware — Tenant suspend/cancel enforcement (per-request)
// ════════════════════════════════════════════════════════════════

describe('auth() middleware — tenant status enforcement (Phase 1)', () => {
    const makeToken = (payload) => jwt.sign(payload, 'test_secret', { expiresIn: '15m' });

    beforeEach(() => {
        process.env.JWT_ACCESS_SECRET = 'test_secret';
    });

    test('Tenant suspended হলে valid token থাকা সত্ত্বেও 403 TENANT_INACTIVE, next() ডাকা হয় না', async () => {
        getTenantById.mockResolvedValue({ status: 'suspended' });

        const token = makeToken({ userId: 'u1', role: 'admin', status: 'active', tenantId: TENANT_A });
        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TENANT_INACTIVE' }));
        expect(next).not.toHaveBeenCalled();
    });

    test('Tenant active হলে next() ডাকা হয়, req.tenantId সঠিকভাবে সেট হয়', async () => {
        getTenantById.mockResolvedValue({ status: 'active' });

        const token = makeToken({ userId: 'u1', role: 'admin', status: 'active', tenantId: TENANT_A });
        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.tenantId).toBe(TENANT_A);
        expect(res.status).not.toHaveBeenCalledWith(403);
    });

    test('fail-open: getTenantById error হলেও next() ডাকা হয় (ব্লক হয় না)', async () => {
        getTenantById.mockRejectedValue(new Error('DB timeout'));

        const token = makeToken({ userId: 'u1', role: 'admin', status: 'active', tenantId: TENANT_A });
        const req  = { headers: { authorization: `Bearer ${token}` } };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(403);
    });
});

// ════════════════════════════════════════════════════════════════
// ৪. auth.service.js → verifyRefreshToken — Tenant enforcement
// ════════════════════════════════════════════════════════════════

describe('verifyRefreshToken() — tenant status enforcement on refresh (Phase 1)', () => {
    beforeEach(() => {
        process.env.JWT_REFRESH_SECRET = 'refresh_secret';
    });

    const makeRefreshToken = (payload) => jwt.sign(payload, 'refresh_secret', { expiresIn: '7d' });

    test('Tenant suspended হলে refresh token valid থাকা সত্ত্বেও reject হয়', async () => {
        const token = makeRefreshToken({ userId: 'user-1' });

        query
            .mockResolvedValueOnce({ rows: [{ refresh_token: token }] }) // session lookup
            .mockResolvedValueOnce({ rows: [{ ...activeUser }] });       // user lookup

        getTenantById.mockResolvedValue({ status: 'suspended' });

        await expect(verifyRefreshToken(token)).rejects.toThrow(/বন্ধ/);
    });

    test('Tenant active হলে refresh token সফলভাবে verify হয়', async () => {
        const token = makeRefreshToken({ userId: 'user-1' });

        query
            .mockResolvedValueOnce({ rows: [{ refresh_token: token }] })
            .mockResolvedValueOnce({ rows: [{ ...activeUser }] });

        getTenantById.mockResolvedValue({ status: 'active' });

        const user = await verifyRefreshToken(token);
        expect(user.id).toBe('user-1');
    });

    test('fail-open: getTenantById error হলেও refresh সফল হয়', async () => {
        const token = makeRefreshToken({ userId: 'user-1' });

        query
            .mockResolvedValueOnce({ rows: [{ refresh_token: token }] })
            .mockResolvedValueOnce({ rows: [{ ...activeUser }] });

        getTenantById.mockRejectedValue(new Error('DB timeout'));

        const user = await verifyRefreshToken(token);
        expect(user.id).toBe('user-1');
    });
});
