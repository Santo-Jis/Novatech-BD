// backend/src/services/tenantAI.service.js
// ============================================================
// প্রতি-tenant AI access resolve করে:
//   • key_source = 'own'      → tenant-এর নিজের key (না থাকলে block)
//   • key_source = 'platform' → platform shared key (wallet balance লাগবে)
//   • key_source = 'blocked'  → সম্পূর্ণ বন্ধ (Super Admin টগল)
// ============================================================

const { query } = require('../config/db');
const { decrypt } = require('../config/encryption');
const walletService = require('./wallet.service');

class AIAccessBlockedError extends Error {
    constructor(message, code = 'AI_ACCESS_BLOCKED') {
        super(message);
        this.name = 'AIAccessBlockedError';
        this.code = code;
    }
}

const getTenantAISettings = async (tenantId) => {
    const r = await query(`SELECT * FROM tenant_ai_settings WHERE tenant_id = $1`, [tenantId]);
    return r.rows[0] || null;
};

// প্ল্যাটফর্মের শেয়ার্ড (গ্লোবাল) key — বিদ্যমান ai_config টেবিল থেকে
const getPlatformAIConfig = async () => {
    const { detectProvider } = require('./ai.service');
    const result = await query(`SELECT config_key, config_value FROM ai_config`);
    const config = {};
    result.rows.forEach((row) => { config[row.config_key] = row.config_value; });

    if (config.api_key) {
        try { config.api_key_decrypted = decrypt(config.api_key); }
        catch { config.api_key_decrypted = config.api_key; }
    }
    if (config.api_key_decrypted) {
        config.provider = config.provider_override || detectProvider(config.api_key_decrypted);
    }
    return config;
};

/**
 * resolveAIAccess(tenantId) →
 *   { keySource, apiKey, provider, modelOverride, tenantSettings }
 * অথবা AIAccessBlockedError throw করে (message বাংলায়, user-facing)
 */
const resolveAIAccess = async (tenantId) => {
    if (!tenantId) {
        // tenantId না দিলে (legacy/background job) — platform config সরাসরি, কোনো চার্জ/ব্লক নেই
        const platform = await getPlatformAIConfig();
        if (!platform.api_key_decrypted) {
            throw new AIAccessBlockedError('AI API Key সেট করা নেই। Settings থেকে যোগ করুন।', 'NO_PLATFORM_KEY');
        }
        return { keySource: null, apiKey: platform.api_key_decrypted, provider: platform.provider, modelOverride: null, tenantSettings: null };
    }

    const tenantSettings = await getTenantAISettings(tenantId);
    const keySource = tenantSettings?.key_source || 'platform';

    if (keySource === 'blocked') {
        throw new AIAccessBlockedError('এই অ্যাকাউন্টের জন্য AI ফিচার বন্ধ করা আছে। বিস্তারিত জানতে সাপোর্টে যোগাযোগ করুন।', 'TENANT_BLOCKED');
    }

    if (keySource === 'own') {
        if (!tenantSettings?.api_key_encrypted) {
            throw new AIAccessBlockedError('আপনার নিজের AI API Key যোগ করা হয়নি। Settings → AI Config থেকে যোগ করুন।', 'OWN_KEY_MISSING');
        }
        let apiKey;
        try { apiKey = decrypt(tenantSettings.api_key_encrypted); }
        catch { apiKey = tenantSettings.api_key_encrypted; }

        return {
            keySource: 'own',
            apiKey,
            provider: tenantSettings.provider,
            modelOverride: tenantSettings.model_override || null,
            tenantSettings,
        };
    }

    // keySource === 'platform' — shared key ব্যবহার হবে, wallet balance লাগবে
    const platform = await getPlatformAIConfig();
    if (!platform.api_key_decrypted) {
        throw new AIAccessBlockedError('Platform AI key কনফিগার করা নেই। Super Admin-এর সাথে যোগাযোগ করুন।', 'NO_PLATFORM_KEY');
    }

    const wallet = await walletService.getWallet(tenantId);
    if (Number(wallet.balance_paisa) <= 0) {
        throw new AIAccessBlockedError('AI ব্যবহারের জন্য ওয়ালেট ব্যালেন্স নেই। রিচার্জ করুন অথবা নিজের API Key যোগ করুন।', 'INSUFFICIENT_BALANCE');
    }

    return {
        keySource: 'platform',
        apiKey: platform.api_key_decrypted,
        provider: platform.provider,
        modelOverride: null,
        tenantSettings,
    };
};

module.exports = { resolveAIAccess, getTenantAISettings, getPlatformAIConfig, AIAccessBlockedError };
