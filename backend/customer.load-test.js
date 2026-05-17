/**
 * customer.load-test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 3 — Load Test  (Real Server, Concurrent Requests)
 *
 * বিদ্যমান load-test.js এর pattern অনুসরণ করে।
 * Node.js শুধু লাগবে (jest নয়), তাই Termux-এও চলবে।
 *
 * Environment setup:
 *   export BASE_URL="https://novatechbd-backend.onrender.com"
 *   export TEST_ADMIN_EMAIL="admin@novatech.bd"
 *   export TEST_ADMIN_PASSWORD="AdminPass1"
 *   export TEST_MANAGER_EMAIL="manager@novatech.bd"
 *   export TEST_MANAGER_PASSWORD="ManagerPass1"
 *   export TEST_WORKER_EMAIL="worker@novatech.bd"
 *   export TEST_WORKER_PASSWORD="WorkerPass1"
 *   export TEST_CUSTOMER_ID="<uuid>"
 *   export TEST_ROUTE_ID="<uuid>"
 *
 * চালানোর কমান্ড:
 *   node customer.load-test.js
 *   node customer.load-test.js --concurrency=20 --duration=60
 *
 * ════════════════════════════════════════════════════════════════
 */

const https = require('https');
const http  = require('http');

// ─── CLI args parser ──────────────────────────────────────────────
const args = {};
process.argv.slice(2).forEach(arg => {
    const [key, val] = arg.replace('--', '').split('=');
    args[key] = val;
});

// ─── Config ───────────────────────────────────────────────────────
const BASE_URL     = process.env.BASE_URL  || 'http://localhost:3000';
const CONCURRENCY  = parseInt(args.concurrency || '10', 10);
const DURATION_SEC = parseInt(args.duration    || '30', 10);
const SLOW_MS      = parseInt(args.slow        || '1000', 10); // 1s threshold

const TEST_CUSTOMER_ID = process.env.TEST_CUSTOMER_ID || '';
const TEST_ROUTE_ID    = process.env.TEST_ROUTE_ID    || '';

// ─── Result Tracker ───────────────────────────────────────────────
const results = {
    total:      0,
    passed:     0,
    failed:     0,
    slow:       0,
    errors:     [],
    timings:    {},  // endpoint → [ms, ms, ...]
};

// ─── HTTP Request helper ──────────────────────────────────────────
function httpRequest(method, path, body, token, extraHeaders = {}) {
    return new Promise((resolve) => {
        const url     = new URL(BASE_URL + path);
        const isHttps = url.protocol === 'https:';
        const lib     = isHttps ? https : http;

        const headers = {
            'Content-Type': 'application/json',
            ...extraHeaders,
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const bodyStr = body ? JSON.stringify(body) : null;
        if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

        const options = {
            hostname: url.hostname,
            port:     url.port || (isHttps ? 443 : 80),
            path:     url.pathname + url.search,
            method,
            headers,
        };

        const startTime = Date.now();

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => {
                const duration = Date.now() - startTime;
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, body: parsed, duration, raw: data });
            });
        });

        req.on('error', (err) => {
            resolve({ status: 0, body: null, duration: Date.now() - startTime, error: err.message });
        });

        req.setTimeout(15000, () => {
            req.destroy();
            resolve({ status: 0, body: null, duration: 15000, error: 'TIMEOUT' });
        });

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

// ─── Result recorder ─────────────────────────────────────────────
function record(label, res, expectedStatus = 200) {
    results.total++;
    const ok = res.status === expectedStatus;
    if (ok) results.passed++;
    else     results.failed++;
    if (res.duration >= SLOW_MS) results.slow++;

    if (!results.timings[label]) results.timings[label] = [];
    results.timings[label].push(res.duration);

    if (!ok) {
        results.errors.push({
            label,
            status:   res.status,
            expected: expectedStatus,
            error:    res.error || res.body?.message,
            duration: res.duration,
        });
    }

    return ok;
}

// ─── Stats calculator ─────────────────────────────────────────────
function calcStats(arr) {
    if (!arr || arr.length === 0) return { min: 0, max: 0, avg: 0, p95: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const sum    = sorted.reduce((a, b) => a + b, 0);
    const p95i   = Math.floor(sorted.length * 0.95);
    return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: Math.round(sum / sorted.length),
        p95: sorted[p95i] || sorted[sorted.length - 1],
    };
}

// ─── Token manager ────────────────────────────────────────────────
const tokens = {};

async function login(role) {
    const credentials = {
        admin:   { identifier: process.env.TEST_ADMIN_EMAIL,   password: process.env.TEST_ADMIN_PASSWORD },
        manager: { identifier: process.env.TEST_MANAGER_EMAIL, password: process.env.TEST_MANAGER_PASSWORD },
        worker:  { identifier: process.env.TEST_WORKER_EMAIL,  password: process.env.TEST_WORKER_PASSWORD },
    };

    const creds = credentials[role];
    if (!creds?.identifier) {
        console.error(`❌ ${role} credentials env variable নেই।`);
        return null;
    }

    const res = await httpRequest('POST', '/api/auth/login', creds);
    if (res.status === 200 && res.body?.data?.accessToken) {
        tokens[role] = res.body.data.accessToken;
        console.log(`✅ ${role} login সফল`);
        return tokens[role];
    } else {
        console.error(`❌ ${role} login ব্যর্থ: ${res.status} — ${JSON.stringify(res.body)}`);
        return null;
    }
}

// ════════════════════════════════════════════════════════════════
// LOAD TEST SCENARIOS
// ════════════════════════════════════════════════════════════════

// Scenario 1: GET /api/customers — Customer List
async function loadCustomerList(role = 'admin') {
    const res = await httpRequest('GET', '/api/customers?page=1&limit=20', null, tokens[role]);
    record('GET /customers (list)', res, 200);
}

// Scenario 2: GET /api/customers — GPS সহ
async function loadCustomerListWithGPS() {
    const res = await httpRequest(
        'GET',
        '/api/customers?lat=23.8103&lng=90.4125&limit=20',
        null,
        tokens['worker']
    );
    record('GET /customers (GPS)', res, 200);
}

// Scenario 3: GET /api/customers/:id — Single customer
async function loadGetCustomer() {
    if (!TEST_CUSTOMER_ID) return;
    const res = await httpRequest('GET', `/api/customers/${TEST_CUSTOMER_ID}`, null, tokens['admin']);
    record('GET /customers/:id', res, 200);
}

// Scenario 4: GET /api/customers/:id/history
async function loadCustomerHistory() {
    if (!TEST_CUSTOMER_ID) return;
    const res = await httpRequest(
        'GET',
        `/api/customers/${TEST_CUSTOMER_ID}/history`,
        null,
        tokens['admin']
    );
    record('GET /customers/:id/history', res, 200);
}

// Scenario 5: GET /api/customers/my-count
async function loadMyCount() {
    const res = await httpRequest('GET', '/api/customers/my-count', null, tokens['worker']);
    record('GET /customers/my-count', res, 200);
}

// Scenario 6: GET /api/customers/edit-requests/pending
async function loadPendingEdits() {
    const res = await httpRequest(
        'GET',
        '/api/customers/edit-requests/pending',
        null,
        tokens['admin']
    );
    record('GET /customers/edit-requests/pending', res, 200);
}

// Scenario 7: Search — ILIKE query
async function loadCustomerSearch() {
    const terms = ['আলী', 'রহিম', 'করিম', 'দোকান', 'স্টোর'];
    const term = terms[Math.floor(Math.random() * terms.length)];
    const res = await httpRequest(
        'GET',
        `/api/customers?search=${encodeURIComponent(term)}&limit=10`,
        null,
        tokens['admin']
    );
    record('GET /customers (search)', res, 200);
}

// Scenario 8: Route filter
async function loadCustomerByRoute() {
    if (!TEST_ROUTE_ID) return;
    const res = await httpRequest(
        'GET',
        `/api/customers?route_id=${TEST_ROUTE_ID}&limit=20`,
        null,
        tokens['manager']
    );
    record('GET /customers (route filter)', res, 200);
}

// Scenario 9: POST /api/customers/verify-email/send — OTP throughput
async function loadEmailOTP() {
    const emails = [
        `loadtest1@novatech.test`,
        `loadtest2@novatech.test`,
        `loadtest3@novatech.test`,
    ];
    const email = emails[Math.floor(Math.random() * emails.length)];
    const res = await httpRequest(
        'POST',
        '/api/customers/verify-email/send',
        { email },
        tokens['admin']
    );
    record('POST /verify-email/send', res, 200);
}

// Scenario 10: Worker-role customer list (sub-query filter)
async function loadWorkerCustomerList() {
    const res = await httpRequest('GET', '/api/customers?page=1&limit=10', null, tokens['worker']);
    record('GET /customers (worker role)', res, 200);
}

// Scenario 11: 401 গার্ড যাচাই — token ছাড়া
async function loadUnauthorized() {
    const res = await httpRequest('GET', '/api/customers', null, null);
    record('GET /customers (no token → 401)', res, 401);
}

// ════════════════════════════════════════════════════════════════
// CONCURRENT RUNNER
// ════════════════════════════════════════════════════════════════

/**
 * একটি scenario-কে CONCURRENCY সংখ্যক concurrent request-এ চালাও
 */
async function runConcurrent(scenarioFn, label, count = CONCURRENCY) {
    console.log(`\n  ⚡ ${label} — ${count} concurrent requests...`);
    const promises = Array.from({ length: count }, () => scenarioFn());
    await Promise.allSettled(promises);
}

// ════════════════════════════════════════════════════════════════
// TIME-BASED RUNNER — একটানা N সেকেন্ড চালাও
// ════════════════════════════════════════════════════════════════

async function runForDuration(scenarioFn, label, durationSec) {
    const endTime = Date.now() + durationSec * 1000;
    let count = 0;

    console.log(`\n  ⏱️  ${label} — ${durationSec}s ধরে চালু...`);

    while (Date.now() < endTime) {
        const batch = Array.from({ length: CONCURRENCY }, () => scenarioFn());
        await Promise.allSettled(batch);
        count += CONCURRENCY;
    }

    console.log(`     → ${count} requests সম্পন্ন`);
}

// ════════════════════════════════════════════════════════════════
// FINAL REPORT
// ════════════════════════════════════════════════════════════════

function printReport() {
    const divider = '═'.repeat(60);
    console.log(`\n${divider}`);
    console.log('📊 CUSTOMER LOAD TEST REPORT');
    console.log(divider);
    console.log(`  মোট Requests : ${results.total}`);
    console.log(`  ✅ সফল        : ${results.passed} (${pct(results.passed, results.total)}%)`);
    console.log(`  ❌ ব্যর্থ      : ${results.failed} (${pct(results.failed, results.total)}%)`);
    console.log(`  🐌 ধীর (>${SLOW_MS}ms): ${results.slow} (${pct(results.slow, results.total)}%)`);
    console.log('');

    console.log('📈 RESPONSE TIME (per endpoint):');
    console.log('  ' + '-'.repeat(56));
    console.log('  Endpoint                          Min   Avg   P95   Max');
    console.log('  ' + '-'.repeat(56));

    for (const [label, times] of Object.entries(results.timings)) {
        const s = calcStats(times);
        const name = label.padEnd(34);
        console.log(`  ${name}${pad(s.min)} ${pad(s.avg)} ${pad(s.p95)} ${pad(s.max)}`);
    }

    if (results.errors.length > 0) {
        console.log('\n❗ ERROR DETAILS (প্রথম ১০টি):');
        results.errors.slice(0, 10).forEach((e, i) => {
            console.log(`  ${i + 1}. [${e.label}] HTTP ${e.status} (expected ${e.expected}) — ${e.error || ''} (${e.duration}ms)`);
        });
    }

    console.log(`\n${divider}`);

    // Success rate threshold check
    const successRate = pct(results.passed, results.total);
    if (successRate < 95) {
        console.error(`\n🚨 FAIL: Success rate ${successRate}% < 95% threshold`);
        process.exit(1);
    } else {
        console.log(`\n✅ PASS: Success rate ${successRate}% ≥ 95%`);
    }

    // P95 threshold check
    const allTimes = Object.values(results.timings).flat();
    const globalStats = calcStats(allTimes);
    if (globalStats.p95 > 3000) {
        console.error(`🚨 SLOW: Global P95 ${globalStats.p95}ms > 3000ms threshold`);
        process.exit(1);
    } else {
        console.log(`✅ FAST: Global P95 ${globalStats.p95}ms ≤ 3000ms`);
    }
}

function pct(n, total) {
    if (!total) return 0;
    return Math.round((n / total) * 100);
}

function pad(n) {
    return String(n + 'ms').padStart(6);
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════

async function main() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('🚀 NOVATECH-BD  Customer Module Load Test');
    console.log(`   Target      : ${BASE_URL}`);
    console.log(`   Concurrency : ${CONCURRENCY} requests`);
    console.log(`   Duration    : ${DURATION_SEC}s (time-based scenarios)`);
    console.log(`   Slow threshold: ${SLOW_MS}ms`);
    console.log('════════════════════════════════════════════════════════════\n');

    // ─── Step 1: Login ──────────────────────────────────────────
    console.log('🔐 Step 1: Login (সব role)');
    await login('admin');
    await login('manager');
    await login('worker');

    const adminOk  = !!tokens['admin'];
    const workerOk = !!tokens['worker'];

    if (!adminOk) {
        console.error('❌ Admin login ছাড়া load test চলবে না। বন্ধ করা হচ্ছে।');
        process.exit(1);
    }

    // ─── Step 2: Smoke Tests (প্রতিটি scenario একবার) ────────────
    console.log('\n🔍 Step 2: Smoke Tests (প্রতিটি endpoint একবার)');

    await loadCustomerList('admin');
    await loadGetCustomer();
    await loadCustomerHistory();
    await loadMyCount();
    await loadPendingEdits();
    await loadUnauthorized();

    console.log('  ✔ Smoke tests সম্পন্ন');

    // ─── Step 3: Concurrent Burst Tests ──────────────────────────
    console.log('\n💥 Step 3: Concurrent Burst Tests');

    // Customer list — সবচেয়ে বেশি ব্যবহৃত endpoint
    await runConcurrent(
        () => loadCustomerList('admin'),
        'Admin: GET /customers list',
        CONCURRENCY * 2
    );

    // Worker role (sub-query filter — heavier)
    if (workerOk) {
        await runConcurrent(
            () => loadWorkerCustomerList(),
            'Worker: GET /customers (sub-query filter)',
            CONCURRENCY
        );
    }

    // GPS distance query — PostGIS ব্যবহার করে, তাই আলাদা test
    if (workerOk) {
        await runConcurrent(
            () => loadCustomerListWithGPS(),
            'Worker: GET /customers (GPS + ST_Distance)',
            CONCURRENCY
        );
    }

    // Customer detail
    if (TEST_CUSTOMER_ID) {
        await runConcurrent(
            () => loadGetCustomer(),
            'Admin: GET /customers/:id',
            CONCURRENCY
        );
    }

    // Customer history (complex JOIN query)
    if (TEST_CUSTOMER_ID) {
        await runConcurrent(
            () => loadCustomerHistory(),
            'Admin: GET /customers/:id/history',
            Math.floor(CONCURRENCY / 2)
        );
    }

    // Search — ILIKE, variable terms
    await runConcurrent(
        () => loadCustomerSearch(),
        'Admin: GET /customers?search=...',
        CONCURRENCY
    );

    // Route filter
    if (TEST_ROUTE_ID) {
        await runConcurrent(
            () => loadCustomerByRoute(),
            'Manager: GET /customers?route_id=...',
            CONCURRENCY
        );
    }

    // Email OTP — DB upsert heavy
    await runConcurrent(
        () => loadEmailOTP(),
        'POST /verify-email/send',
        Math.floor(CONCURRENCY / 2)
    );

    // 401 guard — middleware overhead
    await runConcurrent(
        () => loadUnauthorized(),
        'GET /customers (no token → 401)',
        CONCURRENCY
    );

    // ─── Step 4: Sustained Load ───────────────────────────────────
    console.log(`\n⏳ Step 4: Sustained Load (${DURATION_SEC}s)`);

    // সবচেয়ে critical endpoint গুলো sustained load-এ
    const sustainedScenarios = [
        () => loadCustomerList('admin'),
        () => loadCustomerList('manager'),
        workerOk ? () => loadWorkerCustomerList() : null,
        TEST_CUSTOMER_ID ? () => loadGetCustomer() : null,
        () => loadCustomerSearch(),
        () => loadMyCount(),
    ].filter(Boolean);

    await runForDuration(
        async () => {
            const fn = sustainedScenarios[Math.floor(Math.random() * sustainedScenarios.length)];
            await fn();
        },
        'Mixed customer endpoints',
        DURATION_SEC
    );

    // ─── Step 5: Spike Test ───────────────────────────────────────
    console.log(`\n🌊 Step 5: Spike Test (${CONCURRENCY * 5} sudden burst)`);
    await runConcurrent(
        () => loadCustomerList('admin'),
        'Spike: Admin customer list',
        CONCURRENCY * 5
    );

    // ─── Final Report ─────────────────────────────────────────────
    printReport();
}

main().catch(err => {
    console.error('❌ Load test crash:', err);
    process.exit(1);
});
