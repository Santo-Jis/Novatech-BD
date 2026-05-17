/**
 * attendance.controller.test.js
 * ─────────────────────────────────────────────────────────────
 * Layer 1 — Unit Test (DB ছাড়া)
 * সব DB call ও attendance.service mock করা।
 *
 * টেস্ট করা হচ্ছে:
 *   checkIn               — চেক-ইন
 *   checkOut              — চেক-আউট
 *   applyLeave            — ছুটির আবেদন
 *   reviewLeaveRequest    — আবেদন অনুমোদন/প্রত্যাখ্যান
 *   getAttendanceSettings — সেটিংস
 *   Pure Business Logic   — লেট হিসাব, কর্মদিবস
 * ─────────────────────────────────────────────────────────────
 */

// ─── Mocks ────────────────────────────────────────────────────
jest.mock('../config/db', () => ({
    query: jest.fn(),
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
jest.mock('../services/employee.service', () => ({
    uploadToCloudinary:   jest.fn().mockResolvedValue('https://res.cloudinary.com/test/selfie.jpg'),
    sendLoginCredentials: jest.fn().mockResolvedValue({}),
}));
jest.mock('../services/attendance.service', () => ({
    canCheckIn:              jest.fn(),
    canCheckOut:             jest.fn(),
    calculateLateDeduction:  jest.fn(),
    isHoliday:               jest.fn(),
    isWeeklyOff:             jest.fn(),
    getWorkingDays:          jest.fn(),
    updateFirebaseAttendance: jest.fn().mockResolvedValue({}),
    notifyManagerOnCheckIn:  jest.fn().mockResolvedValue({}),
    getSettings:             jest.fn(),
}));
jest.mock('../services/firebase.notify', () => ({
    firebaseNotify: jest.fn().mockResolvedValue({}),
}));

// ─── Imports ──────────────────────────────────────────────────
const { query } = require('../config/db');
const {
    canCheckIn,
    canCheckOut,
    calculateLateDeduction,
    isHoliday,
    isWeeklyOff,
    updateFirebaseAttendance,
    notifyManagerOnCheckIn,
    getSettings,
} = require('../services/attendance.service');

const {
    checkIn,
    checkOut,
    applyLeave,
    reviewLeaveRequest,
    getAttendanceSettings,
    getMyAttendance,
    correctAttendance,
} = require('../controllers/attendance.controller');

// ─── Helpers ──────────────────────────────────────────────────
const mockRes = () => {
    const res  = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

const workerUser = {
    id:           'worker-uuid-1',
    role:         'worker',
    name_bn:      'রহিম',
    basic_salary:  20000,
    manager_id:   'manager-uuid-1',
};

const managerUser = {
    id:      'manager-uuid-1',
    role:    'manager',
    name_bn: 'ম্যানেজার',
};

const adminUser = {
    id:      'admin-uuid-1',
    role:    'admin',
    name_bn: 'অ্যাডমিন',
};

// ─── Default service mock setup ───────────────────────────────
beforeEach(() => {
    jest.clearAllMocks();

    // Default: চেক-ইন সময়ের মধ্যে
    canCheckIn.mockResolvedValue({ allowed: true });
    canCheckOut.mockResolvedValue({ allowed: true });
    isHoliday.mockResolvedValue(false);
    isWeeklyOff.mockResolvedValue(false);
    calculateLateDeduction.mockResolvedValue({ lateMinutes: 0, deduction: 0, isLate: false });
    getSettings.mockResolvedValue({
        attendance_checkin_start: '09:00',
        attendance_checkin_end:   '10:00',
        attendance_popup_cutoff:  '14:30',
        late_deduction_interval:  '10',
        weekly_off_day:           '5',
        holidays:                 '[]',
    });
});

// ─────────────────────────────────────────────────────────────
// checkIn
// ─────────────────────────────────────────────────────────────

describe('checkIn — চেক-ইন', () => {

    test('চেক-ইনের সময় না হলে 400', async () => {
        canCheckIn.mockResolvedValue({ allowed: false, message: 'সকাল ৯টার আগে চেক-ইন করা যাবে না।' });

        const res = mockRes();
        await checkIn({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, message: expect.stringContaining('৯টা') })
        );
    });

    test('ছুটির দিনে চেক-ইন — 400', async () => {
        isHoliday.mockResolvedValue(true);

        const res = mockRes();
        await checkIn({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ছুটির দিন') })
        );
    });

    test('সাপ্তাহিক ছুটিতে চেক-ইন — 400', async () => {
        isWeeklyOff.mockResolvedValue(true);

        const res = mockRes();
        await checkIn({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ছুটির দিন') })
        );
    });

    test('আজকে আগেই চেক-ইন হয়েছে — 400', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'att-1', check_in_time: '09:00:00' }] });

        const res = mockRes();
        await checkIn({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ইতোমধ্যে') })
        );
    });

    test('সময়মতো চেক-ইন — present status — 200', async () => {
        calculateLateDeduction.mockResolvedValue({ lateMinutes: 0, deduction: 0, isLate: false });
        query
            .mockResolvedValueOnce({ rows: [] })    // no existing checkin
            .mockResolvedValueOnce({ rows: [{ id: 'att-new', status: 'present' }] }); // insert

        const res = mockRes();
        await checkIn({ body: { latitude: 23.8103, longitude: 90.4125 }, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    test('লেটে চেক-ইন — late status — 200', async () => {
        calculateLateDeduction.mockResolvedValue({ lateMinutes: 25, deduction: 200, isLate: true });
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'att-new', status: 'late' }] });

        const res = mockRes();
        await checkIn({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body.data).toHaveProperty('lateMinutes');
    });

    test('সেলফি সহ চেক-ইন — Cloudinary আপলোড হয়', async () => {
        const { uploadToCloudinary } = require('../services/employee.service');
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'att-new', status: 'present' }] });

        const res = mockRes();
        await checkIn(
            { body: {}, user: workerUser, file: { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } },
            res
        );

        expect(uploadToCloudinary).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('location দিলে GPS coordinate সেভ হয়', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'att-new', status: 'present' }] });

        const res = mockRes();
        await checkIn(
            { body: { latitude: 23.8103, longitude: 90.4125 }, user: workerUser, file: null },
            res
        );

        // location সহ query call হয়েছে কিনা যাচাই
        const insertCall = query.mock.calls[1];
        const insertSQL  = insertCall[0];
        expect(insertSQL).toMatch(/ST_MakePoint|ST_SetSRID|check_in_location/i);
    });

    test('DB error — 500', async () => {
        query.mockRejectedValueOnce(new Error('DB failed'));

        const res = mockRes();
        await checkIn({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ─────────────────────────────────────────────────────────────
// checkOut
// ─────────────────────────────────────────────────────────────

describe('checkOut — চেক-আউট', () => {

    test('আজকে চেক-ইন না থাকলে 400', async () => {
        // controller নিজেই DB query করে চেক-ইন আছে কিনা দেখে
        query.mockResolvedValueOnce({ rows: [] }); // attendance record নেই

        const res = mockRes();
        await checkOut({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('আগেই চেক-আউট হয়েছে — 400', async () => {
        // attendance আছে কিন্তু check_out_time আছে
        query.mockResolvedValueOnce({ rows: [{ id: 'att-1', check_in_time: '09:00:00', check_out_time: '17:00:00' }] });

        const res = mockRes();
        await checkOut({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false })
        );
    });

    test('সঠিক চেক-আউট — 200', async () => {
        // attendance আছে, check_in আছে, check_out নেই
        query
            .mockResolvedValueOnce({ rows: [{ id: 'att-1', check_in_time: '09:00:00', check_out_time: null }] }) // SELECT attendance
            .mockResolvedValueOnce({ rows: [] }); // UPDATE

        // worker role-এর জন্য canCheckOut call হয়
        canCheckOut.mockResolvedValue({ allowed: true });

        const res = mockRes();
        await checkOut({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('DB error — 500', async () => {
        query.mockRejectedValueOnce(new Error('DB failed'));

        const res = mockRes();
        await checkOut({ body: {}, user: workerUser, file: null }, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ─────────────────────────────────────────────────────────────
// applyLeave
// ─────────────────────────────────────────────────────────────

describe('applyLeave — ছুটির আবেদন', () => {

    test('start_date না দিলে 400', async () => {
        const res = mockRes();
        await applyLeave(
            { body: { end_date: '2026-06-15', reason: 'অসুস্থ' }, user: workerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('end_date না দিলে 400', async () => {
        const res = mockRes();
        await applyLeave(
            { body: { start_date: '2026-06-10', reason: 'অসুস্থ' }, user: workerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('end_date < start_date — 400', async () => {
        const res = mockRes();
        await applyLeave(
            { body: { start_date: '2026-06-15', end_date: '2026-06-10', reason: 'অসুস্থ' }, user: workerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('সঠিক আবেদন — 201', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'leave-1', status: 'pending' }] });

        const res = mockRes();
        await applyLeave(
            { body: { start_date: '2026-06-10', end_date: '2026-06-12', reason: 'পারিবারিক' }, user: workerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('DB error — 500', async () => {
        query.mockRejectedValueOnce(new Error('DB failed'));

        const res = mockRes();
        await applyLeave(
            { body: { start_date: '2026-06-10', end_date: '2026-06-12', reason: 'অসুস্থ' }, user: workerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ─────────────────────────────────────────────────────────────
// reviewLeaveRequest
// ─────────────────────────────────────────────────────────────

describe('reviewLeaveRequest — আবেদন অনুমোদন/প্রত্যাখ্যান', () => {

    test('status না দিলে 400', async () => {
        const res = mockRes();
        await reviewLeaveRequest(
            { params: { id: 'leave-1' }, body: {}, user: managerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('অবৈধ status (approved/rejected ছাড়া) — 400', async () => {
        const res = mockRes();
        await reviewLeaveRequest(
            { params: { id: 'leave-1' }, body: { status: 'delete' }, user: managerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('request না পাওয়া গেলে বা ইতিমধ্যে reviewed — 404', async () => {
        // controller UPDATE ... WHERE status='pending' RETURNING * → rows খালি মানে 404
        query.mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await reviewLeaveRequest(
            { params: { id: 'unknown' }, body: { status: 'approved' }, user: managerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('আগে অনুমোদিত request আবার approve — 404 (WHERE pending fail)', async () => {
        // already approved → pending filter → rows empty → 404
        query.mockResolvedValueOnce({ rows: [] });

        const res = mockRes();
        await reviewLeaveRequest(
            { params: { id: 'leave-1' }, body: { status: 'approved' }, user: managerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('pending request approve — 200', async () => {
        const leaveRow = {
            id: 'leave-1', status: 'approved',
            user_id: 'worker-uuid-1',
            start_date: '2026-06-10', end_date: '2026-06-10'
        };
        query
            .mockResolvedValueOnce({ rows: [leaveRow] }) // UPDATE leave_requests RETURNING
            .mockResolvedValueOnce({ rows: [] });         // INSERT attendance (leave day)

        const res = mockRes();
        await reviewLeaveRequest(
            { params: { id: 'leave-1' }, body: { status: 'approved' }, user: managerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('pending request reject — 200', async () => {
        query.mockResolvedValueOnce({
            rows: [{ id: 'leave-1', status: 'rejected', user_id: 'worker-uuid-1', start_date: '2026-06-10', end_date: '2026-06-10' }]
        });

        const res = mockRes();
        await reviewLeaveRequest(
            { params: { id: 'leave-1' }, body: { status: 'rejected', reviewer_note: 'যুক্তিসঙ্গত কারণ নেই' }, user: managerUser },
            res
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ─────────────────────────────────────────────────────────────
// getAttendanceSettings
// ─────────────────────────────────────────────────────────────

describe('getAttendanceSettings — সেটিংস', () => {

    test('সেটিংস সফলভাবে আসে', async () => {
        // getSettings() → query('SELECT key, value FROM system_settings')
        query.mockResolvedValueOnce({
            rows: [
                { key: 'attendance_checkin_start', value: '09:00' },
                { key: 'attendance_checkin_end',   value: '10:00' },
                { key: 'attendance_popup_cutoff',  value: '14:30' },
            ]
        });

        const res = mockRes();
        await getAttendanceSettings({ user: workerUser }, res);

        // controller res.json() সরাসরি call করে (status 200 implicitly)
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true })
        );
        const data = res.json.mock.calls[0][0].data;
        expect(data).toHaveProperty('attendance_checkin_start');
        expect(data).toHaveProperty('attendance_checkin_end');
    });
});

// ─────────────────────────────────────────────────────────────
// Pure Business Logic — Attendance Calculations
// ─────────────────────────────────────────────────────────────

describe('Attendance Business Logic — Pure Calculations', () => {

    // লেট মিনিট হিসাব
    const calcLateMinutes = (checkInHour, checkInMin, lateThresholdHour = 10, lateThresholdMin = 0) => {
        const checkInTotal    = checkInHour * 60 + checkInMin;
        const thresholdTotal  = lateThresholdHour * 60 + lateThresholdMin;
        return Math.max(0, checkInTotal - thresholdTotal);
    };

    test('ঠিক ১০:০০ তে — লেট ০ মিনিট',       () => expect(calcLateMinutes(10, 0)).toBe(0));
    test('৯:৩০ তে — লেট ০',                   () => expect(calcLateMinutes(9, 30)).toBe(0));
    test('১০:১৫ তে — লেট ১৫ মিনিট',           () => expect(calcLateMinutes(10, 15)).toBe(15));
    test('১১:০০ তে — লেট ৬০ মিনিট',           () => expect(calcLateMinutes(11, 0)).toBe(60));

    // লেট কর্তন unit হিসাব
    const calcLateUnits = (lateMinutes, interval = 10) => Math.floor(lateMinutes / interval);

    test('৯ মিনিট লেট — ০ unit',   () => expect(calcLateUnits(9)).toBe(0));
    test('১০ মিনিট লেট — ১ unit',  () => expect(calcLateUnits(10)).toBe(1));
    test('২৫ মিনিট লেট — ২ unit',  () => expect(calcLateUnits(25)).toBe(2));
    test('৬০ মিনিট লেট — ৬ unit',  () => expect(calcLateUnits(60)).toBe(6));

    // hourly rate
    const calcHourlyRate = (basic, workingDays = 26, hoursPerDay = 8) =>
        basic / workingDays / hoursPerDay;

    test('২০,৮০০ টাকা basic — hourly ১০০ টাকা', () =>
        expect(calcHourlyRate(20800)).toBeCloseTo(100, 1));

    test('২৬,০০০ টাকা basic — hourly ১২৫ টাকা', () =>
        expect(calcHourlyRate(26000)).toBeCloseTo(125, 1));

    // কর্মদিবস — সাপ্তাহিক ছুটি বাদে
    const countWorkingDays = (year, month, weeklyOffDay = 5) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        let count = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const day = new Date(year, month - 1, d).getDay(); // 0=Sun, 5=Fri
            if (day !== weeklyOffDay) count++;
        }
        return count;
    };

    test('মে ২০২৬ — শুক্রবার বাদে কর্মদিবস',   () => expect(countWorkingDays(2026, 5, 5)).toBeGreaterThan(25));
    test('কর্মদিবস ৩১ দিনের মাসে ৩১ থেকে কম', () => expect(countWorkingDays(2026, 5, 5)).toBeLessThan(31));

    // leave দিনের ব্যবধান
    const leaveDays = (start, end) => {
        const s = new Date(start);
        const e = new Date(end);
        return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    };

    test('একদিনের ছুটি',          () => expect(leaveDays('2026-06-10', '2026-06-10')).toBe(1));
    test('তিন দিনের ছুটি',        () => expect(leaveDays('2026-06-10', '2026-06-12')).toBe(3));
    test('এক সপ্তাহের ছুটি',      () => expect(leaveDays('2026-06-01', '2026-06-07')).toBe(7));

    // উপস্থিতি status নির্ধারণ
    const determineStatus = (isLate, isPresent) => {
        if (!isPresent) return 'absent';
        return isLate ? 'late' : 'present';
    };

    test('present, সময়মতো — status = present', () => expect(determineStatus(false, true)).toBe('present'));
    test('present, লেট — status = late',        () => expect(determineStatus(true, true)).toBe('late'));
    test('অনুপস্থিত — status = absent',         () => expect(determineStatus(false, false)).toBe('absent'));
});
