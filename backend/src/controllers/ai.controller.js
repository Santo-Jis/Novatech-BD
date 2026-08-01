const { query }   = require('../config/db');
const { encrypt, decrypt, maskApiKey } = require('../config/encryption');
const { runAIInsightsJob } = require('../jobs/ai.job');
const { callAI, detectProvider, PROVIDERS } = require('../services/ai.service');
const { resolveAIAccess, getTenantAISettings, AIAccessBlockedError } = require('../services/tenantAI.service');
const axios = require('axios');
const logger = require('../config/logger');

// ============================================================
// POPULAR MODELS LIST — Provider অনুযায়ী
// ============================================================

const POPULAR_MODELS = {
    openrouter: [
        // ══ ফ্রি মডেল (:free) ══════════════════════════════════════════════════

        // 💬 General Chat / Daily Insight — দ্রুত, GPT-4 মানের
        { id: 'meta-llama/llama-3.3-70b-instruct:free',              name: '💬 Llama 3.3 70B — Daily Chat & Insight (Free)',          tier: 'free' },

        // 🧠 Complex Analysis / Reasoning — step-by-step চিন্তা, math, logic
        { id: 'deepseek/deepseek-r1:free',                            name: '🧠 DeepSeek R1 — Complex Analysis & Reasoning (Free)',    tier: 'free' },

        // 💻 Coding — সবচেয়ে শক্তিশালী ফ্রি কোডিং মডেল, 262K context
        { id: 'qwen/qwen3-coder-480b-a35b-instruct:free',             name: '💻 Qwen3 Coder 480B — Best Coding (Free)',                tier: 'free' },

        // 💻 Coding (Alternative) — multi-file, agentic coding project
        { id: 'mistralai/devstral-small:free',                        name: '💻 Devstral Small — Agentic Coding (Free)',               tier: 'free' },

        // 🧠 Reasoning (Alternative) — 262K context, multi-agent workflow
        { id: 'nvidia/nemotron-3-super-120b-a12b:free',               name: '🧠 NVIDIA Nemotron 120B — Long Reasoning (Free)',         tier: 'free' },

        // 🖼️ Vision + Tools — image বোঝা, tool calling, multimodal
        { id: 'google/gemma-4-31b-it:free',                           name: '🖼️ Gemma 4 31B — Vision & Tool Calling (Free)',           tier: 'free' },

        // 📄 Long Document — 1M token context, বড় ডকুমেন্ট বিশ্লেষণ
        { id: 'google/lyria-3-pro-preview:free',                      name: '📄 Lyria 3 Pro — Long Document 1M Context (Free)',        tier: 'free' },

        // 🏢 Office / Productivity — Word, Excel, PPT, agent workflow
        { id: 'minimax/minimax-m2.5:free',                            name: '🏢 MiniMax M2.5 — Office & Productivity (Free)',          tier: 'free' },

        // 🔀 Auto — OpenRouter নিজেই request অনুযায়ী সেরা ফ্রি মডেল বেছে নেবে
        { id: 'openrouter/free',                                       name: '🔀 Auto Free — OpenRouter বেছে নেবে (Free)',              tier: 'free' },

        // ══ পেইড মডেল ══════════════════════════════════════════════════════════
        { id: 'anthropic/claude-haiku-4-5',  name: 'Claude Haiku 4.5 — Fast (Paid)',    tier: 'fast'   },
        { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6 — Smart (Paid)',  tier: 'smart'  },
        { id: 'anthropic/claude-opus-4-6',   name: 'Claude Opus 4.6 — Best (Paid)',     tier: 'best'   },
        { id: 'openai/gpt-4o-mini',          name: 'GPT-4o Mini — Fast (Paid)',         tier: 'fast'   },
        { id: 'openai/gpt-4o',               name: 'GPT-4o — Smart (Paid)',             tier: 'smart'  },
        { id: 'google/gemini-flash-1.5',     name: 'Gemini 1.5 Flash — Fast (Paid)',    tier: 'fast'   },
        { id: 'google/gemini-pro-1.5',       name: 'Gemini 1.5 Pro — Smart (Paid)',     tier: 'smart'  },
        { id: 'deepseek/deepseek-chat',      name: 'DeepSeek Chat — Budget (Paid)',     tier: 'budget' },
    ],
    anthropic: [
        { id: 'claude-haiku-4-5-20251001',  name: 'Claude Haiku 4.5 (Fast)',   tier: 'fast'  },
        { id: 'claude-sonnet-4-6',          name: 'Claude Sonnet 4.6 (Smart)', tier: 'smart' },
        { id: 'claude-opus-4-6',            name: 'Claude Opus 4.6 (Best)',    tier: 'best'  },
    ],
    openai: [
        { id: 'gpt-4o-mini',      name: 'GPT-4o Mini (Fast)',    tier: 'fast'  },
        { id: 'gpt-4o',           name: 'GPT-4o (Smart)',         tier: 'smart' },
        { id: 'gpt-4-turbo',      name: 'GPT-4 Turbo',           tier: 'smart' },
        { id: 'o1-mini',          name: 'o1 Mini (Reasoning)',    tier: 'smart' },
        { id: 'o1',               name: 'o1 (Best Reasoning)',    tier: 'best'  },
    ],
    gemini: [
        { id: 'gemini-1.5-flash',     name: 'Gemini 1.5 Flash (Fast)',  tier: 'fast'  },
        { id: 'gemini-1.5-pro',       name: 'Gemini 1.5 Pro (Smart)',   tier: 'smart' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (New)',   tier: 'smart' },
    ]
};

// ============================================================
// GET INSIGHTS
// ============================================================

const getInsights = async (req, res) => {
    try {
        const { unread_only, limit = 20 } = req.query;
        const userId = req.user.id;
        const role   = req.user.role;

        let conditions = [`tenant_id = $1`, `(target_user_id = $2 OR target_user_id IS NULL)`, `target_role = $3`];
        let params     = [req.tenantId, userId, role === 'admin' ? 'admin' : 'manager'];
        let paramCount = 3;

        if (unread_only === 'true') conditions.push('is_read = false');

        paramCount++;
        params.push(limit);

        const result = await query(
            `SELECT id, insight_type, title, description, data, severity, is_read, created_at
             FROM ai_insights WHERE ${conditions.join(' AND ')}
             ORDER BY created_at DESC LIMIT $${paramCount}`,
            params
        );

        const unreadCount = await query(
            `SELECT COUNT(*) AS count FROM ai_insights
             WHERE tenant_id = $1 AND (target_user_id = $2 OR target_user_id IS NULL)
               AND target_role = $3 AND is_read = false`,
            [req.tenantId, userId, role === 'admin' ? 'admin' : 'manager']
        );

        return res.status(200).json({
            success: true,
            data: { insights: result.rows, unread_count: parseInt(unreadCount.rows[0].count) }
        });
    } catch (error) {
        logger.error('❌ Get Insights Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MARK INSIGHT READ
// ============================================================

const markInsightRead = async (req, res) => {
    try {
        // tenant_id + নিজের target_user_id (অথবা broadcast NULL) না মিললে আপডেট হবে না —
        // আগে এখানে কোনো ownership check-ই ছিল না, যেকোনো id দিয়ে যেকোনো tenant-এর
        // insight read মার্ক করা যেত।
        const result = await query(
            `UPDATE ai_insights SET is_read = true
             WHERE id = $1 AND tenant_id = $2 AND (target_user_id = $3 OR target_user_id IS NULL)`,
            [req.params.id, req.tenantId, req.user.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Insight পাওয়া যায়নি।' });
        }
        return res.status(200).json({ success: true, message: 'পড়া হয়েছে হিসেবে চিহ্নিত।' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET AI CONFIG (provider info সহ)
// ============================================================

const getAIConfig = async (req, res) => {
    try {
        const result = await query('SELECT config_key, config_value, description FROM ai_config');

        const config = {};
        let rawApiKey = null;

        result.rows.forEach(row => {
            if (row.config_key === 'api_key' && row.config_value) {
                try {
                    rawApiKey = decrypt(row.config_value);
                    config[row.config_key] = maskApiKey(rawApiKey);
                } catch {
                    rawApiKey = row.config_value;
                    config[row.config_key] = maskApiKey(row.config_value);
                }
            } else {
                config[row.config_key] = row.config_value;
            }
        });

        // Provider auto-detect করো
        const detectedProvider = rawApiKey ? detectProvider(rawApiKey) : null;
        config.detected_provider = config.provider_override || detectedProvider;
        config.provider_name     = detectedProvider ? PROVIDERS[detectedProvider]?.name : null;

        // Provider এর জন্য মডেল লিস্ট
        const provider = config.detected_provider || 'openrouter';
        config.available_models = POPULAR_MODELS[provider] || POPULAR_MODELS.openrouter;

        return res.status(200).json({ success: true, data: config });
    } catch (error) {
        logger.error('❌ Get AI Config Error:', error.message);
        return res.status(500).json({ success: false, message: 'Config আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MODELS FOR A PROVIDER
// GET /api/ai/models?provider=openrouter
// ============================================================

const getModels = async (req, res) => {
    try {
        const { provider = 'openrouter' } = req.query;
        const models = POPULAR_MODELS[provider] || POPULAR_MODELS.openrouter;
        return res.status(200).json({ success: true, data: { provider, models } });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'মডেল লিস্ট আনতে সমস্যা।' });
    }
};

// ============================================================
// UPDATE AI CONFIG
// ============================================================

const updateAIConfig = async (req, res) => {
    try {
        const { api_key, daily_model, periodic_model, max_tokens, periodic_review_months, complex_tasks_list, provider_override } = req.body;

        const updates = {};

        if (api_key && !api_key.includes('...')) {
            updates.api_key = encrypt(api_key);
        }
        if (daily_model)            updates.daily_model            = daily_model;
        if (periodic_model)         updates.periodic_model         = periodic_model;
        if (max_tokens)             updates.max_tokens             = String(max_tokens);
        if (periodic_review_months) updates.periodic_review_months = String(periodic_review_months);
        if (complex_tasks_list)     updates.complex_tasks_list     = complex_tasks_list;
        if (provider_override !== undefined) {
            updates.provider_override = provider_override || '';
        }

        for (const [key, value] of Object.entries(updates)) {
            // provider_override নতুন হতে পারে তাই UPSERT করো
            await query(
                `INSERT INTO ai_config (config_key, config_value, updated_by, updated_at)
                 VALUES ($3, $1, $2, NOW())
                 ON CONFLICT (config_key) DO UPDATE
                 SET config_value = $1, updated_by = $2, updated_at = NOW()`,
                [value, req.user?.id || null, key]
            );
        }

        // Super Admin (আলাদা key-based auth, req.user/req.tenantId নেই) থেকে কল হলে
        // tenant audit_logs-এ না লিখে শুধু log-এ রাখি — অন্যথায় tenant-level
        // audit_logs-এ user_id/tenant_id NULL সহ ঢুকে যেত।
        if (req.user?.id) {
            await query(
                `INSERT INTO audit_logs (user_id, action, table_name, new_value, tenant_id) VALUES ($1, 'UPDATE_AI_CONFIG', 'ai_config', $2, $3)`,
                [req.user.id, JSON.stringify({ ...updates, api_key: api_key ? '***' : undefined }), req.tenantId || null]
            );
        } else {
            logger.info('🔧 Global AI Config Super Admin থেকে আপডেট হলো:', JSON.stringify({ ...updates, api_key: api_key ? '***' : undefined }));
        }

        return res.status(200).json({ success: true, message: 'AI Config আপডেট সফল।' });
    } catch (error) {
        logger.error('❌ Update AI Config Error:', error.message);
        return res.status(500).json({ success: false, message: 'Config আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TEST AI CONNECTION
// POST /api/ai/test
// ============================================================

const testAIConnection = async (req, res) => {
    try {
        const result = await callAI('বলো: "সংযোগ সফল!"', 'daily', null, []);
        return res.status(200).json({
            success: true,
            message: 'AI সংযোগ সফল!',
            data: { reply: result.text.trim() }
        });
    } catch (error) {
        logger.error('❌ AI Test Error:', error.response?.data || error.message);
        const msg = error.response?.status === 401
            ? 'API Key সঠিক নয়।'
            : error.response?.status === 429
            ? 'API limit পার হয়েছে।'
            : 'সংযোগ ব্যর্থ হয়েছে।';
        return res.status(400).json({ success: false, message: msg });
    }
};

// ============================================================
// TRIGGER AI JOB
// ============================================================

const triggerAIJob = async (req, res) => {
    try {
        res.status(200).json({ success: true, message: 'AI Job শুরু হয়েছে। ব্যাকগ্রাউন্ডে চলছে।' });
        setImmediate(async () => { await runAIInsightsJob(); });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// AI CHAT — Universal Provider
// ============================================================

const aiChat = async (req, res) => {
    try {
        const { message, history = [] } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({ success: false, message: 'বার্তা দিন।' });
        }

        // Business context (tenant-scoped)
        const today = new Date().toISOString().split('T')[0];
        const [salesCtx, attendCtx, creditCtx] = await Promise.all([
            query(`SELECT COALESCE(SUM(total_amount),0) AS today_sales, COUNT(id) AS invoices FROM sales_transactions WHERE date = $1 AND tenant_id = $2`, [today, req.tenantId]),
            query(`SELECT COUNT(CASE WHEN status IN ('present','late') THEN 1 END) AS present, COUNT(CASE WHEN status = 'absent' THEN 1 END) AS absent FROM attendance WHERE date = $1 AND tenant_id = $2`, [today, req.tenantId]),
            query(`SELECT COALESCE(SUM(current_credit),0) AS total_due FROM customers WHERE is_active = true AND tenant_id = $1`, [req.tenantId])
        ]);

        const systemPrompt = `তুমি এই কোম্পানির AI ম্যানেজার। বাংলায় উত্তর দাও।

আজকের তথ্য (${today}):
- বিক্রয়: ৳${parseInt(salesCtx.rows[0].today_sales).toLocaleString()} (${salesCtx.rows[0].invoices}টি invoice)
- উপস্থিত: ${attendCtx.rows[0].present} জন, অনুপস্থিত: ${attendCtx.rows[0].absent} জন
- মোট বকেয়া: ৳${parseInt(creditCtx.rows[0].total_due).toLocaleString()}

সংক্ষেপে ও বাস্তবসম্মত পরামর্শ দাও।`;

        const chatHistory = history.slice(-6).map(h => ({ role: h.role, content: h.content }));

        // ── কেন্দ্রীয় callAI — BYOK resolve + token usage log + wallet চার্জ সব এখানেই হয় ──
        const result = await callAI(message, 'daily', systemPrompt, chatHistory, {
            tenantId: req.tenantId, userId: req.user.id, source: 'admin_chat',
        });

        return res.status(200).json({
            success: true,
            data: {
                reply:      result.text,
                model:      result.model,
                provider:   PROVIDERS[result.provider]?.name || result.provider,
                provider_key: result.provider,
                key_source: result.keySource,     // 'own' | 'platform'
                charge_paisa: result.chargePaisa, // 0 হলে নিজের key ব্যবহার হয়েছে
            }
        });

    } catch (error) {
        if (error instanceof AIAccessBlockedError) {
            logger.warn('⚠️ AI Chat Blocked:', error.message);
            return res.status(403).json({ success: false, message: error.message, error_code: error.code });
        }
        logger.error('❌ AI Chat Error:', error.response?.data || error.message);
        const status = error.response?.status;
        const msg = status === 401 ? 'API Key সঠিক নয়।'
                  : status === 429 ? 'API limit পার হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।'
                  : status === 402 ? 'API ক্রেডিট শেষ। Account এ ব্যালেন্স যোগ করুন।'
                  : 'AI চ্যাটে সমস্যা হয়েছে।';
        return res.status(500).json({ success: false, message: msg });
    }
};

// ============================================================
// TENANT নিজের AI API KEY (BYOK) — GET status / PUT সেট করো
// key_source নিজে বদলাতে পারবে না (সেটা শুধু Super Admin) —
// এটা শুধু key/provider/model সাবমিট করে, Super Admin 'own' করে
// দিলেই সেটা আসলে ব্যবহার হবে।
// ============================================================

const getOwnAIKeyStatus = async (req, res) => {
    try {
        const settings = await getTenantAISettings(req.tenantId);
        return res.status(200).json({
            success: true,
            data: {
                key_source:     settings?.key_source || 'platform',
                has_own_key:    !!settings?.api_key_encrypted,
                provider:       settings?.provider || null,
                model_override: settings?.model_override || null,
                masked_key:     settings?.api_key_encrypted
                    ? maskApiKey((() => { try { return decrypt(settings.api_key_encrypted); } catch { return settings.api_key_encrypted; } })())
                    : null,
            },
        });
    } catch (error) {
        logger.error('❌ Get Own AI Key Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

const updateOwnAIKey = async (req, res) => {
    try {
        const { api_key, provider, model_override } = req.body;

        if (!api_key || api_key.includes('...') || api_key.includes('****')) {
            return res.status(400).json({ success: false, message: 'সঠিক API Key দিন।' });
        }

        const detected = provider || detectProvider(api_key);
        const encrypted = encrypt(api_key);

        await query(
            `INSERT INTO tenant_ai_settings (tenant_id, provider, api_key_encrypted, model_override, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (tenant_id) DO UPDATE
             SET provider = $2, api_key_encrypted = $3, model_override = $4, updated_by = $5, updated_at = NOW()`,
            [req.tenantId, detected, encrypted, model_override || null, req.user.id]
        );

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value, tenant_id) VALUES ($1, 'UPDATE_OWN_AI_KEY', 'tenant_ai_settings', $2, $3)`,
            [req.user.id, JSON.stringify({ provider: detected, api_key: '***' }), req.tenantId]
        );

        return res.status(200).json({
            success: true,
            message: 'আপনার AI Key সেভ হয়েছে। Super Admin অনুমোদন করলে এটা সক্রিয় হবে।',
        });
    } catch (error) {
        logger.error('❌ Update Own AI Key Error:', error.message);
        return res.status(500).json({ success: false, message: 'Key সেভ করতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getInsights, markInsightRead, getAIConfig, getModels, updateAIConfig, testAIConnection, triggerAIJob, aiChat, getOwnAIKeyStatus, updateOwnAIKey };
