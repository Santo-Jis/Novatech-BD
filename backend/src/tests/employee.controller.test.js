/**
 * employee.controller.test.js
 * ════════════════════════════════════════════════════════════════
 * LAYER 1 — Unit Test  (DB ছাড়া, সব mock করা)
 *
 * employee.controller এর transitive dependency chain:
 *   employee.controller → employee.service → pdfkit + sms.service + axios
 *   employee.controller → email.service
 *   employee.controller → bcryptjs
 *   এগুলো top-level এ mock না থাকলে module load-এই crash → 500।
 *
 * টেস্ট করা হচ্ছে:
 *   getEmployee             — একজনের তথ্য
 *   getEmployees            — তালিকা (filter/pagination)
 *   createEmployee          — নতুন কর্মচারী
 *   getPendingEmployees     — অনুমোদন অপেক্ষারত তালিকা
 *   approveEmployee         — অনুমোদন
 *   rejectEmployee          — আবেদন বাতিল
 *   suspendEmployee         — বরখাস্ত
 *   reactivateEmployee      — পুনরায় যুক্ত
 *   editEmployee            — তথ্য সম্পাদনা (Admin vs Worker)
 *   getPendingEdits         — এডিট রিকোয়েস্ট তালিকা
 *   approveEdit / rejectEdit — এডিট অনুমোদন/বাতিল
 *   updateOwnProfile        — নিজের প্রোফাইল
 *   uploadProfilePhoto      — ছবি আপলোড
 *   resetPassword           — পাসওয়ার্ড রিসেট
 *   broadcastEmail          — সবাইকে ইমেইল
 *   Pure Business Logic     — validation rules
 * ════════════════════════════════════════════════════════════════
 */

// ─── Direct Mocks ─────────────────────────────────────────────
jest.mock('../config/redis', () => ({
    getRedisClient:  jest.fn().mockResolvedValue({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
    }),
    blockUserTokens: jest.fn().mockResolvedValue(undefined),
    isUserBlocked:   jest.fn().mockResolvedValue(false),
    unblockUser:     jest.fn().mockResolvedValue(undefined),
}));

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

// ─── Transitive Mocks (employee.service এর dependencies) ──────
jest.mock('pdfkit', () => {
    const mockDoc = {
        pipe:     jest.fn().mockReturnThis(),
        fontSize: jest.fn().mockReturnThis(),
        font:     jest.fn().mockReturnThis(),
        text:     jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        moveTo:   jest.fn().mockReturnThis(),
        lineTo:   jest.fn().mockReturnThis(),
        stroke:   jest.fn().mockReturnThis(),
        end:      jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((event, cb) => {
            if (event === 'end') setTimeout(cb, 0);
            return mockDoc;
        }),
    };
    return jest.fn().mockImplementation(() => mockDoc);
});
jest.mock('axios', () => ({
    post: jest.fn().mockResolvedValue({ data: { status: 'success' } }),
    get:  jest.fn().mockResolvedValue({ data: {} }),
}));
jest.mock('bcryptjs', () => ({
    hash:    jest.fn().mockResolvedValue('hashed_password_xyz'),
    compare: jest.fn().mockResolvedValue(true),
}));
jest.mock('../services/sms.service', () => ({
    sendOTP:              jest.fn().mockResolvedValue({ success: true }),
    sendLoginCredentials: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../services/email.service', () => ({
    sendEmail:                  jest.fn().mockResolvedValue({}),
    sendOTPEmail:               jest.fn().mockResolvedValue({}),
    sendLoginCredentials:       jest.fn().mockResolvedValue({}),
    sendOrderNotificationEmail: jest.fn().mockResolvedValue({}),
}));
jest.mock('../services/employee.service', () => ({
    generateEmployeeCode: jest.fn().mockResolvedValue('NTB-W-26-48293-15'),
    generateCustomerCode: jest.fn().mockResolvedValue('CUS-001'),
    uploadToCloudinary:   jest.fn().mockResolvedValue('https://cloudinary.com/img/test.jpg'),
    uploadToDrive:        jest.fn().mockResolvedValue({ url: 'https://drive.test/f', fileId: 'fid-1' }),
    generateTempPassword: jest.fn().mockReturnValue('TempPass1'),
    sendWelcomeSMS:       jest.fn().mockResolvedValue({}),
    generateEmployeePDF:  jest.fn().mockResolvedValue(Buffer.from('pdf')),
}));

// ─── Imports ──────────────────────────────────────────────────
const { query } = require('../config/db');
const {
    getEmployee, getEmployees, createEmployee, getPendingEmployees,
    approveEmployee, rejectEmployee, suspendEmployee, reactivateEmployee,
    editEmployee, getPendingEdits, approveEdit, rejectEdit,
    updateOwnProfile, uploadProfilePhoto, resetPassword, broadcastEmail,
} = require('../controllers/employee.controller');

// ─── Helpers ──────────────────────────────────────────────────
const mockRes = () => {
    const res      = {};
    res.status     = jest.fn().mockReturnValue(res);
    res.json       = jest.fn().mockReturnValue(res);
    res.setHeader  = jest.fn();
    res.send       = jest.fn();
    return res;
};

const adminUser   = { id: 'admin-uuid-1',   role: 'admin',   name_bn: 'অ্যাডমিন' };
const managerUser = { id: 'manager-uuid-1', role: 'manager', name_bn: 'ম্যানেজার', manager_id: 'manager-uuid-1' };
const workerUser  = { id: 'worker-uuid-1',  role: 'worker',  name_bn: 'করিম',      manager_id: 'manager-uuid-1' };

const makeEmployee = (overrides = {}) => ({
    id: 'emp-uuid-1', role: 'worker', name_bn: 'আলী হাসান', name_en: 'Ali Hasan',
    phone: '01700000001', email: 'ali@example.com', status: 'active',
    employee_code: 'NTB-W-26-00001', basic_salary: '20000',
    profile_photo: null, manager_id: 'manager-uuid-1',
    created_at: new Date().toISOString(),
    ...overrides,
});

// resetAllMocks — call history পরিষ্কার করে।
// কিন্তু jest.mock() factory-র initial implementation মুছে দেয়,
// তাই service mock গুলো beforeEach-এ restore করতে হবে।
beforeEach(() => {
    jest.resetAllMocks();

    const empSvc   = require('../services/employee.service');
    const emailSvc = require('../services/email.service');
    const bcrypt   = require('bcryptjs');

    empSvc.generateEmployeeCode.mockResolvedValue('NTB-W-26-48293-15');
    empSvc.generateTempPassword.mockReturnValue('TempPass1');
    empSvc.uploadToCloudinary.mockResolvedValue('https://cloudinary.com/img/test.jpg');
    empSvc.uploadToDrive.mockResolvedValue({ url: 'https://drive.test/f', fileId: 'fid-1' });
    empSvc.sendWelcomeSMS.mockResolvedValue({});
    empSvc.generateEmployeePDF.mockResolvedValue(Buffer.from('pdf'));
    emailSvc.sendEmail.mockResolvedValue({});
    bcrypt.hash.mockResolvedValue('hashed_password_xyz');

    query.mockResolvedValue({ rows: [] });
});

// ════════════════════════════════════════════════════════════════
// getEmployee
// ════════════════════════════════════════════════════════════════

describe('getEmployee — একজনের তথ্য', () => {

    test('কর্মচারী না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await getEmployee({ params: { id: 'ghost' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('পাওয়া গেলে 200, response-এ password_hash নেই', async () => {
        query.mockResolvedValueOnce({ rows: [{ ...makeEmployee(), password_hash: 'secret' }] });
        const res = mockRes();
        await getEmployee({ params: { id: 'emp-uuid-1' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        const { data } = res.json.mock.calls[0][0];
        expect(data).not.toHaveProperty('password_hash');
    });

    test('DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('conn error'));
        const res = mockRes();
        await getEmployee({ params: { id: 'e1' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// getEmployees
// ════════════════════════════════════════════════════════════════

describe('getEmployees — তালিকা', () => {

    test('Admin — সফলভাবে তালিকা আনে, 200', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '3' }] })
            .mockResolvedValueOnce({ rows: [makeEmployee(), makeEmployee({ id: 'e2' }), makeEmployee({ id: 'e3' })] });
        const res = mockRes();
        await getEmployees({ query: {}, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ total: 3 }) })
        );
    });

    test('Worker — শুধু নিজের data আসে', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '1' }] })
            .mockResolvedValueOnce({ rows: [makeEmployee({ id: workerUser.id })] });
        const res = mockRes();
        await getEmployees({ query: {}, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].data.employees).toHaveLength(1);
    });

    test('Manager + teamFilter → 200', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ count: '2' }] })
            .mockResolvedValueOnce({ rows: [makeEmployee(), makeEmployee({ id: 'e2' })] });
        const res = mockRes();
        await getEmployees({ query: {}, user: managerUser, teamFilter: managerUser.id }, res);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('gone'));
        const res = mockRes();
        await getEmployees({ query: {}, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// createEmployee
// ════════════════════════════════════════════════════════════════

describe('createEmployee — নতুন কর্মচারী', () => {

    const validBody = { role: 'worker', name_bn: 'আলী', name_en: 'Ali', phone: '01700000001' };

    test('name_bn না দিলে 400', async () => {
        const res = mockRes();
        await createEmployee({ body: { role: 'worker', name_en: 'Ali', phone: '017' }, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('phone না দিলে 400', async () => {
        const res = mockRes();
        await createEmployee({ body: { role: 'worker', name_bn: 'আলী', name_en: 'Ali' }, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('role না দিলে 400', async () => {
        const res = mockRes();
        await createEmployee({ body: { name_bn: 'আলী', name_en: 'Ali', phone: '017' }, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('active কর্মচারীর ফোন → 400 + "আগে থেকেই নিবন্ধিত"', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'old', status: 'active' }] });
        const res = mockRes();
        await createEmployee({ body: validBody, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আগে থেকেই নিবন্ধিত') })
        );
    });

    test('archived কর্মচারীর ফোন → 409 + ARCHIVED_EXISTS', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 'old-id', status: 'archived' }] });
        const res = mockRes();
        await createEmployee({ body: validBody, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'ARCHIVED_EXISTS' })
        );
    });

    test('সফলভাবে তৈরি → 201 + temp_password', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'new', name_bn: 'আলী', phone: '017', role: 'worker', status: 'pending' }] });
        const res = mockRes();
        await createEmployee({ body: validBody, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ temp_password: 'TempPass1' }) })
        );
    });

    test('DB unique violation (23505) → 400', async () => {
        query
            .mockResolvedValueOnce({ rows: [] })
            .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: '23505' }));
        const res = mockRes();
        await createEmployee({ body: validBody, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

// ════════════════════════════════════════════════════════════════
// getPendingEmployees
// ════════════════════════════════════════════════════════════════

describe('getPendingEmployees — পেন্ডিং তালিকা', () => {

    test('200 + array', async () => {
        query.mockResolvedValueOnce({ rows: [makeEmployee({ status: 'pending' })] });
        const res = mockRes();
        await getPendingEmployees({ user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: expect.any(Array) })
        );
    });

    test('DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('timeout'));
        const res = mockRes();
        await getPendingEmployees({ user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// approveEmployee
// ════════════════════════════════════════════════════════════════

describe('approveEmployee — অনুমোদন', () => {

    test('pending না পাওয়া → 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await approveEmployee({ params: { id: 'ghost' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('পেন্ডিং কর্মচারী') })
        );
    });

    test('সফল অনুমোদন → 200 + employee_code', async () => {
        query
            .mockResolvedValueOnce({ rows: [makeEmployee({ status: 'pending', join_date: '2026-01-01' })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await approveEmployee({ params: { id: 'emp-uuid-1' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ employee_code: 'NTB-W-26-48293-15' }) })
        );
    });

    test('sendWelcomeSMS কল হয়', async () => {
        const empSvc = require('../services/employee.service');
        query
            .mockResolvedValueOnce({ rows: [makeEmployee({ status: 'pending', join_date: '2026-01-01' })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await approveEmployee({ params: { id: 'e1' }, user: adminUser }, res);
        expect(empSvc.sendWelcomeSMS).toHaveBeenCalledTimes(1);
    });

    test('email থাকলে sendEmail কল হয়', async () => {
        const emailSvc = require('../services/email.service');
        query
            .mockResolvedValueOnce({ rows: [makeEmployee({ status: 'pending', email: 't@t.com', join_date: '2026-01-01' })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await approveEmployee({ params: { id: 'e1' }, user: adminUser }, res);
        expect(emailSvc.sendEmail).toHaveBeenCalledTimes(1);
    });
});

// ════════════════════════════════════════════════════════════════
// rejectEmployee
// ════════════════════════════════════════════════════════════════

describe('rejectEmployee — আবেদন বাতিল', () => {

    test('সফল → 200 + "বাতিল" message', async () => {
        query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await rejectEmployee({ params: { id: 'e1' }, body: { reason: 'ভুল' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('বাতিল') })
        );
    });

    test('DB error → 500', async () => {
        query.mockRejectedValueOnce(new Error('err'));
        const res = mockRes();
        await rejectEmployee({ params: { id: 'e1' }, body: {}, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ════════════════════════════════════════════════════════════════
// suspendEmployee
// ════════════════════════════════════════════════════════════════

describe('suspendEmployee — বরখাস্ত', () => {

    test('কর্মচারী না পাওয়া গেলে 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await suspendEmployee({ params: { id: 'ghost' }, body: {}, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('সফল → 200 + name_bn সহ message', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ name_bn: 'রহিম উদ্দিন' }] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await suspendEmployee({ params: { id: 'e1' }, body: { reason: 'অনুপস্থিতি' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('রহিম উদ্দিন') })
        );
    });
});

// ════════════════════════════════════════════════════════════════
// reactivateEmployee
// ════════════════════════════════════════════════════════════════

describe('reactivateEmployee — পুনরায় যুক্ত', () => {

    test('archived না পাওয়া → 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await reactivateEmployee({ params: { id: 'ghost' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আর্কাইভ') })
        );
    });

    test('সফল → 200 + new_password', async () => {
        query
            .mockResolvedValueOnce({ rows: [makeEmployee({ status: 'archived', email: null })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await reactivateEmployee({ params: { id: 'e1' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ new_password: 'TempPass1' }) })
        );
    });

    test('email থাকলে sendEmail কল হয়', async () => {
        const emailSvc = require('../services/email.service');
        query
            .mockResolvedValueOnce({ rows: [makeEmployee({ status: 'archived', email: 'x@x.com' })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await reactivateEmployee({ params: { id: 'e1' }, user: adminUser }, res);
        expect(emailSvc.sendEmail).toHaveBeenCalledTimes(1);
    });

    test('email না থাকলে sendEmail কল হয় না', async () => {
        const emailSvc = require('../services/email.service');
        query
            .mockResolvedValueOnce({ rows: [makeEmployee({ status: 'archived', email: null })] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await reactivateEmployee({ params: { id: 'e1' }, user: adminUser }, res);
        expect(emailSvc.sendEmail).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// editEmployee
// ════════════════════════════════════════════════════════════════

describe('editEmployee — তথ্য সম্পাদনা', () => {

    test('কর্মচারী না পাওয়া → 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await editEmployee({ params: { id: 'ghost' }, body: { name_bn: 'নাম' }, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('কোনো পরিবর্তন নেই → 400', async () => {
        query.mockResolvedValueOnce({ rows: [makeEmployee()] });
        const res = mockRes();
        await editEmployee({ params: { id: 'e1' }, body: {}, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('কোনো পরিবর্তন নেই') })
        );
    });

    test('Admin → সরাসরি UPDATE + 200', async () => {
        query
            .mockResolvedValueOnce({ rows: [makeEmployee()] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await editEmployee({ params: { id: 'e1' }, body: { name_bn: 'নতুন নাম' }, user: adminUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আপডেট হয়েছে') })
        );
    });

    test('Worker → employees_audit তৈরি হয় + audit_id ফেরত আসে', async () => {
        query
            .mockResolvedValueOnce({ rows: [makeEmployee()] })
            .mockResolvedValueOnce({ rows: [{ id: 55 }] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await editEmployee({ params: { id: 'e1' }, body: { name_bn: 'নতুন' }, user: workerUser, files: {} }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ audit_id: 55 }) })
        );
    });
});

// ════════════════════════════════════════════════════════════════
// getPendingEdits / approveEdit / rejectEdit
// ════════════════════════════════════════════════════════════════

describe('getPendingEdits — এডিট রিকোয়েস্ট', () => {

    test('সফল → 200 + array', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] });
        const res = mockRes();
        await getPendingEdits({ user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: expect.any(Array) })
        );
    });
});

describe('approveEdit — এডিট অনুমোদন', () => {

    test('সফল → 200', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await approveEdit({ params: { id: '5' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('অনুমোদন সফল') })
        );
    });
});

describe('rejectEdit — এডিট বাতিল', () => {

    test('audit না পাওয়া → 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await rejectEdit({ params: { id: '999' }, body: {}, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('সফল বাতিল → আগের data restore + 200', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 5, user_id: 'e1', changes: {}, previous_values: { name_bn: 'পুরনো' } }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await rejectEdit({ params: { id: '5' }, body: { reason: 'ভুল' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('আগের তথ্যে ফিরে গেছে') })
        );
    });
});

// ════════════════════════════════════════════════════════════════
// updateOwnProfile
// ════════════════════════════════════════════════════════════════

describe('updateOwnProfile — নিজের প্রোফাইল', () => {

    test('সফল → 200', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await updateOwnProfile({ body: { name_bn: 'করিম উদ্দিন' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('প্রোফাইল আপডেট হয়েছে') })
        );
    });

    test('emergency_contact object → সঠিকভাবে string-এ convert হয়', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await updateOwnProfile({ body: { emergency_contact: { number: '01800000001' } }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
    });
});

// ════════════════════════════════════════════════════════════════
// uploadProfilePhoto
// ════════════════════════════════════════════════════════════════

describe('uploadProfilePhoto — ছবি আপলোড', () => {

    test('file না দিলে 400', async () => {
        const res = mockRes();
        await uploadProfilePhoto({ file: null, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('ছবি দিন') })
        );
    });

    test('Cloudinary null return → 500', async () => {
        const empSvc = require('../services/employee.service');
        empSvc.uploadToCloudinary.mockResolvedValueOnce(null);
        const res = mockRes();
        await uploadProfilePhoto({ file: { buffer: Buffer.from('img'), mimetype: 'image/jpeg' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    test('সফল → 200 + profile_photo URL', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await uploadProfilePhoto({ file: { buffer: Buffer.from('img'), mimetype: 'image/jpeg' }, user: workerUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ profile_photo: 'https://cloudinary.com/img/test.jpg' }) })
        );
    });
});

// ════════════════════════════════════════════════════════════════
// resetPassword
// ════════════════════════════════════════════════════════════════

describe('resetPassword — পাসওয়ার্ড রিসেট', () => {

    test('কর্মচারী না পাওয়া → 404', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await resetPassword({ params: { id: 'ghost' }, body: {}, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('সফল → 200 + new_password', async () => {
        query.mockResolvedValueOnce({ rows: [{ name_bn: 'আলী', email: null }] });
        const res = mockRes();
        await resetPassword({ params: { id: 'e1' }, body: {}, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ new_password: 'TempPass1' }) })
        );
    });

    test('send_email: true + email → sendEmail কল হয়', async () => {
        const emailSvc = require('../services/email.service');
        query.mockResolvedValueOnce({ rows: [{ name_bn: 'আলী', email: 'a@a.com' }] });
        const res = mockRes();
        await resetPassword({ params: { id: 'e1' }, body: { send_email: true }, user: adminUser }, res);
        expect(emailSvc.sendEmail).toHaveBeenCalledTimes(1);
    });

    test('send_email: true কিন্তু email null → sendEmail কল হয় না', async () => {
        const emailSvc = require('../services/email.service');
        query.mockResolvedValueOnce({ rows: [{ name_bn: 'আলী', email: null }] });
        const res = mockRes();
        await resetPassword({ params: { id: 'e1' }, body: { send_email: true }, user: adminUser }, res);
        expect(emailSvc.sendEmail).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════
// broadcastEmail
// ════════════════════════════════════════════════════════════════

describe('broadcastEmail — সবাইকে ইমেইল', () => {

    test('subject না দিলে 400', async () => {
        const res = mockRes();
        await broadcastEmail({ body: { message: 'বার্তা' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('message না দিলে 400', async () => {
        const res = mockRes();
        await broadcastEmail({ body: { subject: 'নোটিশ' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('active কর্মচারী না থাকলে "কোনো email পাওয়া যায়নি"', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await broadcastEmail({ body: { subject: 'নোটিশ', message: 'বার্তা' }, user: adminUser }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('কোনো email পাওয়া যায়নি') })
        );
    });

    test('২ জনকে পাঠালে sendEmail ২ বার কল হয়', async () => {
        const emailSvc = require('../services/email.service');
        query.mockResolvedValueOnce({
            rows: [{ name_bn: 'আলী', email: 'a@a.com' }, { name_bn: 'করিম', email: 'k@k.com' }],
        });
        const res = mockRes();
        await broadcastEmail({ body: { subject: 'নোটিশ', message: 'বার্তা' }, user: adminUser }, res);
        expect(emailSvc.sendEmail).toHaveBeenCalledTimes(2);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('2 জনকে') })
        );
    });
});

// ════════════════════════════════════════════════════════════════
// Pure Business Logic
// ════════════════════════════════════════════════════════════════

describe('Employee Business Logic — Pure Calculations', () => {

    const canSuspend = (role) => role !== 'admin';
    test('admin suspend করা যাবে না',  () => expect(canSuspend('admin')).toBe(false));
    test('worker suspend করা যাবে',    () => expect(canSuspend('worker')).toBe(true));
    test('manager suspend করা যাবে',   () => expect(canSuspend('manager')).toBe(true));

    const getAllowedFields = (isAdmin) => {
        const base = ['name_bn', 'name_en', 'father_name', 'mother_name',
            'email', 'phone2', 'dob', 'gender', 'marital_status',
            'permanent_address', 'current_address', 'district', 'thana',
            'skills', 'education', 'experience', 'emergency_contact'];
        return isAdmin ? [...base, 'basic_salary', 'manager_id', 'role'] : base;
    };
    test('Admin basic_salary edit করতে পারে',      () => expect(getAllowedFields(true)).toContain('basic_salary'));
    test('Worker basic_salary edit করতে পারে না',  () => expect(getAllowedFields(false)).not.toContain('basic_salary'));
    test('সবাই name_bn edit করতে পারে',             () => expect(getAllowedFields(false)).toContain('name_bn'));

    const normalizeContact = (val) => {
        if (!val) return null;
        if (typeof val === 'object') return val?.number || val?.phone || val?.value || '';
        return String(val).trim();
    };
    test('string → unchanged',         () => expect(normalizeContact('01700000001')).toBe('01700000001'));
    test('{ number } → number',        () => expect(normalizeContact({ number: '01800000001' })).toBe('01800000001'));
    test('{ phone } → phone',          () => expect(normalizeContact({ phone: '019' })).toBe('019'));
    test('null → null',                () => expect(normalizeContact(null)).toBeNull());
    test('empty object → empty string',() => expect(normalizeContact({})).toBe(''));

    const hasRequired = ({ name_bn, name_en, phone, role }) => !!(name_bn && name_en && phone && role);
    test('সব field → valid',   () => expect(hasRequired({ name_bn: 'আলী', name_en: 'Ali', phone: '017', role: 'worker' })).toBe(true));
    test('name_bn নেই → invalid', () => expect(hasRequired({ name_en: 'Ali', phone: '017', role: 'worker' })).toBe(false));
    test('role নেই → invalid',    () => expect(hasRequired({ name_bn: 'আলী', name_en: 'Ali', phone: '017' })).toBe(false));

    const isValidPass = (p) => p && p.length >= 8;
    test('8+ অক্ষর → valid',  () => expect(isValidPass('AbCd1234')).toBe(true));
    test('7 অক্ষর → invalid', () => expect(isValidPass('AbCd123')).toBe(false));
    test('null → invalid',    () => expect(isValidPass(null)).toBeFalsy());
});
