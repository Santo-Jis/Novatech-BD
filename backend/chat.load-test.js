/**
 * chat.load-test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 3 — Chat Load Test (Real Server, Concurrent Requests)
 *
 * customer.load-test.js-এর হুবহু pattern অনুসরণ করে — Node.js শুধু লাগবে
 * (jest নয়), Termux-এও চলবে।
 *
 * ⚠️⚠️ গুরুত্বপূর্ণ সীমাবদ্ধতা, শুরুতেই বলা দরকার:
 * এই টুল শুধু তোমার নিজের Express ব্যাকএন্ড (Node/Postgres)-কে লোড দেয় —
 * chat_threads/chat_messages-এর মতো টেবিলে লেখা কতটা দ্রুত/স্থিতিশীল সেটা
 * মাপে। কিন্তু আসল মেসেজ ডেলিভারি হয় ফ্রন্টএন্ড থেকে সরাসরি Firebase RTDB-তে
 * (এই ব্যাকএন্ডকে বাইপাস করে) — তাই এই টুল দিয়ে RTDB-র নিজের সিলিং সরাসরি
 * মাপা যায় না। RTDB সত্যিই টেস্ট করতে হলে Firebase-এর নিজস্ব REST API
 * (https://<project>.firebaseio.com/path.json) সরাসরি হিট করতে হবে, real
 * auth token দিয়ে — যেটা real Firebase quota/cost খরচ করবে, তাই এই ফাইলে
 * ইচ্ছাকৃতভাবে যোগ করা হয়নি। এটা একটা আলাদা, সচেতন সিদ্ধান্তে করার কাজ।
 *
 * Environment setup:
 *   export BASE_URL="https://zovorix.onrender.com"
 *   export TEST_ADMIN_EMAIL="admin@zovorix.bd"
 *   export TEST_ADMIN_PASSWORD="AdminPass1"
 *   export TEST_WORKER_EMAIL="worker@zovorix.bd"
 *   export TEST_WORKER_PASSWORD="WorkerPass1"
 *   export TEST_THREAD_ID="<uuid>"          # একটা বিদ্যমান chat_threads.id
 *   export TEST_PORTAL_TOKEN="<jwt>"         # ঐচ্ছিক — customer portal token,
 *                                             # না দিলে portal-সাইড scenario স্কিপ হবে
 *
 * চালানোর কমান্ড:
 *   node chat.load-test.js
 *   node chat.load-test.js --concurrency=20 --duration=60
 *
 * ⚠️ প্রোডাকশনে চালানোর আগে ভাবো: এই টেস্ট আসল chat_threads/chat_messages
 * রো তৈরি করবে (notify-এর প্রতিটা কল একটা real dual-write ট্রিগার করে)।
 * প্রথমবার localhost/staging-এ চালানোই নিরাপদ — production-এ চালালে টেস্ট
 * ডেটা জমবে, পরে ম্যানুয়ালি cleanup লাগতে পারে।
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
const SLOW_MS      = parseInt(args.slow        || '1000', 10);

const TEST_THREAD_ID    = process.env.TEST_THREAD_ID    || '';
const TEST_PORTAL_TOKEN = process.env.TEST_PORTAL_TOKEN || '';

// ─── Result Tracker ───────────────────────────────────────────────
const results = { total: 0, passed: 0, failed: 0, slow: 0, errors: [], timings: {} };

// ─── HTTP Request helper (customer.load-test.js থেকে হুবহু) ───────
function httpRequest(method, path, body, token, extraHeaders = {}) {
    return new Promise((resolve) => {
        const url     = new URL(BASE_URL + path);
        const isHttps = url.protocol === 'https:';
        const lib     = isHttps ? https : http;

        const headers = { 'Content-Type': 'application/json', ...extraHeaders };
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
    if (ok) results.passed++; else results.failed++;
    if (res.duration >= SLOW_MS) results.slow++;
    if (!results.timings[label]) results.timings[label] = [];
    results.timings[label].push(res.duration);
    if (!ok) {
        results.errors.push({ label, status: res.status, expected: expectedStatus, error: res.error || res.body?.message, duration: res.duration });
    }
    return ok;
}

function calcStats(arr) {
    if (!arr || arr.length === 0) return { min: 0, max: 0, avg: 0, p95: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const sum    = sorted.reduce((a, b) => a + b, 0);
    const p95i   = Math.floor(sorted.length * 0.95);
    return { min: sorted[0], max: sorted[sorted.length - 1], avg: Math.round(sum / sorted.length), p95: sorted[p95i] || sorted[sorted.length - 1] };
}

// ─── Token manager ────────────────────────────────────────────────
const tokens = {};

async function login(role) {
    const credentials = {
        admin:  { identifier: process.env.TEST_ADMIN_EMAIL,  password: process.env.TEST_ADMIN_PASSWORD },
        worker: { identifier: process.env.TEST_WORKER_EMAIL, password: process.env.TEST_WORKER_PASSWORD },
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
// CHAT LOAD TEST SCENARIOS
// ════════════════════════════════════════════════════════════════

// Scenario 1: GET /api/chat/threads — থ্রেড লিস্ট (staff-সাইডের সবচেয়ে ঘন ঘন এন্ডপয়েন্ট)
async function loadThreadsList(role = 'worker') {
    const res = await httpRequest('GET', '/api/chat/threads?type=personal', null, tokens[role]);
    record('GET /chat/threads', res, 200);
}

// Scenario 2: POST /api/chat/threads/:id/notify — সবচেয়ে ভারী রাইট-পাথ
// (thread update + SLA insert + dual-write insert + push, একটাই কলে)
async function loadNotify() {
    if (!TEST_THREAD_ID) return;
    const res = await httpRequest(
        'POST',
        `/api/chat/threads/${TEST_THREAD_ID}/notify`,
        {
            preview: 'লোড-টেস্ট মেসেজ',
            clientId: `loadtest_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            senderName: 'Load Test',
            text: 'এটা একটা লোড-টেস্ট মেসেজ, chat_messages-এ dual-write ট্রিগার করবে',
            kind: 'text',
        },
        tokens['worker']
    );
    record('POST /chat/threads/:id/notify', res, 200);
}

// Scenario 3: GET /api/chat/search — pg_trgm ফুল-টেক্সট সার্চ
async function loadSearch() {
    const terms = ['ডেলিভারি', 'বাকি', 'অর্ডার', 'সমস্যা', 'ধন্যবাদ'];
    const term = terms[Math.floor(Math.random() * terms.length)];
    const res = await httpRequest('GET', `/api/chat/search?q=${encodeURIComponent(term)}`, null, tokens['admin']);
    record('GET /chat/search', res, 200);
}

// Scenario 4: GET /api/chat/canned-responses — হালকা রিড
async function loadCannedResponses() {
    const res = await httpRequest('GET', '/api/chat/canned-responses', null, tokens['worker']);
    record('GET /chat/canned-responses', res, 200);
}

// Scenario 5: PATCH /api/chat/threads/:id/read — রিড-মার্কিং
async function loadMarkRead() {
    if (!TEST_THREAD_ID) return;
    const res = await httpRequest('PATCH', `/api/chat/threads/${TEST_THREAD_ID}/read`, {}, tokens['worker']);
    record('PATCH /chat/threads/:id/read', res, 200);
}

// Scenario 6: GET /api/chat/sla/stats — SLA ড্যাশবোর্ড (aggregation query)
async function loadSlaStats() {
    const res = await httpRequest('GET', '/api/chat/sla/stats', null, tokens['admin']);
    record('GET /chat/sla/stats', res, 200);
}

// Scenario 7 (ঐচ্ছিক): customer portal notify — TEST_PORTAL_TOKEN দিলেই চলবে
async function loadPortalNotify() {
    if (!TEST_THREAD_ID || !TEST_PORTAL_TOKEN) return;
    const res = await httpRequest(
        'POST',
        `/api/portal/chat/threads/${TEST_THREAD_ID}/notify`,
        { preview: 'পোর্টাল লোড-টেস্ট', clientId: `portal_loadtest_${Date.now()}_${Math.random().toString(36).slice(2)}`, senderName: 'Load Test Customer', text: 'পোর্টাল থেকে লোড-টেস্ট মেসেজ', kind: 'text' },
        TEST_PORTAL_TOKEN
    );
    record('POST /portal/chat/threads/:id/notify', res, 200);
}

// Scenario 8: 401 গার্ড
async function loadUnauthorized() {
    const res = await httpRequest('GET', '/api/chat/threads', null, null);
    record('GET /chat/threads (no token → 401)', res, 401);
}

// ════════════════════════════════════════════════════════════════
// RUNNERS (customer.load-test.js থেকে হুবহু)
// ════════════════════════════════════════════════════════════════

async function runConcurrent(scenarioFn, label, count = CONCURRENCY) {
    console.log(`\n  ⚡ ${label} — ${count} concurrent requests...`);
    const promises = Array.from({ length: count }, () => scenarioFn());
    await Promise.allSettled(promises);
}

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
    console.log('📊 CHAT LOAD TEST REPORT');
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
        console.log(`  ${label.padEnd(34)}${pad(s.min)} ${pad(s.avg)} ${pad(s.p95)} ${pad(s.max)}`);
    }
    if (results.errors.length > 0) {
        console.log('\n❗ ERROR DETAILS (প্রথম ১০টি):');
        results.errors.slice(0, 10).forEach((e, i) => {
            console.log(`  ${i + 1}. [${e.label}] HTTP ${e.status} (expected ${e.expected}) — ${e.error || ''} (${e.duration}ms)`);
        });
    }
    console.log(`\n${divider}`);

    const successRate = pct(results.passed, results.total);
    if (successRate < 95) {
        console.error(`\n🚨 FAIL: Success rate ${successRate}% < 95% threshold`);
        process.exit(1);
    } else {
        console.log(`\n✅ PASS: Success rate ${successRate}% ≥ 95%`);
    }

    const allTimes = Object.values(results.timings).flat();
    const globalStats = calcStats(allTimes);
    if (globalStats.p95 > 3000) {
        console.error(`🚨 SLOW: Global P95 ${globalStats.p95}ms > 3000ms threshold`);
        process.exit(1);
    } else {
        console.log(`✅ FAST: Global P95 ${globalStats.p95}ms ≤ 3000ms`);
    }

    // ⚠️ RTDB নিজে টেস্ট হয়নি — উপরের ফাইল-হেডারে ব্যাখ্যা আছে
    console.log('\nℹ️  মনে রাখবেন: এটা শুধু ব্যাকএন্ড (Node/Postgres) মেপেছে। Firebase RTDB');
    console.log('   (আসল মেসেজ ডেলিভারি) আলাদাভাবে টেস্ট করতে হবে, এই রিপোর্ট সেটা কভার করে না।');
}

function pct(n, total) { if (!total) return 0; return Math.round((n / total) * 100); }
function pad(n) { return String(n + 'ms').padStart(6); }

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════

async function main() {
    console.log('════════════════════════════════════════════════════════════');
    console.log('🚀 ZOVORIX  Chat Module Load Test');
    console.log(`   Target      : ${BASE_URL}`);
    console.log(`   Concurrency : ${CONCURRENCY} requests`);
    console.log(`   Duration    : ${DURATION_SEC}s (time-based scenarios)`);
    console.log(`   Slow threshold: ${SLOW_MS}ms`);
    if (!TEST_THREAD_ID) console.log('   ⚠️  TEST_THREAD_ID নেই — notify/read-mark scenario স্কিপ হবে');
    if (!TEST_PORTAL_TOKEN) console.log('   ⚠️  TEST_PORTAL_TOKEN নেই — portal-সাইড scenario স্কিপ হবে');
    console.log('════════════════════════════════════════════════════════════\n');

    console.log('🔐 Step 1: Login');
    await login('admin');
    await login('worker');
    const adminOk = !!tokens['admin'];
    if (!adminOk) {
        console.error('❌ Admin login ছাড়া load test চলবে না। বন্ধ করা হচ্ছে।');
        process.exit(1);
    }

    console.log('\n🔍 Step 2: Smoke Tests (প্রতিটি endpoint একবার)');
    await loadThreadsList('worker');
    await loadSearch();
    await loadCannedResponses();
    await loadSlaStats();
    await loadMarkRead();
    await loadNotify();
    await loadPortalNotify();
    await loadUnauthorized();
    console.log('  ✔ Smoke tests সম্পন্ন');

    console.log('\n💥 Step 3: Concurrent Burst Tests');
    await runConcurrent(() => loadThreadsList('worker'), 'Worker: GET /chat/threads', CONCURRENCY * 2);
    await runConcurrent(() => loadSearch(), 'Admin: GET /chat/search', CONCURRENCY);
    if (TEST_THREAD_ID) {
        // ⚠️ notify() প্রতিটা কল একটা real chat_messages রো তৈরি করে —
        // সবচেয়ে গুরুত্বপূর্ণ কিন্তু সবচেয়ে বেশি "ডেটা রেখে যায়" এমন scenario
        await runConcurrent(() => loadNotify(), 'Worker: POST /chat/threads/:id/notify', Math.floor(CONCURRENCY / 2));
        await runConcurrent(() => loadMarkRead(), 'Worker: PATCH /chat/threads/:id/read', CONCURRENCY);
    }
    await runConcurrent(() => loadUnauthorized(), 'GET /chat/threads (no token → 401)', CONCURRENCY);

    console.log(`\n⏳ Step 4: Sustained Load (${DURATION_SEC}s)`);
    const sustainedScenarios = [
        () => loadThreadsList('worker'),
        () => loadSearch(),
        () => loadCannedResponses(),
        TEST_THREAD_ID ? () => loadMarkRead() : null,
    ].filter(Boolean);
    await runForDuration(async () => {
        const fn = sustainedScenarios[Math.floor(Math.random() * sustainedScenarios.length)];
        await fn();
    }, 'Mixed chat endpoints (notify বাদে — ডেটা-রাইট সীমিত রাখতে)', DURATION_SEC);

    console.log(`\n🌊 Step 5: Spike Test (${CONCURRENCY * 5} sudden burst)`);
    await runConcurrent(() => loadThreadsList('worker'), 'Spike: Worker thread list', CONCURRENCY * 5);

    printReport();
}

main().catch(err => {
    console.error('❌ Load test crash:', err);
    process.exit(1);
});
