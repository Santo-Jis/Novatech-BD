jest.mock('../config/db', () => ({ query: jest.fn(), withTransaction: jest.fn() }));
jest.mock('../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../services/portalPerson.service', () => ({ getPersonId: jest.fn().mockResolvedValue('p1') }));
jest.mock('../services/fcm.service', () => ({ sendPushToMany: jest.fn().mockResolvedValue() }));
jest.mock('../controllers/customerNotification.controller', () => ({ sendCustomerNotification: jest.fn().mockResolvedValue() }));

const { query } = require('../config/db');
const ctrl = require('../controllers/creditReminderSnooze.controller');
const { resolveSnoozeDate, addDays } = ctrl;

const mockRes = () => { const r = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); return r; };
const TODAY = '2026-11-09';

describe('resolveSnoozeDate', () => {
    test('days → আজ + n', () => expect(resolveSnoozeDate({ days: 7 }, TODAY).until).toBe('2026-11-16'));
    test('সঠিক তারিখ গ্রহণযোগ্য', () => expect(resolveSnoozeDate({ snooze_until: '2026-11-20' }, TODAY).until).toBe('2026-11-20'));
    test('আজকের তারিখও চলে', () => expect(resolveSnoozeDate({ snooze_until: TODAY }, TODAY).until).toBe(TODAY));
    test('অতীতের তারিখ ঠিক নয়', () => expect(resolveSnoozeDate({ snooze_until: '2026-11-08' }, TODAY).error).toBeTruthy());
    test('৩০ দিনের বেশি ঠিক নয়', () => {
        expect(resolveSnoozeDate({ snooze_until: addDays(TODAY, 30) }, TODAY).until).toBeTruthy();
        expect(resolveSnoozeDate({ snooze_until: addDays(TODAY, 31) }, TODAY).error).toBeTruthy();
    });
    test('ভুয়া তারিখ ঠিক নয়', () => {
        expect(resolveSnoozeDate({ snooze_until: '2026-02-31' }, TODAY).error).toBeTruthy();
        expect(resolveSnoozeDate({ snooze_until: 'কাল' }, TODAY).error).toBeTruthy();
    });
    test('কিছু না দিলে ত্রুটি', () => expect(resolveSnoozeDate({}, TODAY).error).toBeTruthy());
});

describe('snoozeMyReminder', () => {
    beforeEach(() => query.mockReset());

    test('connection_id ছাড়া → ৪০০', async () => {
        const res = mockRes();
        await ctrl.snoozeMyReminder({ body: { days: 3 }, portalUser: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('অন্যের connection_id → ৪০৩, কিছু লেখা হয় না', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await ctrl.snoozeMyReminder({ body: { connection_id: 'x', days: 3 }, portalUser: {} }, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('বাকি না থাকলে → ৪০০', async () => {
        query.mockResolvedValueOnce({ rows: [{ customer_id: 'c1', tenant_id: 't1', shop_name: 'S', current_credit: '0' }] });
        const res = mockRes();
        await ctrl.snoozeMyReminder({ body: { connection_id: 'x', days: 3 }, portalUser: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('৬০ দিনে ৩ বার হয়ে গেলে → ৪২৯', async () => {
        query.mockResolvedValueOnce({ rows: [{ customer_id: 'c1', tenant_id: 't1', shop_name: 'S', current_credit: '5000' }] })
             .mockResolvedValueOnce({ rows: [{ n: 3 }] });
        const res = mockRes();
        await ctrl.snoozeMyReminder({ body: { connection_id: 'x', days: 3 }, portalUser: {} }, res);
        expect(res.status).toHaveBeenCalledWith(429);
    });

    test('সফল → আগেরটা expire, নতুন insert, ২০১', async () => {
        query.mockResolvedValueOnce({ rows: [{ customer_id: 'c1', tenant_id: 't1', shop_name: 'S', current_credit: '5000' }] })
             .mockResolvedValueOnce({ rows: [{ n: 0 }] })
             .mockResolvedValue({ rows: [], rowCount: 0 });
        const res = mockRes();
        await ctrl.snoozeMyReminder({ body: { connection_id: 'x', days: 7 }, portalUser: {} }, res);
        expect(res.status).toHaveBeenCalledWith(201);
        const sqls = query.mock.calls.map(c => c[0]);
        expect(sqls.some(s => /UPDATE credit_reminder_snoozes/.test(s))).toBe(true);
        expect(sqls.some(s => /INSERT INTO credit_reminder_snoozes/.test(s))).toBe(true);
    });
});

describe('cancelMyReminderSnooze', () => {
    beforeEach(() => query.mockReset());
    test('অন্যের connection → ৪০৩', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const res = mockRes();
        await ctrl.cancelMyReminderSnooze({ body: { connection_id: 'x' }, portalUser: {} }, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});
