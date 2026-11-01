/**
 * paymentAllocation.service.test.js
 *
 * বাকি আদায় → ইনভয়েসে FIFO বরাদ্দ।
 *   - planFifoAllocation   : pure হিসাব (DB ছাড়া)
 *   - allocatePaymentFifo  : idempotency, lock, query ক্রম, insert
 *   - allocatePaymentSafe  : SAVEPOINT — বরাদ্দ ব্যর্থ হলে মূল transaction বাঁচে
 *
 * চালানোর কমান্ড:
 *   npm run test:unit -- --testPathPattern=paymentAllocation
 */

jest.mock('../config/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const logger = require('../config/logger');
const {
    planFifoAllocation,
    allocatePaymentFifo,
    allocatePaymentSafe,
} = require('../services/paymentAllocation.service');

// ════════════════════════════════════════════════════════════════
// planFifoAllocation — pure
// ════════════════════════════════════════════════════════════════
describe('planFifoAllocation', () => {
    const invoices = [
        { sale_id: 'A', remaining: '5000.00' }, // সবচেয়ে পুরনো
        { sale_id: 'B', remaining: '3000.00' },
        { sale_id: 'C', remaining: '2000.00' },
    ];

    test('পুরনো ইনভয়েস আগে শোধ হয়, বাকিটা পরেরটায় গড়ায়', () => {
        const r = planFifoAllocation(invoices, 6000);
        expect(r.allocations).toEqual([
            { sale_id: 'A', amount: 5000 },
            { sale_id: 'B', amount: 1000 },
        ]);
        expect(r.allocated).toBe(6000);
        expect(r.unallocated).toBe(0);
    });

    test('আদায় একটা ইনভয়েসের চেয়ে ছোট হলে শুধু প্রথমটাতেই বসে (আংশিক)', () => {
        const r = planFifoAllocation(invoices, 1200);
        expect(r.allocations).toEqual([{ sale_id: 'A', amount: 1200 }]);
        expect(r.unallocated).toBe(0);
    });

    test('সব ইনভয়েসের চেয়ে বেশি আদায় → বাকিটা unallocated (এরর নয়)', () => {
        const r = planFifoAllocation(invoices, 12000);
        expect(r.allocated).toBe(10000);
        expect(r.unallocated).toBe(2000);
        expect(r.allocations).toHaveLength(3);
    });

    test('ঠিক একটা ইনভয়েস শোধ হলে পরেরটা ছোঁয়া হয় না', () => {
        const r = planFifoAllocation(invoices, 5000);
        expect(r.allocations).toEqual([{ sale_id: 'A', amount: 5000 }]);
    });

    test('remaining ০ বা ঋণাত্মক ইনভয়েস বাদ যায়', () => {
        const r = planFifoAllocation(
            [{ sale_id: 'X', remaining: 0 }, { sale_id: 'Y', remaining: -50 }, { sale_id: 'Z', remaining: 400 }],
            300
        );
        expect(r.allocations).toEqual([{ sale_id: 'Z', amount: 300 }]);
    });

    test('ইনভয়েস না থাকলে পুরোটাই unallocated', () => {
        const r = planFifoAllocation([], 750);
        expect(r.allocations).toEqual([]);
        expect(r.unallocated).toBe(750);
    });

    test('০ / ঋণাত্মক / অবৈধ amount → কিছুই বরাদ্দ হয় না', () => {
        expect(planFifoAllocation(invoices, 0).allocations).toEqual([]);
        expect(planFifoAllocation(invoices, -10).allocations).toEqual([]);
        expect(planFifoAllocation(invoices, 'abc').allocations).toEqual([]);
        expect(planFifoAllocation(invoices, null).allocated).toBe(0);
    });

    test('floating-point ভুল জমে না (০.১ + ০.২ ধরনের)', () => {
        const r = planFifoAllocation(
            [{ sale_id: 'A', remaining: '0.10' }, { sale_id: 'B', remaining: '0.20' }],
            0.3
        );
        expect(r.allocated).toBe(0.3);
        expect(r.unallocated).toBe(0);
        expect(r.allocations).toEqual([
            { sale_id: 'A', amount: 0.1 },
            { sale_id: 'B', amount: 0.2 },
        ]);
    });

    test('string amount (HTTP body থেকে) ঠিকমতো পার্স হয়', () => {
        const r = planFifoAllocation(invoices, '250.50');
        expect(r.allocations).toEqual([{ sale_id: 'A', amount: 250.5 }]);
    });
});

// ════════════════════════════════════════════════════════════════
// allocatePaymentFifo — fake client
// ════════════════════════════════════════════════════════════════
describe('allocatePaymentFifo', () => {
    const base = { tenantId: 't1', customerId: 'c1', paymentId: 'p1', source: 'collection', amount: 6000 };

    const fakeClient = (responses) => {
        const q = jest.fn();
        responses.forEach(r => q.mockResolvedValueOnce(r));
        return { query: q };
    };

    test('অজানা source → throw (ডেটা নষ্ট হওয়ার আগেই)', async () => {
        const client = fakeClient([]);
        await expect(allocatePaymentFifo(client, { ...base, source: 'nope' })).rejects.toThrow('source');
        expect(client.query).not.toHaveBeenCalled();
    });

    test('আগেই বরাদ্দ হওয়া আদায় → skipped, কিছু insert হয় না', async () => {
        const client = fakeClient([{ rows: [{ '?column?': 1 }] }]); // idempotency check: পাওয়া গেছে
        const r = await allocatePaymentFifo(client, base);
        expect(r.skipped).toBe(true);
        expect(client.query).toHaveBeenCalledTimes(1);
    });

    test('ক্রম: idempotency check → customer row lock → open invoices → insert (প্রতি ইনভয়েসে একটা)', async () => {
        const client = fakeClient([
            { rows: [] },                                  // idempotency: নতুন
            { rows: [{ id: 'c1' }] },                      // FOR UPDATE
            { rows: [                                      // open invoices (পুরনো আগে)
                { sale_id: 'A', remaining: '5000.00' },
                { sale_id: 'B', remaining: '3000.00' },
            ] },
            { rows: [] },                                  // insert A
            { rows: [] },                                  // insert B
        ]);

        const r = await allocatePaymentFifo(client, base);

        const sqls = client.query.mock.calls.map(c => c[0]);
        expect(sqls[0]).toMatch(/FROM payment_allocations/);
        expect(sqls[1]).toMatch(/FOR UPDATE/);
        expect(sqls[2]).toMatch(/ORDER BY st\.created_at ASC/);
        expect(sqls[3]).toMatch(/INSERT INTO payment_allocations/);

        // tenant/customer সবসময় প্যারামিটারে — হাতে জোড়া হয়নি
        expect(client.query.mock.calls[2][1]).toEqual(['c1', 't1']);

        // insert প্যারামিটার: tenant, customer, sale, source, payment, amount
        expect(client.query.mock.calls[3][1]).toEqual(['t1', 'c1', 'A', 'collection', 'p1', 5000]);
        expect(client.query.mock.calls[4][1]).toEqual(['t1', 'c1', 'B', 'collection', 'p1', 1000]);

        expect(r.allocated).toBe(6000);
        expect(r.unallocated).toBe(0);
    });

    test('বাকি ইনভয়েস না থাকলে কিছুই insert হয় না, পুরোটা unallocated', async () => {
        const client = fakeClient([{ rows: [] }, { rows: [{ id: 'c1' }] }, { rows: [] }]);
        const r = await allocatePaymentFifo(client, { ...base, source: 'credit_payment', amount: 400 });
        expect(client.query).toHaveBeenCalledTimes(3);
        expect(r.allocations).toEqual([]);
        expect(r.unallocated).toBe(400);
    });

    test('insert-এ ON CONFLICT DO NOTHING আছে (concurrent double-submit রক্ষা)', async () => {
        const client = fakeClient([
            { rows: [] }, { rows: [{ id: 'c1' }] },
            { rows: [{ sale_id: 'A', remaining: '100' }] },
            { rows: [] },
        ]);
        await allocatePaymentFifo(client, { ...base, amount: 100 });
        expect(client.query.mock.calls[3][0]).toMatch(/ON CONFLICT \(payment_source, payment_id, sale_id\) DO NOTHING/);
    });
});

// ════════════════════════════════════════════════════════════════
// allocatePaymentSafe — SAVEPOINT
// ════════════════════════════════════════════════════════════════
describe('allocatePaymentSafe — savepoint', () => {
    const base = { tenantId: 't1', customerId: 'c1', paymentId: 'p1', source: 'credit_payment', amount: 100 };
    beforeEach(() => { logger.error.mockClear(); });

    test('সফল হলে SAVEPOINT → … → RELEASE, ফলাফল ফেরত', async () => {
        const client = { query: jest.fn()
            .mockResolvedValueOnce({})                                    // SAVEPOINT
            .mockResolvedValueOnce({ rows: [] })                          // idempotency
            .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })              // lock
            .mockResolvedValueOnce({ rows: [{ sale_id: 'A', remaining: '100' }] })
            .mockResolvedValueOnce({ rows: [] })                          // insert
            .mockResolvedValueOnce({})                                    // RELEASE
        };
        const r = await allocatePaymentSafe(client, base);
        const sqls = client.query.mock.calls.map(c => c[0]);
        expect(sqls[0]).toBe('SAVEPOINT payment_alloc');
        expect(sqls[sqls.length - 1]).toBe('RELEASE SAVEPOINT payment_alloc');
        expect(r.allocated).toBe(100);
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('বরাদ্দ ফেল (যেমন টেবিল নেই) → throw করে না, ROLLBACK TO SAVEPOINT, null ফেরত, লগ হয়', async () => {
        const client = { query: jest.fn()
            .mockResolvedValueOnce({})                                          // SAVEPOINT
            .mockRejectedValueOnce(new Error('relation "payment_allocations" does not exist'))
            .mockResolvedValueOnce({})                                          // ROLLBACK TO
            .mockResolvedValueOnce({})                                          // RELEASE
        };
        const r = await allocatePaymentSafe(client, base);

        expect(r).toBeNull();
        const sqls = client.query.mock.calls.map(c => c[0]);
        expect(sqls).toContain('ROLLBACK TO SAVEPOINT payment_alloc');
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('payment_allocations'));
        // কখনো পুরো transaction ROLLBACK করে না — মূল আদায় বাঁচে
        expect(sqls).not.toContain('ROLLBACK');
    });
});
