// ============================================================
// backend/src/services/invoiceWhatsapp.service.js
//
// কাজ:
//   invoice তৈরি হওয়ার পর কাস্টমারের WhatsApp-এ
//   invoice-এর ছবি পাঠাবে।
//
// ব্যবহার (sales.controller.js-এ):
//   const { sendInvoiceWhatsApp } = require('../services/invoiceWhatsapp.service');
//   ...createSale এর পরে...
//   sendInvoiceWhatsApp(cust, saleResult, req.user, processedItems).catch(logger.error);
// ============================================================

const axios = require('axios');
const logger = require('../config/logger');

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

    // ── Invoice Data তৈরি ──
    const invoicePayload = {
        invoice_number:      sale.invoice_number,
        created_at:          sale.created_at || new Date().toISOString(),

        // Customer তথ্য
        shop_name:           customer.shop_name,
        owner_name:          customer.owner_name,

        // SR তথ্য
        sr_name:             worker?.name_bn  || worker?.name || 'SR',
        sr_code:             worker?.employee_code || '',

        // Items
        items: (items || []).map(i => ({
            product_name: i.product_name,
            qty:          parseFloat(i.qty  || 0),
            price:        parseFloat(i.price || 0),
        })),

        // Replacement items (ফেরত পণ্য)
        replacement_items: (sale.replacement_items || []).map(i => ({
            product_name: i.product_name,
            qty:          parseFloat(i.qty   || 0),
            total:        parseFloat(i.total || 0),
        })),

        // Totals
        total_amount:        parseFloat(sale.total_amount        || 0),
        net_amount:          parseFloat(sale.net_amount          || 0),
        discount_amount:     parseFloat(sale.discount_amount     || 0),
        replacement_value:   parseFloat(sale.replacement_value   || 0),
        credit_balance_added:parseFloat(sale.credit_balance_added|| 0),

        // Status
        payment_method: sale.payment_method || 'cash',
        otp_verified:   sale.otp_verified   || false,
    };

    // ── Baileys-এ পাঠাও ──
    try {
        const response = await axios.post(
            `${BAILEYS_URL}/send-invoice`,
            {
                phone:   formattedPhone,
                invoice: invoicePayload,
            },
            {
                headers:  { 'x-api-secret': API_SECRET },
                timeout:  30_000, // Puppeteer render-এ সময় লাগে, তাই 30s
            }
        );

        if (response.data?.success) {
            logger.info(`✅ [InvoiceWA] Invoice ছবি পাঠানো → ${formattedPhone} (${sale.invoice_number})`);
            return { success: true };
        } else {
            logger.warn(`⚠️ [InvoiceWA] Baileys সাড়া দিল কিন্তু success=false:`, response.data);
            return { success: false, reason: 'baileys_error', detail: response.data };
        }

    } catch (err) {
        // Baileys down বা timeout হলেও main flow বন্ধ হবে না
        const status = err.response?.status;
        const detail = err.response?.data || err.message;

        if (status === 503) {
            logger.warn(`⚠️ [InvoiceWA] WhatsApp connect নেই — ${sale.invoice_number}`);
        } else if (err.code === 'ECONNABORTED') {
            logger.warn(`⚠️ [InvoiceWA] Timeout — ${sale.invoice_number}`);
        } else {
            logger.error(`❌ [InvoiceWA] Error — ${sale.invoice_number}:`, detail);
        }

        return { success: false, reason: err.code || 'request_error', detail };
    }
};


module.exports = { sendInvoiceWhatsApp };
