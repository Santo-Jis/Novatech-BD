const axios = require('axios');
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
    if (apiKey && !apiKey.includes('****')) {
        try { apiKey = decrypt(apiKey); } catch { /* .env key decrypt লাগবে না */ }
    }

    _configCache = {
        provider:  raw.sms_provider  || 'softbarta',
        apiKey,
        deviceId:  raw.sms_device_id  || process.env.SMS_DEVICE_ID  || '',
        senderId:  raw.sms_sender_id || process.env.SMS_SENDER_ID || '',
        customUrl: raw.sms_custom_url || '',
        deviceId:  raw.sms_device_id  || '',          // SoftBarta device ID (optional)
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
// CORE SENDER
// ============================================================

const sendSMS = async (phone, message) => {
    try {
        const formattedPhone = formatPhone(phone);
        const config = await getSmsConfig();

        if (!config.enabled) {
            console.log(`📵 SMS বন্ধ (${formattedPhone})`);
            return { success: true, disabled: true };
        }

        if (!config.apiKey) {
            console.log(`📱 Dev Mode [${config.provider}] → ${formattedPhone}: ${message}`);
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

        console.log(`✅ SMS সফল [${config.provider}] → ${formattedPhone}`);
        return result;

    } catch (error) {
        console.error(`❌ SMS Error → ${phone}:`, error.message);
        return { success: false, error: error.message };
    }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const sendOTP = async (phone, otp, shopName) => {
    const msg = `NovaTechBD\nদোকান: ${shopName}\nOTP: ${otp}\nমেয়াদ: ১০ মিনিট\nএই কোড কাউকে দেবেন না।`;
    return sendSMS(phone, msg);
};

const sendInvoice = async (phone, invoiceNumber, totalAmount, shopName) => {
    const msg = `NovaTechBD Invoice\nদোকান: ${shopName}\nInvoice: ${invoiceNumber}\nমোট: ৳${totalAmount.toLocaleString('bn-BD')}\nধন্যবাদ।`;
    return sendSMS(phone, msg);
};

const sendLoginCredentials = async (phone, employeeCode, password, name) => {
    const msg = `NovaTechBD\nস্বাগতম ${name}!\nID: ${employeeCode}\nPassword: ${password}\nপ্রথম লগইনে পাসওয়ার্ড পরিবর্তন করুন।`;
    return sendSMS(phone, msg);
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
    clearSmsConfigCache
};
