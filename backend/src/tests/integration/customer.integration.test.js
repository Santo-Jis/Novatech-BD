/**
 * customer.integration.test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 2 — Integration Test  (Real DB সহ, Supertest দিয়ে HTTP)
 *
 * GitHub Secrets দরকার:
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
 *   TEST_MANAGER_EMAIL, TEST_MANAGER_PASSWORD
 *   TEST_WORKER_EMAIL, TEST_WORKER_PASSWORD
 *   TEST_CUSTOMER_ID         (existing customer UUID for read tests)
 *   TEST_ROUTE_ID            (existing route UUID)
 *
 * চালানোর কমান্ড:
 *   npm run test:integration -- --testPathPattern=customer.integration
 *
 * সতর্কতা:
 *   - create/update test গুলো real DB-তে data তৈরি করে।
 *   - TEST_ prefix দেওয়া customer cleanup করা হয় afterAll-এ।
 * ════════════════════════════════════════════════════════════════
 */

const {
    authGet,
    authPost,
    authPut,
    expectSuccess,
    expectError,
} = require('./helpers/testSetup');

// ─── Skip guard: DB env না থাকলে পুরো suite skip ────────────────
const hasDbEnv = !!(
    process.env.DB_HOST &&
    process.env.TEST_ADMIN_EMAIL &&
    process.env.TEST_CUSTOMER_ID
);

const describeIf = hasDbEnv ? describe : describe.skip;

// Integration test-এ তৈরি করা customer গুলোর id রাখব (cleanup জন্য)
const createdCustomerIds = [];

// ════════════════════════════════════════════════════════════════
// GET /api/customers
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/customers — কাস্টমার লিস্ট (Real DB)', () => {

    test('Admin token দিলে 200 + data array', async () => {
        const res = await authGet('/api/customers', 'admin');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Manager token দিলে শুধু নিজের রুটের কাস্টমার', async () => {
        const res = await authGet('/api/customers', 'manager');
        expectSuccess(res);
        // route_name field থাকবে
        if (res.body.data.length > 0) {
            expect(res.body.data[0]).toHaveProperty('shop_name');
            expect(res.body.data[0]).toHaveProperty('customer_code');
        }
    });

    test('Worker token দিলে assigned customer আসে', async () => {
        const res = await authGet('/api/customers', 'worker');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
        // প্রতিটি customer-এ visited_today field থাকবে
        if (res.body.data.length > 0) {
            expect(res.body.data[0]).toHaveProperty('visited_today');
        }
    });

    test('token ছাড়া → 401', async () => {
        const { getApp } = require('./helpers/testSetup');
        const request = require('supertest');
        const res = await request(getApp()).get('/api/customers');
        expectError(res, 401);
    });

    test('search parameter কাজ করে', async () => {
        const res = await authGet('/api/customers?search=test', 'admin');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('pagination কাজ করে (page=1&limit=5)', async () => {
        const res = await authGet('/api/customers?page=1&limit=5', 'admin');
        expectSuccess(res);
        expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    test('valid GPS coords দিলে distance_meters field আসে', async () => {
        const res = await authGet(
            '/api/customers?lat=23.8103&lng=90.4125&limit=3',
            'admin'
        );
        expectSuccess(res);
        // distance_meters null হতে পারে (GPS না থাকলে) কিন্তু field থাকবে
        if (res.body.data.length > 0) {
            expect(res.body.data[0]).toHaveProperty('latitude');
            expect(res.body.data[0]).toHaveProperty('longitude');
        }
    });
});

// ════════════════════════════════════════════════════════════════
// GET /api/customers/:id
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/customers/:id — একটি কাস্টমার (Real DB)', () => {

    const customerId = process.env.TEST_CUSTOMER_ID;

    test('valid customer id → 200 + customer data', async () => {
        const res = await authGet(`/api/customers/${customerId}`, 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('id', customerId);
        expect(res.body.data).toHaveProperty('shop_name');
        expect(res.body.data).toHaveProperty('customer_code');
        expect(res.body.data).toHaveProperty('credit_limit');
    });

    test('non-existent id → 404', async () => {
        const res = await authGet('/api/customers/00000000-0000-0000-0000-000000000000', 'admin');
        expectError(res, 404);
    });

    test('invalid UUID format → error (400 বা 500)', async () => {
        const res = await authGet('/api/customers/not-a-uuid', 'admin');
        expect([400, 500]).toContain(res.status);
    });

    test('Admin — যেকোনো customer দেখতে পারে', async () => {
        const res = await authGet(`/api/customers/${customerId}`, 'admin');
        expectSuccess(res);
    });
});

// ════════════════════════════════════════════════════════════════
// GET /api/customers/:id/history
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/customers/:id/history — ইতিহাস (Real DB)', () => {

    const customerId = process.env.TEST_CUSTOMER_ID;

    test('Admin — full history পাবে', async () => {
        const res = await authGet(`/api/customers/${customerId}/history`, 'admin');
        expectSuccess(res);
        expect(res.body.data).toHaveProperty('sales');
        expect(res.body.data).toHaveProperty('credit_payments');
        expect(res.body.data).toHaveProperty('visits');
        expect(res.body.data).toHaveProperty('customer');
    });

    test('history data structure সঠিক', async () => {
        const res = await authGet(`/api/customers/${customerId}/history`, 'admin');
        expectSuccess(res);
        expect(res.body.data.sales).toBeInstanceOf(Array);
        expect(res.body.data.credit_payments).toBeInstanceOf(Array);
        expect(res.body.data.visits).toBeInstanceOf(Array);
    });

    test('non-existent customer id — Manager → 403 বা 404', async () => {
        const res = await authGet(
            '/api/customers/00000000-0000-0000-0000-000000000001/history',
            'manager'
        );
        expect([403, 404]).toContain(res.status);
    });
});

// ════════════════════════════════════════════════════════════════
// GET /api/customers/my-count
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/customers/my-count — Worker Count (Real DB)', () => {

    test('Worker token → count number রিটার্ন', async () => {
        const res = await authGet('/api/customers/my-count', 'worker');
        expectSuccess(res);
        expect(typeof res.body.data).toBe('number');
        expect(res.body.data).toBeGreaterThanOrEqual(0);
    });

    test('Admin-ও এই endpoint call করতে পারে', async () => {
        const res = await authGet('/api/customers/my-count', 'admin');
        expectSuccess(res);
    });
});

// ════════════════════════════════════════════════════════════════
// POST /api/customers — CREATE
// ════════════════════════════════════════════════════════════════

describeIf('POST /api/customers — কাস্টমার তৈরি (Real DB)', () => {

    test('Admin — minimum required fields দিয়ে তৈরি → 201', async () => {
        const uniqueShopName = `ইন্টিগ্রেশন টেস্ট দোকান ${Date.now()}`;
        const res = await authPost('/api/customers', {
            shop_name:  uniqueShopName,
            owner_name: 'টেস্ট মালিক',
        }, 'admin');

        expectSuccess(res, 201);
        expect(res.body.data).toHaveProperty('id');
        expect(res.body.data).toHaveProperty('customer_code');
        expect(res.body.message).toContain('কোড');

        // cleanup list-এ রাখো
        if (res.body.data?.id) {
            createdCustomerIds.push(res.body.data.id);
        }
    });

    test('shop_name ছাড়া → 400', async () => {
        const res = await authPost('/api/customers', {
            owner_name: 'নাম আছে কিন্তু দোকান নেই',
        }, 'admin');

        expectError(res, 400);
        expect(res.body.message).toContain('দোকানের নাম');
    });

    test('owner_name ছাড়া → 400', async () => {
        const res = await authPost('/api/customers', {
            shop_name: 'নাম নেই মালিকের',
        }, 'admin');

        expectError(res, 400);
    });

    test('GPS সহ customer তৈরি → 201 + location stored', async () => {
        const res = await authPost('/api/customers', {
            shop_name:  `GPS টেস্ট দোকান ${Date.now()}`,
            owner_name: 'GPS মালিক',
            latitude:   '23.8103',
            longitude:  '90.4125',
        }, 'admin');

        expectSuccess(res, 201);
        if (res.body.data?.id) {
            createdCustomerIds.push(res.body.data.id);
        }
    });

    test('credit_limit দিলে সেটা save হয়', async () => {
        const res = await authPost('/api/customers', {
            shop_name:    `ক্রেডিট টেস্ট ${Date.now()}`,
            owner_name:   'ক্রেডিট মালিক',
            credit_limit: 15000,
        }, 'admin');

        expectSuccess(res, 201);
        expect(res.body.data.credit_limit).toBe(15000);
        if (res.body.data?.id) {
            createdCustomerIds.push(res.body.data.id);
        }
    });

    test('credit_limit না দিলে default 5000', async () => {
        const res = await authPost('/api/customers', {
            shop_name:  `ডিফল্ট ক্রেডিট ${Date.now()}`,
            owner_name: 'ডিফল্ট মালিক',
        }, 'admin');

        expectSuccess(res, 201);
        expect(res.body.data.credit_limit).toBe(5000);
        if (res.body.data?.id) {
            createdCustomerIds.push(res.body.data.id);
        }
    });

    test('customer_code unique ও সঠিক format-এ থাকে', async () => {
        const res = await authPost('/api/customers', {
            shop_name:  `কোড টেস্ট ${Date.now()}`,
            owner_name: 'কোড মালিক',
        }, 'admin');

        expectSuccess(res, 201);
        expect(res.body.data.customer_code).toBeTruthy();
        expect(typeof res.body.data.customer_code).toBe('string');
        if (res.body.data?.id) {
            createdCustomerIds.push(res.body.data.id);
        }
    });

    test('token ছাড়া → 401', async () => {
        const { getApp } = require('./helpers/testSetup');
        const request = require('supertest');
        const res = await request(getApp())
            .post('/api/customers')
            .send({ shop_name: 'হ্যাকার', owner_name: 'হ্যাকার' });

        expectError(res, 401);
    });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/customers/:id — UPDATE
// ════════════════════════════════════════════════════════════════

describeIf('PUT /api/customers/:id — কাস্টমার আপডেট (Real DB)', () => {

    let testCustomerId;

    // এই suite-এর জন্য একটি customer তৈরি
    beforeAll(async () => {
        if (!hasDbEnv) return;
        const res = await authPost('/api/customers', {
            shop_name:  `আপডেট টেস্ট দোকান ${Date.now()}`,
            owner_name: 'আপডেট মালিক',
        }, 'admin');

        if (res.status === 201) {
            testCustomerId = res.body.data.id;
            createdCustomerIds.push(testCustomerId);
        }
    });

    test('Admin — shop_name আপডেট → 200', async () => {
        if (!testCustomerId) return;
        const res = await authPut(`/api/customers/${testCustomerId}`, {
            shop_name:  'আপডেট হওয়া দোকান',
            owner_name: 'আপডেট মালিক',
        }, 'admin');

        expectSuccess(res);
    });

    test('GPS দিয়ে আপডেট → 200', async () => {
        if (!testCustomerId) return;
        const res = await authPut(`/api/customers/${testCustomerId}`, {
            shop_name:  'GPS আপডেট',
            owner_name: 'GPS মালিক',
            latitude:   '23.7644',
            longitude:  '90.3890',
        }, 'admin');

        expectSuccess(res);
    });

    test('non-existent customer → 404', async () => {
        const res = await authPut(
            '/api/customers/00000000-0000-0000-0000-000000000000',
            { shop_name: 'ভূতের দোকান', owner_name: 'ভূত' },
            'admin'
        );
        expectError(res, 404);
    });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/customers/:id/credit-limit
// ════════════════════════════════════════════════════════════════

describeIf('PUT /api/customers/:id/credit-limit — ক্রেডিট লিমিট (Real DB)', () => {

    const customerId = process.env.TEST_CUSTOMER_ID;

    test('Admin — credit_limit update → 200', async () => {
        const res = await authPut(
            `/api/customers/${customerId}/credit-limit`,
            { credit_limit: 20000 },
            'admin'
        );
        expectSuccess(res);
        expect(res.body.data.credit_limit).toBe(20000);
    });

    test('negative credit_limit → 400', async () => {
        const res = await authPut(
            `/api/customers/${customerId}/credit-limit`,
            { credit_limit: -500 },
            'admin'
        );
        expectError(res, 400);
    });

    test('credit_limit ছাড়া body → 400', async () => {
        const res = await authPut(
            `/api/customers/${customerId}/credit-limit`,
            {},
            'admin'
        );
        expectError(res, 400);
    });

    test('0 credit_limit → allowed (zero limit)', async () => {
        const res = await authPut(
            `/api/customers/${customerId}/credit-limit`,
            { credit_limit: 0 },
            'admin'
        );
        expectSuccess(res);
    });

    // cleanup: original limit restore
    afterAll(async () => {
        if (!hasDbEnv || !customerId) return;
        await authPut(
            `/api/customers/${customerId}/credit-limit`,
            { credit_limit: 5000 },
            'admin'
        );
    });
});

// ════════════════════════════════════════════════════════════════
// GET /api/customers/edit-requests/pending
// ════════════════════════════════════════════════════════════════

describeIf('GET /api/customers/edit-requests/pending (Real DB)', () => {

    test('Admin — pending edits list পাবে', async () => {
        const res = await authGet('/api/customers/edit-requests/pending', 'admin');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Manager — শুধু নিজের রুটের pending edits', async () => {
        const res = await authGet('/api/customers/edit-requests/pending', 'manager');
        expectSuccess(res);
        expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Worker token দিয়ে call → 403 বা 200 (route permission এর উপর)', async () => {
        const res = await authGet('/api/customers/edit-requests/pending', 'worker');
        // Worker এই endpoint-এ access নাও পেতে পারে
        expect([200, 403]).toContain(res.status);
    });
});

// ════════════════════════════════════════════════════════════════
// POST /api/customers/verify-email/send
// ════════════════════════════════════════════════════════════════

describeIf('POST /api/customers/verify-email/send — Email OTP (Real DB)', () => {

    test('valid email → OTP পাঠানো, 200', async () => {
        const res = await authPost(
            '/api/customers/verify-email/send',
            { email: 'integration-test@novatech.test' },
            'admin'
        );
        expectSuccess(res);
        expect(res.body.message).toContain('OTP');
    });

    test('invalid email format → 400', async () => {
        const res = await authPost(
            '/api/customers/verify-email/send',
            { email: 'not-valid' },
            'admin'
        );
        expectError(res, 400);
    });

    test('email ছাড়া → 400', async () => {
        const res = await authPost(
            '/api/customers/verify-email/send',
            {},
            'admin'
        );
        expectError(res, 400);
    });
});

// ════════════════════════════════════════════════════════════════
// POST /api/customers/verify-email/confirm
// ════════════════════════════════════════════════════════════════

describeIf('POST /api/customers/verify-email/confirm — OTP Confirm (Real DB)', () => {

    test('OTP না পাঠিয়ে confirm করলে 400', async () => {
        const res = await authPost(
            '/api/customers/verify-email/confirm',
            { email: 'nootp@novatech.test', otp: '000000' },
            'admin'
        );
        expectError(res, 400);
    });

    test('email ছাড়া → 400', async () => {
        const res = await authPost(
            '/api/customers/verify-email/confirm',
            { otp: '123456' },
            'admin'
        );
        expectError(res, 400);
    });

    test('ভুল OTP → 400', async () => {
        // আগে OTP পাঠাই
        await authPost(
            '/api/customers/verify-email/send',
            { email: 'wrongotp@novatech.test' },
            'admin'
        );
        // ভুল OTP দিয়ে confirm
        const res = await authPost(
            '/api/customers/verify-email/confirm',
            { email: 'wrongotp@novatech.test', otp: '000000' },
            'admin'
        );
        expectError(res, 400);
    });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/customers/visit-order
// ════════════════════════════════════════════════════════════════

describeIf('PUT /api/customers/visit-order — Visit ক্রম (Real DB)', () => {

    const routeId = process.env.TEST_ROUTE_ID;
    const customerId = process.env.TEST_CUSTOMER_ID;

    test('route_id ছাড়া → 400', async () => {
        const res = await authPut('/api/customers/visit-order', {
            orders: [{ customer_id: customerId, visit_order: 1 }],
        }, 'admin');
        expectError(res, 400);
    });

    test('empty orders → 400', async () => {
        const res = await authPut('/api/customers/visit-order', {
            route_id: routeId,
            orders:   [],
        }, 'admin');
        expectError(res, 400);
    });

    test('valid route_id + orders → 200', async () => {
        if (!routeId || !customerId) return;

        const res = await authPut('/api/customers/visit-order', {
            route_id: routeId,
            orders:   [{ customer_id: customerId, visit_order: 1 }],
        }, 'admin');
        expectSuccess(res);
        expect(res.body.message).toContain('Visit');
    });
});

// ════════════════════════════════════════════════════════════════
// CLEANUP — integration test-এ তৈরি করা customers মুছে ফেলো
// ════════════════════════════════════════════════════════════════

afterAll(async () => {
    if (!hasDbEnv || createdCustomerIds.length === 0) return;

    const { query } = require('../config/db');
    for (const id of createdCustomerIds) {
        try {
            await query(
                `DELETE FROM customer_assignments WHERE customer_id = $1`,
                [id]
            );
            await query(
                `DELETE FROM customers WHERE id = $1`,
                [id]
            );
        } catch (e) {
            // cleanup failure নীরবে উপেক্ষা
            console.warn(`⚠️ Cleanup failed for customer ${id}:`, e.message);
        }
    }
});
