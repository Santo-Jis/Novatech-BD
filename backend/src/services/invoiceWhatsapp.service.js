// ============================================================
// backend/src/services/invoiceWhatsapp.service.js
//
// কাজ:
//   invoice তৈরি হওয়ার পর কাস্টমারের WhatsApp-এ
//   invoice-এর PDF (ডকুমেন্ট হিসেবে) পাঠাবে।
//
// ব্যবহার (sales.controller.js-এ):
//   const { sendInvoiceWhatsApp } = require('../services/invoiceWhatsapp.service');
//   ...createSale এর পরে...
//   sendInvoiceWhatsApp(cust, saleResult, req.user, processedItems).catch(logger.error);
// ============================================================

const axios = require('axios');
const logger = require('../config/logger');
const { generateInvoicePDF } = require('./invoice.service');

const BAILEYS_URL = process.env.BAILEYS_URL  || 'http://localhost:3001';
const API_SECRET  = process.env.API_SECRET   || 'change-this-secret';

// ─── Phone Formatter ────────────────────────────────────────
const formatPhone = (phone) => {
    if (!phone) return null;
    let digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('01') && digits.length === 11) digits = '880' + digits;
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits;
};


// ─── Main Function ──────────────────────────────────────────
/**
 * invoice তৈরি হওয়ার পর কাস্টমারের WhatsApp-এ ছবি পাঠাও।
 *
 * @param {object} customer  — DB থেকে customer row (whatsapp, shop_name, owner_name)
 * @param {object} sale      — DB থেকে sale row (invoice_number, net_amount, payment_method ইত্যাদি)
 * @param {object} worker    — req.user (sr এর তথ্য — name_bn, employee_code)
 * @param {array}  items     — processed items array [{ product_name, qty, price }]
 * @returns {Promise<{success: boolean}>}
 */
const sendInvoiceWhatsApp = async (customer, sale, worker, items) => {

    // ── Phone চেক ──
    const phone = customer.whatsapp || customer.sms_phone;
    if (!phone) {
        logger.warn(`⚠️ [InvoiceWA] WhatsApp নম্বর নেই — Customer: ${customer.shop_name}`);
        return { success: false, reason: 'no_phone' };
    }

    const formattedPhone = formatPhone(phone);
    if (!formattedPhone) {
        logger.warn(`⚠️ [InvoiceWA] Phone format করা যায়নি: ${phone}`);
        return { success: false, reason: 'invalid_phone' };
    }

    // ── PDF তৈরি ──
    // আগে raw JSON পাঠিয়ে ওপাশে Puppeteer দিয়ে ছবি বানানোর প্ল্যান ছিল, কিন্তু গেটওয়ে
    // Render ফ্রি-টায়ারে (512MB RAM) চলে বলে Chromium চালানো ঝুঁকিপূর্ণ — তাই এখানেই
    // existing generateInvoicePDF() দিয়ে হালকা PDF বানিয়ে ডকুমেন্ট হিসেবে পাঠানো হচ্ছে।
    let pdfBuffer;
    try {
        pdfBuffer = await generateInvoicePDF(sale, customer, worker, items);
    } catch (err) {
        logger.error(`❌ [InvoiceWA] PDF তৈরি ব্যর্থ — ${sale.invoice_number}:`, err.message);
        return { success: false, reason: 'pdf_generation_failed', detail: err.message };
    }

    // ── Baileys গেটওয়েতে পাঠাও ──
    try {
        const response = await axios.post(
            `${BAILEYS_URL}/send-document`,
            {
                phone:      formattedPhone,
                base64Data: pdfBuffer.toString('base64'),
                fileName:   `Invoice-${sale.invoice_number}.pdf`,
                caption:    `🧾 Invoice ${sale.invoice_number} — মোট ৳${parseFloat(sale.net_amount || 0).toLocaleString('bn-BD')}`,
                type:       'invoice_pdf',
            },
            {
                headers:  { 'x-api-key': API_SECRET },
                timeout:  15_000,
            }
        );

        if (response.data?.success) {
            logger.info(`✅ [InvoiceWA] Invoice PDF পাঠানো → ${formattedPhone} (${sale.invoice_number})`);
            return { success: true };
        } else {
            logger.warn(`⚠️ [InvoiceWA] গেটওয়ে সাড়া দিল কিন্তু success=false:`, response.data);
            return { success: false, reason: 'gateway_error', detail: response.data };
        }

    } catch (err) {
        // গেটওয়ে down বা timeout হলেও main flow বন্ধ হবে না
        const status = err.response?.status;
        const detail = err.response?.data || err.message;

        if (status === 503) {
            logger.warn(`⚠️ [InvoiceWA] WhatsApp connect নেই — ${sale.invoice_number}`);
        } else if (err.code === 'ECONNABORTED') {
            logger.warn(`⚠️ [InvoiceWA] Timeout — ${sale.invoice_number}`);
        } else {
            logger.error(`❌ [InvoiceWA] Error — ${sale.invoice_number}:`, { detail });
        }

        return { success: false, reason: err.code || 'request_error', detail };
    }
};


module.exports = { sendInvoiceWhatsApp };
