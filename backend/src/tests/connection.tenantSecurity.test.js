/**
 * connection.tenantSecurity.test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 1 — Unit Test  (DB ছাড়া, সব mock)
 *
 * ✅ Phase 2-3 (কোড অডিট — connection পেইজ) — REGRESSION GUARD
 *
 * connection.controller.js ও customerPortalConnection.controller.js
 * cross-tenant identity link আর JWT company-switch হ্যান্ডল করে —
 * প্ল্যাটফর্মের সবচেয়ে sensitive জায়গাগুলোর একটা, অথচ Phase 1-এর আগে
 * এই দুই ফাইলের কোনো টেস্ট ছিল না। এই ফাইলটা বিশেষভাবে এই জিনিসগুলো
 * কভার করে:
 *
 *   ১. Phase 1 প্রাইভেসি ফিক্স: searchPersons-এ discoverable=false
 *      guard যেন আবার bypass না হয়ে যায়।
 *   ২. Phase 1 cooldown ফিক্স: reject-এর পর REJECT_COOLDOWN_HOURS সময়
 *      নতুন রিকোয়েস্ট ব্লক থাকে (staff→customer ও customer→company —
 *      দুই দিকই)।
 *   ৩. switchCompany()-এর cross-tenant isolation: একজন person অন্য
 *      কারো connection_id দিয়ে বা inactive customer হিসেবে সুইচ করতে
 *      না পারে, আর নতুন JWT-তে person_id/customer_id সবসময় সঠিক
 *      অথেন্টিকেটেড person-এরই হয় (accidentally অন্য কারো নয়)।
 *   ৪. Phase 3 'blocked' status: searchPersons/sendConnectionRequest/
 *      requestConnectionToCompany/connectViaQrScan-এ blocked সম্পর্ক
 *      হার্ড-ব্লক করে (cooldown-এর মতো সময়সীমা নেই, qr_code exact
 *      match-ও override করে না)।
 *   ৫. Phase 3 block/unblock direction-matching: company যা ব্লক
 *      করেছে তা customer নিজে unblock করতে পারে না, উল্টোটাও না —
 *      এই guard-টাই সবচেয়ে জরুরি, নইলে block ফিচার অর্থহীন হয়ে যেত।
 *
 * প্লাস regenerateMyQrCode() — Phase 2-এর নতুন এন্ডপয়েন্ট — এর বেসিক
 * কভারেজ।
 *
 * স্কোপ নোট: ensureCustomerForPerson (এখন services/customerConnection.
 * service.js-এ শেয়ার্ড) নিজে এখানে সরাসরি টেস্ট করা হয়নি — সেই লজিক
 * Phase 2-এ শুধু *সরানো* হয়েছে, আচরণ বদলায়নি। ওটার জন্য দরকার হলে
 * customer.controller.test.js-এর প্যাটার্নে (employee.service ও
 * tenantLimits.service মক করে) আলাদা service-level টেস্ট যোগ করা যায়।
 *
 * চালানোর কমান্ড:
 *   npm run test:unit -- --testPathPattern=connection.tenantSecurity
 * ════════════════════════════════════════════════════════════════
 */

const jwt = require('jsonwebtoken');

// ─── TOP-LEVEL MOCKS ──────────────────────────────────────────────
jest.mock('../config/db', () => ({
    query:           jest.fn(),
    withTransaction: jest.fn(),
}));

// ✅ Phase 4: portalWhatsapp.service.js হিট করলে axios দিয়ে সত্যিকারের
// Baileys গেটওয়েতে HTTP কল যেত (CI-তে গেটওয়ে থাকে না — hang/fail করত)।
// মক করে দেওয়া হলো যাতে টেস্ট ডিটারমিনিস্টিক ও নেটওয়ার্ক-মুক্ত থাকে।
jest.mock('../services/portalWhatsapp.service', () => ({
    sendPortalWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));

// ─── IMPORTS (mock এর পরে) ────────────────────────────────────────
const { query } = require('../config/db');
const { sendPortalWhatsAppMessage } = require('../services/portalWhatsapp.service');

const {
    searchPersons,
    sendConnectionRequest,
    connectViaQrScan,
    acceptConnection,
    rejectConnection,
    blockConnection,
    unblockConnection,
} = require('../controllers/connection.controller');

const {
    requestConnectionToCompany,
    switchCompany,
    regenerateMyQrCode,
    blockCompanyConnection,
    unblockCompanyConnection,
    getMyBlockedCompanies,
} = require('../controllers/customerPortalConnection.controller');

// ─── Helpers ──────────────────────────────────────────────────────
const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    return res;
};

const TENANT_A   = 'tenant-A-uuid';
const PERSON_ID  = 'person-rahim-uuid';
const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
    jest.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════
// ১. searchPersons() — discoverable প্রাইভেসি গার্ড (Phase 1 regression guard)
// ════════════════════════════════════════════════════════════════

describe('searchPersons() — discoverable প্রাইভেসি গার্ড (Phase 1 regression guard)', () => {
    test('SQL-এ discoverable guard আছে — bypass করে fuzzy match হয় না', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const req = { query: { q: '017' }, tenantId: TENANT_A };
        const res = mockRes();
        await searchPersons(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        // ✅ regression guard: এই bracket সরে গেলে discoverable=false
        // ব্যক্তিরা আবার global phone/name সার্চে unmasked ফিরে আসবে।
        expect(sql).toContain(
            "AND (p.discoverable = true OR ccc.status IN ('pending','connected'))"
        );
        expect(sql).toContain('WHERE p.qr_code = $3');
    });

    test('params — [%q%, tenantId, q] ঠিক ক্রমে ও মানে যায়', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const req = { query: { q: '01700000001' }, tenantId: TENANT_A };
        const res = mockRes();
        await searchPersons(req, res);

        expect(query.mock.calls[0][1]).toEqual(['%01700000001%', TENANT_A, '01700000001']);
    });

    test('৩ অক্ষরের কম দিলে — 400, query() ডাকা হয় না', async () => {
        const req = { query: { q: 'ab' }, tenantId: TENANT_A };
        const res = mockRes();
        await searchPersons(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(query).not.toHaveBeenCalled();
    });

    test('ম্যাচ পাওয়া গেলে — 200 এ ডেটা ফেরত দেয়', async () => {
        const rows = [{ id: 'p1', full_name: 'রহিম', phone: '01700000001' }];
        query.mockResolvedValueOnce({ rows });
        const req = { query: { q: '01700000001' }, tenantId: TENANT_A };
        const res = mockRes();
        await searchPersons(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true, data: rows });
    });

    test('DB এরর হলে — 500', async () => {
        query.mockRejectedValueOnce(new Error('db down'));
        const req = { query: { q: 'search' }, tenantId: TENANT_A };
        const res = mockRes();
        await searchPersons(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// ২. reject-cooldown — staff→customer ও customer→company দুই দিকই
//    (Phase 1 regression guard)
// ════════════════════════════════════════════════════════════════

describe('sendConnectionRequest() [staff→customer] — reject cooldown (Phase 1 regression guard)', () => {
    test('dup-check SQL-এ rejected-cooldown clause আছে, param REJECT_COOLDOWN_HOURS=24', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'conn-1' }] });
        const req = { body: { person_id: 'person-1' }, tenantId: TENANT_A, user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        // ✅ regression guard: cooldown windowটা যেন কেউ ভুলে সরিয়ে না দেয়
        expect(sql).toContain(
            "OR (status = 'rejected' AND COALESCE(responded_at, created_at) > NOW() - make_interval(hours => $3))"
        );
        expect(sql).toContain('ORDER BY created_at DESC');

        expect(query.mock.calls[0][1]).toEqual(['person-1', TENANT_A, 24]);
    });

    test('সম্প্রতি rejected থাকলে — 429, insert হয় না', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'old-conn', status: 'rejected' }] });
        const req = { body: { person_id: 'person-1' }, tenantId: TENANT_A, user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(429);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('আগে থেকে pending থাকলে — 409 "আগে থেকেই পাঠানো আছে"', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'x', status: 'pending' }] });
        const req = { body: { person_id: 'person-1' }, tenantId: TENANT_A, user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'রিকোয়েস্ট আগে থেকেই পাঠানো আছে।' })
        );
    });

    test('আগে থেকে connected থাকলে — 409 "ইতিমধ্যে সংযুক্ত"', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'x', status: 'connected' }] });
        const req = { body: { person_id: 'person-1' }, tenantId: TENANT_A, user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'ইতিমধ্যে সংযুক্ত।' })
        );
    });

    test('dup না থাকলে — নতুন request তৈরি হয় (201), correct params দিয়ে', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'new-conn' }] });
        const req = { body: { person_id: 'person-1' }, tenantId: TENANT_A, user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(query.mock.calls[1][1]).toEqual(['person-1', TENANT_A, 'staff-1']);
    });
});

describe('requestConnectionToCompany() [customer→company] — একই cooldown (Phase 1 regression guard)', () => {
    test('dup-check SQL ও params — sendConnectionRequest-এর সাথে সামঞ্জস্যপূর্ণ', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'conn-2' }] });
        const req = { body: { tenant_id: 'tenant-X' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await requestConnectionToCompany(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        expect(sql).toContain(
            "OR (status = 'rejected' AND COALESCE(responded_at, created_at) > NOW() - make_interval(hours => $3))"
        );
        expect(query.mock.calls[0][1]).toEqual([PERSON_ID, 'tenant-X', 24]);
    });

    test('কোম্পানি সম্প্রতি reject করলে — 429', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'x', status: 'rejected' }] });
        const req = { body: { tenant_id: 'tenant-X' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await requestConnectionToCompany(req, res);

        expect(res.status).toHaveBeenCalledWith(429);
    });
});

// ════════════════════════════════════════════════════════════════
// ৩. getPersonId() — backward-compatible person resolution
//    (বিদ্যমান লজিক, নতুন regression guard হিসেবে কভার করা হলো)
// ════════════════════════════════════════════════════════════════

describe('getPersonId() [via requestConnectionToCompany] — backward-compatible resolution', () => {
    test('নতুন token (person_id সরাসরি JWT-তে) — extra DB lookup ছাড়াই ব্যবহার হয়', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'conn-3' }] });
        const req = { body: { tenant_id: 't1' }, portalUser: { person_id: 'person-direct' } };
        const res = mockRes();
        await requestConnectionToCompany(req, res);

        // প্রথম query() কলই dup-check — অতিরিক্ত person-lookup কল নেই
        expect(query.mock.calls[0][1][0]).toBe('person-direct');
    });

    test('পুরনো token (শুধু customer_id) — customers টেবিল থেকে fallback lookup করে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ person_id: 'person-from-db' }] }) // getPersonId lookup
            .mockResolvedValueOnce({ rows: [] })                               // dup-check
            .mockResolvedValueOnce({ rows: [{ id: 'conn-4' }] });              // insert

        const req = { body: { tenant_id: 't1' }, portalUser: { customer_id: 'cust-old' } };
        const res = mockRes();
        await requestConnectionToCompany(req, res);

        expect(query.mock.calls[0][0]).toContain('SELECT person_id FROM customers WHERE id = $1');
        expect(query.mock.calls[0][1]).toEqual(['cust-old']);
        // resolved person_id-ই dup-check-এ ব্যবহৃত হয়েছে
        expect(query.mock.calls[1][1][0]).toBe('person-from-db');
    });

    test('person_id ও customer_id দুটোই না থাকলে — PERSON_NOT_LINKED → 404, query() ডাকা হয় না', async () => {
        const req = { body: { tenant_id: 't1' }, portalUser: {} };
        const res = mockRes();
        await requestConnectionToCompany(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(query).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// ৪. switchCompany() — cross-tenant isolation ও JWT company-switch
//    (সবচেয়ে sensitive অংশ — মূল ফোকাস)
// ════════════════════════════════════════════════════════════════

describe('switchCompany() — cross-tenant isolation ও JWT company-switch', () => {
    let originalSecret;
    beforeEach(() => {
        originalSecret = process.env.JWT_PORTAL_SECRET;
    });
    afterEach(() => {
        process.env.JWT_PORTAL_SECRET = originalSecret;
    });

    test('SQL regression guard — ccc.person_id = $2 AND ccc.status = \'connected\' bracket ঠিক আছে', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const req = { body: { connection_id: 'conn-1' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await switchCompany(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        // ✅ মূল isolation guard: connection_id-টা যেন requesting person-এরই হয়,
        // অন্য কারো connection_id দিয়ে switch করা না যায়
        expect(sql).toContain("WHERE ccc.id = $1 AND ccc.person_id = $2 AND ccc.status = 'connected'");
        expect(query.mock.calls[0][1]).toEqual(['conn-1', PERSON_ID]);
    });

    test('অন্য কারো connection_id (বা ভুল id) — কোনো row মেলে না → 403, cookie সেট হয় না', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const req = { body: { connection_id: 'someone-elses-conn' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await switchCompany(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'এই কোম্পানিতে আপনার অ্যাক্সেস নেই।' })
        );
        expect(res.cookie).not.toHaveBeenCalled();
    });

    test('টার্গেট customer is_active=false — 403, cookie সেট হয় না', async () => {
        query.mockResolvedValueOnce({
            rows: [{ target_customer_id: 'cust-B', customer_code: 'C-002', is_active: false, token_version: 1, company_name: 'কোম্পানি বি' }],
        });
        const req = { body: { connection_id: 'conn-1' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await switchCompany(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.cookie).not.toHaveBeenCalled();
    });

    test('JWT_PORTAL_SECRET সেট না থাকলে — 500, token ইস্যু হয় না', async () => {
        query.mockResolvedValueOnce({
            rows: [{ target_customer_id: 'cust-B', customer_code: 'C-002', is_active: true, token_version: 1, company_name: 'কোম্পানি বি' }],
        });
        delete process.env.JWT_PORTAL_SECRET;

        const req = { body: { connection_id: 'conn-1' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await switchCompany(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.cookie).not.toHaveBeenCalled();
    });

    test('সফল switch — নতুন portal_jwt-এর payload-এ সঠিক person_id/customer_id (cross-tenant leak guard)', async () => {
        query.mockResolvedValueOnce({
            rows: [{ target_customer_id: 'cust-B', customer_code: 'C-002', is_active: true, token_version: 3, company_name: 'কোম্পানি বি' }],
        });
        const req = { body: { connection_id: 'conn-1' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await switchCompany(req, res);

        expect(res.status).not.toHaveBeenCalled(); // success path-এ status() ডাকা হয় না, শুধু json()

        const jsonArg = res.json.mock.calls[0][0];
        expect(jsonArg.data.customer_id).toBe('cust-B');

        // ✅ মূল guard: নতুন token-এ person_id ঠিক এই request-এর অথেন্টিকেটেড
        // person-এরই — অন্য কারো নয়। এটাই cross-tenant/cross-person leak ঠেকায়।
        const decoded = jwt.verify(jsonArg.data.portal_jwt, process.env.JWT_PORTAL_SECRET);
        expect(decoded.person_id).toBe(PERSON_ID);
        expect(decoded.customer_id).toBe('cust-B');
        expect(decoded.token_version).toBe(3);
        expect(decoded.type).toBe('customer_portal');
    });

    test('সফল switch — refresh cookie নতুন কোম্পানির জন্য পুনরায় ইস্যু হয় (Session 12 regression guard)', async () => {
        query.mockResolvedValueOnce({
            rows: [{ target_customer_id: 'cust-B', customer_code: 'C-002', is_active: true, token_version: 1, company_name: 'কোম্পানি বি' }],
        });
        const req = { body: { connection_id: 'conn-1' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await switchCompany(req, res);

        expect(res.cookie).toHaveBeenCalledWith(
            'portal_rt',
            expect.any(String),
            expect.objectContaining({ httpOnly: true, path: '/api/portal' })
        );

        const refreshToken   = res.cookie.mock.calls[0][1];
        const decodedRefresh = jwt.verify(refreshToken, process.env.JWT_PORTAL_SECRET);
        expect(decodedRefresh.person_id).toBe(PERSON_ID);
        expect(decodedRefresh.customer_id).toBe('cust-B');
        expect(decodedRefresh.type).toBe('customer_portal_refresh');
    });

    test('connection_id না দিলে — 400, query() ডাকা হয় না', async () => {
        const req = { body: {}, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await switchCompany(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(query).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// ৫. regenerateMyQrCode() — নতুন এন্ডপয়েন্ট (Phase 2)
// ════════════════════════════════════════════════════════════════

describe('regenerateMyQrCode() — নতুন QR কোড ইস্যু (Phase 2)', () => {
    test('সফল রিজেনারেট — UUID-ফরম্যাট নতুন qr_code দিয়ে persons row আপডেট হয়', async () => {
        query.mockResolvedValueOnce({ rows: [{ qr_code: 'new-uuid-value', full_name: 'রহিম', discoverable: true }] });
        const req = { portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await regenerateMyQrCode(req, res);

        expect(query.mock.calls[0][0]).toContain('UPDATE persons SET qr_code = $1 WHERE id = $2');
        const [newCode, personIdParam] = query.mock.calls[0][1];
        expect(newCode).toMatch(UUID_RE);
        expect(personIdParam).toBe(PERSON_ID);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('unique_violation (23505) — retry করে দ্বিতীয় চেষ্টায় সফল হয়', async () => {
        const collision = new Error('duplicate key value violates unique constraint');
        collision.code = '23505';
        query
            .mockRejectedValueOnce(collision)
            .mockResolvedValueOnce({ rows: [{ qr_code: 'second-try-uuid', full_name: 'রহিম', discoverable: true }] });

        const req = { portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await regenerateMyQrCode(req, res);

        expect(query).toHaveBeenCalledTimes(2);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(res.status).not.toHaveBeenCalledWith(500);
    });

    test('বারবার unique_violation (৩ বারই, MAX_ATTEMPTS) — শেষে 500', async () => {
        const collision = new Error('duplicate key value violates unique constraint');
        collision.code = '23505';
        query.mockRejectedValue(collision); // সব call-এই কলিশন

        const req = { portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await regenerateMyQrCode(req, res);

        expect(query).toHaveBeenCalledTimes(3);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    test('অন্য (non-collision) DB এরর — সাথে সাথেই থামে, retry হয় না', async () => {
        query.mockRejectedValueOnce(new Error('connection terminated'));
        const req = { portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await regenerateMyQrCode(req, res);

        expect(query).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    test('প্রোফাইল লিংক না থাকলে — 404, query() ডাকা হয় না', async () => {
        const req = { portalUser: {} };
        const res = mockRes();
        await regenerateMyQrCode(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(query).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// ৬. searchPersons() — blocked হার্ড-এক্সক্লুশন (Phase 3 regression guard)
// ════════════════════════════════════════════════════════════════

describe('searchPersons() — blocked হার্ড-এক্সক্লুশন (Phase 3)', () => {
    test('blocked সম্পর্ক qr_code exact match-সহ সবকিছু override করে বাদ দেয়', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const req = { query: { q: 'anyphone' }, tenantId: TENANT_A };
        const res = mockRes();
        await searchPersons(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        expect(sql).toContain("WHERE ccc.status IS DISTINCT FROM 'blocked'");
        expect(sql).toContain(
            "ON ccc.person_id = p.id AND ccc.tenant_id = $2 AND ccc.status IN ('pending','connected','blocked')"
        );
        // ✅ regression guard: blocked-wrapper-টা যেন qr_code শাখার আগে বসে,
        // নইলে শুধু fuzzy match-এ প্রযোজ্য হবে, qr_code bypass-এ না
        const whereIdx = sql.indexOf("WHERE ccc.status IS DISTINCT FROM 'blocked'");
        const qrIdx    = sql.indexOf('p.qr_code = $3');
        expect(whereIdx).toBeLessThan(qrIdx);
    });
});

// ════════════════════════════════════════════════════════════════
// ৭. reject-cooldown ফাংশনগুলোতে blocked-চেক (Phase 3 regression guard)
// ════════════════════════════════════════════════════════════════

describe('sendConnectionRequest() ও requestConnectionToCompany() — blocked (Phase 3)', () => {
    test('sendConnectionRequest: blocked -> 403, insert হয় না', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'x', status: 'blocked' }] });
        const req = { body: { person_id: 'p1' }, tenantId: TENANT_A, user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('sendConnectionRequest: dup-check SQL-এ blocked IN-লিস্টে আছে (cooldown-এর মতো সময়সীমা ছাড়াই)', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'c1' }] });
        const req = { body: { person_id: 'p1' }, tenantId: TENANT_A, user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        expect(sql).toContain("status IN ('pending','connected','blocked')");
    });

    test('requestConnectionToCompany: blocked -> 403, নিরপেক্ষ ভাষা (blocked party-কে সরাসরি "ব্লক" বলা হয় না)', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'x', status: 'blocked' }] });
        const req = { body: { tenant_id: 'tX' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await requestConnectionToCompany(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        const msg = res.json.mock.calls[0][0].message;
        expect(msg).not.toContain('ব্লক'); // escalation এড়াতে "আপনাকে ব্লক করা হয়েছে" বলা হয় না
    });
});

// ════════════════════════════════════════════════════════════════
// ৮. connectViaQrScan() — blocked থাকলে QR দিয়েও reconnect বন্ধ (Phase 3)
// ════════════════════════════════════════════════════════════════

describe('connectViaQrScan() — blocked reconnection বন্ধ করে (Phase 3)', () => {
    test('blocked -> 403, ensureCustomerForPerson/insert পর্যন্ত পৌঁছায় না', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: PERSON_ID }] })                         // qr_code দিয়ে person lookup
            .mockResolvedValueOnce({ rows: [{ id: 'conn-1', status: 'blocked' }] });       // existing connection check

        const req = { body: { qr_code: 'some-qr-string' }, tenantId: TENANT_A, user: { id: 'staff-1' } };
        const res = mockRes();
        await connectViaQrScan(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        // ✅ regression guard: মাত্র ২টা query() কল (lookup + existing-check) —
        // তৃতীয় কল (customer creation/insert) হলে বুঝতে হবে blocked bypass হয়ে গেছে
        expect(query).toHaveBeenCalledTimes(2);
    });
});

// ════════════════════════════════════════════════════════════════
// ৯. block()/unblock() — direction-matching (Phase 3, সবচেয়ে জরুরি guard)
//    company যা ব্লক করেছে তা customer নিজে unblock করতে পারে না, উল্টোটাও
//    না — এই guard না থাকলে block ফিচারটাই অর্থহীন হয়ে যেত।
// ════════════════════════════════════════════════════════════════

describe('blockConnection()/unblockConnection() — staff side, direction-matching (Phase 3)', () => {
    test('blockConnection: যেকোনো non-blocked status থেকে ব্লক করা যায়, blocked_by=company সেট হয়', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'blocked', blocked_by: 'company' }] });
        const req = { params: { id: 'c1' }, tenantId: TENANT_A };
        const res = mockRes();
        await blockConnection(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        expect(sql).toContain("status != 'blocked'");
        expect(sql).toContain("blocked_by = 'company'");
        expect(res.status).not.toHaveBeenCalled();
    });

    test('blockConnection: আগে থেকেই blocked হলে — 404 (row মেলে না)', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const req = { params: { id: 'c1' }, tenantId: TENANT_A };
        const res = mockRes();
        await blockConnection(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('unblockConnection: SQL শুধু blocked_by=company সারি টার্গেট করে', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'disconnected' }] });
        const req = { params: { id: 'c1' }, tenantId: TENANT_A };
        const res = mockRes();
        await unblockConnection(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        expect(sql).toContain("AND status = 'blocked' AND blocked_by = 'company'");
    });

    test('unblockConnection: customer-এর করা ব্লক (blocked_by=customer) — company unblock করতে পারে না, 404', async () => {
        // SQL-এর blocked_by='company' শর্তের কারণে বাস্তবে row মিলবে না — mock দিয়ে সেটাই সিমুলেট
        query.mockResolvedValueOnce({ rows: [] });
        const req = { params: { id: 'c1' }, tenantId: TENANT_A };
        const res = mockRes();
        await unblockConnection(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('blockCompanyConnection()/unblockCompanyConnection()/getMyBlockedCompanies() — portal side (Phase 3)', () => {
    test('blockCompanyConnection: blocked_by=customer সেট হয়, person-স্কোপড', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'blocked' }] });
        const req = { params: { id: 'c1' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await blockCompanyConnection(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        expect(sql).toContain("blocked_by = 'customer'");
        expect(sql).toContain('person_id = $2');
        expect(query.mock.calls[0][1]).toEqual(['c1', PERSON_ID]);
    });

    test('unblockCompanyConnection: SQL শুধু blocked_by=customer সারি টার্গেট করে', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'disconnected' }] });
        const req = { params: { id: 'c1' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await unblockCompanyConnection(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        expect(sql).toContain("AND status = 'blocked' AND blocked_by = 'customer'");
    });

    test('unblockCompanyConnection: company-এর করা ব্লক — customer unblock করতে পারে না, 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const req = { params: { id: 'c1' }, portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await unblockCompanyConnection(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('getMyBlockedCompanies: শুধু blocked_by=customer রো ফেরত দেয় (company-এর ব্লক দেখায় না)', async () => {
        const rows = [{ connection_id: 'c1', company_name: 'কোম্পানি এক্স' }];
        query.mockResolvedValueOnce({ rows });
        const req = { portalUser: { person_id: PERSON_ID } };
        const res = mockRes();
        await getMyBlockedCompanies(req, res);

        const sql = query.mock.calls[0][0].replace(/\s+/g, ' ');
        expect(sql).toContain("ccc.status = 'blocked' AND ccc.blocked_by = 'customer'");
        expect(res.json).toHaveBeenCalledWith({ success: true, data: rows });
    });
});

describe('WhatsApp নোটিফিকেশন হুক — connection.controller.js (Phase 4)', () => {
    test('sendConnectionRequest: request পাঠানোর পর WhatsApp যায় সঠিক ফোন নম্বর ও কোম্পানির নামসহ', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'conn-1' }] })
            .mockResolvedValueOnce({ rows: [{ whatsapp: '01700000001', phone: null }] })
            .mockResolvedValueOnce({ rows: [{ company_name: 'Acme', company_name_bn: 'অ্যাকমি' }] });

        const req = { body: { person_id: 'p1' }, tenantId: 'tA', user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);
        await new Promise(r => setTimeout(r, 0));

        expect(sendPortalWhatsAppMessage).toHaveBeenCalledTimes(1);
        const [phone, message] = sendPortalWhatsAppMessage.mock.calls[0];
        expect(phone).toBe('01700000001');
        expect(message).toContain('অ্যাকমি');
    });

    test('sendConnectionRequest: response WhatsApp কলের জন্য অপেক্ষা করে না (সত্যিকারের fire-and-forget)', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'conn-2' }] })
            .mockResolvedValueOnce({ rows: [{ whatsapp: '01700000002', phone: null }] })
            .mockResolvedValueOnce({ rows: [{ company_name: 'Acme', company_name_bn: null }] });

        sendPortalWhatsAppMessage.mockReturnValueOnce(new Promise(() => {}));

        const req = { body: { person_id: 'p2' }, tenantId: 'tA', user: { id: 'staff-1' } };
        const res = mockRes();
        const start = Date.now();
        await sendConnectionRequest(req, res);
        expect(Date.now() - start).toBeLessThan(200);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('person-এর phone/whatsapp দুটোই না থাকলে — WhatsApp কল হয় না, তবু response ঠিকঠাক', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'conn-3' }] })
            .mockResolvedValueOnce({ rows: [{ whatsapp: null, phone: null }] })
            .mockResolvedValueOnce({ rows: [{ company_name: 'Acme', company_name_bn: null }] });

        const req = { body: { person_id: 'p3' }, tenantId: 'tA', user: { id: 'staff-1' } };
        const res = mockRes();
        await sendConnectionRequest(req, res);
        await new Promise(r => setTimeout(r, 0));

        expect(res.status).toHaveBeenCalledWith(201);
        expect(sendPortalWhatsAppMessage).not.toHaveBeenCalled();
    });

    test('acceptConnection: accept-এর পর celebratory WhatsApp মেসেজ যায়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 'c1', person_id: 'p1', status: 'pending' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'connected' }] })
            .mockResolvedValueOnce({ rows: [{ whatsapp: '01711111111', phone: null }] })
            .mockResolvedValueOnce({ rows: [{ company_name: 'Beta', company_name_bn: 'বিটা' }] });

        const req = { params: { id: 'c1' }, tenantId: 'tA', user: { id: 'staff-1' } };
        const res = mockRes();
        await acceptConnection(req, res);
        await new Promise(r => setTimeout(r, 0));

        expect(sendPortalWhatsAppMessage).toHaveBeenCalledTimes(1);
        expect(sendPortalWhatsAppMessage.mock.calls[0][1]).toContain('গ্রহণ করেছে');
    });

    test('rejectConnection: reject-এর পর নিরপেক্ষ (কঠোর নয়) ভাষায় WhatsApp মেসেজ যায়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 'c1', person_id: 'p1', status: 'rejected' }] })
            .mockResolvedValueOnce({ rows: [{ whatsapp: '01722222222', phone: null }] })
            .mockResolvedValueOnce({ rows: [{ company_name: 'Gamma', company_name_bn: null }] });

        const req = { params: { id: 'c1' }, tenantId: 'tA' };
        const res = mockRes();
        await rejectConnection(req, res);
        await new Promise(r => setTimeout(r, 0));

        expect(sendPortalWhatsAppMessage).toHaveBeenCalledTimes(1);
        expect(sendPortalWhatsAppMessage.mock.calls[0][1]).toContain('গ্রহণ করেনি');
    });
});
