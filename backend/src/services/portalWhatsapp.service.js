// ============================================================
// backend/src/services/portalWhatsapp.service.js
//
// কাস্টমার পোর্টালের জন্য WhatsApp মেসেজ পাঠানো — OTP (password
// reset ও registration verification) এবং নিরাপত্তা সতর্কতা
// (password change alert) — সবগুলোতেই ব্যবহৃত হয়।
//
// ✅ REFACTOR (Notification Platform Phase 2): আগে এই ফাইলই সরাসরি
// axios দিয়ে Baileys গেটওয়ে কল করত। এখন সেই HTTP-call অংশ
// whatsappGateway.service.js-এ সরানো হয়েছে (provider-agnostic adapter
// — এখন 'baileys', ভবিষ্যতে অফিসিয়াল WhatsApp Business API-ও যোগ করা
// যাবে caller না বদলিয়ে, শুধু WHATSAPP_PROVIDER env var পাল্টে)। এই
// ফাইল এখন শুধু নিজের কাজ রাখে: phone format, message টেক্সট বানানো।
//
// public interface অপরিবর্তিত — sendPortalOTPWhatsApp,
// sendPasswordChangedAlertWhatsApp, sendPortalWhatsAppMessage,
// formatPhoneForWhatsApp, isWhatsAppLikelyDown — সবগুলোই আগের মতোই
// import করা যাবে, caller-দের কিছু বদলাতে হয়নি।
//
// ⚠️ গুরুত্বপূর্ণ: sms.service.js (যেটা tenant wallet থেকে টাকা কাটে)
// ইচ্ছাকৃতভাবে ব্যবহার করা হয়নি। Baileys-এ কোনো tenant_id/wallet
// ধারণাই নেই — এটা সম্পূর্ণভাবে প্ল্যাটফর্মের নিজস্ব একটা WhatsApp
// নম্বর থেকে পাঠায়, তাই কোনো SaaS কোম্পানির ক্রেডিট/ওয়ালেট থেকে কিছু
// কাটা হয় না।
// ============================================================

const logger = require('../config/logger');
const whatsappGateway = require('./whatsappGateway.service');

// circuit-breaker এখন gateway-level (invoiceWhatsapp.service.js-ও এখন
// এই একই সুরক্ষা পায়, আগে শুধু এখানে ছিল) — এখানে শুধু re-export, যাতে
// customerPortal.controller.js-এর ৩টা import path বদলাতে না হয়।
const isWhatsAppLikelyDown = () => whatsappGateway.isLikelyDown();

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
 * যেকোনো প্লেইন টেক্সট মেসেজ WhatsApp-এ পাঠায় (whatsappGateway.service.js দিয়ে)।
 * OTP, নিরাপত্তা সতর্কতা — সব ধরনের পোর্টাল মেসেজিং এর মূল প্রিমিটিভ।
 *
 * @param {string} phone   — যেকোনো ফরম্যাটে BD মোবাইল নম্বর
 * @param {string} message — সম্পূর্ণ মেসেজ টেক্সট (আগে থেকে তৈরি)
 * @param {string} type    — গেটওয়ে-সাইড লগিং/ক্যাটাগরির জন্য লেবেল
 * @returns {Promise<{success: boolean, reason?: string, detail?: any}>}
 */
const sendPortalWhatsAppMessage = async (phone, message, type = 'portal_notification') => {
    const formattedPhone = formatPhoneForWhatsApp(phone);
    if (!formattedPhone) {
        logger.warn(`⚠️ [PortalWA:${type}] Phone format করা যায়নি: ${phone}`);
        return { success: false, reason: 'invalid_phone' };
    }

    return whatsappGateway.sendText({ to: formattedPhone, body: message, type });
};

/**
 * OTP কোড WhatsApp-এ পাঠায় — sendPortalWhatsAppMessage-এর উপর তৈরি।
 *
 * @param {string} phone          — যেকোনো ফরম্যাটে BD মোবাইল নম্বর
 * @param {string} otp            — ৬ ডিজিটের OTP কোড (plain, শুধু মেসেজে যাবে)
 * @param {string} purpose        — মেসেজে দেখানোর জন্য (যেমন: 'পাসওয়ার্ড সেট/রিসেট', 'রেজিস্ট্রেশন যাচাই')
 * @param {number} expiryMinutes  — কত মিনিট পর্যন্ত কার্যকর (ডিফল্ট ১০)
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
const sendPortalOTPWhatsApp = async (phone, otp, purpose = 'যাচাই', expiryMinutes = 10) => {
    const message =
        `🔐 *ZovoriX কাস্টমার পোর্টাল*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `আপনার ${purpose} কোড:\n\n` +
        `*${otp}*\n\n` +
        `⏱️ এই কোডটি ${expiryMinutes} মিনিট পর্যন্ত কার্যকর।\n` +
        `কারো সাথে এই কোডটি শেয়ার করবেন না।\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `_আপনি এই অনুরোধ না করে থাকলে, মেসেজটি উপেক্ষা করুন।_`;

    return sendPortalWhatsAppMessage(phone, message, 'portal_otp');
};

/**
 * পাসওয়ার্ড পরিবর্তন/সেট হওয়ার নিরাপত্তা সতর্কতা WhatsApp-এ পাঠায়।
 * অ্যাকাউন্ট কম্প্রোমাইজ হলে আসল মালিক যাতে সাথে সাথে জানতে পারে।
 *
 * @param {string} phone — যেকোনো ফরম্যাটে BD মোবাইল নম্বর
 * @param {string} whenText — কখন ঘটেছে (আগে থেকে বাংলায় ফরম্যাট করা, Asia/Dhaka)
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
const sendPasswordChangedAlertWhatsApp = async (phone, whenText) => {
    const message =
        `🔒 *ZovoriX নিরাপত্তা সতর্কতা*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `আপনার কাস্টমার পোর্টাল অ্যাকাউন্টের পাসওয়ার্ড এইমাত্র পরিবর্তন/সেট করা হয়েছে।\n\n` +
        `🕐 সময়: ${whenText}\n\n` +
        `⚠️ *এটা যদি আপনি না করে থাকেন*, দয়া করে সাথে সাথে আপনার সংশ্লিষ্ট দোকান/কোম্পানির সাথে যোগাযোগ করুন।\n` +
        `━━━━━━━━━━━━━━━━`;

    return sendPortalWhatsAppMessage(phone, message, 'security_alert');
};

module.exports = {
    sendPortalOTPWhatsApp,
    sendPasswordChangedAlertWhatsApp,
    sendPortalWhatsAppMessage,
    formatPhoneForWhatsApp,
    isWhatsAppLikelyDown,
};
