/**
 * commissionLedger.logic.test.js
 * ─────────────────────────────────────────────────────────────
 * Phase ১ — commission_ledger (shadow-mode dual-write) টেস্ট
 * + RLS FIX — এখন withTenantScope (app_backend role) দিয়ে কানেক্ট করে
 *
 * বিজনেস নিয়ম:
 * - Ledger append-only — কখনো UPDATE/DELETE হয় না (DB trigger দিয়েও এনফোর্স)
 * - "earn" entry delta-ভিত্তিক: নতুন total − আগে ledger-এ যা জমা ছিল
 * - delta = 0 হলে নতুন row লেখা হয় না
 * - ব্যর্থ হলে (ডিফল্টে) swallow হয় — আসল commission flow কখনো ভাঙে না
 * - সব write/read withTenantScope(tenantId, ...) দিয়ে — RLS policy
 *   ভুল/অনুপস্থিত tenantId থাকলে সাথে সাথেই আটকে দেয়
 * ─────────────────────────────────────────────────────────────
 */

jest.mock('../config/tenantScopedDb', () => {
    const clientQuery = jest.fn();
    const withTenantScope = jest.fn(async (tenantId, callback) => {
        if (!tenantId) {
            throw new Error('withTenantScope: tenantId বাধ্যতামূলক (RLS-এর জন্য)');
        }
        return callback({ query: clientQuery });
    });
    return { withTenantScope, __clientQuery: clientQuery };
});

const { withTenantScope, __clientQuery: query } = require('../config/tenantScopedDb');
const {
    appendLedgerEntry,
    getEarnedSoFar,
    recordDailyEarnDelta,
    recordOneTimeEarn,
} = require('../services/commissionLedger.service');

beforeEach(() => {
    query.mockReset();
    withTenantScope.mockClear();
});

// ─── appendLedgerEntry ─────────────────────────────────────────

describe('appendLedgerEntry — মূল insert', () => {

    test('সব ফিল্ড ঠিকভাবে INSERT-এ পাঠায়, tenantId দিয়ে withTenantScope কল হয়', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'ledger-1' }] });

        const id = await appendLedgerEntry({
            tenantId: 'tenant-1', userId: 'worker-1', entryType: 'earn',
            commissionType: 'daily', date: '2026-09-12', amount: 500,
        });

        expect(id).toBe('ledger-1');
        expect(withTenantScope).toHaveBeenCalledWith('tenant-1', expect.any(Function));

        const [sql, params] = query.mock.calls[0];
        expect(sql).toEqual(expect.stringContaining('INSERT INTO commission_ledger'));
        expect(sql).toEqual(expect.stringContaining('ON CONFLICT (idempotency_key) DO NOTHING'));
        expect(params[0]).toBe('tenant-1'); // tenant_id প্রথম param
        expect(params[1]).toBe('worker-1'); // user_id দ্বিতীয়
    });

    test('tenantId ছাড়া কল করলে (swallowErrors=false) throw করবে', async () => {
        await expect(
            appendLedgerEntry({ userId: 'w1', entryType: 'earn', commissionType: 'daily', date: '2026-09-12', amount: 100 }, { swallowErrors: false })
        ).rejects.toThrow(/tenantId/i);
    });

    test('tenantId ছাড়া কল করলে ডিফল্টে (swallow) throw করে না, null রিটার্ন করে', async () => {
        const id = await appendLedgerEntry({ userId: 'w1', entryType: 'earn', commissionType: 'daily', date: '2026-09-12', amount: 100 });
        expect(id).toBeNull();
        // নিজের validation withTenantScope-এর আগেই থামিয়েছে
        expect(withTenantScope).not.toHaveBeenCalled();
    });

    test('অজানা entryType দিলে throw করবে (swallow করলে null)', async () => {
        const id = await appendLedgerEntry({
            tenantId: 't1', userId: 'w1', entryType: 'not_a_real_type',
            commissionType: 'daily', date: '2026-09-12', amount: 100,
        });
        expect(id).toBeNull();
    });

    test('DB query নিজেই ব্যর্থ হলে (ডিফল্টে) swallow করে null রিটার্ন করে', async () => {
        query.mockRejectedValueOnce(new Error('connection lost'));

        const id = await appendLedgerEntry({
            tenantId: 't1', userId: 'w1', entryType: 'earn',
            commissionType: 'daily', date: '2026-09-12', amount: 100,
        });

        expect(id).toBeNull(); // throw করেনি, ঠিকভাবে swallow হয়েছে
    });

    // ✅ RLS regression guard: withTenantScope নিজেই ভুল/অনুপস্থিত tenantId-তে
    // throw করলে (mock-এ ঠিক এই আচরণই বসানো আছে, আসল RLS policy-র
    // simulation হিসেবে), সেটাও swallow হওয়া উচিত, crash না করে।
    test('withTenantScope ভুল tenantId-তে throw করলেও swallow হয়', async () => {
        const id = await appendLedgerEntry({
            tenantId: '', userId: 'w1', entryType: 'earn', // খালি স্ট্রিং — falsy
            commissionType: 'daily', date: '2026-09-12', amount: 100,
        });
        expect(id).toBeNull();
    });
});

// ─── getEarnedSoFar ────────────────────────────────────────────

describe('getEarnedSoFar — এখন পর্যন্ত জমা হওয়া earn-এর যোগফল', () => {

    test('SUM query ঠিক user/date/commissionType/entry_type দিয়ে ফিল্টার করে, tenantId দিয়ে RLS scope', async () => {
        query.mockResolvedValueOnce({ rows: [{ total: '1500.00' }] });

        const total = await getEarnedSoFar('worker-1', '2026-09-12', 'daily', 'tenant-1');

        expect(total).toBe(1500);
        expect(withTenantScope).toHaveBeenCalledWith('tenant-1', expect.any(Function));

        const [sql, params] = query.mock.calls[0];
        expect(sql).toEqual(expect.stringContaining("entry_type = 'earn'"));
        expect(params).toEqual(['worker-1', '2026-09-12', 'daily']);
    });

    test('কোনো entry না থাকলে 0', async () => {
        query.mockResolvedValueOnce({ rows: [{ total: '0' }] });
        const total = await getEarnedSoFar('worker-1', '2026-09-12', 'daily', 'tenant-1');
        expect(total).toBe(0);
    });

    // ✅ RLS FIX প্রমাণ: tenantId ছাড়া এই ফাংশন এখন সরাসরি throw করে —
    // আগে tenantId প্যারামিটারই ছিল না, ফলে RLS scope সেট না করেই query
    // যেত (তখন commission_ledger-এ কোনো RLS policy না থাকায় সমস্যা হতো না,
    // কিন্তু এখন policy আছে বলে এটা বাধ্যতামূলক)।
    test('tenantId ছাড়া কল করলে throw করবে', async () => {
        await expect(getEarnedSoFar('worker-1', '2026-09-12', 'daily')).rejects.toThrow(/tenantId/i);
    });
});

// ─── recordDailyEarnDelta ──────────────────────────────────────

describe('recordDailyEarnDelta — delta-ভিত্তিক দৈনিক earn entry', () => {

    test('প্রথমবার (prior=0): পুরো amount-ই delta হিসেবে লেখা হয়', async () => {
        query.mockResolvedValueOnce({ rows: [{ total: '0' }] });      // getEarnedSoFar
        query.mockResolvedValueOnce({ rows: [{ id: 'ledger-1' }] });  // insert

        const id = await recordDailyEarnDelta({
            tenantId: 't1', userId: 'w1', date: '2026-09-12',
            newTotalSales: 20000, newRate: 5, newAmount: 1000,
        });

        expect(id).toBe('ledger-1');
        const insertParams = query.mock.calls[1][1];
        expect(insertParams[5]).toBe(1000); // amount column — পুরো delta

        // দুটো কলই একই tenantId দিয়ে RLS-scoped
        expect(withTenantScope).toHaveBeenNthCalledWith(1, 't1', expect.any(Function));
        expect(withTenantScope).toHaveBeenNthCalledWith(2, 't1', expect.any(Function));
    });

    test('দ্বিতীয়বার recompute (prior=1000, new=1500): শুধু delta (৫০০) লেখা হয়', async () => {
        query.mockResolvedValueOnce({ rows: [{ total: '1000' }] });   // getEarnedSoFar
        query.mockResolvedValueOnce({ rows: [{ id: 'ledger-2' }] });  // insert

        await recordDailyEarnDelta({
            tenantId: 't1', userId: 'w1', date: '2026-09-12',
            newTotalSales: 30000, newRate: 5, newAmount: 1500,
        });

        const insertParams = query.mock.calls[1][1];
        expect(insertParams[5]).toBe(500); // শুধু delta, পুরো নতুন amount না
    });

    test('delta = 0 হলে নতুন row লেখা হয় না', async () => {
        query.mockResolvedValueOnce({ rows: [{ total: '1000' }] }); // prior === new

        const id = await recordDailyEarnDelta({
            tenantId: 't1', userId: 'w1', date: '2026-09-12',
            newTotalSales: 20000, newRate: 5, newAmount: 1000,
        });

        expect(id).toBeNull();
        expect(query).toHaveBeenCalledTimes(1); // শুধু SUM query, insert হয়নি
    });

    // ✅ এটাই Bug #4-এর ওপরে ledger-এর উন্নতি: paid হয়ে যাওয়া দিনেও দেরিতে
    // আসা sale-এর কমিশন হারিয়ে না গিয়ে "এখনো owed" ধরা পড়ে।
    test('paid দিনে দেরিতে sale এলে positive delta ধরা পড়ে (Bug #4-এর উন্নত আচরণ)', async () => {
        // ধরি দিনটা ইতিমধ্যে ৳1000 হিসেবে paid হয়ে গেছে (ledger-এ prior=1000)
        // কিন্তু নতুন sale আসায় প্রকৃত total এখন ৳1200
        query.mockResolvedValueOnce({ rows: [{ total: '1000' }] });
        query.mockResolvedValueOnce({ rows: [{ id: 'ledger-3' }] });

        await recordDailyEarnDelta({
            tenantId: 't1', userId: 'w1', date: '2026-09-12',
            newTotalSales: 24000, newRate: 5, newAmount: 1200,
        });

        const insertParams = query.mock.calls[1][1];
        expect(insertParams[5]).toBe(200); // অতিরিক্ত owed অংশ, পুরনো commission টেবিলে এটা ধরাই পড়ত না
    });

    test('getEarnedSoFar ব্যর্থ হলেও throw করে না, null রিটার্ন করে', async () => {
        query.mockRejectedValueOnce(new Error('db down'));

        const id = await recordDailyEarnDelta({
            tenantId: 't1', userId: 'w1', date: '2026-09-12',
            newTotalSales: 20000, newRate: 5, newAmount: 1000,
        });

        expect(id).toBeNull();
    });
});

// ─── recordOneTimeEarn ─────────────────────────────────────────

describe('recordOneTimeEarn — একবারের earn entry (যেমন attendance bonus)', () => {

    test('idempotencyKey সহ সঠিকভাবে insert করে', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'ledger-9' }] });

        const id = await recordOneTimeEarn({
            tenantId: 't1', userId: 'w1', date: '2026-09-12', amount: 3000,
            commissionType: 'attendance_bonus', sourceType: 'attendance_bonus_rule',
            idempotencyKey: 'bonus8m:w1:2026-09-12',
        });

        expect(id).toBe('ledger-9');
        const [, params] = query.mock.calls[0];
        expect(params).toContain('bonus8m:w1:2026-09-12');
    });
});
