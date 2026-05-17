/**
 * salary.integration.test.js
 * ─────────────────────────────────────────────────────────────
 * Layer 2 — Integration Test (Real DB)
 * Real Supabase Test DB ব্যবহার করে HTTP endpoint টেস্ট।
 *
 * টেস্ট করা হচ্ছে:
 *   GET  /api/salary/sheet
 *   GET  /api/salary/worker/:id
 *   GET  /api/salary/my
 *   POST /api/salary/pay
 *   DELETE /api/salary/payment/:id
 * ─────────────────────────────────────────────────────────────
 */

const {
    authGet,
    authPost,
    authDelete,
    expectSuccess,
    expectError,
} = require('./helpers/testSetup');

// ─────────────────────────────────────────────────────────────
// GET /api/salary/sheet
// ─────────────────────────────────────────────────────────────

describe('GET /api/salary/sheet — বেতন শীট', () => {

    test('Admin: current month-এর শীট আসবে', async () => {
        const res = await authGet('/api/salary/sheet', 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('workers');
        expect(res.body.data).toHaveProperty('pagination');
        expect(res.body.data.workers).toBeInstanceOf(Array);
    });

    test('Admin: specific month-year দিলে সেই মাসের শীট', async () => {
        const res = await authGet('/api/salary/sheet?month=1&year=2026', 'admin');
        expectSuccess(res);
        expect(res.body.data.month).toBe(1);
        expect(res.body.data.year).toBe(2026);
    });

    test('Admin: pagination কাজ করে', async () => {
        const res = await authGet('/api/salary/sheet?page=1&limit=5', 'admin');
        expectSuccess(res);
        expect(res.body.data.pagination.limit).toBe(5);
    });

    test('Worker: salary/sheet access করতে পারবে না — 403', async () => {
        const res = await authGet('/api/salary/sheet', 'worker');
        expectError(res, 403);
    });

    test('Manager: salary/sheet access করতে পারবে না — 403', async () => {
        const res = await authGet('/api/salary/sheet', 'manager');
        expectError(res, 403);
    });

    test('Token ছাড়া — 401', async () => {
        const request = require('supertest');
        const { getApp } = require('./helpers/testSetup');
        const res = await request(getApp()).get('/api/salary/sheet');
        expectError(res, 401);
    });
});

// ─────────────────────────────────────────────────────────────
// GET /api/salary/my
// ─────────────────────────────────────────────────────────────

describe('GET /api/salary/my — নিজের বেতন ইতিহাস', () => {

    test('Worker: নিজের ইতিহাস দেখতে পাবে', async () => {
        const res = await authGet('/api/salary/my', 'worker');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin: নিজের salary/my দেখতে পাবে', async () => {
        const res = await authGet('/api/salary/my', 'admin');
        expectSuccess(res);
    });

    test('Token ছাড়া — 401', async () => {
        const request = require('supertest');
        const { getApp } = require('./helpers/testSetup');
        const res = await request(getApp()).get('/api/salary/my');
        expectError(res, 401);
    });
});

// ─────────────────────────────────────────────────────────────
// GET /api/salary/worker/:id
// ─────────────────────────────────────────────────────────────

describe('GET /api/salary/worker/:id — একজনের বেতন স্লিপ', () => {

    test('Admin: test worker এর বেতন স্লিপ', async () => {
        if (!process.env.TEST_WORKER_ID) return;

        const res = await authGet(`/api/salary/worker/${process.env.TEST_WORKER_ID}`, 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('worker');
        expect(res.body.data).toHaveProperty('attendance');
        expect(res.body.data).toHaveProperty('commission');
        expect(res.body.data).toHaveProperty('net_payable');
    });

    test('Admin: অজানা worker ID — 404', async () => {
        const res = await authGet('/api/salary/worker/00000000-0000-0000-0000-000000000000', 'admin');
        expectError(res, 404);
    });

    test('Worker: অন্যের বেতন স্লিপ দেখতে পারবে না — 403', async () => {
        if (!process.env.TEST_WORKER_ID) return;
        const res = await authGet(`/api/salary/worker/${process.env.TEST_WORKER_ID}`, 'worker');
        expectError(res, 403);
    });
});

// ─────────────────────────────────────────────────────────────
// POST /api/salary/pay
// ─────────────────────────────────────────────────────────────

describe('POST /api/salary/pay — বেতন পরিশোধ', () => {

    test('worker_id না দিলে 400', async () => {
        const res = await authPost('/api/salary/pay', { month: 1, year: 2020 }, 'admin');
        expectError(res, 400);
    });

    test('month না দিলে 400', async () => {
        const res = await authPost('/api/salary/pay', { worker_id: 'some-id', year: 2020 }, 'admin');
        expectError(res, 400);
    });

    test('অজানা worker_id — 404', async () => {
        const res = await authPost('/api/salary/pay', {
            worker_id: '00000000-0000-0000-0000-000000000000',
            month: 1,
            year:  2020,
        }, 'admin');
        expectError(res, 404);
    });

    test('Worker role: বেতন দিতে পারবে না — 403', async () => {
        const res = await authPost('/api/salary/pay', {
            worker_id: 'any-id',
            month: 1,
            year:  2020,
        }, 'worker');
        expectError(res, 403);
    });

    // ⚠️ actual pay test শুধু TEST_WORKER_ID থাকলে এবং ২০২০ সাল (যেখানে কখনো pay হয়নি)
    test('Admin: ইতিমধ্যে পরিশোধ হওয়া মাসে আবার pay — 400', async () => {
        if (!process.env.TEST_ALREADY_PAID_WORKER_ID || !process.env.TEST_ALREADY_PAID_MONTH) return;

        const res = await authPost('/api/salary/pay', {
            worker_id: process.env.TEST_ALREADY_PAID_WORKER_ID,
            month:     parseInt(process.env.TEST_ALREADY_PAID_MONTH),
            year:      parseInt(process.env.TEST_ALREADY_PAID_YEAR || '2025'),
        }, 'admin');
        expectError(res, 400);
        expect(res.body.message).toMatch(/ইতিমধ্যে/);
    });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/salary/payment/:id
// ─────────────────────────────────────────────────────────────

describe('DELETE /api/salary/payment/:id — পরিশোধ বাতিল', () => {

    test('অজানা payment ID — 404', async () => {
        const res = await authDelete('/api/salary/payment/00000000-0000-0000-0000-000000000000', 'admin');
        expectError(res, 404);
    });

    test('Worker: cancel করতে পারবে না — 403', async () => {
        const res = await authDelete('/api/salary/payment/some-id', 'worker');
        expectError(res, 403);
    });

    test('Manager: cancel করতে পারবে না — 403', async () => {
        const res = await authDelete('/api/salary/payment/some-id', 'manager');
        expectError(res, 403);
    });
});
