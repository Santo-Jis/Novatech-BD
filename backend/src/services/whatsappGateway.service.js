// backend/src/services/whatsappGateway.service.js
// ============================================================
// WhatsApp Gateway — provider-agnostic adapter
// (Notification Platform Phase 2 — generic adapter; vendor decision
// deliberately deferred by the user, so no vendor-specific integration
// code is written here yet — see "ভবিষ্যতের provider" নিচে)
//
// sms.service.js-এর multi-provider adapter প্যাটার্নটাই অনুসরণ করা
// হয়েছে (SoftBarta/SSLWireless/Twilio/Custom, env var দিয়ে বেছে নেওয়া) —
// এই একই shape, WhatsApp-এর জন্য।
//
// portalWhatsapp.service.js (OTP/security text) আর
// invoiceWhatsapp.service.js (invoice PDF) — দুটোই এখন এই gateway-র
// মধ্য দিয়ে পাঠায় (নিজেদের public function signature অপরিবর্তিত, phone
// formatting/message-বানানো/PDF-generation নিজেদের কাছেই থাকে — শুধু
// "গেটওয়েতে আসল HTTP কলটা" এখানে সরানো হয়েছে)।
//
// ── এখন বাস্তবায়িত ──
// 'baileys': বিদ্যমান self-hosted গেটওয়ে (Phase 0-এ hardcoded secret
// সরানো হয়েছিল) — সেই একই HTTP call দুটো ফাইল থেকে এখানে সরানো হয়েছে,
// আচরণ অপরিবর্তিত, নতুন কিছু লেখা হয়নি। circuit-breaker
// (isWhatsAppLikelyDown) আগে শুধু portalWhatsapp.service.js-এ ছিল —
// এখন gateway-level, তাই invoiceWhatsapp.service.js-ও বিনামূল্যে এই
// সুরক্ষা পাচ্ছে (আগে ছিল না)।
//
// ── ভবিষ্যতের provider — স্পষ্ট stub, আন্দাজ-করা implementation না ──
// 'twilio', 'meta_cloud', 'gupshup', '360dialog', 'wati' — এগুলোর
// কোনোটার real API-র বিরুদ্ধে test করার সুযোগ নেই এখানে (network
// access/credential নেই)। আন্দাজ করে লেখা কোড "কাজ করে" ভেবে merge হয়ে
// যাওয়ার চেয়ে, বেছে নিলে স্পষ্ট "implement করা হয়নি" error দেওয়া
// নিরাপদ। ভবিষ্যতে কেউ একটা বাস্তবায়ন করলে: নিচে PROVIDERS-এ একটা নতুন
// entry, sendText/sendTemplate/sendDocument — ঠিক baileysProvider-এর
// শেইপে। caller-দের (portalWhatsapp.service.js, invoiceWhatsapp.service.js,
// এদের callers) কিছুই বদলাতে হবে না।
//
// ── sendText বনাম sendTemplate — কেন আলাদা ──
// Baileys আর অফিসিয়াল WhatsApp Business Platform-এর একটা মৌলিক
// পার্থক্য: অফিসিয়াল API-তে ২৪-ঘণ্টা customer-service window-এর বাইরে
// শুধু Meta-approved TEMPLATE message পাঠানো যায় (placeholder-সহ
// আগে থেকে অনুমোদিত), free-form text না। Baileys-এ এই রেস্ট্রিকশন
// নেই — তাই baileysProvider.sendTemplate() শুধু variables বসিয়ে plain
// text বানিয়ে sendText()-ই কল করে। ভবিষ্যতে official provider লেখার
// সময় sendTemplate()-এই আসল template API কল যাবে (templateName +
// languageCode + variables নিয়ে) — sendText() হয়তো ২৪-ঘণ্টা window-এর
// ভেতরের reply-only ব্যবহারের জন্য থাকবে।
// ============================================================

const axios  = require('axios');
const logger = require('../config/logger');

const BAILEYS_URL = process.env.BAILEYS_URL || 'http://localhost:3001';
const API_SECRET  = process.env.API_SECRET || null;

if (!API_SECRET) {
    logger.warn('⚠️ [WhatsAppGateway] API_SECRET সেট নেই — baileys provider দিয়ে পাঠানো বন্ধ থাকবে যতক্ষণ না সেট করা হয়।');
}

// ─── circuit-breaker (portalWhatsapp.service.js থেকে সরানো, এখন
// gateway-level — বাকি নিয়ম অপরিবর্তিত) ───
let lastFailureAt = null;
const DOWN_WINDOW_MS = 2 * 60 * 1000; // ২ মিনিট

const isLikelyDown = () => {
    if (!lastFailureAt) return false;
    return (Date.now() - lastFailureAt) < DOWN_WINDOW_MS;
};
const markFailure  = () => { lastFailureAt = Date.now(); };
const markRecovered = () => { lastFailureAt = null; };


// ============================================================
// baileysProvider — portalWhatsapp.service.js + invoiceWhatsapp.service.js
// থেকে হুবহু তুলে আনা HTTP call, আচরণ অপরিবর্তিত।
// ============================================================
const baileysProvider = {
    async sendText({ to, body, type = 'notification' }) {
        if (!API_SECRET) return { success: false, reason: 'not_configured' };

        try {
            const res = await axios.post(
                `${BAILEYS_URL}/send-message`,
                { phone: to, message: body, type },
                { headers: { 'x-api-key': API_SECRET }, timeout: 10_000 }
            );
            if (res.data?.success) {
                logger.info(`📲 [WhatsAppGateway:baileys:${type}] সফল → ${to}`);
                markRecovered();
                return { success: true };
            }
            logger.warn(`⚠️ [WhatsAppGateway:baileys:${type}] গেটওয়ে সাড়া দিল কিন্তু success=false:`, res.data);
            markFailure();
            return { success: false, reason: 'baileys_error', detail: res.data };
        } catch (err) {
            const status = err.response?.status;
            if (status === 503) {
                logger.warn(`⚠️ [WhatsAppGateway:baileys:${type}] WhatsApp সেশন কানেক্টেড নেই → ${to}`);
            } else {
                logger.warn(`⚠️ [WhatsAppGateway:baileys:${type}] ব্যর্থ → ${to}:`, err.message);
            }
            markFailure();
            return { success: false, reason: err.code || 'request_error', detail: err.response?.data || err.message };
        }
    },

    // Baileys-এ template-restriction নেই — উপরের কমেন্ট দেখো
    async sendTemplate({ to, variables = {}, renderText, type = 'template' }) {
        const body = renderText(variables);
        return baileysProvider.sendText({ to, body, type });
    },

    async sendDocument({ to, documentBuffer, filename, caption, type = 'document' }) {
        if (!API_SECRET) return { success: false, reason: 'not_configured' };

        try {
            const res = await axios.post(
                `${BAILEYS_URL}/send-document`,
                {
                    phone:      to,
                    base64Data: documentBuffer.toString('base64'),
                    fileName:   filename,
                    caption,
                    type,
                },
                { headers: { 'x-api-key': API_SECRET }, timeout: 15_000 }
            );
            if (res.data?.success) {
                logger.info(`✅ [WhatsAppGateway:baileys:${type}] ডকুমেন্ট পাঠানো → ${to}`);
                markRecovered();
                return { success: true };
            }
            logger.warn(`⚠️ [WhatsAppGateway:baileys:${type}] গেটওয়ে সাড়া দিল কিন্তু success=false:`, res.data);
            markFailure();
            return { success: false, reason: 'gateway_error', detail: res.data };
        } catch (err) {
            const status = err.response?.status;
            const detail = err.response?.data || err.message;
            if (status === 503) {
                logger.warn(`⚠️ [WhatsAppGateway:baileys:${type}] WhatsApp connect নেই → ${to}`);
            } else if (err.code === 'ECONNABORTED') {
                logger.warn(`⚠️ [WhatsAppGateway:baileys:${type}] Timeout → ${to}`);
            } else {
                logger.error(`❌ [WhatsAppGateway:baileys:${type}] Error → ${to}:`, { detail });
            }
            markFailure();
            return { success: false, reason: err.code || 'request_error', detail };
        }
    },
};


// ============================================================
// ভবিষ্যতের provider — স্পষ্ট "implement করা হয়নি" stub।
// ============================================================
const notImplementedProvider = (name, docsHint) => ({
    async sendText()     { throw new Error(`[WhatsAppGateway] provider '${name}' এখনো implement করা হয়নি (sendText)। ${docsHint}`); },
    async sendTemplate() { throw new Error(`[WhatsAppGateway] provider '${name}' এখনো implement করা হয়নি (sendTemplate)। ${docsHint}`); },
    async sendDocument() { throw new Error(`[WhatsAppGateway] provider '${name}' এখনো implement করা হয়নি (sendDocument)। ${docsHint}`); },
});

const PROVIDERS = {
    baileys:     baileysProvider,
    twilio:      notImplementedProvider('twilio',     'দরকার: Twilio WhatsApp API docs, Content Template Builder-এ approved template, TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM env var।'),
    meta_cloud:  notImplementedProvider('meta_cloud',  'দরকার: Meta Business verification, WhatsApp Cloud API access token, phone_number_id, approved message templates।'),
    gupshup:     notImplementedProvider('gupshup',     'দরকার: Gupshup app + API key, approved templates।'),
    '360dialog': notImplementedProvider('360dialog',   'দরকার: 360dialog API key, approved templates।'),
    wati:        notImplementedProvider('wati',        'দরকার: Wati API key, approved templates।'),
};

const PROVIDER_NAME = process.env.WHATSAPP_PROVIDER || 'baileys';

const getProvider = () => {
    const p = PROVIDERS[PROVIDER_NAME];
    if (!p) {
        logger.error(`[WhatsAppGateway] অজানা WHATSAPP_PROVIDER='${PROVIDER_NAME}' — 'baileys'-এ fallback করছি`);
        return PROVIDERS.baileys;
    }
    return p;
};

module.exports = {
    // মূল adapter interface — caller-রা provider সম্পর্কে কিছুই জানে না
    sendText:     (args) => getProvider().sendText(args),
    sendTemplate: (args) => getProvider().sendTemplate(args),
    sendDocument: (args) => getProvider().sendDocument(args),

    // circuit-breaker — portalWhatsapp.service.js এটা re-export করে
    isLikelyDown,

    // টেস্ট/ডিবাগের জন্য — কোন provider এখন সক্রিয়
    activeProvider: PROVIDER_NAME,
};
