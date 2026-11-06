jest.mock('../config/db', () => ({ query: jest.fn() }));
jest.mock('../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../services/email.service', () => ({ sendEmail: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('../services/fcm.service', () => ({ sendPushToMany: jest.fn().mockResolvedValue() }));
jest.mock('../controllers/customerNotification.controller', () => ({ sendCustomerNotification: jest.fn().mockResolvedValue() }));
jest.mock('../config/publicAppUrl', () => ({ getPublicAppUrl: () => 'https://app.test' }));
jest.mock('../config/queue', () => ({ notificationQueue: { add: jest.fn() }, isQueueAvailable: () => false }));
jest.mock('../services/portalWhatsapp.service', () => ({
    sendPortalWhatsAppMessage: jest.fn(),
    isWhatsAppLikelyDown: jest.fn().mockReturnValue(false),
}));

const { query } = require('../config/db');
const { sendEmail } = require('../services/email.service');
const wa = require('../services/portalWhatsapp.service');
const { sendCreditReminder } = require('../controllers/creditReminder.controller');

const mockRes = () => { const r = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); return r; };
const req = { params: { customerId: 'c1' }, user: { id: 'sr1', name_bn: 'রহিম' }, tenantId: 't1' };
const cust = (o = {}) => ({ id: 'c1', shop_name: 'দোকান', owner_name: 'করিম', email: null, whatsapp: '01711111111',
    current_credit: '5000', sr_name: 'SR', manager_id: null, portal_redirect_id: null, ...o });

// প্রথম query = throttle (খালি), দ্বিতীয় = কাস্টমার, বাকি = INSERT ইত্যাদি
const setup = (c) => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [c] }).mockResolvedValue({ rows: [] });
};
const insertCall = () => query.mock.calls.find(([sql]) => /INSERT INTO credit_reminder_logs/.test(sql));

beforeEach(() => { sendEmail.mockClear(); wa.sendPortalWhatsAppMessage.mockReset(); wa.isWhatsAppLikelyDown.mockReturnValue(false); });

test('শুধু WhatsApp আছে → WhatsApp যায়, Email যায় না, লগে channel=whatsapp', async () => {
    setup(cust());
    wa.sendPortalWhatsAppMessage.mockResolvedValue({ success: true });
    const res = mockRes();
    await sendCreditReminder(req, res);
    expect(wa.sendPortalWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertCall()[1]).toEqual(expect.arrayContaining(['whatsapp']));
    expect(res.json.mock.calls[0][0].data).toMatchObject({ channel: 'whatsapp', whatsapp_sent: true });
});

test('দুটোই আছে, WhatsApp সফল → Email যায় না', async () => {
    setup(cust({ email: 'a@b.com' }));
    wa.sendPortalWhatsAppMessage.mockResolvedValue({ success: true });
    await sendCreditReminder(req, mockRes());
    expect(sendEmail).not.toHaveBeenCalled();
});

test('WhatsApp ব্যর্থ + Email আছে → Email-এ fallback', async () => {
    setup(cust({ email: 'a@b.com' }));
    wa.sendPortalWhatsAppMessage.mockResolvedValue({ success: false });
    const res = mockRes();
    await sendCreditReminder(req, res);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].data.channel).toBe('email');
});

test('WhatsApp ব্যর্থ + Email নেই → ৫০২, লগ বসে না', async () => {
    setup(cust());
    wa.sendPortalWhatsAppMessage.mockResolvedValue({ success: false });
    const res = mockRes();
    await sendCreditReminder(req, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(insertCall()).toBeUndefined();
});

test('WhatsApp গেটওয়ে down ধরা থাকলে চেষ্টাই করে না', async () => {
    setup(cust({ email: 'a@b.com' }));
    wa.isWhatsAppLikelyDown.mockReturnValue(true);
    await sendCreditReminder(req, mockRes());
    expect(wa.sendPortalWhatsAppMessage).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
});

test('email ও WhatsApp কোনোটাই না থাকলে → ৪০০', async () => {
    setup(cust({ whatsapp: null }));
    const res = mockRes();
    await sendCreditReminder(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
});
