/**
 * ============================================================
 * Novatech-BD — Salary, Customer, Attendance Load Test
 * ============================================================
 *
 * বিদ্যমান load-test.js এর সাথে মিলিয়ে চালানো যাবে।
 * অথবা আলাদাভাবে:
 *   node load-test-priority.js
 *
 * Environment variables (load-test.js এর মতোই):
 *   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD
 *   TEST_WORKER_EMAIL / TEST_WORKER_PASSWORD
 *   TEST_MANAGER_EMAIL / TEST_MANAGER_PASSWORD
 *   TEST_CUSTOMER_ID   (optional — specific customer test)
 *   TEST_WORKER_ID     (optional — specific worker salary test)
 *   BASE_URL           (default: https://novatechbd-backend.onrender.com)
 *
 * চালানো:
 *   node load-test-priority.js
 * ============================================================
 */

const https = require('https');
const http  = require('http');

const BASE_URL = process.env.BASE_URL || 'https://novatechbd-backend.onrender.com';

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
    return res.status === 200 ? res.body?.data?.accessToken : null;
}

// ─── Helper: check ─────────────────────────────────────────
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// SCENARIO A: Salary — ৫ জন Admin/Accountant একসাথে
// প্রতিজন: salary sheet + worker detail
// ============================================================
async function salaryAdminFlow(adminId) {
    console.log(`\n💰 Salary-Admin-${adminId}: শুরু...`);

    const token = await login(USERS.admin);
    if (!token) {
        results.failed++;
        results.errors.push(`Salary-Admin-${adminId}: Login failed`);
        return;
    }

    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    // ── Step 1: Current month salary sheet ──
    await sleep(200);
    const sheetRes = await request('GET', `/api/salary/sheet?month=${month}&year=${year}&limit=20`, null, token);
    check(`Salary-${adminId}: Sheet (${month}/${year})`, sheetRes.status === 200, sheetRes.duration);

    // ── Step 2: Previous month sheet ──
    await sleep(300);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const prevRes   = await request('GET', `/api/salary/sheet?month=${prevMonth}&year=${prevYear}`, null, token);
    check(`Salary-${adminId}: Prev Sheet (${prevMonth}/${prevYear})`, prevRes.status === 200, prevRes.duration);

    // ── Step 3: Specific worker (TEST_WORKER_ID থাকলে) ──
    if (process.env.TEST_WORKER_ID) {
        await sleep(200);
        const workerRes = await request(
            'GET',
            `/api/salary/worker/${process.env.TEST_WORKER_ID}?month=${month}&year=${year}`,
            null,
            token
        );
        check(`Salary-${adminId}: Worker Detail`, workerRes.status === 200, workerRes.duration);
    }

    // ── Step 4: My salary history ──
    await sleep(200);
    const myRes = await request('GET', '/api/salary/my', null, token);
    check(`Salary-${adminId}: My History`, myRes.status === 200, myRes.duration);

    console.log(`💰 Salary-Admin-${adminId}: শেষ`);
}

// ============================================================
// SCENARIO B: Salary — ২০ জন Worker একসাথে নিজের বেতন দেখছে
// ============================================================
async function salaryWorkerFlow(workerId) {
    console.log(`\n👷 Worker-Salary-${workerId}: শুরু...`);

    const token = await login(USERS.worker);
    if (!token) {
        results.failed++;
        results.errors.push(`Worker-Salary-${workerId}: Login failed`);
        return;
    }

    await sleep(Math.random() * 500); // stagger

    const res = await request('GET', '/api/salary/my', null, token);
    check(`Worker-Salary-${workerId}: My Salary`, res.status === 200, res.duration);

    console.log(`👷 Worker-Salary-${workerId}: শেষ`);
}

// ============================================================
// SCENARIO C: Customer — ১৫ জন Worker একসাথে customer list + detail
// ============================================================
async function customerWorkerFlow(workerId) {
    console.log(`\n🏪 Customer-${workerId}: শুরু...`);

    const token = await login(USERS.worker);
    if (!token) {
        results.failed++;
        results.errors.push(`Customer-${workerId}: Login failed`);
        return;
    }

    await sleep(Math.random() * 300); // stagger

    // ── Step 1: Customer list ──
    const listRes = await request('GET', '/api/customers', null, token);
    check(`Customer-${workerId}: List`, listRes.status === 200, listRes.duration);

    const customers = listRes.body?.data || [];

    // ── Step 2: Specific customer detail ──
    if (customers.length > 0) {
        await sleep(200);
        const customer = customers[Math.floor(Math.random() * Math.min(customers.length, 5))];
        const detailRes = await request('GET', `/api/customers/${customer.id}`, null, token);
        check(`Customer-${workerId}: Detail`, detailRes.status === 200, detailRes.duration);

        // ── Step 3: Customer history ──
        await sleep(200);
        const histRes = await request('GET', `/api/customers/${customer.id}/history`, null, token);
        check(`Customer-${workerId}: History`, histRes.status === 200, histRes.duration);
    }

    // ── Step 4: My customer count ──
    await sleep(200);
    const countRes = await request('GET', '/api/customers/my-count', null, token);
    check(`Customer-${workerId}: My Count`, countRes.status === 200, countRes.duration);

    console.log(`🏪 Customer-${workerId}: শেষ`);
}

// ============================================================
// SCENARIO D: Customer — ৩ জন Manager একসাথে
// credit limit পরিবর্তন + pending edit requests
// ============================================================
async function customerManagerFlow(managerId) {
    console.log(`\n👔 Customer-Manager-${managerId}: শুরু...`);

    const token = await login(USERS.manager);
    if (!token) {
        results.failed++;
        results.errors.push(`Customer-Manager-${managerId}: Login failed`);
        return;
    }

    // ── Step 1: Customer list (Manager scope) ──
    const listRes = await request('GET', '/api/customers', null, token);
    check(`CustMgr-${managerId}: Customer List`, listRes.status === 200, listRes.duration);

    // ── Step 2: Pending edit requests ──
    await sleep(300);
    const editRes = await request('GET', '/api/customers/edit-requests/pending', null, token);
    check(`CustMgr-${managerId}: Edit Requests`, editRes.status === 200, editRes.duration);

    // ── Step 3: Specific customer credit limit update (TEST_CUSTOMER_ID থাকলে) ──
    if (process.env.TEST_CUSTOMER_ID) {
        await sleep(300);
        const limitRes = await request(
            'PUT',
            `/api/customers/${process.env.TEST_CUSTOMER_ID}/credit-limit`,
            { credit_limit: 50000 + managerId * 1000 }, // প্রতিজন একটু আলাদা
            token
        );
        check(
            `CustMgr-${managerId}: Credit Limit`,
            limitRes.status === 200,
            limitRes.duration
        );
    }

    console.log(`👔 Customer-Manager-${managerId}: শেষ`);
}

// ============================================================
// SCENARIO E: Attendance — ২০ জন Worker একসাথে হাজিরা দেখছে
// ============================================================
async function attendanceWorkerFlow(workerId) {
    console.log(`\n📋 Attendance-${workerId}: শুরু...`);

    const token = await login(USERS.worker);
    if (!token) {
        results.failed++;
        results.errors.push(`Attendance-${workerId}: Login failed`);
        return;
    }

    await sleep(Math.random() * 400); // stagger

    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    // ── Step 1: Settings ──
    const settRes = await request('GET', '/api/attendance/settings', null, token);
    check(`Attendance-${workerId}: Settings`, settRes.status === 200, settRes.duration);

    // ── Step 2: My attendance ──
    await sleep(200);
    const myRes = await request('GET', `/api/attendance/my?month=${month}&year=${year}`, null, token);
    check(`Attendance-${workerId}: My Attendance`, myRes.status === 200, myRes.duration);

    // ── Step 3: My leave requests ──
    await sleep(200);
    const leaveRes = await request('GET', '/api/attendance/leave/my', null, token);
    check(`Attendance-${workerId}: My Leaves`, leaveRes.status === 200, leaveRes.duration);

    console.log(`📋 Attendance-${workerId}: শেষ`);
}

// ============================================================
// SCENARIO F: Attendance — ৫ জন Manager একসাথে
// team attendance + monthly report + leave review
// ============================================================
async function attendanceManagerFlow(managerId) {
    console.log(`\n👔 Att-Manager-${managerId}: শুরু...`);

    const token = await login(USERS.manager);
    if (!token) {
        results.failed++;
        results.errors.push(`Att-Manager-${managerId}: Login failed`);
        return;
    }

    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const checks = [
        [`/api/attendance/today`,                          `AttMgr-${managerId}: Today Live`],
        [`/api/attendance/team`,                           `AttMgr-${managerId}: Team`],
        [`/api/attendance/monthly?month=${month}&year=${year}`, `AttMgr-${managerId}: Monthly`],
        [`/api/attendance/leave/all`,                      `AttMgr-${managerId}: All Leaves`],
    ];

    for (const [path, label] of checks) {
        await sleep(300);
        const res = await request('GET', path, null, token);
        check(label, res.status === 200, res.duration);
    }

    console.log(`👔 Att-Manager-${managerId}: শেষ`);
}

// ============================================================
// SCENARIO G: Salary Stress — ১ জন Admin বারবার sheet
// (DB এর aggregate query কতটা দ্রুত?)
// ============================================================
async function salaryStressFlow() {
    console.log('\n🔥 Salary Stress: শুরু...');

    const token = await login(USERS.admin);
    if (!token) {
        results.failed++;
        results.errors.push('Salary Stress: Login failed');
        return;
    }

    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    // ১০ বার consecutive salary sheet request
    for (let i = 1; i <= 10; i++) {
        const res = await request('GET', `/api/salary/sheet?month=${month}&year=${year}`, null, token);
        check(`Salary Stress #${i}`, res.status === 200, res.duration);
        await sleep(100); // ১০০ms gap
    }

    console.log('🔥 Salary Stress: শেষ');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('   🚀 Novatech-BD Priority Load Test (Salary/Customer/Attendance)');
    console.log(`   🌐 Server: ${BASE_URL}`);
    console.log('═══════════════════════════════════════════════════════');

    if (!USERS.admin.identifier || !USERS.worker.identifier || !USERS.manager.identifier) {
        console.error('\n❌ Environment variables সেট করো:\n');
        console.error('   export TEST_ADMIN_EMAIL="admin@example.com"');
        console.error('   export TEST_ADMIN_PASSWORD="AdminPass1"');
        console.error('   export TEST_WORKER_EMAIL="worker@example.com"');
        console.error('   export TEST_WORKER_PASSWORD="WorkerPass1"');
        console.error('   export TEST_MANAGER_EMAIL="manager@example.com"');
        console.error('   export TEST_MANAGER_PASSWORD="ManagerPass1"');
        console.error('\nOptional:');
        console.error('   export TEST_WORKER_ID="<uuid>"');
        console.error('   export TEST_CUSTOMER_ID="<uuid>"');
        console.error('\nতারপর: node load-test-priority.js\n');
        process.exit(1);
    }

    const startTime = Date.now();

    // ── Phase A: Salary Admin (৫ জন) ──────────────────────────
    console.log('\n━━━ Phase A: ৫ জন Admin/Accountant salary sheet দেখছে ━━━');
    await Promise.all(Array.from({ length: 5 }, (_, i) => salaryAdminFlow(i + 1)));

    // ── Phase B: Worker নিজের salary (২০ জন) ─────────────────
    console.log('\n━━━ Phase B: ২০ জন Worker নিজের বেতন দেখছে ━━━');
    await Promise.all(Array.from({ length: 20 }, (_, i) => salaryWorkerFlow(i + 1)));

    // ── Phase C: Customer list + detail (১৫ জন Worker) ───────
    console.log('\n━━━ Phase C: ১৫ জন Worker কাস্টমার list দেখছে ━━━');
    await Promise.all(Array.from({ length: 15 }, (_, i) => customerWorkerFlow(i + 1)));

    // ── Phase D: Customer Manager (৩ জন) ─────────────────────
    console.log('\n━━━ Phase D: ৩ জন Manager customer manage করছে ━━━');
    await Promise.all(Array.from({ length: 3 }, (_, i) => customerManagerFlow(i + 1)));

    // ── Phase E: Attendance Worker (২০ জন) ───────────────────
    console.log('\n━━━ Phase E: ২০ জন Worker হাজিরা দেখছে ━━━');
    await Promise.all(Array.from({ length: 20 }, (_, i) => attendanceWorkerFlow(i + 1)));

    // ── Phase F: Attendance Manager (৫ জন) ───────────────────
    console.log('\n━━━ Phase F: ৫ জন Manager team হাজিরা দেখছে ━━━');
    await Promise.all(Array.from({ length: 5 }, (_, i) => attendanceManagerFlow(i + 1)));

    // ── Phase G: Salary Stress Test ───────────────────────────
    console.log('\n━━━ Phase G: Salary Sheet Stress (১০x consecutive) ━━━');
    await salaryStressFlow();

    // ── Final Report ───────────────────────────────────────────
    const totalTime  = ((Date.now() - startTime) / 1000).toFixed(1);
    const successRate = results.total > 0
        ? ((results.passed / results.total) * 100).toFixed(1)
        : '0.0';

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   📊 FINAL REPORT — Priority Modules');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   মোট Request:    ${results.total}`);
    console.log(`   ✅ Pass:         ${results.passed}`);
    console.log(`   ❌ Fail:         ${results.failed}`);
    console.log(`   ⚠️  Slow (>2s):  ${results.slow}`);
    console.log(`   ⏱️  মোট সময়:    ${totalTime}s`);
    console.log(`   📈 Success Rate: ${successRate}%`);

    if (results.errors.length > 0) {
        console.log('\n   ❌ Failed Requests:');
        [...new Set(results.errors)].forEach(e => console.log(`      • ${e}`));
    }

    // Slow endpoints বিশ্লেষণ
    const slowEndpoints = Object.entries(results.timings)
        .map(([label, times]) => ({
            label,
            avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
            max: Math.max(...times),
            count: times.length,
        }))
        .filter(e => e.avg > 1000)
        .sort((a, b) => b.avg - a.avg);

    if (slowEndpoints.length > 0) {
        console.log('\n   🐢 Slow Endpoints (avg >1s):');
        slowEndpoints.forEach(e =>
            console.log(`      • ${e.label}: avg=${e.avg}ms, max=${e.max}ms (${e.count}x)`)
        );
    } else {
        console.log('\n   🚀 সব endpoint দ্রুত!');
    }

    // Module-wise summary
    console.log('\n   📦 Module-wise Summary:');
    const modules = [
        { name: '💰 Salary',     prefix: ['Salary', 'Worker-Salary'] },
        { name: '🏪 Customer',   prefix: ['Customer', 'CustMgr'] },
        { name: '📋 Attendance', prefix: ['Attendance', 'AttMgr'] },
    ];

    for (const mod of modules) {
        const modEntries = Object.entries(results.timings)
            .filter(([label]) => mod.prefix.some(p => label.startsWith(p)));
        if (modEntries.length === 0) continue;

        const allTimes = modEntries.flatMap(([, times]) => times);
        const avg = Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length);
        const modPassed = modEntries.reduce((sum, [label]) => {
            const isError = results.errors.some(e => e === label);
            return sum + (isError ? 0 : 1);
        }, 0);
        console.log(`      ${mod.name}: avg=${avg}ms, ${modPassed}/${modEntries.length} passed`);
    }

    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(console.error);
