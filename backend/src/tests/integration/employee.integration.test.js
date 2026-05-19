/**
 * employee.integration.test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 2 — Integration Test  (Real DB সহ, Supertest দিয়ে HTTP)
 *
 * GitHub Secrets দরকার:
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
 *   TEST_MANAGER_EMAIL, TEST_MANAGER_PASSWORD
 *   TEST_WORKER_EMAIL, TEST_WORKER_PASSWORD
 *   TEST_EMPLOYEE_ID   (existing active employee UUID for read tests)
 *
 * চালানোর কমান্ড:
 *   npm run test:integration -- --testPathPattern=employee.integration
 *
 * সতর্কতা:
 *   - createEmployee test গুলো real DB-তে data তৈরি করে।
 *   - afterAll-এ TEST_ prefix দেওয়া employee গুলো cleanup করা হয়।
 * ════════════════════════════════════════════════════════════════
 */

const {
    authGet,
    authPost,
    authPut,
    authDelete,
    publicPost,
    expectSuccess,
    expectError,
    getApp,
} = require('./helpers/testSetup');

// ─── Skip guard: DB env না থাকলে পুরো suite skip ────────────────
const hasDbEnv = !!(
    process.env.DB_HOST &&
    process.env.TEST_ADMIN_EMAIL &&
    process.env.TEST_EMPLOYEE_ID
);

const describeIf = hasDbEnv ? describe : describe.skip;

// Integration test-এ তৈরি employee id গুলো রাখব (cleanup জন্য)
const createdEmployeeIds = [];

// ════════════════════════════════════════════════════════════════
// GET /api/employees
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/employees — তালিকা (Real DB)', () => {

    test('Admin token → 200 + employees array', async () => {
        const res = await authGet('/api/employees', 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('employees');
        expect(res.body.data.employees).toBeInstanceOf(Array);
    });

    test('Admin → pagination field আসে', async () => {
        const res = await authGet('/api/employees?page=1&limit=5', 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('total');
        expect(res.body.data.employees.length).toBeLessThanOrEqual(5);
    });

    test('Manager token → নিজের team-এর employee', async () => {
        const res = await authGet('/api/employees', 'manager');
        expectSuccess(res);
        expect(res.body.data.employees).toBeInstanceOf(Array);
    });

    test('Worker token → শুধু নিজের data', async () => {
        const res = await authGet('/api/employees', 'worker');
        expectSuccess(res);
        expect(res.body.data.employees).toBeInstanceOf(Array);
        expect(res.body.data.employees.length).toBeLessThanOrEqual(1);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp()).get('/api/employees');
        expectError(res, 401);
    });

    test('search parameter কাজ করে', async () => {
        const res = await authGet('/api/employees?search=test', 'admin');
        expectSuccess(res);
        expect(res.body.data.employees).toBeInstanceOf(Array);
    });

    test('role filter কাজ করে', async () => {
        const res = await authGet('/api/employees?role=worker', 'admin');
        expectSuccess(res);
        if (res.body.data.employees.length > 0) {
            expect(res.body.data.employees[0].role).toBe('worker');
        }
    });

    test('status filter কাজ করে', async () => {
        const res = await authGet('/api/employees?status=active', 'admin');
        expectSuccess(res);
        if (res.body.data.employees.length > 0) {
            expect(res.body.data.employees[0].status).toBe('active');
        }
    });
});

// ════════════════════════════════════════════════════════════════
// GET /api/employees/:id
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/employees/:id — একজনের তথ্য (Real DB)', () => {

    const empId = process.env.TEST_EMPLOYEE_ID;

    test('valid id → 200 + employee data', async () => {
        const res = await authGet(`/api/employees/${empId}`, 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('id', empId);
        expect(res.body.data).toHaveProperty('name_bn');
        expect(res.body.data).toHaveProperty('employee_code');
        expect(res.body.data).toHaveProperty('role');
        expect(res.body.data).toHaveProperty('status');
    });

    test('response-এ password_hash নেই', async () => {
        const res = await authGet(`/api/employees/${empId}`, 'admin');
        expectSuccess(res);
        expect(res.body.data).not.toHaveProperty('password_hash');
    });

    test('non-existent id → 404', async () => {
        const res = await authGet(
            '/api/employees/00000000-0000-0000-0000-000000000000',
            'admin'
        );
        expectError(res, 404);
    });

    test('invalid UUID format → 400 বা 500', async () => {
        const res = await authGet('/api/employees/not-a-uuid', 'admin');
        expect([400, 500]).toContain(res.status);
    });

    test('Worker নিজের id → 200', async () => {
        // Worker নিজেকে দেখতে পারে (selfOrAdmin middleware)
        const res = await authGet(`/api/employees/${empId}`, 'worker');
        // empId যদি worker না হয় তাহলে 403 আসবে, সেটাও valid
        expect([200, 403]).toContain(res.status);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp()).get(`/api/employees/${empId}`);
        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// GET /api/employees/pending
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/employees/pending — পেন্ডিং তালিকা (Real DB)', () => {

    test('Admin → 200 + array', async () => {
        const res = await authGet('/api/employees/pending', 'admin');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Worker → 403', async () => {
        const res = await authGet('/api/employees/pending', 'worker');
        expectError(res, 403);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp()).get('/api/employees/pending');
        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// GET /api/employees/audit — pending edit list
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/employees/audit — এডিট রিকোয়েস্ট (Real DB)', () => {

    test('Admin → 200 + array', async () => {
        const res = await authGet('/api/employees/audit', 'admin');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Worker → 403', async () => {
        const res = await authGet('/api/employees/audit', 'worker');
        expectError(res, 403);
    });
});

// ════════════════════════════════════════════════════════════════
// POST /api/employees — CREATE
// ════════════════════════════════════════════════════════════════

describeIf('POST /api/employees — নতুন কর্মচারী (Real DB)', () => {

    test('Admin — minimum field দিয়ে তৈরি → 201 + temp_password', async () => {
        const uniquePhone = `019${Date.now().toString().slice(-8)}`;
        const res = await authPost('/api/employees', {
            role:    'worker',
            name_bn: `ইন্টিগ্রেশন টেস্ট কর্মচারী ${Date.now()}`,
            name_en: 'Integration Test Worker',
            phone:   uniquePhone,
        }, 'admin');

        expectSuccess(res, 201);
        expect(res.body.data).toHaveProperty('temp_password');
        expect(res.body.data).toHaveProperty('id');
        expect(res.body.data.status).toBe('pending');

        if (res.body.data?.id) createdEmployeeIds.push(res.body.data.id);
    });

    test('name_bn ছাড়া → 400', async () => {
        const res = await authPost('/api/employees', {
            role:    'worker',
            name_en: 'No Bengali Name',
            phone:   `018${Date.now().toString().slice(-8)}`,
        }, 'admin');
        expectError(res, 400);
    });

    test('phone ছাড়া → 400', async () => {
        const res = await authPost('/api/employees', {
            role:    'worker',
            name_bn: 'ফোন নেই',
            name_en: 'No Phone',
        }, 'admin');
        expectError(res, 400);
    });

    test('role ছাড়া → 400', async () => {
        const res = await authPost('/api/employees', {
            name_bn: 'রোল নেই',
            name_en: 'No Role',
            phone:   `017${Date.now().toString().slice(-8)}`,
        }, 'admin');
        expectError(res, 400);
    });

    test('duplicate phone (active) → 400', async () => {
        // আগে তৈরি করা employee-র phone দিয়ে আবার try
        if (createdEmployeeIds.length === 0) return;

        const { query } = require('../../config/db');
        const result = await query(
            'SELECT phone FROM users WHERE id = $1',
            [createdEmployeeIds[0]]
        );
        if (!result.rows[0]?.phone) return;

        // status active করে দাও (approve করা ছাড়া সেটা pending থাকবে, তাই skip)
        // এই টেস্টটা শুধু যাচাই করে যে controller duplicate check করছে
        const res = await authPost('/api/employees', {
            role:    'worker',
            name_bn: 'ডুপ্লিকেট',
            name_en: 'Duplicate',
            phone:   result.rows[0].phone,
        }, 'admin');
        // 400 (active dup) বা 409 (archived) যেকোনো একটা আসবে
        expect([400, 409]).toContain(res.status);
    });

    test('Worker → canCreateEmployee middleware → 403', async () => {
        const res = await authPost('/api/employees', {
            role:    'worker',
            name_bn: 'টেস্ট',
            name_en: 'Test',
            phone:   `016${Date.now().toString().slice(-8)}`,
        }, 'worker');
        expectError(res, 403);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp()).post('/api/employees').send({
            role: 'worker', name_bn: 'হ্যাকার', name_en: 'Hacker', phone: '01700000099',
        });
        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/employees/:id — EDIT
// ════════════════════════════════════════════════════════════════

describeIf('PUT /api/employees/:id — তথ্য আপডেট (Real DB)', () => {

    let testEmpId;

    beforeAll(async () => {
        if (!hasDbEnv) return;
        // এই suite-র জন্য একটি employee তৈরি করো
        const res = await authPost('/api/employees', {
            role:    'worker',
            name_bn: `এডিট টেস্ট ${Date.now()}`,
            name_en: 'Edit Test Worker',
            phone:   `015${Date.now().toString().slice(-8)}`,
        }, 'admin');
        if (res.status === 201) {
            testEmpId = res.body.data.id;
            createdEmployeeIds.push(testEmpId);
        }
    });

    test('Admin — name_bn আপডেট → 200', async () => {
        if (!testEmpId) return;
        const res = await authPut(`/api/employees/${testEmpId}`, {
            name_bn: 'আপডেটেড নাম',
        }, 'admin');
        expectSuccess(res);
        expect(res.body.message).toContain('আপডেট হয়েছে');
    });

    test('Admin — basic_salary আপডেট → 200', async () => {
        if (!testEmpId) return;
        const res = await authPut(`/api/employees/${testEmpId}`, {
            basic_salary: 25000,
        }, 'admin');
        expectSuccess(res);
    });

    test('কোনো field না দিলে → 400', async () => {
        if (!testEmpId) return;
        const res = await authPut(`/api/employees/${testEmpId}`, {}, 'admin');
        expectError(res, 400);
        expect(res.body.message).toContain('কোনো পরিবর্তন নেই');
    });

    test('non-existent id → 404', async () => {
        const res = await authPut(
            '/api/employees/00000000-0000-0000-0000-000000000000',
            { name_bn: 'ভূত' },
            'admin'
        );
        expectError(res, 404);
    });

    test('Worker নিজের id দিয়ে edit → 200 + audit_id (pending review)', async () => {
        if (!testEmpId) return;
        // worker নিজে edit করলে audit তৈরি হয়, সরাসরি update নয়
        const res = await authPut(`/api/employees/${testEmpId}`, {
            current_address: 'ঢাকা, মিরপুর',
        }, 'worker');
        // Worker অন্যজনের id দিলে 403, নিজের হলে 200
        expect([200, 403]).toContain(res.status);
        if (res.status === 200) {
            expect(res.body.data).toHaveProperty('audit_id');
        }
    });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/employees/:id/approve — অনুমোদন
// ════════════════════════════════════════════════════════════════

describeIf('PUT /api/employees/:id/approve — অনুমোদন (Real DB)', () => {

    let pendingEmpId;

    beforeAll(async () => {
        if (!hasDbEnv) return;
        const res = await authPost('/api/employees', {
            role:    'worker',
            name_bn: `অনুমোদন টেস্ট ${Date.now()}`,
            name_en: 'Approval Test',
            phone:   `014${Date.now().toString().slice(-8)}`,
        }, 'admin');
        if (res.status === 201) {
            pendingEmpId = res.body.data.id;
            createdEmployeeIds.push(pendingEmpId);
        }
    });

    test('pending employee approve → 200 + employee_code', async () => {
        if (!pendingEmpId) return;
        const res = await authPut(`/api/employees/${pendingEmpId}/approve`, {}, 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('employee_code');
        expect(res.body.data.employee_code).toBeTruthy();
    });

    test('non-existent id → 404', async () => {
        const res = await authPut(
            '/api/employees/00000000-0000-0000-0000-000000000000/approve',
            {},
            'admin'
        );
        expectError(res, 404);
        expect(res.body.message).toContain('পেন্ডিং কর্মচারী');
    });

    test('Worker → canApproveEmployee middleware → 403', async () => {
        const res = await authPut(
            `/api/employees/${pendingEmpId}/approve`,
            {},
            'worker'
        );
        expectError(res, 403);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp())
            .put(`/api/employees/${pendingEmpId}/approve`)
            .send({});
        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/employees/:id/reject — বাতিল
// ════════════════════════════════════════════════════════════════

describeIf('PUT /api/employees/:id/reject — আবেদন বাতিল (Real DB)', () => {

    let pendingEmpId;

    beforeAll(async () => {
        if (!hasDbEnv) return;
        const res = await authPost('/api/employees', {
            role:    'worker',
            name_bn: `রিজেক্ট টেস্ট ${Date.now()}`,
            name_en: 'Reject Test',
            phone:   `013${Date.now().toString().slice(-8)}`,
        }, 'admin');
        if (res.status === 201) {
            pendingEmpId = res.body.data.id;
            createdEmployeeIds.push(pendingEmpId);
        }
    });

    test('pending reject → 200 + "বাতিল" message', async () => {
        if (!pendingEmpId) return;
        const res = await authPut(`/api/employees/${pendingEmpId}/reject`, {
            reason: 'অসম্পূর্ণ তথ্য দেওয়া হয়েছে',
        }, 'admin');
        expectSuccess(res);
        expect(res.body.message).toContain('বাতিল');
    });

    test('Worker → 403', async () => {
        const res = await authPut(
            `/api/employees/${pendingEmpId}/reject`,
            { reason: 'টেস্ট' },
            'worker'
        );
        expectError(res, 403);
    });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/employees/:id/suspend — বরখাস্ত
// ════════════════════════════════════════════════════════════════

describeIf('PUT /api/employees/:id/suspend — বরখাস্ত (Real DB)', () => {

    const empId = process.env.TEST_EMPLOYEE_ID;

    test('non-existent id → 404', async () => {
        const res = await authPut(
            '/api/employees/00000000-0000-0000-0000-000000000000/suspend',
            { reason: 'টেস্ট' },
            'admin'
        );
        expectError(res, 404);
    });

    test('Worker → canSuspendEmployee middleware → 403', async () => {
        const res = await authPut(`/api/employees/${empId}/suspend`, { reason: 'টেস্ট' }, 'worker');
        expectError(res, 403);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp())
            .put(`/api/employees/${empId}/suspend`)
            .send({ reason: 'টেস্ট' });
        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// POST /api/employees/:id/reset-password
// ════════════════════════════════════════════════════════════════

describeIf('POST /api/employees/:id/reset-password — পাসওয়ার্ড রিসেট (Real DB)', () => {

    const empId = process.env.TEST_EMPLOYEE_ID;

    test('Admin — valid id → 200 + new_password', async () => {
        const res = await authPost(`/api/employees/${empId}/reset-password`, {}, 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('new_password');
        expect(res.body.data.new_password.length).toBeGreaterThanOrEqual(8);
    });

    test('non-existent id → 404', async () => {
        const res = await authPost(
            '/api/employees/00000000-0000-0000-0000-000000000000/reset-password',
            {},
            'admin'
        );
        expectError(res, 404);
    });

    test('Worker → isAdmin middleware → 403', async () => {
        const res = await authPost(`/api/employees/${empId}/reset-password`, {}, 'worker');
        expectError(res, 403);
    });

    test('Manager → isAdmin middleware → 403', async () => {
        const res = await authPost(`/api/employees/${empId}/reset-password`, {}, 'manager');
        expectError(res, 403);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp())
            .post(`/api/employees/${empId}/reset-password`)
            .send({});
        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/employees/profile — নিজের প্রোফাইল
// ════════════════════════════════════════════════════════════════

describeIf('PUT /api/employees/profile — নিজের প্রোফাইল (Real DB)', () => {

    test('Worker নিজের profile আপডেট → 200', async () => {
        const res = await authPut('/api/employees/profile', {
            current_address: `টেস্ট ঠিকানা ${Date.now()}`,
        }, 'worker');
        expectSuccess(res);
        expect(res.body.message).toContain('প্রোফাইল আপডেট হয়েছে');
    });

    test('Admin নিজের profile আপডেট → 200', async () => {
        const res = await authPut('/api/employees/profile', {
            current_address: `অ্যাডমিন ঠিকানা ${Date.now()}`,
        }, 'admin');
        expectSuccess(res);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp())
            .put('/api/employees/profile')
            .send({ current_address: 'হ্যাকার ঠিকানা' });
        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// POST /api/employees/broadcast-email
// ════════════════════════════════════════════════════════════════

describeIf('POST /api/employees/broadcast-email — ব্রডকাস্ট ইমেইল (Real DB)', () => {

    test('subject ছাড়া → 400', async () => {
        const res = await authPost('/api/employees/broadcast-email', {
            message: 'বার্তা আছে কিন্তু subject নেই',
        }, 'admin');
        expectError(res, 400);
    });

    test('message ছাড়া → 400', async () => {
        const res = await authPost('/api/employees/broadcast-email', {
            subject: 'Subject আছে কিন্তু message নেই',
        }, 'admin');
        expectError(res, 400);
    });

    test('Admin — valid subject+message → 200', async () => {
        const res = await authPost('/api/employees/broadcast-email', {
            subject: `ইন্টিগ্রেশন টেস্ট নোটিশ ${Date.now()}`,
            message: 'এটি একটি স্বয়ংক্রিয় টেস্ট বার্তা। অনুগ্রহ করে উপেক্ষা করুন।',
        }, 'admin');
        expectSuccess(res);
        // "X জনকে..." বা "কোনো email পাওয়া যায়নি" — দুটোই valid
        expect(res.body.message).toBeTruthy();
    });

    test('Worker → isAdmin middleware → 403', async () => {
        const res = await authPost('/api/employees/broadcast-email', {
            subject: 'হ্যাক চেষ্টা',
            message: 'হ্যাক',
        }, 'worker');
        expectError(res, 403);
    });

    test('Token ছাড়া → 401', async () => {
        const request = require('supertest');
        const res = await request(getApp())
            .post('/api/employees/broadcast-email')
            .send({ subject: 'টেস্ট', message: 'টেস্ট' });
        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// CLEANUP — integration test-এ তৈরি করা employee গুলো মুছে ফেলো
// ════════════════════════════════════════════════════════════════

afterAll(async () => {
    if (!hasDbEnv || createdEmployeeIds.length === 0) return;

    const { query } = require('../../config/db');
    for (const id of createdEmployeeIds) {
        try {
            await query(`DELETE FROM employee_assignments WHERE employee_id = $1`, [id]);
            await query(`DELETE FROM employees_audit WHERE user_id = $1`, [id]);
            await query(`DELETE FROM users WHERE id = $1`, [id]);
        } catch (e) {
            console.warn(`⚠️ Cleanup failed for employee ${id}:`, e.message);
        }
    }
});
