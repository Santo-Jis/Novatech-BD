const axios     = require('axios');
const { query } = require('../config/db');
const { decrypt } = require('../config/encryption');

// ============================================================
// AI Service — Multi-Provider Integration
// Supports: OpenRouter, Anthropic, OpenAI, Google Gemini
// NovaTechBD Management System
// ============================================================

const PROVIDERS = {
    openrouter: {
        name:        'OpenRouter',
        baseUrl:     'https://openrouter.ai/api/v1/chat/completions',
        format:      'openai',
        authHeader:  'Authorization',
        authValue:   (key) => `Bearer ${key}`,
        extraHeaders: {
            'HTTP-Referer': 'https://novatech-bd.vercel.app',
            'X-Title':      'NovaTech BD'
        }
    },
    anthropic: {
        name:        'Anthropic Claude',
        baseUrl:     'https://api.anthropic.com/v1/messages',
        format:      'anthropic',
        authHeader:  'x-api-key',
        authValue:   (key) => key,
        extraHeaders: { 'anthropic-version': '2023-06-01' }
    },
    openai: {
        name:        'OpenAI',
        baseUrl:     'https://api.openai.com/v1/chat/completions',
        format:      'openai',
        authHeader:  'Authorization',
        authValue:   (key) => `Bearer ${key}`,
        extraHeaders: {}
    },
    gemini: {
        name:        'Google Gemini',
        baseUrl:     'https://generativelanguage.googleapis.com/v1beta/models',
        format:      'gemini',
        authHeader:  null,
        authValue:   (key) => key,
        extraHeaders: {}
    }
};

const detectProvider = (apiKey) => {
    if (!apiKey) return null;
    if (apiKey.startsWith('sk-or-'))  return 'openrouter';
    if (apiKey.startsWith('sk-ant-')) return 'anthropic';
    if (apiKey.startsWith('AIza'))    return 'gemini';
    if (apiKey.startsWith('sk-'))     return 'openai';
    return 'openrouter';
};

const getAIConfig = async () => {
    const result = await query('SELECT config_key, config_value FROM ai_config');
    const config = {};
    result.rows.forEach(row => { config[row.config_key] = row.config_value; });

    if (config.api_key) {
        try { config.api_key_decrypted = decrypt(config.api_key); }
        catch { config.api_key_decrypted = config.api_key; }
    }

    if (config.api_key_decrypted) {
        config.provider = config.provider_override || detectProvider(config.api_key_decrypted);
    }

    return config;
};

const getDefaultModel = (provider, type = 'daily') => {
    const defaults = {
        // OpenRouter ফ্রি মডেল:
        // daily   → Llama 3.3 70B  : চ্যাট, দৈনিক insight, সংক্ষিপ্ত বিশ্লেষণ — দ্রুত ও GPT-4 মানের
        // complex → DeepSeek R1    : গভীর business analysis, alert তৈরি, multi-step reasoning
        openrouter: {
            daily:   'meta-llama/llama-3.3-70b-instruct:free',
            complex: 'deepseek/deepseek-r1:free'
        },
        anthropic:  { daily: 'claude-haiku-4-5-20251001',  complex: 'claude-sonnet-4-6' },
        openai:     { daily: 'gpt-4o-mini',                complex: 'gpt-4o' },
        gemini:     { daily: 'gemini-1.5-flash',           complex: 'gemini-1.5-pro' }
    };
    return defaults[provider]?.[type] || 'meta-llama/llama-3.3-70b-instruct:free';
};

const selectModel = (config, taskType = 'daily') => {
    const complexTasks = (config.complex_tasks_list || '').split(',').map(t => t.trim());
    if (complexTasks.includes(taskType)) {
        return config.periodic_model || getDefaultModel(config.provider, 'complex');
    }
    return config.daily_model || getDefaultModel(config.provider, 'daily');
};

// OpenAI-compatible format (OpenRouter + OpenAI)
const callOpenAIFormat = async (providerConfig, apiKey, model, messages, systemPrompt, maxTokens) => {
    const body = {
        model,
        max_tokens: maxTokens,
        messages: systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages
    };
    const headers = {
        'Content-Type': 'application/json',
        [providerConfig.authHeader]: providerConfig.authValue(apiKey),
        ...providerConfig.extraHeaders
    };
    const response = await axios.post(providerConfig.baseUrl, body, { headers, timeout: 60000 });
    return response.data?.choices?.[0]?.message?.content || '';
};

// Anthropic native format
const callAnthropicFormat = async (providerConfig, apiKey, model, messages, systemPrompt, maxTokens) => {
    const body = { model, max_tokens: maxTokens, messages };
    if (systemPrompt) body.system = systemPrompt;
    const headers = {
        'Content-Type': 'application/json',
        [providerConfig.authHeader]: providerConfig.authValue(apiKey),
        ...providerConfig.extraHeaders
    };
    const response = await axios.post(providerConfig.baseUrl, body, { headers, timeout: 60000 });
    return response.data?.content?.[0]?.text || '';
};

// Google Gemini format
const callGeminiFormat = async (providerConfig, apiKey, model, messages, systemPrompt, maxTokens) => {
    const url = `${providerConfig.baseUrl}/${model}:generateContent?key=${apiKey}`;
    const contents = messages.map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
    const response = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
    });
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

// Universal AI কল
const callAI = async (prompt, taskType = 'daily', systemPrompt = null, chatHistory = []) => {
    const config = await getAIConfig();

    if (!config.api_key_decrypted) {
        throw new Error('AI API Key সেট করা নেই। Settings থেকে যোগ করুন।');
    }

    const provider       = config.provider || detectProvider(config.api_key_decrypted);
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) throw new Error(`অজানা Provider: ${provider}`);

    const model     = selectModel(config, taskType);
    const maxTokens = parseInt(config.max_tokens || '1000');
    const messages  = [...chatHistory, { role: 'user', content: prompt }];

    console.log(`🤖 AI → Provider: ${providerConfig.name} | Model: ${model}`);

    switch (providerConfig.format) {
        case 'openai':    return await callOpenAIFormat(providerConfig, config.api_key_decrypted, model, messages, systemPrompt, maxTokens);
        case 'anthropic': return await callAnthropicFormat(providerConfig, config.api_key_decrypted, model, messages, systemPrompt, maxTokens);
        case 'gemini':    return await callGeminiFormat(providerConfig, config.api_key_decrypted, model, messages, systemPrompt, maxTokens);
        default: throw new Error(`অসমর্থিত format: ${providerConfig.format}`);
    }
};

const callClaudeAPI = callAI; // backward compat

// ডেইলি ডাটা
const collectDailyData = async (managerId = null) => {
    const today = new Date().toISOString().split('T')[0];
    let workerFilter = '', workerFilterParams = [];
    if (managerId) { workerFilter = 'AND u.manager_id = $1'; workerFilterParams = [managerId]; }

    const attendance = await query(
        `SELECT u.name_bn, a.status, a.late_minutes, a.salary_deduction
         FROM attendance a JOIN users u ON a.user_id = u.id
         WHERE a.date = $${managerId ? '2' : '1'} ${workerFilter}`,
        managerId ? [today, ...workerFilterParams] : [today]
    );

    const sales = await query(
        `SELECT u.name_bn, SUM(st.total_amount) AS total_sales, COUNT(st.id) AS invoice_count, SUM(st.credit_used) AS credit_given
         FROM sales_transactions st JOIN users u ON st.worker_id = u.id
         WHERE st.date = $${managerId ? '2' : '1'} ${workerFilter}
         GROUP BY u.id, u.name_bn`,
        managerId ? [today, ...workerFilterParams] : [today]
    );

    const trend = await query(
        `SELECT st.date, SUM(st.total_amount) AS total
         FROM sales_transactions st JOIN users u ON st.worker_id = u.id
         WHERE st.date >= $${managerId ? '2' : '1'}::date - INTERVAL '7 days'
           AND st.date <= $${managerId ? '2' : '1'} ${workerFilter}
         GROUP BY st.date ORDER BY st.date`,
        managerId ? [today, ...workerFilterParams] : [today]
    );

    const highCredit = await query(
        `SELECT c.shop_name, c.current_credit, c.credit_limit,
                ROUND((c.current_credit / NULLIF(c.credit_limit,0) * 100)::numeric, 1) AS usage_pct
         FROM customers c LEFT JOIN routes r ON c.route_id = r.id
         WHERE c.current_credit > 0 ${managerId ? 'AND r.manager_id = $1' : ''}
         ORDER BY usage_pct DESC NULLS LAST LIMIT 5`,
        managerId ? [managerId] : []
    );

    return { date: today, attendance: attendance.rows, sales: sales.rows, trend: trend.rows, high_credit: highCredit.rows };
};

const generateManagerInsight = async (managerId, managerName) => {
    try {
        const data = await collectDailyData(managerId);
        const prompt = `তুমি NovaTech BD কোম্পানির একজন AI Business Analyst।\nনিচের ডাটা বিশ্লেষণ করে ${managerName} ম্যানেজারের জন্য একটি সংক্ষিপ্ত বাংলা রিপোর্ট তৈরি করো।\n\nতারিখ: ${data.date}\nহাজিরা:\n${JSON.stringify(data.attendance, null, 2)}\nআজকের বিক্রয়:\n${JSON.stringify(data.sales, null, 2)}\nগত ৭ দিনের ট্রেন্ড:\n${JSON.stringify(data.trend, null, 2)}\nউচ্চ ক্রেডিট ঝুঁকি:\n${JSON.stringify(data.high_credit, null, 2)}\n\nনিচের JSON ফরম্যাটে উত্তর দাও (অন্য কিছু লিখবে না):\n{\n  "summary": "সংক্ষিপ্ত সারসংক্ষেপ (২-৩ বাক্য)",\n  "alerts": [{"type": "warning/critical/info", "title": "শিরোনাম", "message": "বিস্তারিত"}],\n  "recommendations": ["সুপারিশ ১", "সুপারিশ ২"]\n}`;
        const response = await callAI(prompt, 'daily');
        return JSON.parse(response.replace(/```json|```/g, '').trim());
    } catch (error) {
        console.error(`❌ Manager Insight Error (${managerId}):`, error.message);
        return null;
    }
};

const generateAdminInsight = async () => {
    try {
        const data = await collectDailyData(null);
        const kpi  = await query(`SELECT COUNT(DISTINCT st.worker_id) AS active_sellers, SUM(st.total_amount) AS total_sales, SUM(st.credit_used) AS total_credit, COUNT(a.id) FILTER (WHERE a.status = 'late') AS late_count FROM sales_transactions st LEFT JOIN attendance a ON a.user_id = st.worker_id AND a.date = CURRENT_DATE WHERE st.date = CURRENT_DATE`);
        const prompt = `তুমি NovaTech BD কোম্পানির AI Business Analyst।\nনিচের কোম্পানির সামগ্রিক ডাটা বিশ্লেষণ করে Admin এর জন্য রিপোর্ট তৈরি করো।\n\nতারিখ: ${data.date}\nKPI:\n${JSON.stringify(kpi.rows[0], null, 2)}\nবিক্রয় (SR ভিত্তিক):\n${JSON.stringify(data.sales, null, 2)}\nক্রেডিট ঝুঁকি:\n${JSON.stringify(data.high_credit, null, 2)}\n\nনিচের JSON ফরম্যাটে উত্তর দাও:\n{\n  "summary": "কোম্পানির সামগ্রিক অবস্থা (৩-৪ বাক্য)",\n  "kpi_highlights": ["মূল পয়েন্ট ১", "মূল পয়েন্ট ২"],\n  "alerts": [{"type": "warning/critical/info", "title": "শিরোনাম", "message": "বিস্তারিত"}],\n  "recommendations": ["সুপারিশ ১", "সুপারিশ ২"]\n}`;
        const response = await callAI(prompt, 'daily');
        return JSON.parse(response.replace(/```json|```/g, '').trim());
    } catch (error) {
        console.error('❌ Admin Insight Error:', error.message);
        return null;
    }
};

const saveInsight = async (insightType, targetRole, targetUserId, title, description, data, severity) => {
    await query(
        `INSERT INTO ai_insights (insight_type, target_role, target_user_id, title, description, data, severity) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [insightType, targetRole, targetUserId || null, title, description, JSON.stringify(data || {}), severity || 'info']
    );
};

module.exports = { getAIConfig, detectProvider, PROVIDERS, callAI, callClaudeAPI, collectDailyData, generateManagerInsight, generateAdminInsight, saveInsight };
