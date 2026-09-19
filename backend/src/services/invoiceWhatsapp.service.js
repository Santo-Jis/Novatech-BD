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
//
// ✅ REFACTOR (Notification Platform Phase 2): আগে এই ফাইলই সরাসরি
// axios দিয়ে Baileys গেটওয়ে কল করত (portalWhatsapp.service.js থেকে
// সম্পূর্ণ আলাদা কোড, নিজের কোনো circuit-breaker ছাড়াই)। এখন
// whatsappGateway.service.js-এর মধ্য দিয়ে পাঠায় — একই provider-agnostic
// adapter portalWhatsapp.service.js যেটা ব্যবহার করে, তাই বোনাস হিসেবে
// এখন এটাও circuit-breaker সুরক্ষা পাচ্ছে (গেটওয়ে সাম্প্রতিক ডাউন
// থাকলে PDF বানানোর CPU খরচ না করেই দ্রুত fail করবে)। public interface
// (sendInvoiceWhatsApp) অপরিবর্তিত — sales.controller.js-এর কল
// বদলাতে হয়নি।
// ============================================================

const logger = require('../config/logger');
const { generateInvoicePDF } = require('./invoice.service');
const whatsappGateway = require('./whatsappGateway.service');

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

    // ✅ NEW (Phase 2, বোনাস): আগে এখানে কোনো circuit-breaker ছিল না —
    // এখন gateway-level হওয়ায় এখানেও কাজ করে, PDF তৈরির আগেই skip করে
    // যদি গেটওয়ে সাম্প্রতিক ডাউন দেখা যায়।
    if (whatsappGateway.isLikelyDown()) {
        logger.warn(`⚠️ [InvoiceWA] গেটওয়ে সাম্প্রতিক ডাউন দেখা গেছে — PDF তৈরি না করেই skip (${sale.invoice_number})`);
        return { success: false, reason: 'gateway_likely_down' };
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

    // ── গেটওয়েতে পাঠাও ──
    return whatsappGateway.sendDocument({
        to: formattedPhone,
        documentBuffer: pdfBuffer,
        filename: `Invoice-${sale.invoice_number}.pdf`,
        caption: `🧾 Invoice ${sale.invoice_number} — মোট ৳${parseFloat(sale.net_amount || 0).toLocaleString('bn-BD')}`,
        type: 'invoice_pdf',
    });
};


module.exports = { sendInvoiceWhatsApp };
