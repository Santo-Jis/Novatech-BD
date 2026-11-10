/**
 * receiptResend.test.js — বাকি আদায়ের রসিদ আবার পাঠানো (POST /collections/:source/:id/resend-receipt)
 * এবং আদায়ের সময়ের বাকি স্ন্যাপশট (saveReceiptSnapshotSafe)
 */

jest.mock('../config/db', () => ({ query: jest.fn(), withTransaction: jest.fn() }));
jest.mock('../config/firebase', () => ({ uploadToStorage: jest.fn(), initializeFirebase: jest.fn(), getDB: jest.fn() }));
jest.mock('sharp', () => jest.fn());
jest.mock('../services/commission.service', () => ({ updateCommissionRealtime: jest.fn() }));
jest.mock('../services/firebase.notify', () => ({ firebaseNotify: jest.fn() }));
jest.mock('../services/paymentAllocation.service', () => ({
    allocatePaymentSafe: jest.fn(), parseSaleIds: jest.fn(), assertSaleIdsBelongToCustomer: jest.fn(),
}));
jest.mock('../controllers/customerNotification.controller', () => ({ sendCustomerNotification: jest.fn() }));
jest.mock('../services/teamAccess.service', () => ({ denyWorkerOutsideTeam: jest.fn().mockResolvedValue(false) }));
jest.mock('../services/collectionReceipt.service', () => ({
    sendCollectionReceipt: jest.fn(),
    buildReceiptNo: jest.fn().mockReturnValue('MR-X'),
    saveReceiptSnapshotSafe: jest.fn(),
}));

const { query } = require('../config/db');
const { sendCollectionReceipt } = require('../services/collectionReceipt.service');
const { denyWorkerOutsideTeam } = require('../services/teamAccess.service');
const { resendReceipt } = require('../controllers/collection.controller');

const ID = '11111111-1111-1111-1111-111111111111';
const mkRes = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
let n = 0;
const call = async (over = {}) => {
    const res = mkRes();
    // প্রতিটা টেস্টে আলাদা id — cooldown Map টেস্টগুলোকে প্রভাবিত না করে
    const id = over.id || `11111111-1111-1111-1111-${String(++n).padStart(12, '0')}`;
    await resendReceipt({
        params: { source: 'collection', id, ...(over.params || {}) },
        user: over.user || { id: 'w1', role: 'worker' },
        tenantId: 't1',
    }, res);
    return res;
};

const pay = (extra = {}) => ({
    id: ID, customer_id: 'c1', amount: '2000', payment_mode: 'cash', status: 'pending',
    created_at: new Date('2026-11-08T10:00:00Z'), collector_id: 'u1',
    due_before: '5000', due_after: '3000', ...extra,
});

const mockDb = (payment, { current = '1000' } = {}) => {
    query.mockReset();
    query.mockImplementation(async (sql) => {
        if (sql.includes('FROM collections') || sql.includes('FROM credit_payments')) return { rows: payment ? [payment] : [] };
        if (sql.includes('current_credit')) return { rows: [{ current_credit: current }] };
        if (sql.includes('payment_allocations')) return { rows: [{ sale_id: 's1' }] };
        if (sql.includes('FROM users')) return { rows: [{ name_bn: 'আলী', employee_code: 'SR1' }] };
        return { rows: [] };
    });
};

describe('resendReceipt', () => {
    beforeEach(() => { jest.clearAllMocks(); denyWorkerOutsideTeam.mockResolvedValue(false); });

    test('অবৈধ source/id → 400', async () => {
        expect((await call({ params: { source: 'x' } })).status).toHaveBeenCalledWith(400);
        expect((await call({ params: { id: 'not-uuid' } })).status).toHaveBeenCalledWith(400);
    });

    test('আদায় নেই → 404', async () => {
        mockDb(null);
        expect((await call()).status).toHaveBeenCalledWith(404);
    });

    test('rejected আদায় → 400', async () => {
        mockDb(pay({ status: 'rejected' }));
        expect((await call()).status).toHaveBeenCalledWith(400);
    });

    test('অন্য টিমের কাস্টমার (worker) → denyWorkerOutsideTeam response দেয়, রসিদ যায় না', async () => {
        mockDb(pay());
        denyWorkerOutsideTeam.mockResolvedValueOnce(true);
        await call();
        expect(sendCollectionReceipt).not.toHaveBeenCalled();
    });

    test('স্ন্যাপশট আছে → আদায়ের সময়ের বাকি (আগে ৫০০০, পরে ৩০০০) যায়, "বর্তমান" নয়', async () => {
        mockDb(pay(), { current: '999' });
        sendCollectionReceipt.mockResolvedValue({ success: true, channel: 'whatsapp', receiptNo: 'MR-X' });
        const res = await call();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, channel: 'whatsapp' }));
        const arg = sendCollectionReceipt.mock.calls[0][0];
        expect(arg.previousDue).toBe(5000);
        expect(arg.remainingDue).toBe(3000);
        expect(arg.remainingIsCurrent).toBe(false);
        expect(arg.allocations).toEqual([{ sale_id: 's1' }]);
        expect(arg.createdAt).toEqual(new Date('2026-11-08T10:00:00Z')); // একই রসিদ নম্বরের জন্য
        expect(arg.collector).toEqual({ name_bn: 'আলী', employee_code: 'SR1' });
    });

    test('পুরনো আদায় (স্ন্যাপশট নেই) → আজকের বাকি, remainingIsCurrent=true, আগের বাকি বানানো হয় না', async () => {
        mockDb(pay({ due_before: null, due_after: null }), { current: '1234' });
        sendCollectionReceipt.mockResolvedValue({ success: true, channel: 'email', receiptNo: 'MR-X' });
        const res = await call();
        const arg = sendCollectionReceipt.mock.calls[0][0];
        expect(arg.remainingDue).toBe(1234);
        expect(arg.remainingIsCurrent).toBe(true);
        expect(arg.previousDue).toBeNull();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('ইমেইলে') }));
    });

    test('credit_payment source-ও কাজ করে', async () => {
        mockDb(pay());
        sendCollectionReceipt.mockResolvedValue({ success: true, channel: 'whatsapp', receiptNo: 'MR-X' });
        const res = await call({ params: { source: 'credit_payment' } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(query.mock.calls.some(c => c[0].includes('FROM credit_payments'))).toBe(true);
    });

    test('যোগাযোগের মাধ্যম নেই → 422', async () => {
        mockDb(pay());
        sendCollectionReceipt.mockResolvedValue({ success: false, reason: 'no_contact' });
        expect((await call()).status).toHaveBeenCalledWith(422);
    });

    test('পাঠানো ব্যর্থ → 502', async () => {
        mockDb(pay());
        sendCollectionReceipt.mockResolvedValue({ success: false, reason: 'send_failed' });
        expect((await call()).status).toHaveBeenCalledWith(502);
    });

    test('সফল পাঠানোর পর ৩০ সেকেন্ডের মধ্যে একই আদায়ে আবার → 429', async () => {
        mockDb(pay());
        sendCollectionReceipt.mockResolvedValue({ success: true, channel: 'whatsapp', receiptNo: 'MR-X' });
        const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        await call({ id });
        const second = await call({ id });
        expect(second.status).toHaveBeenCalledWith(429);
        expect(sendCollectionReceipt).toHaveBeenCalledTimes(1);
    });

    test('ব্যর্থ পাঠানো cooldown শুরু করে না — আবার চেষ্টা করা যায়', async () => {
        mockDb(pay());
        sendCollectionReceipt.mockResolvedValueOnce({ success: false, reason: 'send_failed' })
                             .mockResolvedValueOnce({ success: true, channel: 'whatsapp', receiptNo: 'MR-X' });
        const id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        await call({ id });
        const retry = await call({ id });
        expect(retry.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('manager: নিজের রুটের নয় এমন কাস্টমার → 403', async () => {
        mockDb(pay());
        query.mockImplementation(async (sql) => {
            if (sql.includes('FROM collections')) return { rows: [pay()] };
            if (sql.includes('JOIN routes')) return { rows: [] };   // রুট মেলেনি
            return { rows: [] };
        });
        const res = await call({ user: { id: 'm1', role: 'manager' } });
        expect(res.status).toHaveBeenCalledWith(403);
        expect(sendCollectionReceipt).not.toHaveBeenCalled();
    });
});

describe('saveReceiptSnapshotSafe (আসল ফাইল)', () => {
    const real = jest.requireActual('../services/collectionReceipt.service');

    test('SAVEPOINT-এ UPDATE; সফল হলে RELEASE', async () => {
        const client = { query: jest.fn().mockResolvedValue({}) };
        await real.saveReceiptSnapshotSafe(client, { table: 'collections', id: 'x', tenantId: 't', dueBefore: 5000, dueAfter: 3000 });
        const sqls = client.query.mock.calls.map(c => c[0]);
        expect(sqls[0]).toBe('SAVEPOINT receipt_snapshot');
        expect(sqls[1]).toContain('UPDATE collections SET due_before');
        expect(client.query.mock.calls[1][1]).toEqual([5000, 3000, 'x', 't']);
        expect(sqls[2]).toBe('RELEASE SAVEPOINT receipt_snapshot');
    });

    test('কলাম না থাকলে (migration চলেনি) ROLLBACK TO SAVEPOINT, throw করে না', async () => {
        const client = { query: jest.fn(async (sql) => { if (sql.startsWith('UPDATE')) throw new Error('column "due_before" does not exist'); return {}; }) };
        await expect(real.saveReceiptSnapshotSafe(client, { table: 'credit_payments', id: 'x', tenantId: 't', dueBefore: 1, dueAfter: 0 })).resolves.toBeUndefined();
        const sqls = client.query.mock.calls.map(c => c[0]);
        expect(sqls).toContain('ROLLBACK TO SAVEPOINT receipt_snapshot');
    });

    test('অননুমোদিত table নাম → কিছুই চলে না (SQL injection সুরক্ষা)', async () => {
        const client = { query: jest.fn() };
        await real.saveReceiptSnapshotSafe(client, { table: 'users; DROP TABLE x', id: 'x', tenantId: 't', dueBefore: 1, dueAfter: 0 });
        expect(client.query).not.toHaveBeenCalled();
    });
});

describe('getCustomerCollections — SQL-এ অস্তিত্বহীন "employees" টেবিল নেই (রিগ্রেশন)', () => {
    const { getCustomerCollections } = require('../controllers/collection.controller');

    test('SR-এর নাম users টেবিল থেকে আসে (LEFT JOIN users), employees থেকে নয়', async () => {
        query.mockReset();
        query.mockResolvedValue({ rows: [] });
        const res = mkRes();
        await getCustomerCollections({
            params: { customerId: '11111111-1111-1111-1111-111111111111' },
            query: {}, user: { id: 'a1', role: 'admin' }, tenantId: 't1',
        }, res);
        const sqls = query.mock.calls.map(c => String(c[0]));
        const colSql = sqls.find(q => q.includes('FROM collections col'));
        expect(colSql).toBeTruthy();
        expect(colSql).not.toMatch(/\bemployees\b/);
        expect(colSql).toMatch(/LEFT JOIN users\s+e ON e\.id = col\.sr_id/);
    });
});
