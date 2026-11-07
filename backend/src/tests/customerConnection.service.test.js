// ============================================================
// customerConnection.service.test.js
// autoConnectStaffCreatedCustomer — staff দোকান তৈরি করলে অটো-কানেকশন
//
// মূল নিয়ম যা এখানে লক করা হচ্ছে: কাস্টমার/কোম্পানির আগের সিদ্ধান্ত
// (blocked / disconnected / rejected / pending) staff-এর দোকান-তৈরি দিয়ে
// কখনো উল্টে যাবে না। শুধু "কোনো সম্পর্কই নেই" অবস্থায় নতুন 'connected' রো।
// ============================================================

jest.mock('../config/db', () => ({
    query:           jest.fn(),
    withTransaction: jest.fn(),
}));

jest.mock('../services/employee.service', () => ({
    generateCustomerCode: jest.fn(),
}));

jest.mock('../services/tenantLimits.service', () => ({
    assertCustomerLimitAvailable: jest.fn(),
}));

jest.mock('../services/portalPerson.service', () => ({
    ensurePersonForCustomer: jest.fn(),
}));

const { query } = require('../config/db');
const { ensurePersonForCustomer } = require('../services/portalPerson.service');
const { autoConnectStaffCreatedCustomer } = require('../services/customerConnection.service');

const CUSTOMER_ID = 'cust-1';
const TENANT_ID   = 'tenant-gadgetpoint';
const PERSON_ID   = 'person-1';
const STAFF_ID    = 'sr-1';

beforeEach(() => {
    jest.resetAllMocks();
    ensurePersonForCustomer.mockResolvedValue(PERSON_ID);
});

describe('autoConnectStaffCreatedCustomer', () => {

    test('কোনো সম্পর্ক নেই → নতুন connected রো (initiated_by=staff_created)', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })                  // existing lookup
            .mockResolvedValueOnce({ rows: [{ id: 'conn-1' }] }); // INSERT ... WHERE NOT EXISTS

        const out = await autoConnectStaffCreatedCustomer(CUSTOMER_ID, TENANT_ID, STAFF_ID);

        expect(out).toEqual({ status: 'connected', created: true });
        expect(ensurePersonForCustomer).toHaveBeenCalledWith(CUSTOMER_ID);

        const [sql, params] = query.mock.calls[1];
        expect(sql).toContain('INSERT INTO customer_company_connections');
        expect(sql).toContain("'staff_created'");
        expect(sql).toContain('WHERE NOT EXISTS'); // race-safe (UNIQUE ইনডেক্স নেই)
        expect(params).toEqual([PERSON_ID, TENANT_ID, CUSTOMER_ID, STAFF_ID]);
    });

    test('একই সময়ে অন্য রিকোয়েস্ট রো বানিয়ে ফেললে → ডুপ্লিকেট নয়, created=false', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })   // lookup: তখনো নেই
            .mockResolvedValueOnce({ rows: [] });  // INSERT: NOT EXISTS ফেল → কিছু insert হয়নি

        const out = await autoConnectStaffCreatedCustomer(CUSTOMER_ID, TENANT_ID, STAFF_ID);
        expect(out).toEqual({ status: 'connected', created: false });
    });

    test.each(['blocked', 'disconnected', 'rejected', 'pending'])(
        "আগে থেকে '%s' থাকলে → কিছুই বদলায় না (কোনো INSERT/UPDATE নয়)",
        async (status) => {
            query.mockResolvedValueOnce({ rows: [{ id: 'conn-x', status, customer_id: null }] });

            const out = await autoConnectStaffCreatedCustomer(CUSTOMER_ID, TENANT_ID, STAFF_ID);

            expect(out).toEqual({ status, created: false });
            expect(query).toHaveBeenCalledTimes(1); // শুধু lookup, কোনো write নয়
        }
    );

    test('connected আছে কিন্তু customer_id ফাঁকা → শুধু customer_id বসায়', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 'conn-1', status: 'connected', customer_id: null }] })
            .mockResolvedValueOnce({ rows: [] }); // UPDATE

        const out = await autoConnectStaffCreatedCustomer(CUSTOMER_ID, TENANT_ID, STAFF_ID);

        expect(out).toEqual({ status: 'connected', created: false });
        const [sql, params] = query.mock.calls[1];
        expect(sql).toContain('UPDATE customer_company_connections SET customer_id');
        expect(params).toEqual([CUSTOMER_ID, 'conn-1']);
    });

    test('connected আছে এবং customer_id আগেই সেট → কোনো write নয়', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'conn-1', status: 'connected', customer_id: 'cust-old' }] });

        const out = await autoConnectStaffCreatedCustomer(CUSTOMER_ID, TENANT_ID, STAFF_ID);

        expect(out).toEqual({ status: 'connected', created: false });
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('person লিংক ব্যর্থ হলে error প্রপাগেট করে (caller লগ করবে, customer creation আটকাবে না)', async () => {
        ensurePersonForCustomer.mockRejectedValueOnce(new Error('PERSON_NOT_LINKED'));

        await expect(
            autoConnectStaffCreatedCustomer(CUSTOMER_ID, TENANT_ID, STAFF_ID)
        ).rejects.toThrow('PERSON_NOT_LINKED');
        expect(query).not.toHaveBeenCalled();
    });
});
