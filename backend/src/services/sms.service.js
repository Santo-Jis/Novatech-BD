const axios = require('axios');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { decrypt } = require('../config/encryption');

// ============================================================
// SMS Service — Multi-Provider Adapter
// NovaTechBD Management System
// ============================================================
// Supported providers:
//   softbarta     → sms.softbarta.com (Android phone gateway)  ← DEFAULT
//   ssl_wireless  → smsc.sslwireless.com
//   twilio        → api.twilio.com/2010-04-01
//   custom        → DB-এ sms_custom_url
// ============================================================

// DB থেকে SMS কনফিগ পড়া (cached 60s)
let _configCache = null;
let _configCacheAt = 0;

const getSmsConfig = async () => {
    if (_configCache && Date.now() - _configCacheAt < 60_000) {
        return _configCache;
    }

    const SMS_KEYS = [
        'sms_api_key', 'sms_sender_id', 'sms_provider',
        'sms_custom_url', 'sms_enabled', 'sms_device_id'
    ];
    const result = await query(
        `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
        [SMS_KEYS]
    );

    const raw = {};
    result.rows.forEach(r => { raw[r.key] = r.value; });

    // API key ডিক্রিপ্ট করো
    let apiKey = raw.sms_api_key || process.env.SMS_API_KEY || '';
    if (apiKey && !apiKey.includes('****') && !apiKey.includes('****')) {
        try {
            // hex-encoded encrypted value হলে decrypt করো
            if (/^[0-9a-f]{65,}$/i.test(apiKey)) {
                apiKey = decrypt(apiKey);
            }
        } catch (e) {
            logger.warn('⚠️ SMS API Key decrypt হয়নি — plain text হিসেবে ব্যবহার হবে।');
            // encrypted key decrypt না হলে SMS_API_KEY .env থেকে নাও
            apiKey = process.env.SMS_API_KEY || '';
        }
    }

    _configCache = {
        provider:  raw.sms_provider  || 'softbarta',
        apiKey,
        deviceId:  raw.sms_device_id  || process.env.SMS_DEVICE_ID  || '',
        senderId:  raw.sms_sender_id || process.env.SMS_SENDER_ID || '',
        customUrl: raw.sms_custom_url || '',
        // ✅ FIX: duplicate deviceId সরানো হয়েছে — নিচেরটা উপরেরটা override করত,
        // ফলে SMS_DEVICE_ID env fallback হারিয়ে যেত।
        enabled:   raw.sms_enabled !== 'false',
    };
    _configCacheAt = Date.now();

    return _configCache;
};

const clearSmsConfigCache = () => {
    _configCache = null;
    _configCacheAt = 0;
};

// ============================================================
// PHONE NUMBER FORMATTER
// ============================================================

const formatPhone = (phone) => {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0'))  p = '88' + p;
    if (!p.startsWith('88')) p = '88' + p;
    return p; // "8801XXXXXXXXX"
};

// ============================================================
// PROVIDER ADAPTERS
// ============================================================

// ── SoftBarta (sms.softbarta.com) ────────────────────────
// API: GET https://sms.softbarta.com/services/send.php
// Params: key, number, message, option=1, type=sms
// Success: { "success": true }
const sendViaSoftBarta = async (formattedPhone, message, config) => {
    const params = new URLSearchParams({
        key:     config.apiKey,
        number:  formattedPhone,
        message,
        option:  '1',
        type:    'sms',
    });

    const response = await axios.get(
        `https://sms.softbarta.com/services/send.php?${params.toString()}`,
        { timeout: 15000 }
    );

    if (response.data?.success === true) {
        return { success: true, data: response.data };
    }
    // error message বের করো
    const errMsg = response.data?.error?.message
        || response.data?.message
        || 'SoftBarta: SMS পাঠানো ব্যর্থ';
    throw new Error(errMsg);
};

// ── SSL Wireless ───────────────────────────────────────────
const sendViaSSLWireless = async (formattedPhone, message, config) => {
    const response = await axios.post(
        'https://smsc.sslwireless.com/api/v3/send-sms',
        {
            api_token: config.apiKey,
            sid:       config.senderId,
            sms:       message,
            msisdn:    formattedPhone,
            csmsid:    `NTB_${Date.now()}`
        },
        { timeout: 10000 }
    );
    if (response.data?.status_code === 1000) {
        return { success: true, data: response.data };
    }
    throw new Error(response.data?.status_message || 'SSL Wireless: SMS পাঠানো ব্যর্থ');
};

// ── Twilio ─────────────────────────────────────────────────
// API Key format: "AccountSID:AuthToken"
const sendViaTwilio = async (formattedPhone, message, config) => {
    const [accountSid, authToken] = config.apiKey.split(':');
    if (!accountSid || !authToken) {
        throw new Error('Twilio API Key ফরম্যাট ভুল। "AccountSID:AuthToken" দিন।');
    }
    const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams({
            From: config.senderId,
            To:   `+${formattedPhone}`,
            Body: message,
        }),
        { auth: { username: accountSid, password: authToken }, timeout: 10000 }
    );
    if (response.data?.sid) {
        return { success: true, data: response.data };
    }
    throw new Error(response.data?.message || 'Twilio: SMS পাঠানো ব্যর্থ');
};

// ── TextBee (textbee.dev) ─────────────────────────────────
// API: POST https://api.textbee.dev/api/v1/gateway/devices/{deviceId}/send-sms
// Header: x-api-key: YOUR_API_KEY
// Body: { "receivers": ["8801XXXXXXXXX"], "message": "..." }
const sendViaTextBee = async (formattedPhone, message, config) => {
    if (!config.deviceId) throw new Error('TextBee Device ID সেট করা নেই। SMS_DEVICE_ID যোগ করুন।');
    const response = await axios.post(
        `https://api.textbee.dev/api/v1/gateway/devices/${config.deviceId}/send-sms`,
        { receivers: [formattedPhone], message },
        {
            headers: { 'x-api-key': config.apiKey },
            timeout: 15000
        }
    );
    if (response.data?.data?.successCount > 0 || response.status === 200) {
        return { success: true, data: response.data };
    }
    throw new Error(response.data?.message || 'TextBee: SMS পাঠানো ব্যর্থ');
};

// ── Custom API ─────────────────────────────────────────────
const sendViaCustom = async (formattedPhone, message, config) => {
    if (!config.customUrl) throw new Error('Custom SMS URL সেট করা নেই।');
    const response = await axios.post(
        config.customUrl,
        { api_token: config.apiKey, mobile: formattedPhone, message },
        { timeout: 10000 }
    );
    if (response.status === 200 && (response.data?.status === 'success' || response.data?.success)) {
        return { success: true, data: response.data };
    }
    throw new Error(response.data?.message || 'Custom API: SMS পাঠানো ব্যর্থ');
};

// ============================================================
// SMS LOGGER — non-blocking, DB-এ log রাখে
// ============================================================
const logSms = async ({ phone, type = 'custom', provider, status, error = null, sent_by = null }) => {
    try {
        await query(
            `INSERT INTO sms_logs (phone, message_type, provider, status, error_message, sent_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [phone, type, provider, status, error, sent_by]
        );
    } catch (e) {
        logger.warn('⚠️ SMS log save failed:', e.message);
    }
};

// ============================================================
// CORE SENDER
// ============================================================

const sendSMS = async (phone, message, meta = {}) => {
    // meta = { type: 'otp' | 'invoice' | 'login' | 'custom', sent_by: userId }
    const { type = 'custom', sent_by = null } = meta;
    try {
        const formattedPhone = formatPhone(phone);
        const config = await getSmsConfig();

        if (!config.enabled) {
            logger.info(`📵 SMS বন্ধ (${formattedPhone})`);
            await logSms({ phone: formattedPhone, type, provider: config.provider, status: 'disabled', sent_by });
            return { success: true, disabled: true };
        }

        if (!config.apiKey) {
            logger.info(`📱 Dev Mode [${config.provider}] → ${formattedPhone}: ${message}`);
            await logSms({ phone: formattedPhone, type, provider: config.provider, status: 'dev', sent_by });
            return { success: true, dev: true };
        }

        let result;
        switch (config.provider) {
            case 'textbee':      result = await sendViaTextBee(formattedPhone, message, config);    break;
            case 'softbarta':    result = await sendViaSoftBarta(formattedPhone, message, config);  break;
            case 'twilio':       result = await sendViaTwilio(formattedPhone, message, config);     break;
            case 'custom':       result = await sendViaCustom(formattedPhone, message, config);     break;
            case 'ssl_wireless':
            default:             result = await sendViaSSLWireless(formattedPhone, message, config); break;
        }

        logger.info(`✅ SMS সফল [${config.provider}] → ${formattedPhone}`);
        await logSms({ phone: formattedPhone, type, provider: config.provider, status: 'sent', sent_by });
        return result;

    } catch (error) {
        const config = _configCache;
        logger.error(`❌ SMS Error → ${phone}:`, error.message);
        await logSms({ phone: formatPhone(phone), type, provider: config?.provider, status: 'failed', error: error.message, sent_by });
        return { success: false, error: error.message };
    }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const sendOTP = async (phone, otp, shopName, meta = {}) => {
    const msg = `NovaTechBD\nদোকান: ${shopName}\nOTP: ${otp}\nমেয়াদ: ১০ মিনিট\nএই কোড কাউকে দেবেন না।`;
    return sendSMS(phone, msg, { type: 'otp', ...meta });
};

const sendInvoice = async (phone, invoiceNumber, totalAmount, shopName, meta = {}) => {
    const msg = `NovaTechBD Invoice\nদোকান: ${shopName}\nInvoice: ${invoiceNumber}\nমোট: ৳${totalAmount.toLocaleString('bn-BD')}\nধন্যবাদ।`;
    return sendSMS(phone, msg, { type: 'invoice', ...meta });
};

const sendLoginCredentials = async (phone, employeeCode, password, name, meta = {}) => {
    const msg = `NovaTechBD\nস্বাগতম ${name}!\nID: ${employeeCode}\nPassword: ${password}\nপ্রথম লগইনে পাসওয়ার্ড পরিবর্তন করুন।`;
    return sendSMS(phone, msg, { type: 'login', ...meta });
};

const getWhatsAppInvoiceLink = (phone, invoiceNumber, totalAmount, shopName, items) => {
    const fp = formatPhone(phone);
    const itemsList = items
        .map(i => `• ${i.name}: ${i.qty} × ৳${i.price} = ৳${i.subtotal}`)
        .join('\n');
    const message =
        `🧾 *NovaTech BD Invoice*\n━━━━━━━━━━━━━━━━━━\n` +
        `🏪 দোকান: *${shopName}*\n📋 Invoice: *${invoiceNumber}*\n` +
        `━━━━━━━━━━━━━━━━━━\n${itemsList}\n━━━━━━━━━━━━━━━━━━\n` +
        `💰 মোট: *৳${totalAmount.toLocaleString('bn-BD')}*\n━━━━━━━━━━━━━━━━━━\n` +
        `_NovaTech BD (Ltd.)_\n_জানকি সিংহ রোড, বরিশাল_`;
    return `https://wa.me/${fp}?text=${encodeURIComponent(message)}`;
};

module.exports = {
    sendSMS,
    sendOTP,
    sendInvoice,
    sendLoginCredentials,
    getWhatsAppInvoiceLink,
    clearSmsConfigCache,
    getSmsConfig,       // admin status endpoint-এর জন্য
};
