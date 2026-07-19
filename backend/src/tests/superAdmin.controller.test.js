/**
 * superAdmin.controller.test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 1 — Unit Test  (DB ছাড়া, সব mock)
 *
 * ✅ Phase 4 (TICKET-09, 19 July 2026)
 *
 * কভার করা হচ্ছে (৮টি function):
 *   getAllTenants            — pagination, search, status filter, default/edge-case limit
 *   createTenant             — validation, duplicate slug (23505), audit log
 *   updateTenantStatus       — invalid status reject, cache clear, audit log (old/new)
 *   updateTenantPlan         — payment_reference বাধ্যতামূলক, force_no_payment override
 *   getTenantDetails         — 404, সফল fetch
 *   deleteTenant             — confirm guard, default-tenant guard, snapshot audit log
 *   resetTenantAdminPassword — tenant/admin not-found, temp password format, audit log (no plaintext leak)
 *   verifyPlanPayment        — placeholder verification logic
 *
 * এই টেস্টগুলো বিশেষভাবে Phase 1/2/3-এ পাওয়া/ফিক্স করা বাগগুলো যেন
 * ভবিষ্যতে আবার ফিরে না আসে তা নিশ্চিত করে:
 *   - audit log (platform_audit_log) প্রতিটা state-changing action-এ insert হয়
 *   - payment_reference ছাড়া blind plan-extension বন্ধ থাকে
 *   - default tenant কখনো delete করা যায় না
 *
 * চালানোর কমান্ড:
 *   npm run test:unit -- --testPathPattern=superAdmin.controller
 * ════════════════════════════════════════════════════════════════
 */

// ─── TOP-LEVEL MOCKS (file-এর একদম শুরুতে) ──────────────────────
jest.mock('../config/db', () => ({
    query: jest.fn(),
}));

jest.mock('../middlewares/tenantResolver', () => ({
    clearTenantCache: jest.fn(),
    getTenantById:     jest.fn(),
}));

jest.mock('bcryptjs', () => ({
    hash: jest.fn().mockResolvedValue('hashed_password_xyz'),
}));

// ─── IMPORTS (mock এর পরে) ────────────────────────────────────────
const { query } = require('../config/db');
const { clearTenantCache } = require('../middlewares/tenantResolver');
const bcrypt = require('bcryptjs');

const {
    getAllTenants,
    createTenant,
    updateTenantStatus,
    updateTenantPlan,
    getTenantDetails,
    deleteTenant,
    resetTenantAdminPassword,
    verifyPlanPayment,
} = require('../controllers/superAdmin.controller');

// ════════════════════════════════════════════════════════════════
// ─── SHARED HELPERS ──────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

/** mockRes() → Express res object (chainable) */
const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT_ID   = '6e4e4241-6afc-40a9-9ef8-48ec5036d629';

const sampleTenant = {
    id: OTHER_TENANT_ID,
    slug: 'dhaka-trading-test',
    company_name: 'Dhaka Trading Co (Test)',
    status: 'trial',
    plan: 'basic',
};

beforeEach(() => {
    jest.resetAllMocks();
    bcrypt.hash.mockResolvedValue('hashed_password_xyz');
    // logAudit ফাংশন internally query() ব্যবহার করে — প্রতিটা টেস্টে
    // যতগুলো query কল হবে তার শেষেরটা সাধারণত audit-log insert (fail-open,
    // resolve হলেই যথেষ্ট, ফলাফল ব্যবহার হয় না)।
});

// ════════════════════════════════════════════════════════════════
// 1. getAllTenants
// ════════════════════════════════════════════════════════════════

describe('getAllTenants — pagination + search (TICKET-05)', () => {
    test('কোনো query param ছাড়া — default page=1, limit=20', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // count query
            .mockResolvedValueOnce({ rows: [sampleTenant] });   // data query

        const req = { query: {} };
        const res = mockRes();
        await getAllTenants(req, res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                pagination: { page: 1, limit: 20, total: 2, total_pages: 1 },
            })
        );
    });

    test('page/limit query param — সঠিকভাবে offset হিসাব হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ total: '25' }] })
            .mockResolvedValueOnce({ rows: [sampleTenant] });

        const req = { query: { page: '2', limit: '10' } };
        const res = mockRes();
        await getAllTenants(req, res);

        // দ্বিতীয় query কলে LIMIT/OFFSET params শেষে থাকার কথা: [..., limit(10), offset(10)]
        const dataCallParams = query.mock.calls[1][1];
        expect(dataCallParams).toEqual(expect.arrayContaining([10, 10]));
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                pagination: { page: 2, limit: 10, total: 25, total_pages: 3 },
            })
        );
    });

    test('অবৈধ/negative page-limit দিলে safe default-এ পড়ে (crash না করে)', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ total: '0' }] })
            .mockResolvedValueOnce({ rows: [] });

        const req = { query: { page: '-5', limit: 'abc' } };
        const res = mockRes();
        await getAllTenants(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ pagination: expect.objectContaining({ page: 1, limit: 20 }) })
        );
    });

    test('limit ১০০-এর বেশি চাইলে ১০০-তে cap হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ total: '500' }] })
            .mockResolvedValueOnce({ rows: [] });

        const req = { query: { limit: '99999' } };
        const res = mockRes();
        await getAllTenants(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ pagination: expect.objectContaining({ limit: 100 }) })
        );
    });

    test('search দিলে ILIKE condition ও query-তে যোগ হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ total: '1' }] })
            .mockResolvedValueOnce({ rows: [sampleTenant] });

        const req = { query: { search: 'dhaka' } };
        const res = mockRes();
        await getAllTenants(req, res);

        const countSql = query.mock.calls[0][0];
        expect(countSql).toContain('ILIKE');
        const countParams = query.mock.calls[0][1];
        expect(countParams[0]).toBe('%dhaka%');
    });

    test('status filter দিলে সঠিক WHERE condition যোগ হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ total: '1' }] })
            .mockResolvedValueOnce({ rows: [sampleTenant] });

        const req = { query: { status: 'trial' } };
        const res = mockRes();
        await getAllTenants(req, res);

        const countSql = query.mock.calls[0][0];
        expect(countSql).toContain('t.status =');
    });

    test('DB error হলে 500', async () => {
        query.mockRejectedValueOnce(new Error('DB down'));

        const req = { query: {} };
        const res = mockRes();
        await getAllTenants(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
});

// ════════════════════════════════════════════════════════════════
// 2. createTenant
// ════════════════════════════════════════════════════════════════

describe('createTenant', () => {
    test('আবশ্যক ফিল্ড অনুপস্থিত থাকলে 400', async () => {
        const req = { body: { slug: 'only-slug' } };
        const res = mockRes();
        await createTenant(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(query).not.toHaveBeenCalled();
    });

    test('সফল তৈরি — 201 + audit log insert হয়', async () => {
        const newTenant = { id: 'new-tenant-id', slug: 'new-co', company_name: 'New Co' };
        query
            .mockResolvedValueOnce({ rows: [newTenant] }) // INSERT tenants
            .mockResolvedValueOnce({ rows: [] })          // INSERT users (admin)
            .mockResolvedValueOnce({ rows: [] })          // INSERT system_settings copy
            .mockResolvedValueOnce({ rows: [] })          // INSERT tenant_subscription_logs
            .mockResolvedValueOnce({ rows: [] });         // INSERT platform_audit_log (logAudit)

        const req = {
            body: {
                slug: 'new-co', company_name: 'New Co',
                admin_phone: '01700000000', admin_password: 'pass1234',
            },
            ip: '1.2.3.4',
        };
        const res = mockRes();
        await createTenant(req, res);

        expect(bcrypt.hash).toHaveBeenCalledWith('pass1234', 10);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: { tenant: newTenant } })
        );

        // শেষ query কলটাই audit log insert হওয়া উচিত
        const lastCallSql = query.mock.calls[query.mock.calls.length - 1][0];
        expect(lastCallSql).toContain('platform_audit_log');
        const lastCallParams = query.mock.calls[query.mock.calls.length - 1][1];
        expect(lastCallParams).toEqual(expect.arrayContaining(['tenant.create', newTenant.id]));
    });

    test('duplicate slug/phone/email (Postgres 23505) → 409', async () => {
        const dupError = new Error('duplicate key value violates unique constraint');
        dupError.code = '23505';
        query.mockRejectedValueOnce(dupError);

        const req = {
            body: {
                slug: 'dup-co', company_name: 'Dup Co',
                admin_phone: '01700000000', admin_password: 'pass1234',
            },
        };
        const res = mockRes();
        await createTenant(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('অন্য যেকোনো DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('unexpected'));

        const req = {
            body: {
                slug: 'err-co', company_name: 'Err Co',
                admin_phone: '01700000000', admin_password: 'pass1234',
            },
        };
        const res = mockRes();
        await createTenant(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// 3. updateTenantStatus — Phase 1-এর suspend enforcement ঠিক থাকার জন্য গুরুত্বপূর্ণ
// ════════════════════════════════════════════════════════════════

describe('updateTenantStatus (Phase 1 suspend enforcement-এর ভিত্তি)', () => {
    test('অবৈধ status মান দিলে 400, কোনো DB write হয় না', async () => {
        const req = { params: { tenantId: OTHER_TENANT_ID }, body: { status: 'banned' } };
        const res = mockRes();
        await updateTenantStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(query).not.toHaveBeenCalled();
    });

    test('বৈধ status change — cache clear + audit log-এ old/new status থাকে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ status: 'trial' }] }) // SELECT old status
            .mockResolvedValueOnce({ rows: [] })                    // UPDATE tenants
            .mockResolvedValueOnce({ rows: [] })                    // INSERT tenant_subscription_logs
            .mockResolvedValueOnce({ rows: [] });                   // INSERT platform_audit_log

        const req = {
            params: { tenantId: OTHER_TENANT_ID },
            body: { status: 'suspended', reason: 'payment overdue' },
            ip: '1.2.3.4',
        };
        const res = mockRes();
        await updateTenantStatus(req, res);

        expect(clearTenantCache).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, message: expect.stringContaining('suspended') })
        );

        const auditParams = query.mock.calls[3][1];
        expect(auditParams).toEqual(
            expect.arrayContaining([
                'tenant.status_change',
                OTHER_TENANT_ID,
                JSON.stringify({ old_status: 'trial', new_status: 'suspended', reason: 'payment overdue' }),
            ])
        );
    });

    test('DB error হলে 500', async () => {
        query.mockRejectedValueOnce(new Error('DB down'));
        const req = { params: { tenantId: OTHER_TENANT_ID }, body: { status: 'active' } };
        const res = mockRes();
        await updateTenantStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// 4. updateTenantPlan — Phase 3 TICKET-07 (payment verification hook)
// ════════════════════════════════════════════════════════════════

describe('updateTenantPlan (payment verification hook)', () => {
    test('payment_reference ও force_no_payment দুটোই অনুপস্থিত → 400, কোনো DB write না', async () => {
        const req = { params: { tenantId: OTHER_TENANT_ID }, body: { plan: 'pro' } };
        const res = mockRes();
        await updateTenantPlan(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(query).not.toHaveBeenCalled();
    });

    test('payment_reference দিলে — verified:true সহ সফল', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ plan: 'basic' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            params: { tenantId: OTHER_TENANT_ID },
            body: { plan: 'pro', payment_reference: 'bkash-TXN123456' },
        };
        const res = mockRes();
        await updateTenantPlan(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                payment_verification: expect.objectContaining({ verified: true }),
            })
        );
    });

    test('force_no_payment:true দিলে — verified:false হলেও সফলভাবে extend হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ plan: 'basic' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            params: { tenantId: OTHER_TENANT_ID },
            body: { plan: 'pro', force_no_payment: true },
        };
        const res = mockRes();
        await updateTenantPlan(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                payment_verification: expect.objectContaining({ verified: false }),
            })
        );
    });

    test('DB error হলে 500', async () => {
        query.mockRejectedValueOnce(new Error('DB down'));
        const req = {
            params: { tenantId: OTHER_TENANT_ID },
            body: { plan: 'pro', force_no_payment: true },
        };
        const res = mockRes();
        await updateTenantPlan(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// 5. getTenantDetails
// ════════════════════════════════════════════════════════════════

describe('getTenantDetails', () => {
    test('Tenant না পেলে 404', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ employees: '0', customers: '0', total_sales: '0', total_revenue: '0' }] });

        const req = { params: { tenantId: 'non-existent' } };
        const res = mockRes();
        await getTenantDetails(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('পাওয়া গেলে tenant + stats দুটোই ফেরত দেয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleTenant] })
            .mockResolvedValueOnce({ rows: [{ employees: '5', customers: '10', total_sales: '20', total_revenue: '5000' }] });

        const req = { params: { tenantId: OTHER_TENANT_ID } };
        const res = mockRes();
        await getTenantDetails(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                data: expect.objectContaining({ tenant: sampleTenant }),
            })
        );
    });

    test('DB error হলে 500', async () => {
        query.mockRejectedValue(new Error('DB down'));
        const req = { params: { tenantId: OTHER_TENANT_ID } };
        const res = mockRes();
        await getTenantDetails(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// 6. deleteTenant
// ════════════════════════════════════════════════════════════════

describe('deleteTenant', () => {
    test('confirm:"DELETE" ছাড়া 400, কোনো DB write হয় না', async () => {
        const req = { params: { tenantId: OTHER_TENANT_ID }, body: {} };
        const res = mockRes();
        await deleteTenant(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(query).not.toHaveBeenCalled();
    });

    test('Default tenant ডিলিট করার চেষ্টা করলে 403, কোনো DB write হয় না', async () => {
        const req = {
            params: { tenantId: DEFAULT_TENANT_ID },
            body: { confirm: 'DELETE' },
        };
        const res = mockRes();
        await deleteTenant(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(query).not.toHaveBeenCalled();
    });

    test('সফল delete — snapshot নেওয়া হয়, audit log-এ snapshot যায়', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleTenant] }) // snapshot SELECT
            .mockResolvedValueOnce({ rows: [] })             // DELETE
            .mockResolvedValueOnce({ rows: [] });            // audit log insert

        const req = {
            params: { tenantId: OTHER_TENANT_ID },
            body: { confirm: 'DELETE' },
            ip: '1.2.3.4',
        };
        const res = mockRes();
        await deleteTenant(req, res);

        expect(clearTenantCache).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        const auditSql    = query.mock.calls[2][0];
        const auditParams = query.mock.calls[2][1];
        expect(auditSql).toContain('platform_audit_log');
        expect(auditParams).toEqual(expect.arrayContaining(['tenant.delete', OTHER_TENANT_ID]));
    });

    test('DB error হলে 500', async () => {
        query.mockRejectedValueOnce(new Error('DB down'));
        const req = {
            params: { tenantId: OTHER_TENANT_ID },
            body: { confirm: 'DELETE' },
        };
        const res = mockRes();
        await deleteTenant(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// 7. resetTenantAdminPassword — Phase 3 TICKET-06
// ════════════════════════════════════════════════════════════════

describe('resetTenantAdminPassword', () => {
    test('Tenant না পেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const req = { params: { tenantId: 'non-existent' }, body: {} };
        const res = mockRes();
        await resetTenantAdminPassword(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('Tenant আছে কিন্তু active admin নেই → 404', async () => {
        query
            .mockResolvedValueOnce({ rows: [sampleTenant] }) // tenant check
            .mockResolvedValueOnce({ rows: [] });            // admin query — খালি

        const req = { params: { tenantId: OTHER_TENANT_ID }, body: {} };
        const res = mockRes();
        await resetTenantAdminPassword(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('admin') })
        );
    });

    test('সফল reset — ১২-ক্যারেক্টার temp password, hash হয়ে DB-তে বসে, audit log-এ প্লেইনটেক্সট যায় না', async () => {
        const adminUser = { id: 'admin-1', name_bn: 'অ্যাডমিন', email: 'admin@test.com', phone: '017' };
        query
            .mockResolvedValueOnce({ rows: [sampleTenant] })  // tenant check
            .mockResolvedValueOnce({ rows: [adminUser] })     // admin query
            .mockResolvedValueOnce({ rows: [] })              // UPDATE users password_hash
            .mockResolvedValueOnce({ rows: [] });             // audit log insert

        const req = { params: { tenantId: OTHER_TENANT_ID }, body: {}, ip: '1.2.3.4' };
        const res = mockRes();
        await resetTenantAdminPassword(req, res);

        expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 10);
        const tempPasswordUsed = bcrypt.hash.mock.calls[0][0];
        expect(tempPasswordUsed).toHaveLength(12);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                data: expect.objectContaining({ temp_password: tempPasswordUsed }),
            })
        );

        // audit log details-এ প্লেইনটেক্সট পাসওয়ার্ড থাকা উচিত না
        const auditParams  = query.mock.calls[3][1];
        const auditDetails = auditParams[2]; // JSON.stringify(details)
        expect(auditDetails).not.toContain(tempPasswordUsed);
        expect(auditDetails).toContain(adminUser.id);
    });

    test('admin_email দিলে সেই নির্দিষ্ট admin টার্গেট হয় (query params-এ email থাকে)', async () => {
        const adminUser = { id: 'admin-2', name_bn: 'সেকেন্ড অ্যাডমিন', email: 'second@test.com', phone: '018' };
        query
            .mockResolvedValueOnce({ rows: [sampleTenant] })
            .mockResolvedValueOnce({ rows: [adminUser] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const req = {
            params: { tenantId: OTHER_TENANT_ID },
            body: { admin_email: 'second@test.com' },
        };
        const res = mockRes();
        await resetTenantAdminPassword(req, res);

        const adminQueryParams = query.mock.calls[1][1];
        expect(adminQueryParams).toEqual([OTHER_TENANT_ID, 'second@test.com']);
    });

    test('DB error হলে 500', async () => {
        query.mockRejectedValueOnce(new Error('DB down'));
        const req = { params: { tenantId: OTHER_TENANT_ID }, body: {} };
        const res = mockRes();
        await resetTenantAdminPassword(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// 8. verifyPlanPayment — placeholder verification logic
// ════════════════════════════════════════════════════════════════

describe('verifyPlanPayment', () => {
    test('reference না দিলে verified:false', async () => {
        const result = await verifyPlanPayment(undefined);
        expect(result.verified).toBe(false);
    });

    test('৪ ক্যারেক্টারের কম reference দিলে verified:false', async () => {
        const result = await verifyPlanPayment('ab');
        expect(result.verified).toBe(false);
    });

    test('বৈধ reference দিলে verified:true (placeholder)', async () => {
        const result = await verifyPlanPayment('bkash-TXN123456');
        expect(result.verified).toBe(true);
    });
});
