/**
 * attendance.integration.test.js
 * ─────────────────────────────────────────────────────────────
 * Layer 2 — Integration Test (Real DB)
 * Real Supabase Test DB ব্যবহার করে HTTP endpoint টেস্ট।
 *
 * টেস্ট করা হচ্ছে:
 *   GET  /api/attendance/settings
 *   GET  /api/attendance/my
 *   GET  /api/attendance/today
 *   GET  /api/attendance/all
 *   GET  /api/attendance/monthly
 *   POST /api/attendance/leave/apply
 *   GET  /api/attendance/leave/my
 *   GET  /api/attendance/leave/all
 *   PUT  /api/attendance/leave/:id/review
 *
 * NOTE: checkIn/checkOut সময়-নির্ভর, CI তে সবসময় pass নাও করতে পারে।
 *       তাই এগুলো আলাদা skip করা যায় env দিয়ে।
 * ─────────────────────────────────────────────────────────────
 */

const request = require('supertest');
const {
    getApp,
    authGet,
    authPost,
    authPut,
    expectSuccess,
    expectError,
} = require('./helpers/testSetup');

// ─────────────────────────────────────────────────────────────
// GET /api/attendance/settings
// ─────────────────────────────────────────────────────────────

describe('GET /api/attendance/settings — সেটিংস', () => {

    test('Worker: সেটিংস দেখতে পাবে', async () => {
        const res = await authGet('/api/attendance/settings', 'worker');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('attendance_checkin_start');
        expect(res.body.data).toHaveProperty('attendance_checkin_end');
        expect(res.body.data).toHaveProperty('attendance_popup_cutoff');
    });

    test('Admin: সেটিংস দেখতে পাবে', async () => {
        const res = await authGet('/api/attendance/settings', 'admin');
        expectSuccess(res);
    });

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp()).get('/api/attendance/settings');
        expectError(res, 401);
    });
});

// ─────────────────────────────────────────────────────────────
// GET /api/attendance/my
// ─────────────────────────────────────────────────────────────

describe('GET /api/attendance/my — নিজের হাজিরা', () => {

    test('Worker: নিজের হাজিরা ইতিহাস দেখবে', async () => {
        const res = await authGet('/api/attendance/my', 'worker');
        expectSuccess(res);
        // data = { attendance: [], summary: {}, bonus_progress: {} }
        expect(res.body.data.attendance).toBeInstanceOf(Array);
    });

    test('month, year filter কাজ করে', async () => {
        const res = await authGet('/api/attendance/my?month=1&year=2026', 'worker');
        expectSuccess(res);
    });

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp()).get('/api/attendance/my');
        expectError(res, 401);
    });
});

// ─────────────────────────────────────────────────────────────
// GET /api/attendance/today
// ─────────────────────────────────────────────────────────────

describe('GET /api/attendance/today — আজকের লাইভ হাজিরা', () => {

    test('Manager: দলের আজকের হাজিরা দেখবে', async () => {
        const res = await authGet('/api/attendance/today', 'manager');
        expectSuccess(res);
        // data = { workers: [], summary: {}, date: '' }
        expect(res.body.data.workers).toBeInstanceOf(Array);
    });

    test('Admin: সব worker এর আজকের হাজিরা দেখবে', async () => {
        const res = await authGet('/api/attendance/today', 'admin');
        expectSuccess(res);
    });

    test('Worker: today হাজিরা দেখতে পারবে না — 403', async () => {
        const res = await authGet('/api/attendance/today', 'worker');
        expectError(res, 403);
    });

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp()).get('/api/attendance/today');
        expectError(res, 401);
    });
});

// ─────────────────────────────────────────────────────────────
// GET /api/attendance/all
// ─────────────────────────────────────────────────────────────

describe('GET /api/attendance/all — সব হাজিরা (Admin)', () => {

    test('Admin: সব হাজিরা পাবে', async () => {
        const res = await authGet('/api/attendance/all', 'admin');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Worker: সব হাজিরা দেখতে পারবে না — 403', async () => {
        const res = await authGet('/api/attendance/all', 'worker');
        expectError(res, 403);
    });

    test('Manager: সব হাজিরা দেখতে পারবে না — 403', async () => {
        const res = await authGet('/api/attendance/all', 'manager');
        expectError(res, 403);
    });
});

// ─────────────────────────────────────────────────────────────
// GET /api/attendance/monthly
// ─────────────────────────────────────────────────────────────

describe('GET /api/attendance/monthly — মাসিক রিপোর্ট', () => {

    test('Admin: মাসিক রিপোর্ট পাবে', async () => {
        const res = await authGet('/api/attendance/monthly?month=1&year=2026', 'admin');
        expectSuccess(res);
    });

    test('Manager: নিজের দলের মাসিক রিপোর্ট', async () => {
        const res = await authGet('/api/attendance/monthly?month=1&year=2026', 'manager');
        expectSuccess(res);
    });

    test('Worker: মাসিক রিপোর্ট দেখতে পারবে না — 403', async () => {
        const res = await authGet('/api/attendance/monthly', 'worker');
        expectError(res, 403);
    });
});

// ─────────────────────────────────────────────────────────────
// POST /api/attendance/checkin (সময়-নির্ভর)
// ─────────────────────────────────────────────────────────────

describe('POST /api/attendance/checkin — চেক-ইন', () => {

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp()).post('/api/attendance/checkin').send({});
        expectError(res, 401);
    });

    test('Admin role: চেক-ইন করতে পারবে না — 403', async () => {
        const res = await authPost('/api/attendance/checkin', {}, 'admin');
        expectError(res, 403);
    });

    // সময়ের বাইরে হলে 400, মধ্যে হলে 200 বা 400 (ইতিমধ্যে done)
    test('Worker: চেক-ইন result — 200 বা 400 (সময়/duplicate নির্ভর)', async () => {
        if (process.env.SKIP_CHECKIN_TEST === 'true') return;

        const res = await authPost('/api/attendance/checkin', {
            latitude:  23.8103,
            longitude: 90.4125,
        }, 'worker');

        // ২০০ = সফল, ৪০০ = সময় বাইরে বা duplicate — দুটোই acceptable
        expect([200, 400]).toContain(res.status);
    });
});

// ─────────────────────────────────────────────────────────────
// POST /api/attendance/checkout (সময়-নির্ভর)
// ─────────────────────────────────────────────────────────────

describe('POST /api/attendance/checkout — চেক-আউট', () => {

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp()).post('/api/attendance/checkout').send({});
        expectError(res, 401);
    });

    test('Admin role: চেক-আউট করতে পারবে না — 403', async () => {
        const res = await authPost('/api/attendance/checkout', {}, 'admin');
        expectError(res, 403);
    });

    test('Worker: checkout — 200 বা 400 (চেক-ইন না থাকলে)', async () => {
        if (process.env.SKIP_CHECKIN_TEST === 'true') return;

        const res = await authPost('/api/attendance/checkout', {
            latitude:  23.8103,
            longitude: 90.4125,
        }, 'worker');

        expect([200, 400]).toContain(res.status);
    });
});

// ─────────────────────────────────────────────────────────────
// Leave Application Workflow
// ─────────────────────────────────────────────────────────────

describe('POST /api/attendance/leave/apply — ছুটির আবেদন', () => {

    test('start_date না দিলে 400', async () => {
        const res = await authPost('/api/attendance/leave/apply', {
            end_date: '2026-12-31',
            reason:   'অসুস্থ',
        }, 'worker');
        expectError(res, 400);
    });

    test('end_date < start_date — 400', async () => {
        const res = await authPost('/api/attendance/leave/apply', {
            start_date: '2026-12-31',
            end_date:   '2026-12-01',
            reason:     'অসুস্থ',
        }, 'worker');
        expectError(res, 400);
    });

    test('সঠিক আবেদন — 201', async () => {
        const futureStart = '2026-12-20';
        const futureEnd   = '2026-12-22';

        const res = await authPost('/api/attendance/leave/apply', {
            start_date: futureStart,
            end_date:   futureEnd,
            reason:     'পারিবারিক প্রয়োজন',
        }, 'worker');

        // 201 = নতুন, 400 = overlap (পরীক্ষা চলতে থাকলে)
        expect([201, 400]).toContain(res.status);
    });

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp()).post('/api/attendance/leave/apply').send({
            start_date: '2026-12-20',
            end_date:   '2026-12-22',
        });
        expectError(res, 401);
    });
});

describe('GET /api/attendance/leave/my — নিজের আবেদন', () => {

    test('Worker: নিজের আবেদন তালিকা দেখবে', async () => {
        const res = await authGet('/api/attendance/leave/my', 'worker');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp()).get('/api/attendance/leave/my');
        expectError(res, 401);
    });
});

describe('GET /api/attendance/leave/all — সব আবেদন', () => {

    test('Manager: সব pending আবেদন দেখবে', async () => {
        const res = await authGet('/api/attendance/leave/all', 'manager');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin: সব আবেদন দেখবে', async () => {
        const res = await authGet('/api/attendance/leave/all', 'admin');
        expectSuccess(res);
    });

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp()).get('/api/attendance/leave/all');
        expectError(res, 401);
    });
});

describe('PUT /api/attendance/leave/:id/review — আবেদন রিভিউ', () => {

    test('status না দিলে 400', async () => {
        const res = await authPut('/api/attendance/leave/some-id/review', {}, 'manager');
        expectError(res, 400);
    });

    test('অবৈধ status (approved/rejected ছাড়া) — 400', async () => {
        const res = await authPut('/api/attendance/leave/some-id/review', { status: 'delete' }, 'manager');
        expectError(res, 400);
    });

    test('অজানা leave ID — 404', async () => {
        const res = await authPut(
            '/api/attendance/leave/00000000-0000-0000-0000-000000000000/review',
            { status: 'approved' },
            'manager'
        );
        expectError(res, 404);
    });

    test('Worker: রিভিউ করতে পারবে না — 403', async () => {
        const res = await authPut('/api/attendance/leave/some-id/review', { status: 'approved' }, 'worker');
        expectError(res, 403);
    });

    test('Token ছাড়া — 401', async () => {
        const res = await request(getApp())
            .put('/api/attendance/leave/some-id/review')
            .send({ status: 'approved' });
        expectError(res, 401);
    });
});
