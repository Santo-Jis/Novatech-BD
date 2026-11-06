const { decideReminder, channelPlan, DEFAULT_CONFIG } = require('../services/creditReminderPolicy.service');

const base = {
    amountDue: 5000, oldestDueDays: 10, daysSinceLastPayment: null,
    remindersInCycle: 0, daysSinceLastReminder: null, snoozedUntil: null,
    now: new Date('2026-11-09T06:00:00Z'),
};
const d = (o) => decideReminder({ ...base, ...o });

describe('decideReminder', () => {
    test('যোগ্য কাস্টমার → ধাপ ১, কাস্টমারকে', () => {
        expect(d({})).toMatchObject({ send: true, stage: 1, audience: 'customer' });
    });
    test('ছোট বাকি বাদ', () => expect(d({ amountDue: 300 }).reason).toBe('below_min_amount'));
    test('৭ দিনের কম পুরনো বাদ', () => expect(d({ oldestDueDays: 5 }).reason).toBe('in_grace_period'));
    test('সম্প্রতি পেমেন্ট করলে বাদ', () => expect(d({ daysSinceLastPayment: 1 }).reason).toBe('recent_payment'));
    test('snooze চলাকালীন বাদ (দিনসহ)', () => {
        expect(d({ snoozedUntil: '2026-11-09' }).reason).toBe('snoozed');
        expect(d({ snoozedUntil: '2026-11-08' }).send).toBe(true);
    });
    test('ধাপ ২ আগে বিরতি লাগে (৭ দিন)', () => {
        expect(d({ remindersInCycle: 1, daysSinceLastReminder: 3 }).reason).toBe('too_soon');
        expect(d({ remindersInCycle: 1, daysSinceLastReminder: 7 })).toMatchObject({ send: true, stage: 2 });
    });
    test('ধাপ ৪–৫ শুধু স্টাফ; ১৪ দিন বিরতি; এরপর বন্ধ', () => {
        expect(d({ remindersInCycle: 3, daysSinceLastReminder: 10 }).reason).toBe('too_soon');
        expect(d({ remindersInCycle: 3, daysSinceLastReminder: 14 })).toMatchObject({ stage: 4, audience: 'staff' });
        expect(d({ remindersInCycle: 5, daysSinceLastReminder: 30 }).reason).toBe('max_stage_reached');
    });
});

describe('channelPlan', () => {
    test('ধাপ ১: WhatsApp আগে, fallback Email, in-app নয়', () =>
        expect(channelPlan(1)).toEqual({ mode: 'first', order: ['whatsapp', 'email'], inApp: false }));
    test('ধাপ ৩: দুটোই', () => expect(channelPlan(3).mode).toBe('all'));
    test('ধাপ ৪: কাস্টমারকে কিছু নয়', () => expect(channelPlan(4).mode).toBe('none'));
});
