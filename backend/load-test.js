/**
 * ============================================================
 * Novatech-BD — Load Test
 * Termux এ চালানো যাবে (শুধু Node.js লাগবে)
 * ============================================================
 *
 * ধাপ ১ — Termux এ চালাও:
 *   pkg install nodejs
 *
 * ধাপ ২ — Environment set করো:
 *   export TEST_ADMIN_EMAIL="admin@example.com"
 *   export TEST_ADMIN_PASSWORD="AdminPass1"
 *   export TEST_WORKER_EMAIL="worker@example.com"
 *   export TEST_WORKER_PASSWORD="WorkerPass1"
 *   export TEST_MANAGER_EMAIL="manager@example.com"
 *   export TEST_MANAGER_PASSWORD="ManagerPass1"
 *   export TEST_PORTAL_TOKEN="<customer_portal_token_from_db>"
 *
 * Customer Portal Token setup (একবার করতে হবে):
 *   Supabase SQL Editor-এ:
 *   UPDATE customer_portal_tokens
 *   SET bound_device_id = '003969ffd38e01145439b34cb31c72d6f80ed85e5dec26be10035fcc457c47cf',
 *       bound_email     = 'loadtest@novatech.test',
 *       token_version   = 1,
 *       expires_at      = NOW() + INTERVAL '30 days'
 *   WHERE customer_id = '<test_customer_id>';
 *
 * ধাপ ৩ — চালাও:
 *   node load-test.js
 *
 * ============================================================
 */

const jwt   = require('jsonwebtoken');
const https = require('https');
const http  = require('http');

// ─── Config ────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'https://novatechbd-backend.onrender.com';

// Customer Portal Load Test Config
const TEST_CUSTOMER_ID    = process.env.TEST_CUSTOMER_ID    || '68734e30-df31-4337-a5cf-a7b813bb415a';
const TEST_CUSTOMER_COUNT = parseInt(process.env.TEST_CUSTOMER_COUNT || '100', 10);
const JWT_PORTAL_SECRET   = process.env.JWT_PORTAL_SECRET;

// Test portal JWT তৈরি করো (login step বাদ — সরাসরি authenticated endpoints টেস্ট)
function makePortalJWT(customerId) {
    if (!JWT_PORTAL_SECRET) return null;
    return jwt.sign(
        { customer_id: customerId, email: 'loadtest@novatech.test',
          google_name: 'Load Test', type: 'customer_portal', token_version: 1 },
        JWT_PORTAL_SECRET,
        { expiresIn: '1h', algorithm: 'HS256' }
    );
}

const USERS = {
    admin:   { identifier: process.env.TEST_ADMIN_EMAIL,   password: process.env.TEST_ADMIN_PASSWORD },
    manager: { identifier: process.env.TEST_MANAGER_EMAIL, password: process.env.TEST_MANAGER_PASSWORD },
    worker:  { identifier: process.env.TEST_WORKER_EMAIL,  password: process.env.TEST_WORKER_PASSWORD },
};

// ─── Result Tracker ────────────────────────────────────────
const results = {
    total:   0,
    passed:  0,
    failed:  0,
    slow:    0,
    errors:  [],
    timings: {},
};

// ─── Helper: HTTP Request ──────────────────────────────────
// extraHeaders — device-login এ custom User-Agent পাঠানোর জন্য
function request(method, path, body, token, extraHeaders = {}) {
    return new Promise((resolve) => {
        const url     = new URL(BASE_URL + path);
        const isHttps = url.protocol === 'https:';
        const lib     = isHttps ? https : http;

        const data    = body ? JSON.stringify(body) : null;
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            ...extraHeaders,
        };

        const start = Date.now();
        const req   = lib.request({
            hostname: url.hostname,
            port:     url.port || (isHttps ? 443 : 80),
            path:     url.pathname + url.search,
            method,
            headers,
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => raw += chunk);
            res.on('end', () => {
                const duration = Date.now() - start;
                let parsed;
                try { parsed = JSON.parse(raw); } catch { parsed = {}; }
                resolve({ status: res.statusCode, body: parsed, duration });
            });
        });

        req.on('error', (err) => {
            resolve({ status: 0, body: {}, duration: 0, error: err.message });
        });

        if (data) req.write(data);
        req.end();
    });
}

// ─── Helper: Login ─────────────────────────────────────────
async function login(user) {
    const res = await request('POST', '/api/auth/login', {
        identifier: user.identifier,
        password:   user.password,
    });
    if (res.status === 200 && res.body?.data?.accessToken) {
        return res.body.data.accessToken;
    }
    return null;
}

// ─── Helper: Check ─────────────────────────────────────────
function check(label, condition, duration) {
    results.total++;
    if (!results.timings[label]) results.timings[label] = [];
    results.timings[label].push(duration);

    if (condition) {
        results.passed++;
        if (duration > 2000) {
            results.slow++;
            console.log(`  ⚠️  SLOW  ${label} (${duration}ms)`);
        } else {
            console.log(`  ✅ PASS  ${label} (${duration}ms)`);
        }
    } else {
        results.failed++;
        results.errors.push(label);
        console.log(`  ❌ FAIL  ${label} (${duration}ms)`);
    }
}

// ─── Helper: sleep ─────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// SCENARIO 1: SR Worker Flow (১০ জন একসাথে)
// ============================================================
async function srWorkerFlow(workerId) {
    console.log(`\n👷 SR-${workerId}: শুরু হচ্ছে...`);

    const loginRes = await request('POST', '/api/auth/login', {
        identifier: USERS.worker.identifier,
        password:   USERS.worker.password,
    });
    check(`SR-${workerId}: Login`, loginRes.status === 200, loginRes.duration);

    const token = loginRes.body?.data?.accessToken;
    if (!token) return;

    const checks = [
        ['/api/auth/me',              'GET',  null,  `SR-${workerId}: /me`],
        ['/api/customers',            'GET',  null,  `SR-${workerId}: Customers`],
        ['/api/orders/today',         'GET',  null,  `SR-${workerId}: Today orders`],
        ['/api/sales/today-summary',  'GET',  null,  `SR-${workerId}: Today summary`],
        ['/api/commission/my',        'GET',  null,  `SR-${workerId}: Commission`],
        ['/api/attendance/my',        'GET',  null,  `SR-${workerId}: Attendance`],
        ['/api/ledger/stock',         'GET',  null,  `SR-${workerId}: Stock`],
    ];

    for (const [path, method, body, label] of checks) {
        const res = await request(method, path, body, token);
        check(label, res.status === 200, res.duration);
        await sleep(300);
    }

    const logoutRes = await request('POST', '/api/auth/logout', null, token);
    check(`SR-${workerId}: Logout`, logoutRes.status === 200, logoutRes.duration);

    console.log(`👷 SR-${workerId}: শেষ`);
}

// ============================================================
// SCENARIO 2: ৫০ জন একসাথে Order দেওয়া
// ============================================================
async function bulkOrderFlow(userId) {
    console.log(`\n🛒 Order-${userId}: শুরু হচ্ছে...`);

    const token = await login(USERS.worker);
    if (!token) {
        results.failed++;
        results.errors.push(`Order-${userId}: Login failed`);
        console.log(`  ❌ Order-${userId}: Login failed`);
        return;
    }

    // Product list
    const prodRes = await request('GET', '/api/products', null, token);
    check(`Order-${userId}: Products`, prodRes.status === 200, prodRes.duration);

    let products = [];
    try { products = prodRes.body?.data || []; } catch {}

    if (products.length === 0) {
        console.log(`  ⚠️  Order-${userId}: কোনো product নেই — order skip`);
        return;
    }

    // Order দাও
    const product  = products[Math.floor(Math.random() * products.length)];
    const qty      = Math.floor(Math.random() * 5) + 1;
    const orderRes = await request('POST', '/api/orders', {
        items: [{ product_id: product.id, qty }]
    }, token);

    check(
        `Order-${userId}: Order create`,
        orderRes.status === 200 || orderRes.status === 201,
        orderRes.duration
    );

    // My orders
    const myRes = await request('GET', '/api/orders/my', null, token);
    check(`Order-${userId}: My orders`, myRes.status === 200, myRes.duration);

    console.log(`🛒 Order-${userId}: শেষ`);
}

// ============================================================
// SCENARIO 3: Manager Flow (৫ জন)
// ============================================================
async function managerFlow(managerId) {
    console.log(`\n👔 Manager-${managerId}: শুরু হচ্ছে...`);

    const token = await login(USERS.manager);
    if (!token) {
        results.failed++;
        results.errors.push(`Manager-${managerId}: Login failed`);
        return;
    }

    const checks = [
        ['/api/orders/pending',        'GET', null, `Manager-${managerId}: Pending orders`],
        ['/api/attendance/today',      'GET', null, `Manager-${managerId}: Team attendance`],
        ['/api/sales/team',            'GET', null, `Manager-${managerId}: Team sales`],
        ['/api/reports/kpi',           'GET', null, `Manager-${managerId}: KPI`],
        ['/api/settlements/pending',   'GET', null, `Manager-${managerId}: Settlements`],
        ['/api/commission/team',       'GET', null, `Manager-${managerId}: Team commission`],
    ];

    for (const [path, method, body, label] of checks) {
        const res = await request(method, path, body, token);
        check(label, res.status === 200, res.duration);
        await sleep(300);
    }

    console.log(`👔 Manager-${managerId}: শেষ`);
}

// ============================================================
// SCENARIO 4: Admin Flow
// ============================================================
async function adminFlow() {
    console.log(`\n🔑 Admin: শুরু হচ্ছে...`);

    const token = await login(USERS.admin);
    if (!token) {
        results.failed++;
        results.errors.push('Admin: Login failed');
        return;
    }

    const checks = [
        ['/api/admin/stats',        'Admin: System stats'],
        ['/api/employees',          'Admin: Employees'],
        ['/api/reports/sales',      'Admin: Sales report'],
        ['/api/reports/commission', 'Admin: Commission report'],
        ['/api/salary/sheet',       'Admin: Salary sheet'],
        ['/api/settlements/all',    'Admin: All settlements'],
        ['/api/reports/credit',     'Admin: Credit report'],
        ['/api/reports/pl',         'Admin: P&L report'],
    ];

    for (const [path, label] of checks) {
        const res = await request('GET', path, null, token);
        check(label, res.status === 200, res.duration);
        await sleep(500);
    }

    console.log(`🔑 Admin: শেষ`);
}

// ============================================================
// SCENARIO 5: ১০০ Customer একসাথে login + order request
//
// DB-তে একটি test token bound করা আছে:
//   device_id  = 'load-test-device'
//   User-Agent = 'Mozilla/5.0'
//   hash       = sha256('load-test-device::Mozilla/5.0')
// ============================================================
async function customerFlow(customerId) {
    console.log(`\n🛍️  Customer-${customerId}: শুরু হচ্ছে...`);

    const portalToken = process.env.TEST_PORTAL_TOKEN;

    if (!portalToken) {
        console.log(`🛍️  Customer-${customerId}: TEST_PORTAL_TOKEN নেই — skip`);
        return;
    }

    // ── Step 1: device-login ───────────────────────────────
    // device_id ও User-Agent fixed — DB bound_device_id এর সাথে match করবে
    const loginRes = await request(
        'POST',
        '/api/portal/device-login',
        { portal_token: portalToken, device_id: 'load-test-device' },
        null,
        { 'User-Agent': 'Mozilla/5.0' }
    );

    check(
        `Customer-${customerId}: Portal Login`,
        loginRes.status === 200,
        loginRes.duration
    );

    const token = loginRes.body?.data?.portal_jwt;
    if (!token) {
        // ❗ error message print করো — debug-এর জন্য
        const errMsg = loginRes.body?.message || loginRes.body?.error_code || JSON.stringify(loginRes.body);
        if (customerId === 1) { // শুধু প্রথমজনের error দেখাই — বাকিগুলো একই হবে
            console.log(`🛍️  Customer-${customerId}: login failed — status=${loginRes.status} msg="${errMsg}"`);
        }
        return;
    }

    // ── Step 2: Dashboard ──────────────────────────────────
    await sleep(200);
    const dashRes = await request('GET', '/api/portal/dashboard', null, token);
    check(`Customer-${customerId}: Dashboard`, dashRes.status === 200, dashRes.duration);

    // ── Step 3: Products দেখো ─────────────────────────────
    await sleep(200);
    const prodRes = await request('GET', '/api/portal/products', null, token);
    check(`Customer-${customerId}: Products`, prodRes.status === 200, prodRes.duration);

    // ── Step 4: Order Request দাও ─────────────────────────
    const products = prodRes.body?.data || [];
    if (products.length > 0) {
        await sleep(200);
        const product  = products[Math.floor(Math.random() * products.length)];
        const orderRes = await request('POST', '/api/portal/order-request', {
            items: [{ product_id: product.id, qty: Math.floor(Math.random() * 3) + 1 }],
            note:  `Load test order from customer ${customerId}`,
        }, token);
        check(
            `Customer-${customerId}: Order Request`,
            orderRes.status === 200 || orderRes.status === 201,
            orderRes.duration
        );
    }

    // ── Step 5: My Order Requests দেখো ───────────────────
    await sleep(200);
    const myOrdersRes = await request('GET', '/api/portal/order-requests', null, token);
    check(`Customer-${customerId}: My Orders`, myOrdersRes.status === 200, myOrdersRes.duration);

    // ── Step 6: Invoices দেখো ─────────────────────────────
    await sleep(200);
    const invoiceRes = await request('GET', '/api/portal/invoices', null, token);
    check(`Customer-${customerId}: Invoices`, invoiceRes.status === 200, invoiceRes.duration);

    console.log(`🛍️  Customer-${customerId}: শেষ`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('   🚀 Novatech-BD Load Test শুরু হচ্ছে');
    console.log(`   🌐 Server: ${BASE_URL}`);
    console.log('═══════════════════════════════════════════════');

    // Credentials চেক
    if (!USERS.admin.identifier || !USERS.worker.identifier || !USERS.manager.identifier) {
        console.error('\n❌ Environment variable সেট করো:\n');
        console.error('   export TEST_ADMIN_EMAIL="admin@example.com"');
        console.error('   export TEST_ADMIN_PASSWORD="AdminPass1"');
        console.error('   export TEST_WORKER_EMAIL="worker@example.com"');
        console.error('   export TEST_WORKER_PASSWORD="WorkerPass1"');
        console.error('   export TEST_MANAGER_EMAIL="manager@example.com"');
        console.error('   export TEST_MANAGER_PASSWORD="ManagerPass1"');
        console.error('\nতারপর: node load-test.js\n');
        process.exit(1);
    }

    const startTime = Date.now();

    // ── Phase 1: ১০ জন SR একসাথে ──────────────────────────
    console.log('\n━━━ Phase 1: ১০ জন SR একসাথে কাজ করছে ━━━');
    await Promise.all(
        Array.from({ length: 10 }, (_, i) => srWorkerFlow(i + 1))
    );

    // ── Phase 2: ৫০ জন একসাথে Order ──────────────────────
    console.log('\n━━━ Phase 2: ৫০ জন একসাথে Order দিচ্ছে ━━━');
    await Promise.all(
        Array.from({ length: 50 }, (_, i) => bulkOrderFlow(i + 1))
    );

    // ── Phase 3: ৫ জন Manager ─────────────────────────────
    console.log('\n━━━ Phase 3: ৫ জন Manager কাজ করছে ━━━');
    await Promise.all(
        Array.from({ length: 5 }, (_, i) => managerFlow(i + 1))
    );

    // ── Phase 4: Admin ─────────────────────────────────────
    console.log('\n━━━ Phase 4: Admin রিপোর্ট দেখছে ━━━');
    await adminFlow();

    // ── Phase 5: ১০০ Customer একসাথে ──────────────────────
    console.log('\n━━━ Phase 5: ১০০ Customer একসাথে login + order ━━━');
    if (!process.env.TEST_PORTAL_TOKEN) {
        console.log('  ⚠️  TEST_PORTAL_TOKEN সেট নেই — customer flow skip');
        console.log('  ℹ️  GitHub Secrets-এ TEST_PORTAL_TOKEN যোগ করো।');
    } else {
        console.log(`  ℹ️  ${TEST_CUSTOMER_COUNT} জন customer একসাথে চলছে...`);
        await Promise.all(
            Array.from({ length: TEST_CUSTOMER_COUNT }, (_, i) => customerFlow(i + 1))
        );
    }

    // ── Final Report ───────────────────────────────────────
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const successRate = ((results.passed / results.total) * 100).toFixed(1);

    console.log('\n═══════════════════════════════════════════════');
    console.log('   📊 FINAL REPORT');
    console.log('═══════════════════════════════════════════════');
    console.log(`   মোট Request:   ${results.total}`);
    console.log(`   ✅ Pass:        ${results.passed}`);
    console.log(`   ❌ Fail:        ${results.failed}`);
    console.log(`   ⚠️  Slow (>2s):  ${results.slow}`);
    console.log(`   ⏱️  মোট সময়:    ${totalTime}s`);
    console.log(`   📈 Success Rate: ${successRate}%`);

    if (results.errors.length > 0) {
        console.log('\n   ❌ Failed Requests:');
        [...new Set(results.errors)].forEach(e => console.log(`      • ${e}`));
    }

    // Slow endpoints
    const slowEndpoints = Object.entries(results.timings)
        .map(([label, times]) => ({
            label,
            avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
            max: Math.max(...times),
        }))
        .filter(e => e.avg > 1000)
        .sort((a, b) => b.avg - a.avg);

    if (slowEndpoints.length > 0) {
        console.log('\n   🐢 Slow Endpoints (avg >1s):');
        slowEndpoints.forEach(e =>
            console.log(`      • ${e.label}: avg=${e.avg}ms, max=${e.max}ms`)
        );
    } else {
        console.log('\n   🚀 সব endpoint দ্রুত!');
    }

    console.log('═══════════════════════════════════════════════\n');

    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(console.error);
