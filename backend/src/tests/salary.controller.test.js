/**
 * salary.controller.test.js
 * ─────────────────────────────────────────────────────────────
 * Layer 1 — Unit Test (DB ছাড়া)
 * সব DB call mock করা। শুধু controller logic যাচাই।
 *
 * টেস্ট করা হচ্ছে:
 *   getSalarySheet          — বেতন শীট
 *   getWorkerSalaryDetail   — একজনের বেতন স্লিপ
 *   paySalary               — বেতন পরিশোধ
 *   getMySalaryHistory      — নিজের ইতিহাস
 *   cancelSalaryPayment     — পরিশোধ বাতিল
 *   Pure Business Logic     — net বেতন হিসাব
 * ─────────────────────────────────────────────────────────────
 */

// ─── Mocks ────────────────────────────────────────────────────
jest.mock('../config/db', () => ({
    query:           jest.fn(),
    withTransaction: jest.fn(),
}));
jest.mock('../config/firebase', () => ({
    initializeFirebase: jest.fn(),
    getDB: jest.fn().mockReturnValue({
        ref: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue({}) }),
    }),
}));
jest.mock('../config/encryption', () => ({
    generateOTP: jest.fn().mockReturnValue('123456'),
    encrypt:     jest.fn().mockReturnValue('encrypted'),
    decrypt:     jest.fn().mockReturnValue('decrypted'),
}));

// ─── Imports ──────────────────────────────────────────────────
const { query, withTransaction } = require('../config/db');
const {
    getSalarySheet,
    getWorkerSalaryDetail,
    paySalary,
    getMySalaryHistory,
    cancelSalaryPayment,
} = require('../controllers/salary.controller');

// ─── Helpers ──────────────────────────────────────────────────
const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const adminUser = {
    id:      'admin-uuid-1',
    role:    'admin',
    name_bn: 'অ্যাডমিন',
};

const workerUser = {
    id:      'worker-uuid-1',
    role:    'worker',
    name_bn: 'রহিম',
};

const makeWorkerRow = (overrides = {}) => ({
    worker_id:             'w1',
    name_bn:               'করিম',
    employee_code:         'EMP-001',
    basic_salary:          '20000',
    outstanding_dues:      '0',
    present_days:          '26',
    absent_days:           '0',
    late_days:             '0',
    attendance_deduction:  '0',
    sales_commission:      '2000',
    attendance_bonus:      '500',
    total_commission:      '2500',
    payment_id:            null,
    payment_status:        null,
    paid_amount:           null,
    outstanding_dues_deducted: null,
    paid_at:               null,
    payment_reference:     null,
    payment_method:        null,
    note:                  null,
    approved_by_name:      null,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────
// getSalarySheet
// ─────────────────────────────────────────────────────────────

describe('getSalarySheet — বেতন শীট', () => {

    test('সঠিক ডেটা দিলে 200 ও enriched workers আসবে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '2' }] })        // worker count
            .mockResolvedValueOnce({ rows: [makeWorkerRow(), makeWorkerRow({ worker_id: 'w2', name_bn: 'জলিল' })] }); // workers

        const res = mockRes();
        await getSalarySheet(
            { query: { month: '5', year: '2026', page: '1', limit: '50' }, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.data.workers).toHaveLength(2);
        expect(body.data.pagination.total).toBe(2);
    });

    test('পরিশোধ হয়নি এমন worker এর net_payable হিসাব সঠিক', async () => {
        const worker = makeWorkerRow({
            basic_salary:         '20000',
            total_commission:     '3000',
            attendance_deduction: '500',
            outstanding_dues:     '1000',
            payment_id:           null,
        });
        query
            .mockResolvedValueOnce({ rows: [{ count: '1' }] })
            .mockResolvedValueOnce({ rows: [worker] });

        const res = mockRes();
        await getSalarySheet({ query: {}, user: adminUser }, res);

        const enriched = res.json.mock.calls[0][0].data.workers[0];
        // net = 20000 + 3000 - 500 - 1000 = 21500
        expect(enriched.net_payable).toBe(21500);
        expect(enriched.is_paid).toBe(false);
    });

    test('পরিশোধ হয়েছে এমন worker এ is_paid = true', async () => {
        const worker = makeWorkerRow({
            payment_id:     'pay-1',
            payment_status: 'paid',
            paid_amount:    '22000',
        });
        query
            .mockResolvedValueOnce({ rows: [{ count: '1' }] })
            .mockResolvedValueOnce({ rows: [worker] });

        const res = mockRes();
        await getSalarySheet({ query: {}, user: adminUser }, res);

        const enriched = res.json.mock.calls[0][0].data.workers[0];
        expect(enriched.is_paid).toBe(true);
        expect(enriched.net_payable).toBe(22000);
    });

    test('worker না থাকলে খালি তালিকা দেবে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await getSalarySheet({ query: {}, user: adminUser }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data.workers).toHaveLength(0);
    });

    test('DB error হলে 500', async () => {
        query.mockRejectedValueOnce(new Error('DB সংযোগ ব্যর্থ'));

        const res = mockRes();
        await getSalarySheet({ query: {}, user: adminUser }, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('pagination সঠিকভাবে কাজ করে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '100' }] })
            .mockResolvedValueOnce({ rows: Array(10).fill(makeWorkerRow()) });

        const res = mockRes();
        await getSalarySheet(
            { query: { page: '2', limit: '10' }, user: adminUser },
            res
        );

        const { pagination } = res.json.mock.calls[0][0].data;
        expect(pagination.page).toBe(2);
        expect(pagination.limit).toBe(10);
        expect(pagination.total_pages).toBe(10);
    });
});

// ─────────────────────────────────────────────────────────────
// getWorkerSalaryDetail
// ─────────────────────────────────────────────────────────────

describe('getWorkerSalaryDetail — একজনের বেতন স্লিপ', () => {

    test('সঠিক worker_id দিলে বিস্তারিত পাওয়া যাবে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 'w1', name_bn: 'করিম', employee_code: 'EMP-001', basic_salary: '20000', outstanding_dues: '0', phone: '01700000001' }] })
            .mockResolvedValueOnce({ rows: [{ present_days: '25', absent_days: '1', late_days: '2', total_deduction: '200' }] })
            .mockResolvedValueOnce({ rows: [{ sales_commission: '1500', attendance_bonus: '500', total_commission: '2000' }] })
            .mockResolvedValueOnce({ rows: [] }); // payment history

        const res = mockRes();
        await getWorkerSalaryDetail(
            { params: { id: 'w1' }, query: { month: '5', year: '2026' }, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    test('অজানা worker_id — 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await getWorkerSalaryDetail(
            { params: { id: 'unknown' }, query: {}, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('DB error হলে 500', async () => {
        query.mockRejectedValueOnce(new Error('query failed'));

        const res = mockRes();
        await getWorkerSalaryDetail(
            { params: { id: 'w1' }, query: {}, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ─────────────────────────────────────────────────────────────
// paySalary
// ─────────────────────────────────────────────────────────────

describe('paySalary — বেতন পরিশোধ', () => {

    beforeEach(() => {
        withTransaction.mockImplementation(async (cb) => {
            const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
            return await cb(client);
        });
    });

    test('worker_id না দিলে 400', async () => {
        const res = mockRes();
        await paySalary(
            { body: { month: 5, year: 2026 }, user: adminUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('month না দিলে 400', async () => {
        const res = mockRes();
        await paySalary(
            { body: { worker_id: 'w1', year: 2026 }, user: adminUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('year না দিলে 400', async () => {
        const res = mockRes();
        await paySalary(
            { body: { worker_id: 'w1', month: 5 }, user: adminUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('ইতিমধ্যে পরিশোধ হলে 400', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'pay-1' }] }); // existing payment

        const res = mockRes();
        await paySalary(
            { body: { worker_id: 'w1', month: 5, year: 2026 }, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ইতিমধ্যে') })
        );
    });

    test('worker না পাওয়া গেলে 404', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })  // no existing payment
            .mockResolvedValueOnce({ rows: [] }); // worker not found

        const res = mockRes();
        await paySalary(
            { body: { worker_id: 'unknown', month: 5, year: 2026 }, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('সঠিক ডেটা দিলে বেতন পরিশোধ সফল — 200', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })  // no existing payment
            .mockResolvedValueOnce({ rows: [{ name_bn: 'করিম', basic_salary: '20000', outstanding_dues: '1000' }] }) // worker
            .mockResolvedValueOnce({ rows: [{ total_deduction: '500' }] })  // attendance deduction
            .mockResolvedValueOnce({ rows: [{ sales_commission: '2000', attendance_bonus: '500', total_commission: '2500' }] }); // commission

        const res = mockRes();
        await paySalary(
            {
                body:  { worker_id: 'w1', month: 5, year: 2026, payment_method: 'bank', deduct_dues: true },
                user:  adminUser,
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        // net = 20000 + 2500 - 500 - 1000 = 21000
        expect(body.data.net_payable).toBe(21000);
    });

    test('deduct_dues = false হলে dues কাটা যাবে না', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ name_bn: 'করিম', basic_salary: '20000', outstanding_dues: '5000' }] })
            .mockResolvedValueOnce({ rows: [{ total_deduction: '0' }] })
            .mockResolvedValueOnce({ rows: [{ sales_commission: '0', attendance_bonus: '0', total_commission: '0' }] });

        const res = mockRes();
        await paySalary(
            {
                body: { worker_id: 'w1', month: 5, year: 2026, deduct_dues: false },
                user: adminUser,
            },
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);
        // net = 20000 + 0 - 0 - 0 = 20000 (dues কাটেনি)
        expect(res.json.mock.calls[0][0].data.net_payable).toBe(20000);
    });

    test('transaction error হলে 500', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ name_bn: 'করিম', basic_salary: '20000', outstanding_dues: '0' }] })
            .mockResolvedValueOnce({ rows: [{ total_deduction: '0' }] })
            .mockResolvedValueOnce({ rows: [{ sales_commission: '0', attendance_bonus: '0', total_commission: '0' }] });

        withTransaction.mockRejectedValueOnce(new Error('transaction failed'));

        const res = mockRes();
        await paySalary(
            { body: { worker_id: 'w1', month: 5, year: 2026 }, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ─────────────────────────────────────────────────────────────
// getMySalaryHistory
// ─────────────────────────────────────────────────────────────

describe('getMySalaryHistory — নিজের বেতন ইতিহাস', () => {

    test('worker নিজের ইতিহাস দেখতে পাবে', async () => {
        query.mockResolvedValueOnce({
            rows: [
                { month: 4, year: 2026, net_payable: '18000', paid_at: '2026-04-30', payment_method: 'bank' },
                { month: 3, year: 2026, net_payable: '17500', paid_at: '2026-03-31', payment_method: 'cash' },
            ]
        });

        const res = mockRes();
        await getMySalaryHistory({ user: workerUser }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data).toHaveLength(2);
    });

    test('ইতিহাস না থাকলে খালি তালিকা', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await getMySalaryHistory({ user: workerUser }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────
// cancelSalaryPayment
// ─────────────────────────────────────────────────────────────

describe('cancelSalaryPayment — পরিশোধ বাতিল', () => {

    beforeEach(() => {
        withTransaction.mockImplementation(async (cb) => {
            const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
            return await cb(client);
        });
    });

    test('payment না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await cancelSalaryPayment(
            { params: { id: 'pay-999' }, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('২৪ ঘণ্টার পর বাতিল করা যাবে না — 400', async () => {
        const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        query.mockResolvedValueOnce({
            rows: [{ id: 'pay-1', paid_at: oldDate, worker_id: 'w1', outstanding_dues_deducted: '1000', month: 5, year: 2026 }]
        });

        const res = mockRes();
        await cancelSalaryPayment(
            { params: { id: 'pay-1' }, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('২৪ ঘণ্টা') })
        );
    });

    test('২৪ ঘণ্টার মধ্যে বাতিল সফল — 200', async () => {
        const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
        query.mockResolvedValueOnce({
            rows: [{ id: 'pay-1', paid_at: recentDate, worker_id: 'w1', outstanding_dues_deducted: '1000', month: 5, year: 2026 }]
        });

        const res = mockRes();
        await cancelSalaryPayment(
            { params: { id: 'pay-1' }, user: adminUser },
            res
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────
// Pure Business Logic — বেতন হিসাব
// ─────────────────────────────────────────────────────────────

describe('Salary Business Logic — Pure Calculations', () => {

    const calcNetSalary = (basic, commission, attDeduction, dues, deductDues = true) => {
        const d = deductDues ? dues : 0;
        return Math.max(0, basic + commission - attDeduction - d);
    };

    test('কোনো কর্তন নেই — net = basic + commission', () =>
        expect(calcNetSalary(20000, 3000, 0, 0)).toBe(23000));

    test('উপস্থিতি কর্তন আছে — net কমে', () =>
        expect(calcNetSalary(20000, 2000, 500, 0)).toBe(21500));

    test('বকেয়া আছে ও deduct_dues=true — dues কাটে', () =>
        expect(calcNetSalary(20000, 2000, 500, 2000, true)).toBe(19500));

    test('deduct_dues=false — dues কাটে না', () =>
        expect(calcNetSalary(20000, 2000, 500, 5000, false)).toBe(21500));

    test('কর্তন বেতনের বেশি হলে net = 0, কখনো negative হবে না', () =>
        expect(calcNetSalary(5000, 0, 3000, 4000)).toBe(0));

    test('পুরো মাস অনুপস্থিত — commission ০ হলে শুধু basic', () =>
        expect(calcNetSalary(20000, 0, 0, 0)).toBe(20000));

    // hourly rate হিসাব
    const calcHourlyRate = (basic) => basic / 26 / 8;

    test('hourly rate সঠিক — ২৬ কর্মদিবস, ৮ ঘণ্টা', () =>
        expect(calcHourlyRate(20800)).toBeCloseTo(100, 1));

    // late deduction
    const calcLateDeduction = (lateMinutes, basic, interval = 10) => {
        if (lateMinutes <= 0) return 0;
        const lateUnits  = Math.floor(lateMinutes / interval);
        const hourlyRate = calcHourlyRate(basic);
        return Math.round(lateUnits * hourlyRate);
    };

    test('ঠিকমতো এলে (0 মিনিট লেট) — কর্তন ০', () =>
        expect(calcLateDeduction(0, 20800)).toBe(0));

    test('১০ মিনিট লেট — ১ unit কর্তন', () =>
        expect(calcLateDeduction(10, 20800)).toBe(100));

    test('২৫ মিনিট লেট — ২ unit কর্তন', () =>
        expect(calcLateDeduction(25, 20800)).toBe(200));

    test('৯ মিনিট লেট — interval পার না হওয়ায় কর্তন ০', () =>
        expect(calcLateDeduction(9, 20800)).toBe(0));

    // payment reference generate
    const makeRef = (year, month) =>
        `SAL-${year}-${String(month).padStart(2, '0')}-`;

    test('reference format সঠিক', () =>
        expect(makeRef(2026, 5)).toBe('SAL-2026-05-'));

    test('single digit month zero-padded হয়', () =>
        expect(makeRef(2026, 1)).toBe('SAL-2026-01-'));
});
