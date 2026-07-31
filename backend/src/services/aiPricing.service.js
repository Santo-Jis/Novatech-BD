// backend/src/services/aiPricing.service.js
// ============================================================
// AI Token Pricing — Flat rate অথবা Provider cost-এর উপর markup %
// Super Admin platform_settings (global default) অথবা প্রতি-tenant
// tenant_ai_settings (override) থেকে mode/rate বেছে নেয়।
// ============================================================

const { query } = require('../config/db');

// ── Provider/model অনুযায়ী আনুমানিক raw cost (USD / 1000 token) ──
// ⚠️ এগুলো approximate reference rate — শুধু 'percent markup' মোডে
// ব্যবহার হয়, exact billing invoice না। ফ্রি (:free) মডেলের cost ০।
const MODEL_COST_USD_PER_1K = {
    'openrouter:anthropic/claude-haiku-4-5':  { input: 0.001,   output: 0.005  },
    'openrouter:anthropic/claude-sonnet-4-6': { input: 0.003,   output: 0.015  },
    'openrouter:anthropic/claude-opus-4-6':   { input: 0.015,   output: 0.075  },
    'openrouter:openai/gpt-4o-mini':          { input: 0.00015, output: 0.0006 },
    'openrouter:openai/gpt-4o':               { input: 0.0025,  output: 0.01   },
    'openrouter:google/gemini-flash-1.5':     { input: 0.000075,output: 0.0003 },
    'openrouter:google/gemini-pro-1.5':       { input: 0.00125, output: 0.005  },
    'openrouter:deepseek/deepseek-chat':      { input: 0.00027, output: 0.0011 },
    'anthropic:claude-haiku-4-5-20251001':    { input: 0.001,   output: 0.005  },
    'anthropic:claude-sonnet-4-6':            { input: 0.003,   output: 0.015  },
    'anthropic:claude-opus-4-6':              { input: 0.015,   output: 0.075  },
    'openai:gpt-4o-mini':                     { input: 0.00015, output: 0.0006 },
    'openai:gpt-4o':                          { input: 0.0025,  output: 0.01   },
    'openai:gpt-4-turbo':                     { input: 0.01,    output: 0.03   },
    'gemini:gemini-1.5-flash':                { input: 0.000075,output: 0.0003 },
    'gemini:gemini-1.5-pro':                  { input: 0.00125, output: 0.005  },
};
const DEFAULT_COST = { input: 0.002, output: 0.006 }; // অজানা/paid মডেলের জন্য নিরাপদ generic ধারণা

const isFreeModel = (model = '') => model.endsWith(':free') || model.includes('/free');

const estimateProviderCostUSD = (provider, model, promptTokens = 0, completionTokens = 0) => {
    if (isFreeModel(model)) return 0;
    const rates = MODEL_COST_USD_PER_1K[`${provider}:${model}`] || DEFAULT_COST;
    return (promptTokens / 1000) * rates.input + (completionTokens / 1000) * rates.output;
};

// ── Global ডিফল্ট (platform_settings), ৬০ সেকেন্ড cache ──────────
let _cache = null, _cacheAt = 0;

const getGlobalAIPricing = async () => {
    if (_cache && Date.now() - _cacheAt < 60_000) return _cache;

    const result = await query(
        `SELECT key, value FROM platform_settings
         WHERE key IN ('ai_pricing_mode','ai_flat_rate_paisa_per_1k','ai_markup_percent','ai_usd_to_bdt_rate')`
    );
    const map = {};
    result.rows.forEach((r) => { map[r.key] = r.value; });

    _cache = {
        pricingMode:       map.ai_pricing_mode === 'percent' ? 'percent' : 'flat',
        flatRatePaisaPer1k: parseInt(map.ai_flat_rate_paisa_per_1k, 10) || 50,
        markupPercent:      parseFloat(map.ai_markup_percent) || 30,
        usdToBdtRate:       parseFloat(map.ai_usd_to_bdt_rate) || 122,
    };
    _cacheAt = Date.now();
    return _cache;
};

const clearAIPricingCache = () => { _cache = null; };

/**
 * charge_paisa হিসাব করো — tenant override থাকলে সেটা, না থাকলে global default।
 * tenantSettings: tenant_ai_settings row (বা null/undefined)
 */
const calculateChargePaisa = async ({ provider, model, promptTokens = 0, completionTokens = 0, totalTokens = 0, tenantSettings }) => {
    const global = await getGlobalAIPricing();

    const mode        = tenantSettings?.pricing_mode || global.pricingMode;
    const flatRate     = tenantSettings?.flat_rate_paisa_per_1k ?? global.flatRatePaisaPer1k;
    const markupPercent = tenantSettings?.markup_percent ?? global.markupPercent;

    if (mode === 'percent') {
        const costUSD = estimateProviderCostUSD(provider, model, promptTokens, completionTokens);
        const costBDT = costUSD * global.usdToBdtRate;
        const chargeBDT = costBDT * (1 + markupPercent / 100);
        return { chargePaisa: Math.max(0, Math.round(chargeBDT * 100)), mode: 'percent' };
    }

    // flat mode — টোকেন প্রতি ১০০০-এ ফিক্স রেট
    const chargePaisa = Math.max(0, Math.round((totalTokens / 1000) * flatRate));
    return { chargePaisa, mode: 'flat' };
};

module.exports = {
    getGlobalAIPricing,
    clearAIPricingCache,
    calculateChargePaisa,
    estimateProviderCostUSD,
};
