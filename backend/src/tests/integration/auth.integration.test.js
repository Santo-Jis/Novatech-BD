/**
 * auth.integration.test.js
 * ─────────────────────────────────────────────────────────────
 * Auth API এর Integration টেস্ট
 * Real Supabase DB ব্যবহার করে
 *
 * টেস্ট করা হচ্ছে:
 * POST /api/auth/login
 * POST /api/auth/refresh
 * POST /api/auth/logout
 * GET  /api/auth/me
 * ─────────────────────────────────────────────────────────────
 */

const request  = require('supertest');
const {
    getApp,
    publicPost,
    authGet,
    authPost,
    expectSuccess,
    expectError,
} = require('./helpers/testSetup');

// ─── Login ────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {

    test('সঠিক credentials দিলে token পাওয়া যাবে', async () => {
        const res = await publicPost('/api/auth/login', {
            identifier: process.env.TEST_ADMIN_EMAIL,
            password:   process.env.TEST_ADMIN_PASSWORD,
        });

        expectSuccess(res);
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user).toHaveProperty('role');
        // sensitive data login response-এ থাকবে না
        expect(res.body.user).not.toHaveProperty('basic_salary');
        expect(res.body.user).not.toHaveProperty('outstanding_dues');
    });

    test('ভুল password — 401', async () => {
        const res = await publicPost('/api/auth/login', {
            identifier: process.env.TEST_ADMIN_EMAIL,
            password:   'WrongPassword999',
        });
        expectError(res, 401);
    });

    test('অজানা email — 401', async () => {
        const res = await publicPost('/api/auth/login', {
            identifier: 'nobody@novatech.bd',
            password:   'AnyPassword1',
        });
        expectError(res, 401);
    });

    test('identifier না দিলে — 400', async () => {
        const res = await publicPost('/api/auth/login', {
            password: 'SomePassword1',
        });
        expectError(res, 400);
    });

    test('password না দিলে — 400', async () => {
        const res = await publicPost('/api/auth/login', {
            identifier: process.env.TEST_ADMIN_EMAIL,
        });
        expectError(res, 400);
    });

    test('employee code দিয়েও login হবে', async () => {
        // TEST_WORKER_CODE GitHub Secret-এ রাখুন
        if (!process.env.TEST_WORKER_CODE) return;

        const res = await publicPost('/api/auth/login', {
            identifier: process.env.TEST_WORKER_CODE,
            password:   process.env.TEST_WORKER_PASSWORD,
        });
        expectSuccess(res);
        expect(res.body.user.role).toBe('worker');
    });
});

// ─── GET /api/auth/me ─────────────────────────────────────────

describe('GET /api/auth/me', () => {

    test('valid token দিলে user info পাওয়া যাবে', async () => {
        const res = await authGet('/api/auth/me', 'admin');

        expectSuccess(res);
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user).toHaveProperty('name_bn');
        expect(res.body.user).toHaveProperty('role');
    });

    test('token ছাড়া — 401', async () => {
        const res = await request(getApp()).get('/api/auth/me');
        expectError(res, 401);
    });

    test('ভুল token — 401', async () => {
        const res = await request(getApp())
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalidtoken123');
        expectError(res, 401);
    });
});

// ─── POST /api/auth/logout ────────────────────────────────────

describe('POST /api/auth/logout', () => {

    test('login করে logout — সফল হবে', async () => {
        // আলাদা login করি (cache token logout হয়ে যাবে)
        const loginRes = await publicPost('/api/auth/login', {
            identifier: process.env.TEST_WORKER_EMAIL,
            password:   process.env.TEST_WORKER_PASSWORD,
        });
        expect(loginRes.status).toBe(200);

        const token = loginRes.body.accessToken;

        const logoutRes = await request(getApp())
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${token}`);

        expectSuccess(logoutRes);
    });

    test('token ছাড়া logout — 401', async () => {
        const res = await request(getApp()).post('/api/auth/logout');
        expectError(res, 401);
    });
});

// ─── Role-based access ────────────────────────────────────────

describe('Role-based access control', () => {

    test('worker হিসেবে login করলে role = worker', async () => {
        const res = await authGet('/api/auth/me', 'worker');
        expectSuccess(res);
        expect(res.body.user.role).toBe('worker');
    });

    test('manager হিসেবে login করলে role = manager', async () => {
        const res = await authGet('/api/auth/me', 'manager');
        expectSuccess(res);
        expect(res.body.user.role).toBe('manager');
    });
});
