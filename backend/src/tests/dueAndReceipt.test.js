/**
 * dueAndReceipt.test.js
 *
 * তিনটা সমস্যার সমাধান যাচাই:
 *   ১. নগদ বিক্রিতে বিলের বেশি টাকা → পুরনো বাকি থেকে কাটা (createSale: cash_given / due_payment)
 *   ২. ইনভয়েসে আগের বাকি / বাকি-আদায় / এখনকার বাকি (invoiceDue.util + PDF + WhatsApp টেক্সট)
 *   ৩. পণ্য ছাড়া শুধু বাকি দিলে রসিদ (collectionReceipt.service)
 */

jest.mock('../config/db', () => ({ query: jest.fn(), withTransaction: jest.fn() }));
jest.mock('../config/firebase', () => ({
    initializeFirebase: jest.fn(),
    getDB: jest.fn().mockReturnValue({ ref: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue({}) }) }),
}));
jest.mock('../services/price.utils', () => ({ calcFromProduct: jest.fn() }));
jest.mock('../config/encryption', () => ({
    generateOTP: jest.fn().mockReturnValue('123456'),
    encrypt: jest.fn(), decrypt: jest.fn(),
}));
jest.mock('../controllers/ledger.controller', () => ({ addLedgerEntry: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/firebase.notify', () => ({ firebaseNotify: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/sms.service', () => ({
    sendOTP: jest.fn().mockResolvedValue({ success: true }),
    sendInvoice: jest.fn().mockResolvedValue({ success: true }),
    getWhatsAppInvoiceLink: jest.fn(),
}));
jest.mock('../services/email.service', () => ({
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
    sendOTPEmail: jest.fn(), sendOTPWithInvoiceEmail: jest.fn().mockResolvedValue({}), sendInvoiceEmail: jest.fn(),
}));
jest.mock('../services/employee.service', () => ({ uploadToCloudinary: jest.fn() }));
jest.mock('../services/whatsappGateway.service', () => ({
    isLikelyDown: jest.fn().mockReturnValue(false),
    sendDocument: jest.fn().mockResolvedValue({ success: true }),
    sendText: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../services/invoiceWhatsapp.service', () => ({ sendInvoiceWhatsApp: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('../services/invoiceBranding.service', () => ({
    loadInvoiceBranding: jest.fn().mockResolvedValue({
        company: { name: 'টেস্ট কোম্পানি', address: 'বরিশাল', phone: null, email: null }, itemMeta: {},
    }),
    itemSubtitle: jest.fn().mockReturnValue(''),
}));
jest.mock('../controllers/customerNotification.controller', () => ({
    sendCustomerNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock('../services/commission.service', () => ({
    updateCommissionRealtime: jest.fn().mockResolvedValue({ rate: 0, amount: 0, totalSales: 0 }),
    getDailyCommissionableSales: jest.fn(), getWorkerRateOverride: jest.fn(),
    getDailyCommissionBreakdown: jest.fn().mockResolvedValue({ entries: [] }),
    getSaleCommissionMap: jest.fn(),
}));

const { query, withTransaction } = require('../config/db');
const { calcFromProduct } = require('../services/price.utils');
const whatsappGateway = require('../services/whatsappGateway.service');
const { getDueSummary, getDueRows } = require('../services/invoiceDue.util');
const { buildReceiptNo, generateCollectionReceiptPDF, sendCollectionReceipt } = require('../services/collectionReceipt.service');

// ─────────────────────────────────────────────────────────────
describe('invoiceDue.util — বাকির হিসাব সারি', () => {
    test('পুরনো ইনভয়েস (স্ন্যাপশট NULL) → কিছুই দেখায় না', () => {
        expect(getDueSummary({ previous_due: null, closing_due: null, credit_used: 0 })).toBeNull();
        expect(getDueRows({ credit_used: 0 })).toEqual([]);
    });
    test('আগে/পরে বাকি ০ এবং কিছু আদায় নেই → দেখায় না', () => {
        expect(getDueRows({ previous_due: 0, closing_due: 0, due_payment: 0, credit_used: 0 })).toEqual([]);
    });
    test('বাকি ৫০০০, ১০০০ বিল, ৫০০ বাড়তি → আগের ৫০০০, আদায় ৫০০, এখন ৪৫০০', () => {
        const rows = getDueRows({ previous_due: '5000', due_payment: '500', closing_due: '4500', credit_used: 0 });
        expect(rows.map(r => r.label)).toEqual(['আগের বাকি', '− বাকি আদায় (আজ)', 'এখনকার মোট বাকি']);
        expect(rows.map(r => r.value)).toEqual(['৳5,000', '৳500', '৳4,500']);
        expect(rows[2].bold).toBe(true);
    });
    test('নগদ বিক্রি, বাকি ৫০০০ — ইনভয়েসে আগের বাকি ও মোট বাকি দুটোই (সমস্যা ২)', () => {
        const rows = getDueRows({ previous_due: 5000, due_payment: 0, closing_due: 5000, credit_used: 0 });
        expect(rows.map(r => r.value)).toEqual(['৳5,000', '৳5,000']);
    });
    test('বাকি বিক্রিতে "এই ইনভয়েসের বাকি" সারি আসে', () => {
        const rows = getDueRows({ previous_due: 5000, due_payment: 0, closing_due: 7000, credit_used: 2000 });
        expect(rows.map(r => r.label)).toContain('+ এই ইনভয়েসের বাকি');
    });
});

// ─────────────────────────────────────────────────────────────
describe('Invoice PDF / WhatsApp টেক্সট — আসল pdfkit', () => {
    const { generateInvoicePDF, getInvoiceWhatsAppMessage } = require('../services/invoice.service');
    const sale = {
        invoice_number: 'INV-1', created_at: new Date(), total_amount: 2000, net_amount: 2000, discount_amount: 0,
        payment_method: 'cash', cash_received: 2000, credit_used: 0, otp_verified: false,
        previous_due: 5000, due_payment: 0, closing_due: 5000,
    };
    const customer = { shop_name: 'দোকান', owner_name: 'মালিক', whatsapp: '01700000000' };
    const worker   = { name_bn: 'আলী', employee_code: 'SR1' };
    const items    = [{ product_id: 'p', product_name: 'পণ্য', qty: 2, price: 1000 }];

    test('PDF তৈরি হয় (বাকির হিসাব সহ) — বৈধ PDF বাইট', async () => {
        const buf = await generateInvoicePDF(sale, customer, worker, items);
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.slice(0, 4).toString()).toBe('%PDF');
    });
    test('পুরনো ইনভয়েসেও PDF ভাঙে না', async () => {
        const buf = await generateInvoicePDF({ ...sale, previous_due: null, closing_due: null }, customer, worker, items);
        expect(buf.slice(0, 4).toString()).toBe('%PDF');
    });
    test('WhatsApp টেক্সটে আগের বাকি ও এখনকার মোট বাকি থাকে', () => {
        const msg = getInvoiceWhatsAppMessage(sale, customer, worker, items, 'কো');
        expect(msg).toContain('বাকির হিসাব');
        expect(msg).toContain('আগের বাকি: ৳5,000');
        expect(msg).toContain('এখনকার মোট বাকি: ৳5,000');
    });
    test('বাকি আদায় হলে টেক্সটে আদায়ের লাইন আসে', () => {
        const msg = getInvoiceWhatsAppMessage({ ...sale, due_payment: 500, closing_due: 4500 }, customer, worker, items, 'কো');
        expect(msg).toContain('বাকি বাবদ নগদ প্রাপ্ত: ৳500');
        expect(msg).toContain('এখনকার মোট বাকি: ৳4,500');
    });
    test('স্ন্যাপশট না থাকলে টেক্সটে বাকির অংশ নেই', () => {
        const msg = getInvoiceWhatsAppMessage({ ...sale, previous_due: null, closing_due: null }, customer, worker, items, 'কো');
        expect(msg).not.toContain('বাকির হিসাব');
    });
});

// ─────────────────────────────────────────────────────────────
describe('collectionReceipt.service — পণ্য ছাড়া বাকি আদায়ের রসিদ (সমস্যা ৩)', () => {
    beforeEach(() => { jest.clearAllMocks(); whatsappGateway.isLikelyDown.mockReturnValue(false); });

    test('রসিদ নম্বর id + BD তারিখ থেকে, একই আদায়ে একই নম্বর', () => {
        const d = new Date('2026-11-08T20:00:00Z'); // BD সময়ে ০৯ নভেম্বর
        expect(buildReceiptNo('a1b2c3d4-0000-0000-0000-000000000000', d)).toBe('MR-20261109-A1B2C3');
        expect(buildReceiptNo('a1b2c3d4-0000-0000-0000-000000000000', d))
            .toBe(buildReceiptNo('a1b2c3d4-0000-0000-0000-000000000000', d));
    });

    test('রসিদ PDF বৈধ', async () => {
        const buf = await generateCollectionReceiptPDF({
            receiptNo: 'MR-1', createdAt: new Date(), company: { name: 'কো' },
            customer: { shop_name: 'দোকান', owner_name: 'মালিক' },
            amount: 2000, paymentMode: 'cash', previousDue: 5000, remainingDue: 3000,
            invoiceNumbers: ['INV-1', 'INV-2'], collectorName: 'আলী', collectorCode: 'SR1',
        });
        expect(buf.slice(0, 4).toString()).toBe('%PDF');
    });

    test('বাকি ৫০০০, ২০০০ দিল → WhatsApp-এ PDF যায়, ক্যাপশনে এখনকার বাকি ৩০০০', async () => {
        query.mockImplementation(async (sql) => {
            if (sql.includes('FROM customers')) return { rows: [{ shop_name: 'দোকান', owner_name: 'মালিক', whatsapp: '01711111111', sms_phone: null, email: null }] };
            if (sql.includes('FROM sales_transactions')) return { rows: [{ invoice_number: 'INV-9' }] };
            return { rows: [] };
        });
        const r = await sendCollectionReceipt({
            tenantId: 't1', customerId: 'c1', paymentId: 'abcdef12-0000-0000-0000-000000000000',
            amount: 2000, paymentMode: 'cash', previousDue: 5000, remainingDue: 3000,
            allocations: [{ sale_id: 's1' }], collector: { name_bn: 'আলী', employee_code: 'SR1' },
        });
        expect(r.success).toBe(true);
        expect(r.channel).toBe('whatsapp');
        const arg = whatsappGateway.sendDocument.mock.calls[0][0];
        expect(arg.to).toBe('8801711111111');
        expect(arg.filename).toMatch(/^Receipt-MR-\d{8}-ABCDEF\.pdf$/);
        expect(arg.caption).toContain('3,000');
        expect(arg.documentBuffer.slice(0, 4).toString()).toBe('%PDF');
    });

    test('WhatsApp ব্যর্থ হলে ইমেইলে যায়', async () => {
        whatsappGateway.sendDocument.mockResolvedValueOnce({ success: false, reason: 'down' });
        const { sendEmail } = require('../services/email.service');
        query.mockImplementation(async (sql) => sql.includes('FROM customers')
            ? { rows: [{ shop_name: 'দোকান', owner_name: 'ম', whatsapp: '01711111111', sms_phone: null, email: 'a@b.com' }] }
            : { rows: [] });
        const r = await sendCollectionReceipt({
            tenantId: 't1', customerId: 'c1', paymentId: 'p1', amount: 100, remainingDue: 0,
        });
        expect(r.channel).toBe('email');
        expect(sendEmail).toHaveBeenCalledWith('a@b.com', expect.stringContaining('MR-'), expect.any(String), expect.any(String), expect.any(Object));
    });

    test('কোনো যোগাযোগ-মাধ্যম না থাকলে throw না করে no_contact', async () => {
        query.mockImplementation(async (sql) => sql.includes('FROM customers')
            ? { rows: [{ shop_name: 'দোকান', owner_name: 'ম', whatsapp: null, sms_phone: null, email: null }] }
            : { rows: [] });
        const r = await sendCollectionReceipt({ tenantId: 't1', customerId: 'c1', paymentId: 'p1', amount: 100, remainingDue: 0 });
        expect(r).toEqual(expect.objectContaining({ success: false, reason: 'no_contact' }));
    });

    test('DB ফেল করলেও throw করে না', async () => {
        query.mockRejectedValue(new Error('db down'));
        const r = await sendCollectionReceipt({ tenantId: 't1', customerId: 'c1', paymentId: 'p1', amount: 1, remainingDue: 0 });
        expect(r.success).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────
describe('createSale — বিলের বেশি নগদ → বাকি থেকে কাটা (সমস্যা ১)', () => {
    const { createSale } = require('../controllers/sales.controller');
    const mockRes = () => { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn().mockReturnValue(r); return r; };
    const worker = { id: 'w1', role: 'worker', name_bn: 'আলী', employee_code: 'SR1', manager_id: null };

    let clientCalls;
    const setup = ({ currentCredit = '5000' } = {}) => {
        calcFromProduct.mockReturnValue({ unitPrice: 1000, vatRate: 0, taxRate: 0, vatAmount: 0, taxAmount: 0, finalPrice: 1000, subtotal: 1000 });
        query.mockReset();
        query.mockImplementation(async (sql) => {
            if (typeof sql !== 'string') return { rows: [] };
            if (sql.includes('FROM customers'))     return { rows: [{ id: 'c1', shop_name: 'দোকান', current_credit: currentCredit, credit_limit: '50000', credit_balance: 0 }] };
            if (sql.includes('FROM products'))      return { rows: [{ id: 'p1', name: 'পণ্য', price: '1000', vat: '0', tax: '0' }] };
            if (sql.includes('system_settings'))    return { rows: [{ value: 'false' }] };
            if (sql.includes('generate_invoice_number')) return { rows: [{ invoice_number: 'INV-T' }] };
            return { rows: [] };
        });
        clientCalls = [];
        withTransaction.mockReset();
        withTransaction.mockImplementation(async (cb) => {
            const client = { query: jest.fn(async (sql, params) => {
                clientCalls.push({ sql: String(sql), params });
                const q = String(sql);
                if (q.includes('FROM sr_stock_ledger')) return { rows: [{ pid: 'p1', in_hand: '999' }] };
                if (q.includes('FROM customers') && q.includes('FOR UPDATE')) return { rows: [{ current_credit: currentCredit, credit_limit: '50000' }] };
                if (q.includes('SELECT current_credit FROM customers')) {
                    // বিক্রি + কাটার পরের মান: ৫০০০ − ৫০০
                    return { rows: [{ current_credit: '4500' }] };
                }
                if (q.includes('INSERT INTO sales_transactions')) return { rows: [{ id: 'sale1', invoice_number: 'INV-T', total_amount: 1000, net_amount: 1000, payment_method: 'cash', cash_received: 1000, credit_used: 0, verify_token: 'x' }] };
                if (q.includes('INSERT INTO collections')) return { rows: [{ id: 'col1' }] };
                // অন্য সব (অর্ডার lock, visit, stock_movements …) — কিছু একটা row ফেরত দিলেই চলে
                return { rows: [{ id: 'o1' }] };
            }) };
            return cb(client);
        });
    };
    const sell = async (body) => {
        const res = mockRes();
        await createSale({ body: { customer_id: 'c1', items: [{ product_id: 'p1', qty: 1 }], payment_method: 'cash', ...body }, user: worker, tenantId: 't1' }, res);
        return res;
    };

    test('বাকি ৫০০০, বিল ১০০০, ১৫০০ নগদ → collections ৫০০, current_credit −৫০০, স্ন্যাপশট ৫০০০/৫০০/৪৫০০', async () => {
        setup();
        const res = await sell({ cash_given: 1500, idempotency_key: 'k1' });
        expect(res.status).toHaveBeenCalledWith(201);
        const body = res.json.mock.calls[0][0].data;
        expect(body.previous_due).toBe(5000);
        expect(body.due_payment).toBe(500);
        expect(body.closing_due).toBe(4500);

        const col = clientCalls.find(c => c.sql.includes('INSERT INTO collections'));
        expect(col).toBeTruthy();
        expect(col.params[2]).toBe(500);                // amount
        expect(col.params[5]).toBe('k1:due');           // idempotency key
        const dec = clientCalls.find(c => c.sql.includes('GREATEST(0, current_credit - $1)'));
        expect(dec.params[0]).toBe(500);
        // বিক্রির নিজের নগদ বদলায়নি (settlement/commission নিরাপদ)
        const ins = clientCalls.find(c => c.sql.includes('INSERT INTO sales_transactions'));
        expect(ins.params[10]).toBe(1000);              // cash_received
        const snap = clientCalls.find(c => c.sql.includes('SET previous_due'));
        expect(snap.params.slice(0, 3)).toEqual([5000, 500, 4500]);
    });

    test('ঠিক বিলের সমান নগদ (cash_given=১০০০) → কোনো collections এন্ট্রি নেই', async () => {
        setup();
        const res = await sell({ cash_given: 1000 });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(clientCalls.find(c => c.sql.includes('INSERT INTO collections'))).toBeUndefined();
        expect(res.json.mock.calls[0][0].data.due_payment).toBe(0);
    });

    test('cash_given না পাঠালে আগের মতোই; ইনভয়েসে আগের বাকি স্ন্যাপশট থাকে (সমস্যা ২)', async () => {
        setup();
        const res = await sell({});
        const d = res.json.mock.calls[0][0].data;
        expect(d.previous_due).toBe(5000);
        expect(d.due_payment).toBe(0);
        expect(clientCalls.find(c => c.sql.includes('INSERT INTO collections'))).toBeUndefined();
    });

    test('বিলের চেয়ে কম নগদ → 400, কিছুই লেখা হয় না', async () => {
        setup();
        const res = await sell({ cash_given: 800 });
        expect(res.status).toHaveBeenCalledWith(400);
        expect(withTransaction).not.toHaveBeenCalled();
    });

    test('বাড়তি টাকা মোট বাকির চেয়ে বেশি → 400 DUE_PAYMENT_EXCEEDS', async () => {
        setup({ currentCredit: '300' });
        const res = await sell({ cash_given: 1500 });  // বাড়তি ৫০০ > বাকি ৩০০
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DUE_PAYMENT_EXCEEDS' }));
    });

    test('বাকি (credit) পদ্ধতিতে due_payment → 400', async () => {
        setup();
        const res = await sell({ payment_method: 'credit', due_payment: 200 });
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
