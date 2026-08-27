const axios     = require('axios');
const logger = require('../config/logger');
const { query } = require('../config/db');
const { decrypt } = require('../config/encryption');

// ============================================================
// AI Service — Multi-Provider Integration
// Supports: OpenRouter, Anthropic, OpenAI, Google Gemini
// ZovoriX Management System
// ============================================================

const PROVIDERS = {
    openrouter: {
        name:        'OpenRouter',
        baseUrl:     'https://openrouter.ai/api/v1/chat/completions',
        format:      'openai',
        authHeader:  'Authorization',
        authValue:   (key) => `Bearer ${key}`,
        extraHeaders: {
            'HTTP-Referer': 'https://zovorix.vercel.app',
            'X-Title':      'ZovoriX'
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

// ============================================================
// ✅ ধাপ ১: Native Tool-Calling — normalized ↔ provider translation
//
// normalized message shape (সব provider-এর জন্য একই, adapter নিজে
// নিজে provider-native ফরম্যাটে রূপান্তর করে):
//   { role: 'user', content: '...' }
//   { role: 'assistant', content: '...'|null, toolCalls?: [{id, name, arguments}] }
//   { role: 'tool', toolCallId, name, content }   ← tool execution-এর ফলাফল
//
// normalized tool shape: { name, description, parameters: <JSON Schema> }
//
// tools না দিলে (পুরনো caller-রা — staff insight ইত্যাদি) messages-এ
// কখনো role:'tool' বা assistant.toolCalls থাকে না, তাই নিচের প্রতিটা
// translator-ই "else" শাখায় গিয়ে ঠিক আগের মতোই plain {role, content}
// ম্যাপিং করে — behavior অপরিবর্তিত।
// ============================================================

const toOpenAITools = (tools) => tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } },
}));

const toOpenAIMessages = (messages) => messages.map(m => {
    if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })),
        };
    }
    return { role: m.role, content: m.content };
});

const parseOpenAIResponse = (data) => {
    const message = data?.choices?.[0]?.message || {};
    const usage   = data?.usage || {};
    const usageOut = {
        promptTokens:     usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens:      usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0)),
    };
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        return {
            type: 'tool_calls',
            toolCalls: message.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments || '{}' })),
            text: message.content || null,
            usage: usageOut,
        };
    }
    return { type: 'text', text: message.content || '', usage: usageOut };
};

// OpenAI-compatible format (OpenRouter + OpenAI)
const callOpenAIFormat = async (providerConfig, apiKey, model, messages, systemPrompt, maxTokens, tools = null) => {
    const body = {
        model,
        max_tokens: maxTokens,
        messages: systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...toOpenAIMessages(messages)]
            : toOpenAIMessages(messages),
    };
    if (tools && tools.length > 0) body.tools = toOpenAITools(tools); // ✅ ধাপ ১
    const headers = {
        'Content-Type': 'application/json',
        [providerConfig.authHeader]: providerConfig.authValue(apiKey),
        ...providerConfig.extraHeaders
    };
    const response = await axios.post(providerConfig.baseUrl, body, { headers, timeout: 60000 });
    return parseOpenAIResponse(response.data);
};

// ── Anthropic: consecutive tool-result গুলো একটাই user turn-এ merge
// করতে হয় (একাধিক tool call এক turn-এ হলে Anthropic এটাই আশা করে) ──
const toAnthropicTools = (tools) => tools.map(t => ({
    name: t.name, description: t.description, input_schema: t.parameters || { type: 'object', properties: {} },
}));

const toAnthropicMessages = (messages) => {
    const out = [];
    for (const m of messages) {
        if (m.role === 'tool') {
            const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
            const last  = out[out.length - 1];
            if (last && last._isToolResultTurn) last.content.push(block);
            else out.push({ role: 'user', content: [block], _isToolResultTurn: true });
            continue;
        }
        if (m.role === 'assistant' && m.toolCalls?.length) {
            const content = [];
            if (m.content) content.push({ type: 'text', text: m.content });
            for (const tc of m.toolCalls) {
                let input; try { input = JSON.parse(tc.arguments || '{}'); } catch { input = {}; }
                content.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
            }
            out.push({ role: 'assistant', content });
            continue;
        }
        out.push({ role: m.role, content: m.content });
    }
    return out.map(({ _isToolResultTurn, ...rest }) => rest); // internal marker বাদ
};

const parseAnthropicResponse = (data) => {
    const blocks = data?.content || [];
    const usage  = data?.usage || {};
    const promptTokens     = usage.input_tokens || 0;
    const completionTokens = usage.output_tokens || 0;
    const usageOut = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };

    const toolUseBlocks = blocks.filter(b => b.type === 'tool_use');
    const textBlock      = blocks.find(b => b.type === 'text');
    if (toolUseBlocks.length > 0) {
        return {
            type: 'tool_calls',
            toolCalls: toolUseBlocks.map(b => ({ id: b.id, name: b.name, arguments: JSON.stringify(b.input || {}) })),
            text: textBlock?.text || null,
            usage: usageOut,
        };
    }
    return { type: 'text', text: textBlock?.text || '', usage: usageOut };
};

// Anthropic native format
const callAnthropicFormat = async (providerConfig, apiKey, model, messages, systemPrompt, maxTokens, tools = null) => {
    const body = { model, max_tokens: maxTokens, messages: toAnthropicMessages(messages) };
    if (systemPrompt) body.system = systemPrompt;
    if (tools && tools.length > 0) body.tools = toAnthropicTools(tools); // ✅ ধাপ ১
    const headers = {
        'Content-Type': 'application/json',
        [providerConfig.authHeader]: providerConfig.authValue(apiKey),
        ...providerConfig.extraHeaders
    };
    const response = await axios.post(providerConfig.baseUrl, body, { headers, timeout: 60000 });
    return parseAnthropicResponse(response.data);
};

// ── Gemini: role নাম আলাদা (user/model/function), আর নিজে কোনো
// tool-call-id দেয় না — matching-এর জন্য synthetic id বানাতে হয়
// (Gemini নিজে name দিয়ে match করে, তাই এই id শুধু আমাদের অভ্যন্তরীণ
// bookkeeping-এর জন্য, provider-এর কাছে ফেরত পাঠাতে হয় না) ──
const toGeminiTools = (tools) => [{
    function_declarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } })),
}];

const toGeminiContents = (messages) => {
    const out = [];
    for (const m of messages) {
        if (m.role === 'tool') {
            let response; try { response = JSON.parse(m.content); } catch { response = { result: m.content }; }
            const part = { functionResponse: { name: m.name, response } };
            const last = out[out.length - 1];
            if (last && last.role === 'function') last.parts.push(part);
            else out.push({ role: 'function', parts: [part] });
            continue;
        }
        if (m.role === 'assistant' && m.toolCalls?.length) {
            const parts = [];
            if (m.content) parts.push({ text: m.content });
            for (const tc of m.toolCalls) {
                let args; try { args = JSON.parse(tc.arguments || '{}'); } catch { args = {}; }
                parts.push({ functionCall: { name: tc.name, args } });
            }
            out.push({ role: 'model', parts });
            continue;
        }
        out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    }
    return out;
};

const parseGeminiResponse = (data) => {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const usage = data?.usageMetadata || {};
    const promptTokens     = usage.promptTokenCount || 0;
    const completionTokens = usage.candidatesTokenCount || 0;
    const usageOut = { promptTokens, completionTokens, totalTokens: usage.totalTokenCount || (promptTokens + completionTokens) };

    const fnCalls   = parts.filter(p => p.functionCall);
    const textPart  = parts.find(p => p.text);
    if (fnCalls.length > 0) {
        return {
            type: 'tool_calls',
            toolCalls: fnCalls.map((p, i) => ({
                id: `gemini_call_${Date.now()}_${i}`,
                name: p.functionCall.name,
                arguments: JSON.stringify(p.functionCall.args || {}),
            })),
            text: textPart?.text || null,
            usage: usageOut,
        };
    }
    return { type: 'text', text: textPart?.text || '', usage: usageOut };
};

// Google Gemini format
const callGeminiFormat = async (providerConfig, apiKey, model, messages, systemPrompt, maxTokens, tools = null) => {
    const url  = `${providerConfig.baseUrl}/${model}:generateContent?key=${apiKey}`;
    const body = { contents: toGeminiContents(messages), generationConfig: { maxOutputTokens: maxTokens } };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
    if (tools && tools.length > 0) body.tools = toGeminiTools(tools); // ✅ ধাপ ১
    const response = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
    });
    return parseGeminiResponse(response.data);
};

// ============================================================
// ✅ ধাপ ১ (স্ট্রিমিং — ১ম অংশ, শুধু OpenAI-format/OpenRouter):
//
// এই স্ট্রিমিং শুধু agentic loop-এর প্রতিটা round-এই ব্যবহার হয়
// (customerAiChat.service.js-এর runAgenticChatStream) — এক call
// text produce করবে না তা আগে থেকে জানার উপায় নেই, তাই প্রতিটা
// round-ই স্ট্রিম করে চেষ্টা করা হয়, কিন্তু ফলাফল অনুযায়ী আলাদা আচরণ:
//
//   • প্রথম meaningful delta-তে delta.tool_calls থাকলে → পুরো response
//     tool-call হিসেবে ধরে নিয়ে চুপচাপ buffer করা হয় (arguments-এর
//     ছোট ছোট টুকরো জোড়া লাগিয়ে), customer-কে কিছুই forward হয় না
//     (tool call-এর raw JSON মানুষের পড়ার মতো কিছু না)
//   • প্রথম meaningful delta-তে delta.content থাকলে → text-mode ধরে
//     নিয়ে প্রতিটা chunk সাথে সাথে onTextChunk() দিয়ে forward হয়
//     (আসল streaming UX — customer টাইপ হতে দেখে)
//
// Anthropic/Gemini streaming এখনো নেই — এই ডেলিভারিতে ইচ্ছাকৃতভাবে
// শুধু OpenAI-format/OpenRouter (production-এ যেটা আসলে চলছে)।
// অন্য provider হলে streamAI() নিচে non-streaming callAI()-তে
// gracefully fallback করে (স্ট্রিম হবে না, কিন্তু ভাঙবেও না)।
// ============================================================
const streamOpenAIFormat = (providerConfig, apiKey, model, messages, systemPrompt, maxTokens, tools, onTextChunk) => {
    return new Promise((resolve, reject) => {
        (async () => {
            const body = {
                model, max_tokens: maxTokens, stream: true,
                messages: systemPrompt
                    ? [{ role: 'system', content: systemPrompt }, ...toOpenAIMessages(messages)]
                    : toOpenAIMessages(messages),
            };
            if (tools && tools.length > 0) body.tools = toOpenAITools(tools);
            const headers = {
                'Content-Type': 'application/json',
                [providerConfig.authHeader]: providerConfig.authValue(apiKey),
                ...providerConfig.extraHeaders,
            };

            let buffer   = '';
            let fullText = '';
            let mode     = null; // null | 'text' | 'tool_calls' — প্রথম meaningful delta-তে ঠিক হয়
            const toolCallAcc = {}; // index → { id, name, arguments } — টুকরো টুকরো জোড়া লাগানো হয়
            let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

            const handleEvent = (dataStr) => {
                if (dataStr === '[DONE]') return;
                let json;
                try { json = JSON.parse(dataStr); } catch { return; } // চাংক মাঝপথে কাটা থাকলে skip, পরের data-তে সম্পূর্ণ হবে

                if (json.usage) {
                    usage = {
                        promptTokens:     json.usage.prompt_tokens || 0,
                        completionTokens: json.usage.completion_tokens || 0,
                        totalTokens:      json.usage.total_tokens || 0,
                    };
                }

                const delta = json.choices?.[0]?.delta;
                if (!delta) return;

                if (delta.tool_calls) {
                    mode = mode || 'tool_calls';
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!toolCallAcc[idx]) toolCallAcc[idx] = { id: '', name: '', arguments: '' };
                        if (tc.id) toolCallAcc[idx].id = tc.id;
                        if (tc.function?.name) toolCallAcc[idx].name += tc.function.name;
                        if (tc.function?.arguments) toolCallAcc[idx].arguments += tc.function.arguments;
                    }
                    return; // tool-call mode-এ কখনো forward করা হয় না
                }

                if (delta.content) {
                    mode = mode || 'text';
                    fullText += delta.content;
                    if (mode === 'text') onTextChunk(delta.content); // শুধু নিশ্চিত text-mode হলেই forward
                }
            };

            try {
                const response = await axios.post(providerConfig.baseUrl, body, {
                    headers, timeout: 60000, responseType: 'stream',
                });

                response.data.on('data', (chunk) => {
                    buffer += chunk.toString('utf8');
                    const parts = buffer.split('\n\n');
                    buffer = parts.pop(); // শেষ অংশ অসম্পূর্ণ হতে পারে — পরের chunk-এর অপেক্ষায় রাখা হলো
                    for (const part of parts) {
                        const line = part.trim();
                        if (!line.startsWith('data:')) continue;
                        handleEvent(line.slice(5).trim());
                    }
                });

                response.data.on('end', () => {
                    if (mode === 'tool_calls') {
                        const toolCalls = Object.values(toolCallAcc)
                            .filter(tc => tc.name)
                            .map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments || '{}' }));
                        resolve({ type: 'tool_calls', toolCalls, text: fullText || null, usage });
                    } else {
                        resolve({ type: 'text', text: fullText, usage });
                    }
                });
                response.data.on('error', reject);
            } catch (err) {
                reject(err);
            }
        })();
    });
};

/**
 * streamAI — শুধু OpenAI-format/OpenRouter-এ আসলেই স্ট্রিম করে (ধাপ ১-এর
 * এই অংশে)। অন্য provider হলে callAI()-তে non-streaming fallback করে,
 * পুরো টেক্সট একবারে onTextChunk()-এ পাঠিয়ে দেয় (ভাঙে না, শুধু আসল
 * incremental streaming হয় না)।
 *
 * রিটার্ন করে: callAI()-এর মতোই shape — { type, text, toolCalls, usage,
 * provider, model, requestedModel, usedFallback, keySource, chargePaisa }
 */
const streamAI = async (rawMessages, systemPrompt, tools, options = {}, onTextChunk = () => {}) => {
    const { tenantId = null, userId = null, source = 'unknown' } = options;
    const { resolveAIAccess } = require('./tenantAI.service');
    const access = await resolveAIAccess(tenantId);
    const config = await getAIConfig();
    const provider       = access.provider || config.provider || detectProvider(access.apiKey);
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) throw new Error(`অজানা Provider: ${provider}`);

    if (providerConfig.format !== 'openai') {
        // ✅ Anthropic/Gemini streaming এখনো নেই — non-streaming-এ গ্রেসফুল fallback
        const result = await callAI(null, 'daily', systemPrompt, [], {
            tenantId, userId, source, tools, rawMessages,
        });
        if (result.type === 'text' && result.text) onTextChunk(result.text); // এক ধাক্কায় পুরোটা, তবু কাজ করে
        return result;
    }

    const requestedModel = access.modelOverride || selectModel(config, 'daily');
    const maxTokens = parseInt(config.max_tokens || '1000');

    let actualModel  = requestedModel;
    let usedFallback = false;
    let streamResult;

    if (provider === 'openrouter') {
        const FREE_FALLBACKS = [
            'meta-llama/llama-3.3-70b-instruct:free',
            'google/gemma-3-27b-it:free',
            'mistralai/mistral-7b-instruct:free',
            'openrouter/auto',
        ];
        const modelsToTry = [requestedModel, ...FREE_FALLBACKS.filter(m => m !== requestedModel)];
        const retryableStatuses = tools ? [429, 404, 400] : [429, 404];
        let lastError = null;
        for (const tryModel of modelsToTry) {
            try {
                streamResult = await streamOpenAIFormat(providerConfig, access.apiKey, tryModel, rawMessages, systemPrompt, maxTokens, tools, onTextChunk);
                actualModel  = tryModel;
                usedFallback = tryModel !== requestedModel;
                if (usedFallback) logger.warn(`⚠️ [Stream] Model ${requestedModel} ব্যর্থ, ${tryModel} দিয়ে fallback হলো`);
                break;
            } catch (err) {
                const status = err.response?.status;
                if (retryableStatuses.includes(status)) { lastError = err; continue; }
                throw err;
            }
        }
        if (!streamResult && lastError) throw lastError;
    } else {
        streamResult = await streamOpenAIFormat(providerConfig, access.apiKey, requestedModel, rawMessages, systemPrompt, maxTokens, tools, onTextChunk);
    }

    // ── Usage log + wallet charge — callAI()-এর ঠিক একই প্যাটার্ন ──
    let chargePaisa = 0;
    if (tenantId) {
        try {
            const { calculateChargePaisa } = require('./aiPricing.service');
            const walletService = require('./wallet.service');

            if (access.keySource === 'platform') {
                const priced = await calculateChargePaisa({
                    provider, model: actualModel,
                    promptTokens:     streamResult.usage.promptTokens,
                    completionTokens: streamResult.usage.completionTokens,
                    totalTokens:      streamResult.usage.totalTokens,
                    tenantSettings:   access.tenantSettings,
                });
                chargePaisa = priced.chargePaisa;

                if (chargePaisa > 0) {
                    try {
                        await walletService.deduct(tenantId, chargePaisa, {
                            type: 'ai_charge',
                            reference: `ai:${source}`,
                            description: `AI স্ট্রিমিং — ${streamResult.usage.totalTokens} token (${provider}/${actualModel})`,
                        });
                    } catch (err) {
                        logger.error('❌ Wallet deduct ব্যর্থ (stream):', err.message);
                        chargePaisa = 0;
                    }
                }
            }

            await query(
                `INSERT INTO ai_usage_logs
                    (tenant_id, user_id, source, key_source, provider, model,
                     prompt_tokens, completion_tokens, total_tokens, pricing_mode, charge_paisa, billed)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [
                    tenantId, userId, source, access.keySource, provider, actualModel,
                    streamResult.usage.promptTokens, streamResult.usage.completionTokens, streamResult.usage.totalTokens,
                    access.keySource === 'platform' ? (access.tenantSettings?.pricing_mode || null) : null,
                    chargePaisa, chargePaisa > 0,
                ]
            );
            await query(
                `UPDATE tenants SET ai_tokens_used = COALESCE(ai_tokens_used, 0) + $1 WHERE id = $2`,
                [streamResult.usage.totalTokens, tenantId]
            );
        } catch (logErr) {
            logger.error('❌ AI usage log/charge Error (stream):', logErr.message);
        }
    }

    return {
        type: streamResult.type,
        text: streamResult.text,
        toolCalls: streamResult.toolCalls || null,
        usage: streamResult.usage,
        provider,
        model: actualModel,
        requestedModel,
        usedFallback,
        keySource: access.keySource,
        chargePaisa,
    };
};

// ============================================================
// Universal AI কল
// options: { tenantId, userId, source } — দিলে tenant-aware
// BYOK resolve + token usage log + wallet চার্জ হবে। tenantId না
// দিলে (background insight job) legacy platform-key আচরণ, কোনো
// চার্জ/ব্লক হয় না (backward compatible)।
// রিটার্ন করে: { text, usage, provider, model, requestedModel, usedFallback, keySource, chargePaisa }
// (model = আসলে যা সার্ভ করেছে; requestedModel = যা চাওয়া হয়েছিল — ধাপ ০ থেকে আলাদা, fallback ট্র্যাক করতে)
// ============================================================
const callAI = async (prompt, taskType = 'daily', systemPrompt = null, chatHistory = [], options = {}) => {
    const {
        tenantId = null, userId = null, source = 'unknown',
        tools = null,        // ✅ ধাপ ১: normalized tool-schema array (না দিলে আগের মতোই কোনো tool পাঠানো হয় না)
        rawMessages = null,  // ✅ ধাপ ১: orchestration loop-এর জন্য — দিলে chatHistory/prompt উপেক্ষা করে সরাসরি এই array পাঠানো হয়
    } = options;
    const { resolveAIAccess } = require('./tenantAI.service');

    // ── AI Access resolve করো (own key / platform key / block) ──
    const access = await resolveAIAccess(tenantId);

    // daily_model/periodic_model config এখনো global ai_config থেকেই আসে
    // (tenant নিজের key দিলেও, model select করার লজিক একই থাকে)
    const config = await getAIConfig();
    const provider       = access.provider || config.provider || detectProvider(access.apiKey);
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) throw new Error(`অজানা Provider: ${provider}`);

    const requestedModel = access.modelOverride || selectModel(config, taskType);
    const maxTokens = parseInt(config.max_tokens || '1000');
    const messages  = rawMessages || [...chatHistory, { role: 'user', content: prompt }];

    logger.info(`🤖 AI → Provider: ${providerConfig.name} | Model: ${requestedModel} | KeySource: ${access.keySource || 'legacy'}${tools ? ` | Tools: ${tools.length}` : ''}`);

    let result;
    // ✅ ধাপ ০ (বেসলাইন): আগে fallback হলেও ফাংশনের বাইরে সবসময় requestedModel-ই
    // রিপোর্ট হতো (নিচের return/usage-log-এ) — actualModel/usedFallback আলাদাভাবে
    // ট্র্যাক না করলে fallback-rate বা "কোন মডেল আসলে সার্ভ করলো" কখনো সঠিকভাবে জানা যেত না।
    let actualModel  = requestedModel;
    let usedFallback = false;

    switch (providerConfig.format) {
        case 'openai': {
            // OpenRouter হলে rate-limit/404-এ ফ্রি ফলব্যাক মডেল দিয়ে retry করো
            if (provider === 'openrouter') {
                const FREE_FALLBACKS = [
                    'meta-llama/llama-3.3-70b-instruct:free',
                    'google/gemma-3-27b-it:free',
                    'mistralai/mistral-7b-instruct:free',
                    'openrouter/auto',
                ];
                const modelsToTry = [requestedModel, ...FREE_FALLBACKS.filter(m => m !== requestedModel)];
                // ✅ ধাপ ১: tools পাঠানো হলে ৪০০-ও fallback-retryable ধরা হচ্ছে —
                // অনেক free মডেল tool-calling সাপোর্ট না করলে ৪২৯/৪০৪ না দিয়ে
                // সরাসরি ৪০০ (bad request) দেয়। tools ছাড়া পুরনো আচরণ অপরিবর্তিত।
                const retryableStatuses = tools ? [429, 404, 400] : [429, 404];
                let lastError = null;
                for (const tryModel of modelsToTry) {
                    try {
                        result = await callOpenAIFormat(providerConfig, access.apiKey, tryModel, messages, systemPrompt, maxTokens, tools);
                        actualModel  = tryModel;
                        usedFallback = tryModel !== requestedModel;
                        if (usedFallback) logger.warn(`⚠️ Model ${requestedModel} ব্যর্থ, ${tryModel} দিয়ে fallback হলো`);
                        break;
                    } catch (err) {
                        const errStatus = err.response?.status;
                        if (retryableStatuses.includes(errStatus)) { lastError = err; continue; }
                        throw err;
                    }
                }
                if (!result && lastError) throw lastError;
            } else {
                result = await callOpenAIFormat(providerConfig, access.apiKey, requestedModel, messages, systemPrompt, maxTokens, tools);
            }
            break;
        }
        case 'anthropic': result = await callAnthropicFormat(providerConfig, access.apiKey, requestedModel, messages, systemPrompt, maxTokens, tools); break;
        case 'gemini':    result = await callGeminiFormat(providerConfig, access.apiKey, requestedModel, messages, systemPrompt, maxTokens, tools); break;
        default: throw new Error(`অসমর্থিত format: ${providerConfig.format}`);
    }

    let chargePaisa = 0;

    // ── Usage log + wallet চার্জ — শুধু tenantId দেওয়া থাকলে ──
    if (tenantId) {
        try {
            const { calculateChargePaisa } = require('./aiPricing.service');
            const walletService = require('./wallet.service');

            if (access.keySource === 'platform') {
                const priced = await calculateChargePaisa({
                    provider, model: actualModel,
                    promptTokens:     result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens:      result.usage.totalTokens,
                    tenantSettings:   access.tenantSettings,
                });
                chargePaisa = priced.chargePaisa;

                if (chargePaisa > 0) {
                    try {
                        await walletService.deduct(tenantId, chargePaisa, {
                            type: 'ai_charge',
                            reference: `ai:${source}`,
                            description: `AI ব্যবহার — ${result.usage.totalTokens} token (${provider}/${actualModel})`,
                        });
                    } catch (deductErr) {
                        // Reply ইতিমধ্যে provider থেকে এসে গেছে (cost হয়ে গেছে) —
                        // deduct fail (race condition-এ ব্যালেন্স শেষ) হলেও reply আটকানো হবে না,
                        // শুধু log-এ billed=false থাকবে, পরের রিকোয়েস্ট balance check-এ block হবে।
                        logger.warn(`⚠️ AI wallet deduct fail (tenant ${tenantId}):`, deductErr.message);
                        chargePaisa = 0;
                    }
                }
            }

            await query(
                `INSERT INTO ai_usage_logs
                    (tenant_id, user_id, source, key_source, provider, model,
                     prompt_tokens, completion_tokens, total_tokens, pricing_mode, charge_paisa, billed)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [
                    tenantId, userId, source, access.keySource, provider, actualModel,
                    result.usage.promptTokens, result.usage.completionTokens, result.usage.totalTokens,
                    access.keySource === 'platform' ? (access.tenantSettings?.pricing_mode || null) : null,
                    chargePaisa, chargePaisa > 0,
                ]
            );

            // tenants.ai_tokens_used — রিপোর্টিং/ড্যাশবোর্ডের জন্য কাউন্টার আপডেট
            await query(
                `UPDATE tenants SET ai_tokens_used = COALESCE(ai_tokens_used, 0) + $1 WHERE id = $2`,
                [result.usage.totalTokens, tenantId]
            );
        } catch (logErr) {
            logger.error('❌ AI usage log/charge Error:', logErr.message);
        }
    }

    // ✅ ধাপ ০: model এখন actualModel (fallback হলে যেটা সত্যিই সার্ভ করেছে)।
    // ✅ ধাপ ১: type/toolCalls যোগ হলো — tools দিলে model tool চাইতে পারে
    // (type:'tool_calls'), না চাইলে বা tools না দিলে type:'text' (পুরনো
    // caller-রা শুধু .text পড়ে, তাই তাদের কিছু বদলায় না)।
    return {
        type: result.type || 'text',
        text: result.text,
        toolCalls: result.toolCalls || null,
        usage: result.usage,
        provider,
        model: actualModel,
        requestedModel,
        usedFallback,
        keySource: access.keySource,
        chargePaisa,
    };
};

const callClaudeAPI = callAI; // backward compat

// ডেইলি ডাটা — tenantId বাধ্যতামূলক (এর আগে managerId=null হলে এই ফাংশন
// কোনো tenant filter ছাড়াই পুরো প্ল্যাটফর্মের সব tenant-এর attendance/sales/
// credit ডাটা একসাথে টেনে আনতো — সেই cross-tenant leak এখানে ফিক্স করা হলো)
const collectDailyData = async (managerId, tenantId) => {
    if (!tenantId) throw new Error('collectDailyData()-এ tenantId আবশ্যক (cross-tenant leak এড়াতে)।');

    const today = new Date().toISOString().split('T')[0];

    const attParams = [today, tenantId];
    let attFilter = 'AND a.tenant_id = $2';
    if (managerId) { attParams.push(managerId); attFilter += ` AND u.manager_id = $${attParams.length}`; }

    const attendance = await query(
        `SELECT u.name_bn, a.status, a.late_minutes, a.salary_deduction
         FROM attendance a JOIN users u ON a.user_id = u.id
         WHERE a.date = $1 ${attFilter}`,
        attParams
    );

    const salesParams = [today, tenantId];
    let salesFilter = 'AND st.tenant_id = $2';
    if (managerId) { salesParams.push(managerId); salesFilter += ` AND u.manager_id = $${salesParams.length}`; }

    const sales = await query(
        `SELECT u.name_bn, SUM(st.total_amount) AS total_sales, COUNT(st.id) AS invoice_count, SUM(st.credit_used) AS credit_given
         FROM sales_transactions st JOIN users u ON st.worker_id = u.id
         WHERE st.date = $1 ${salesFilter}
         GROUP BY u.id, u.name_bn`,
        salesParams
    );

    const trendParams = [today, tenantId];
    let trendFilter = 'AND st.tenant_id = $2';
    if (managerId) { trendParams.push(managerId); trendFilter += ` AND u.manager_id = $${trendParams.length}`; }

    const trend = await query(
        `SELECT st.date, SUM(st.total_amount) AS total
         FROM sales_transactions st JOIN users u ON st.worker_id = u.id
         WHERE st.date >= $1::date - INTERVAL '7 days'
           AND st.date <= $1 ${trendFilter}
         GROUP BY st.date ORDER BY st.date`,
        trendParams
    );

    const creditParams = [tenantId];
    let creditFilter = 'AND c.tenant_id = $1';
    if (managerId) { creditParams.push(managerId); creditFilter += ` AND r.manager_id = $${creditParams.length}`; }

    const highCredit = await query(
        `SELECT c.shop_name, c.current_credit, c.credit_limit,
                ROUND((c.current_credit / NULLIF(c.credit_limit,0) * 100)::numeric, 1) AS usage_pct
         FROM customers c LEFT JOIN routes r ON c.route_id = r.id
         WHERE c.current_credit > 0 ${creditFilter}
         ORDER BY usage_pct DESC NULLS LAST LIMIT 5`,
        creditParams
    );

    return { date: today, attendance: attendance.rows, sales: sales.rows, trend: trend.rows, high_credit: highCredit.rows };
};

const generateManagerInsight = async (managerId, managerName, tenantId) => {
    try {
        const data = await collectDailyData(managerId, tenantId);
        const prompt = `তুমি এই কোম্পানির একজন AI Business Analyst।\nনিচের ডাটা বিশ্লেষণ করে ${managerName} ম্যানেজারের জন্য একটি সংক্ষিপ্ত বাংলা রিপোর্ট তৈরি করো।\n\nতারিখ: ${data.date}\nহাজিরা:\n${JSON.stringify(data.attendance, null, 2)}\nআজকের বিক্রয়:\n${JSON.stringify(data.sales, null, 2)}\nগত ৭ দিনের ট্রেন্ড:\n${JSON.stringify(data.trend, null, 2)}\nউচ্চ ক্রেডিট ঝুঁকি:\n${JSON.stringify(data.high_credit, null, 2)}\n\nনিচের JSON ফরম্যাটে উত্তর দাও (অন্য কিছু লিখবে না):\n{\n  "summary": "সংক্ষিপ্ত সারসংক্ষেপ (২-৩ বাক্য)",\n  "alerts": [{"type": "warning/critical/info", "title": "শিরোনাম", "message": "বিস্তারিত"}],\n  "recommendations": ["সুপারিশ ১", "সুপারিশ ২"]\n}`;
        const response = await callAI(prompt, 'daily', null, [], { tenantId, source: 'insight_job_manager' });
        return JSON.parse(response.text.replace(/```json|```/g, '').trim());
    } catch (error) {
        logger.error(`❌ Manager Insight Error (${managerId}, tenant ${tenantId}):`, error.message);
        return null;
    }
};

const generateAdminInsight = async (tenantId) => {
    try {
        if (!tenantId) throw new Error('generateAdminInsight()-এ tenantId আবশ্যক (cross-tenant leak এড়াতে)।');
        const data = await collectDailyData(null, tenantId);
        const kpi  = await query(
            `SELECT COUNT(DISTINCT st.worker_id) AS active_sellers, SUM(st.total_amount) AS total_sales, SUM(st.credit_used) AS total_credit, COUNT(a.id) FILTER (WHERE a.status = 'late') AS late_count
             FROM sales_transactions st LEFT JOIN attendance a ON a.user_id = st.worker_id AND a.date = CURRENT_DATE AND a.tenant_id = $1
             WHERE st.date = CURRENT_DATE AND st.tenant_id = $1`,
            [tenantId]
        );
        const prompt = `তুমি এই কোম্পানির AI Business Analyst।\nনিচের কোম্পানির সামগ্রিক ডাটা বিশ্লেষণ করে Admin এর জন্য রিপোর্ট তৈরি করো।\n\nতারিখ: ${data.date}\nKPI:\n${JSON.stringify(kpi.rows[0], null, 2)}\nবিক্রয় (SR ভিত্তিক):\n${JSON.stringify(data.sales, null, 2)}\nক্রেডিট ঝুঁকি:\n${JSON.stringify(data.high_credit, null, 2)}\n\nনিচের JSON ফরম্যাটে উত্তর দাও:\n{\n  "summary": "কোম্পানির সামগ্রিক অবস্থা (৩-৪ বাক্য)",\n  "kpi_highlights": ["মূল পয়েন্ট ১", "মূল পয়েন্ট ২"],\n  "alerts": [{"type": "warning/critical/info", "title": "শিরোনাম", "message": "বিস্তারিত"}],\n  "recommendations": ["সুপারিশ ১", "সুপারিশ ২"]\n}`;
        const response = await callAI(prompt, 'daily', null, [], { tenantId, source: 'insight_job_admin' });
        return JSON.parse(response.text.replace(/```json|```/g, '').trim());
    } catch (error) {
        logger.error(`❌ Admin Insight Error (tenant ${tenantId}):`, error.message);
        return null;
    }
};

const saveInsight = async (insightType, targetRole, targetUserId, title, description, data, severity, tenantId) => {
    await query(
        `INSERT INTO ai_insights (insight_type, target_role, target_user_id, title, description, data, severity, tenant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [insightType, targetRole, targetUserId || null, title, description, JSON.stringify(data || {}), severity || 'info', tenantId]
    );
};

module.exports = { getAIConfig, detectProvider, PROVIDERS, callAI, streamAI, callClaudeAPI, collectDailyData, generateManagerInsight, generateAdminInsight, saveInsight };
