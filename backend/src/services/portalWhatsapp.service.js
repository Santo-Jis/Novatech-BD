// ============================================================
// backend/src/services/portalWhatsapp.service.js
//
// কাস্টমার পোর্টালের জন্য OTP পাঠানো (WhatsApp দিয়ে) — Password
// reset ও Registration verification দুটোতেই ব্যবহৃত হয়।
//
// ⚠️ গুরুত্বপূর্ণ: এটা বিদ্যমান invoiceWhatsapp.service.js/invoice.service.js
// এর মতোই সরাসরি Baileys গেটওয়ে (self-hosted WhatsApp Web session) ব্যবহার
// করে — sms.service.js (যেটা tenant wallet থেকে টাকা কাটে) ইচ্ছাকৃতভাবে
// ব্যবহার করা হয়নি। Baileys-এ কোনো tenant_id/wallet ধারণাই নেই — এটা
// সম্পূর্ণভাবে প্ল্যাটফর্মের নিজস্ব একটা WhatsApp নম্বর থেকে পাঠায়, তাই
// কোনো SaaS কোম্পানির ক্রেডিট/ওয়ালেট থেকে কিছু কাটা হয় না।
// ============================================================

const axios  = require('axios');
const logger = require('../config/logger');

const BAILEYS_URL = process.env.BAILEYS_URL || 'http://localhost:3001';
const API_SECRET  = process.env.API_SECRET  || 'change-this-secret';

// ─── Phone Formatter (BD নম্বর → WhatsApp আন্তর্জাতিক ফরম্যাট) ───
// ইনপুট: 01XXXXXXXXX / 8801XXXXXXXXX / 1XXXXXXXXX (যেকোনো ফরম্যাট)
// আউটপুট: 8801XXXXXXXXX (leading 0 বাদ দিয়ে, ঠিক ১৩ ডিজিট)
const formatPhoneForWhatsApp = (phone) => {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('880')) return digits;
    if (digits.startsWith('0'))   return '880' + digits.slice(1);
    if (digits.length === 10)     return '880' + digits;
    return digits;
};

/**
 * OTP কোড WhatsApp-এ প্লেইন টেক্সট মেসেজ হিসেবে পাঠায় (Baileys গেটওয়ে দিয়ে)।
 *
 * @param {string} phone          — যেকোনো ফরম্যাটে BD মোবাইল নম্বর
 * @param {string} otp            — ৬ ডিজিটের OTP কোড (plain, শুধু মেসেজে যাবে)
 * @param {string} purpose        — মেসেজে দেখানোর জন্য (যেমন: 'পাসওয়ার্ড সেট/রিসেট', 'রেজিস্ট্রেশন যাচাই')
 * @param {number} expiryMinutes  — কত মিনিট পর্যন্ত কার্যকর (ডিফল্ট ১০)
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
const sendPortalOTPWhatsApp = async (phone, otp, purpose = 'যাচাই', expiryMinutes = 10) => {
    const formattedPhone = formatPhoneForWhatsApp(phone);
    if (!formattedPhone) {
        logger.warn(`⚠️ [PortalOTP-WA] Phone format করা যায়নি: ${phone}`);
        return { success: false, reason: 'invalid_phone' };
    }

    const message =
        `🔐 *ZovoriX কাস্টমার পোর্টাল*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `আপনার ${purpose} কোড:\n\n` +
        `*${otp}*\n\n` +
        `⏱️ এই কোডটি ${expiryMinutes} মিনিট পর্যন্ত কার্যকর।\n` +
        `কারো সাথে এই কোডটি শেয়ার করবেন না।\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `_আপনি এই অনুরোধ না করে থাকলে, মেসেজটি উপেক্ষা করুন।_`;

    try {
        const res = await axios.post(
            `${BAILEYS_URL}/send-message`,
            { phone: formattedPhone, message, type: 'portal_otp' },
            { headers: { 'x-api-key': API_SECRET }, timeout: 10_000 }
        );
        if (res.data?.success) {
            logger.info(`📲 [PortalOTP-WA] সফল → ${formattedPhone}`);
            return { success: true };
        }
        logger.warn(`⚠️ [PortalOTP-WA] গেটওয়ে সাড়া দিল কিন্তু success=false:`, res.data);
        return { success: false, reason: 'baileys_error', detail: res.data };
    } catch (err) {
        const status = err.response?.status;
        if (status === 503) {
            logger.warn(`⚠️ [PortalOTP-WA] WhatsApp সেশন কানেক্টেড নেই → ${formattedPhone}`);
        } else {
            logger.warn(`⚠️ [PortalOTP-WA] ব্যর্থ → ${formattedPhone}:`, err.message);
        }
        return { success: false, reason: err.code || 'request_error', detail: err.response?.data || err.message };
    }
};

module.exports = { sendPortalOTPWhatsApp, formatPhoneForWhatsApp };
