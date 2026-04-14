const { query }   = require('../config/db');
const { encrypt, decrypt, maskApiKey } = require('../config/encryption');
const { runAIInsightsJob } = require('../jobs/ai.job');
const { callAI, detectProvider, PROVIDERS } = require('../services/ai.service');
const axios = require('axios');

// ============================================================
// POPULAR MODELS LIST — Provider অনুযায়ী
// ============================================================

const POPULAR_MODELS = {
    openrouter: [
        // ══ ফ্রি মডেল (:free) ══════════════════════════════════════════════════

        // 💬 General Chat / Daily Insight — দ্রুত, GPT-4 মানের
        { id: 'openrouter/auto',              name: '💬 Llama 3.3 70B — Daily Chat & Insight (Free)',          tier: 'free' },

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

        let conditions = [`(target_user_id = $1 OR target_user_id IS NULL)`, `target_role = $2`];
        let params     = [userId, role === 'admin' ? 'admin' : 'manager'];
        let paramCount = 2;

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
             WHERE (target_user_id = $1 OR target_user_id IS NULL)
               AND target_role = $2 AND is_read = false`,
            [userId, role === 'admin' ? 'admin' : 'manager']
        );

        return res.status(200).json({
            success: true,
            data: { insights: result.rows, unread_count: parseInt(unreadCount.rows[0].count) }
        });
    } catch (error) {
        console.error('❌ Get Insights Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MARK INSIGHT READ
// ============================================================

const markInsightRead = async (req, res) => {
    try {
        await query('UPDATE ai_insights SET is_read = true WHERE id = $1', [req.params.id]);
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
        console.error('❌ Get AI Config Error:', error.message);
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
                [value, req.user.id, key]
            );
        }

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value) VALUES ($1, 'UPDATE_AI_CONFIG', 'ai_config', $2)`,
            [req.user.id, JSON.stringify({ ...updates, api_key: api_key ? '***' : undefined })]
        );

        return res.status(200).json({ success: true, message: 'AI Config আপডেট সফল।' });
    } catch (error) {
        console.error('❌ Update AI Config Error:', error.message);
        return res.status(500).json({ success: false, message: 'Config আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TEST AI CONNECTION
// POST /api/ai/test
// ============================================================

const testAIConnection = async (req, res) => {
    try {
        const reply = await callAI('বলো: "সংযোগ সফল!"', 'daily', null, []);
        return res.status(200).json({
            success: true,
            message: 'AI সংযোগ সফল!',
            data: { reply: reply.trim() }
        });
    } catch (error) {
        console.error('❌ AI Test Error:', error.response?.data || error.message);
        const msg = error.response?.status === 401
            ? 'API Key সঠিক নয়।'
            : error.response?.status === 429
            ? 'API limit পার হয়েছে।'
            : error.message || 'সংযোগ ব্যর্থ হয়েছে।';
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

        // AI Config
        const configRes = await query(`SELECT config_key, config_value FROM ai_config`);
        const dbConfig  = {};
        configRes.rows.forEach(r => { dbConfig[r.config_key] = r.config_value; });

        if (!dbConfig.api_key) {
            return res.status(400).json({ success: false, message: 'AI API Key সেট করা নেই। Settings থেকে যোগ করুন।' });
        }

        let apiKey;
        try { apiKey = decrypt(dbConfig.api_key); } catch { apiKey = dbConfig.api_key; }

        const provider     = dbConfig.provider_override || detectProvider(apiKey);
        const providerInfo = PROVIDERS[provider];

        // Business context
        const today = new Date().toISOString().split('T')[0];
        const [salesCtx, attendCtx, creditCtx] = await Promise.all([
            query(`SELECT COALESCE(SUM(total_amount),0) AS today_sales, COUNT(id) AS invoices FROM sales_transactions WHERE date = $1`, [today]),
            query(`SELECT COUNT(CASE WHEN status IN ('present','late') THEN 1 END) AS present, COUNT(CASE WHEN status = 'absent' THEN 1 END) AS absent FROM attendance WHERE date = $1`, [today]),
            query(`SELECT COALESCE(SUM(current_credit),0) AS total_due FROM customers WHERE is_active = true`)
        ]);

        const systemPrompt = `তুমি NovaTech BD কোম্পানির AI ম্যানেজার। বাংলায় উত্তর দাও।

আজকের তথ্য (${today}):
- বিক্রয়: ৳${parseInt(salesCtx.rows[0].today_sales).toLocaleString()} (${salesCtx.rows[0].invoices}টি invoice)
- উপস্থিত: ${attendCtx.rows[0].present} জন, অনুপস্থিত: ${attendCtx.rows[0].absent} জন
- মোট বকেয়া: ৳${parseInt(creditCtx.rows[0].total_due).toLocaleString()}

সংক্ষেপে ও বাস্তবসম্মত পরামর্শ দাও।`;

        const chatHistory = history.slice(-6).map(h => ({ role: h.role, content: h.content }));
        const model       = dbConfig.daily_model || (provider === 'openrouter' ? 'openrouter/auto' : 'gpt-4o-mini');
        const maxTokens   = 800;

        let reply = '';

        // Provider অনুযায়ী কল
        if (providerInfo.format === 'gemini') {
            const url = `${providerInfo.baseUrl}/${model}:generateContent?key=${apiKey}`;
            const contents = [...chatHistory, { role: 'user', content: message }].map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));
            const gemRes = await axios.post(url, {
                contents,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { maxOutputTokens: maxTokens }
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
            reply = gemRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'উত্তর পাওয়া যায়নি।';

        } else if (providerInfo.format === 'anthropic') {
            const messages = [...chatHistory, { role: 'user', content: message }];
            const antRes = await axios.post(providerInfo.baseUrl,
                { model, max_tokens: maxTokens, system: systemPrompt, messages },
                { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, timeout: 30000 }
            );
            reply = antRes.data.content[0]?.text || 'উত্তর পাওয়া যায়নি।';

        } else {
            // OpenAI-compatible (OpenRouter + OpenAI)
            const messages = [
                { role: 'system', content: systemPrompt },
                ...chatHistory,
                { role: 'user', content: message }
            ];
            const oaiRes = await axios.post(providerInfo.baseUrl,
                { model, max_tokens: maxTokens, messages },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        [providerInfo.authHeader]: providerInfo.authValue(apiKey),
                        ...providerInfo.extraHeaders
                    },
                    timeout: 30000
                }
            );
            reply = oaiRes.data?.choices?.[0]?.message?.content || 'উত্তর পাওয়া যায়নি।';
        }

        return res.status(200).json({
            success: true,
            data: {
                reply,
                model,
                provider:      providerInfo.name,
                provider_key:  provider
            }
        });

    } catch (error) {
        console.error('❌ AI Chat Error:', error.response?.data || error.message);
        const status = error.response?.status;
        const msg = status === 401 ? 'API Key সঠিক নয়।'
                  : status === 429 ? 'API limit পার হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।'
                  : status === 402 ? 'API ক্রেডিট শেষ। Account এ ব্যালেন্স যোগ করুন।'
                  : error.message || 'AI চ্যাটে সমস্যা হয়েছে।';
        return res.status(500).json({ success: false, message: msg });
    }
};

module.exports = { getInsights, markInsightRead, getAIConfig, getModels, updateAIConfig, testAIConnection, triggerAIJob, aiChat };
