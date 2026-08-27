const logger = require('../config/logger');
// ============================================================
// Customer AI Chat Controller  (updated)
// File: backend/src/controllers/customerAiChat.controller.js
//
// পরিবর্তন:
//   • response-এ tokens_remaining, refill_in_seconds যোগ হয়েছে
//     (aiTokenBucket middleware req.aiTokens set করে)
//   • বাকি সব আগের মতোই
// ============================================================

const { query }          = require('../config/db');
const { AIAccessBlockedError } = require('../services/tenantAI.service');
const { writeAiChatLog, getDB } = require('../config/firebase');
const {
    runAgenticChat,       // ✅ ধাপ ১: ২-pass regex-এর জায়গায় native tool-calling loop
    runAgenticChatStream, // ✅ ধাপ ১ (স্ট্রিমিং): একই loop, streamAI দিয়ে
    buildSystemPrompt,
    getConnectedCompanies,
} = require('../services/customerAiChat.service');
const {
    getOrCreateThreadId,  // ✅ ধাপ ১ (মেমরি): server-side conversation থ্রেড
    getThreadHistory,
    appendMessages,
} = require('../services/aiChatMemory.service');

// ── Helper: portal customer_id থেকে person_id বের করো ──
// ✅ NEW (Session 20): customerPortalConnection.controller.js-এর
// getPersonId-এর মতোই — multi-company aggregate-এর জন্য দরকার
const getPersonId = async (customerId) => {
    const r = await query(`SELECT person_id FROM customers WHERE id = $1`, [customerId]);
    if (r.rows.length === 0 || !r.rows[0].person_id) {
        throw new Error('PERSON_NOT_LINKED');
    }
    return r.rows[0].person_id;
};

// ── Save to Firebase (non-critical) ─────────────────────────
const saveToLog = async (customerId, message, reply) => {
    try {
        await writeAiChatLog(customerId, message, reply);
    } catch { /* non-critical */ }
};

// ── Quality/observability log (ধাপ ০-এ শুরু, ধাপ ১-এ extend করা) ──
// ✅ ধাপ ১: intent_*/final_* এখন প্রথম/শেষ LLM call ম্যাপ করে (নতুন
// আর্কিটেকচারে "intent pass" আলাদা কিছু না, তবু ধাপ ০-এর বেসলাইনের সাথে
// latency/model তুলনা চালিয়ে যেতে এই ম্যাপিং রাখা হয়েছে)। নতুন কলাম:
// orchestration_mode ('native_tools' — ALTER TABLE-এর DEFAULT-এ পুরনো
// রো-গুলো '2pass_regex' থেকে যাবে, তাই before/after আলাদা করা যাবে),
// llm_call_count (এই turn-এ মোট round-trip), tools_called
// (comma-separated, একাধিক হতে পারে), any_used_fallback, hit_loop_limit।
const logChatQuality = (q) => {
    query(
        `INSERT INTO ai_chat_quality_logs
            (tenant_id, customer_id, person_id, source, orchestration_mode,
             tool_selected, tool_had_error, ended_in_sr_referral,
             intent_model_requested, intent_model_used, intent_used_fallback,
             final_model_requested, final_model_used, final_used_fallback,
             intent_latency_ms, final_latency_ms, total_latency_ms,
             llm_call_count, tools_called, any_used_fallback, hit_loop_limit,
             request_failed, failure_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
            q.tenant_id, q.customer_id, q.person_id, q.source, q.orchestration_mode,
            q.tool_selected, q.tool_had_error, q.ended_in_sr_referral,
            q.intent_model_requested, q.intent_model_used, q.intent_used_fallback,
            q.final_model_requested, q.final_model_used, q.final_used_fallback,
            q.intent_latency_ms, q.final_latency_ms, q.total_latency_ms,
            q.llm_call_count, q.tools_called, q.any_used_fallback, q.hit_loop_limit,
            q.request_failed, q.failure_reason,
        ]
    ).catch(err => logger.warn('⚠️ ai_chat_quality_logs insert ব্যর্থ (non-critical):', err.message));
};

// ── Constants ────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 500;
// ✅ ধাপ ১ (মেমরি): MAX_HISTORY_TURNS/MAX_HISTORY_CONTENT সরানো হলো —
// client-truncated history আর ব্যবহার হয় না (aiChatMemory.service.js-এর
// MAX_HISTORY_MESSAGES এখন এই দায়িত্ব নেয়)

const customerAiChat = async (req, res) => {
    // ✅ NEW (ধাপ ০): পুরো request-জুড়ে quality metrics জমা করে শেষে
    // একবারই (success বা error, দুই path-এই) logChatQuality() দিয়ে flush করব
    const requestStartedAt = Date.now();
    const quality = {
        tenant_id: req.tenantId || null,
        customer_id: null,
        person_id: null,
        source: 'customer_chat',
        orchestration_mode: 'native_tools', // ✅ ধাপ ১
        tool_selected: null,   // ✅ ধাপ ১: এখন প্রথম tool-এর নাম না, সব tool-এর comma-separated তালিকা (নিচে tools_called-ও দেখো — একই মান, ঐতিহাসিক কলাম নাম রাখা হয়েছে continuity-র জন্য)
        tool_had_error: false,
        ended_in_sr_referral: false,
        intent_model_requested: null,
        intent_model_used: null,
        intent_used_fallback: false,
        final_model_requested: null,
        final_model_used: null,
        final_used_fallback: false,
        intent_latency_ms: null,
        final_latency_ms: null,
        total_latency_ms: null,
        llm_call_count: null,      // ✅ ধাপ ১
        tools_called: null,        // ✅ ধাপ ১
        any_used_fallback: false,  // ✅ ধাপ ১
        hit_loop_limit: false,     // ✅ ধাপ ১
        request_failed: false,
        failure_reason: null,
    };

    try {
        const { message, new_thread } = req.body; // ✅ ধাপ ১ (মেমরি): client history আর ব্যবহার হয় না, server-side thread থেকে আসে

        // ── Validation ────────────────────────────────────────
        if (!message?.trim()) {
            return res.status(400).json({ success: false, message: 'বার্তা দিন।' });
        }

        if (message.trim().length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({
                success:     false,
                message:     `বার্তা সর্বোচ্চ ${MAX_MESSAGE_LENGTH} অক্ষরের মধ্যে রাখুন।`,
                error_code:  'MESSAGE_TOO_LONG',
                max_length:  MAX_MESSAGE_LENGTH,
                sent_length: message.trim().length,
            });
        }

        // ⚠️ SECURITY: customerId সবসময় JWT থেকে
        const customerId = req.portalUser.customer_id;
        quality.customer_id = customerId; // ✅ NEW (ধাপ ০)

        const customerResult = await query(
            `SELECT shop_name, owner_name, customer_code FROM customers WHERE id = $1
             AND tenant_id = $2`,
            [customerId, req.tenantId]
        );
        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer তথ্য পাওয়া যায়নি।' });
        }

        const customerInfo = customerResult.rows[0];

        // ✅ NEW (Session 20): personId + কানেক্টেড কোম্পানি তালিকা —
        // multi-company aggregate tool executor ও system prompt দুটোতেই লাগবে
        let personId;
        let companies = [];
        try {
            personId  = await getPersonId(customerId);
            companies = await getConnectedCompanies(personId);
            quality.person_id = personId; // ✅ NEW (ধাপ ০)
        } catch (err) {
            if (err.message === 'PERSON_NOT_LINKED') {
                return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
            }
            throw err;
        }

        const systemPrompt = buildSystemPrompt(customerInfo, companies);

        // ── ✅ ধাপ ১ (মেমরি): client-truncated history (৬ turn/৩০০ char)
        // বাদ — এখন server-side thread থেকে history আসে, তাই refresh বা
        // অন্য ডিভাইসে গেলেও context হারায় না। new_thread:true (request
        // body) দিলে জোর করে নতুন থ্রেড শুরু হয় — এই ডেলিভারিতে frontend
        // এখনো এই flag পাঠায় না (নিচের README-তে কারণ), তাই মূলত
        // idle-timeout (৬ ঘণ্টা)-ই rotation নিয়ন্ত্রণ করে।
        const { threadId } = await getOrCreateThreadId(customerId, !!new_thread);
        const chatHistory  = await getThreadHistory(customerId, threadId);

        // ── ✅ ধাপ ১: ২-pass (intent detection prompt + regex parse +
        // final answer prompt) সম্পূর্ণ বাদ — এখন একটাই agentic loop।
        // Native tool-calling দিয়ে model নিজে ঠিক করে কোন tool(s) লাগবে,
        // প্রয়োজনে একাধিক tool একসাথে চাইতে পারে ("বাকি আর কেনাকাটা
        // দুটোই দেখাও" এখন এক turn-এই সম্ভব, আগে সম্ভব ছিল না)।
        const agentic = await runAgenticChat({
            personId,
            message: message.trim(),
            chatHistory,
            systemPrompt,
            tenantId: req.tenantId,
        });

        // ✅ ধাপ ১: agentic.callLog থেকে quality মেট্রিক্স — প্রথম call
        // → intent_* (ধাপ ০-এর বেসলাইনের সাথে latency/model তুলনা চালিয়ে
        // যেতে), শেষ call (যেটা text দিলো, বা loop-limit ছুঁলে শেষটাই)
        // → final_*। tool_selected/tools_called এখন একাধিক নাম ধরতে পারে।
        const toolNames = agentic.callLog.flatMap(c => c.toolNames);
        quality.llm_call_count       = agentic.callLog.length;
        quality.tool_selected        = toolNames.length ? toolNames.join(',') : null;
        quality.tools_called         = quality.tool_selected;
        quality.any_used_fallback    = agentic.callLog.some(c => c.usedFallback);
        quality.hit_loop_limit       = agentic.hitLoopLimit;
        quality.tool_had_error       = agentic.anyToolError;
        quality.ended_in_sr_referral = agentic.anyToolError;

        const firstCall = agentic.callLog[0];
        const lastCall  = agentic.callLog[agentic.callLog.length - 1];
        if (firstCall) {
            quality.intent_model_requested = firstCall.requestedModel;
            quality.intent_model_used      = firstCall.model;
            quality.intent_used_fallback   = firstCall.usedFallback;
            quality.intent_latency_ms      = firstCall.latencyMs;
        }
        if (lastCall) {
            quality.final_model_requested = lastCall.requestedModel;
            quality.final_model_used      = lastCall.model;
            quality.final_used_fallback   = lastCall.usedFallback;
            quality.final_latency_ms      = lastCall.latencyMs;
        }

        const reply = agentic.text;
        await saveToLog(customerId, message.trim(), reply);

        // ✅ ধাপ ১ (মেমরি): এই turn-টা থ্রেডে সেভ — non-blocking (fire-and-forget),
        // ai_chat_quality_logs-এর same প্যাটার্ন। ব্যর্থ হলেও customer-এর
        // reply আটকাবে না, শুধু পরের মেসেজে এই turn-টা context-এ থাকবে না।
        appendMessages(req.tenantId, customerId, threadId, [
            { role: 'user', content: message.trim() },
            { role: 'assistant', content: reply },
        ]);

        // ✅ NEW (ধাপ ০): সফল হলে এখানেই flush — non-blocking, response দেরি করবে না
        quality.total_latency_ms = Date.now() - requestStartedAt;
        logChatQuality(quality);

        // ── Token Info (aiTokenBucket middleware থেকে) ───────
        // req.aiTokens না থাকলে (middleware bypass হলে) gracefully handle
        const tokenInfo = req.aiTokens || null;

        return res.status(200).json({
            success: true,
            data: {
                reply,
                tool_used: toolNames, // ✅ ধাপ ১: আগে string|null ছিল, এখন array (একাধিক tool হতে পারে)
                // কাস্টমারকে দেখাতে পারবেন: "আপনার ১৬টি টোকেন বাকি"
                ...(tokenInfo && {
                    tokens_remaining:  tokenInfo.remaining,
                    tokens_max:        tokenInfo.max,
                    cost_this_request: tokenInfo.cost,
                    refill_in_seconds: tokenInfo.refill_in_seconds,
                }),
            },
        });

    } catch (error) {
        // ✅ NEW (ধাপ ০): ব্যর্থ request-ও বেসলাইনে গোনা দরকার, নাহলে fallback/error-rate
        // আসলের চেয়ে কম দেখাবে (শুধু সফল কথোপকথনগুলো count হলে)
        quality.total_latency_ms = Date.now() - requestStartedAt;
        quality.request_failed   = true;

        if (error instanceof AIAccessBlockedError) {
            quality.failure_reason = error.code || 'access_blocked'; // ✅ NEW
            logChatQuality(quality); // ✅ NEW
            logger.warn('⚠️ Customer AI Chat blocked:', error.message);
            return res.status(403).json({ success: false, message: error.message, error_code: error.code });
        }
        logger.error('❌ Customer AI Chat Error:', error.message);
        const status = error.response?.status;
        quality.failure_reason = status === 429 ? 'rate_limited' : 'provider_error'; // ✅ NEW
        logChatQuality(quality); // ✅ NEW
        const msg = status === 429 ? 'একটু পরে আবার চেষ্টা করুন।' : 'AI চ্যাটে সমস্যা হয়েছে।';
        return res.status(500).json({ success: false, message: msg });
    }
};

// ── Chat History (অপরিবর্তিত) ────────────────────────────────
const getCustomerChatHistory = async (req, res) => {
    try {
        const customerId = req.portalUser.customer_id;
        const limit = Math.min(50, parseInt(req.query.limit) || 20);

        const snapshot = await getDB()
            .ref(`aiChatLogs/${customerId}`)
            .orderByKey()
            .limitToLast(limit)
            .once('value');

        const data = snapshot.val();

        if (!data) {
            return res.status(200).json({ success: true, data: [] });
        }

        const history = Object.entries(data)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([ts, entry]) => ({
                message: entry.message,
                reply:   entry.reply,
                time:    new Date(Number(ts)).toLocaleString('bn-BD', {
                    timeZone: 'Asia/Dhaka',
                    day:      '2-digit',
                    month:    'short',
                    hour:     '2-digit',
                    minute:   '2-digit',
                }),
            }));

        return res.status(200).json({ success: true, data: history });

    } catch (error) {
        logger.error('❌ Chat History Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ✅ ধাপ ১ (স্ট্রিমিং — ১ম অংশ): SSE streaming endpoint
//
// সম্পূর্ণ additive — বিদ্যমান customerAiChat() ফাংশন/এন্ডপয়েন্ট
// অপরিবর্তিত (zero risk of regression)। নতুন route
// (POST /portal/ai-chat/stream) হিসেবে যোগ হবে, একই aiTokenBucket
// middleware পুনর্ব্যবহার করে।
//
// ⚠️ এখনো frontend consumption নেই এই ডেলিভারিতে — ইচ্ছাকৃতভাবে।
// এই sandbox-এ browser/DOM নেই বলে fetch+ReadableStream consumption
// কোড কখনো verify করতে পারব না, তাই সেটা আলাদা, পরের ডেলিভারি যেখানে
// অতিরিক্ত সতর্কতা ও manual QA-র কথা স্পষ্ট করে বলা হবে। এই ডেলিভারিতে
// backend স্ট্রিমিং infrastructure — যেটা mock দিয়ে ভালোভাবে verify
// করা সম্ভব হয়েছে (নিচের README দেখো)।
// ============================================================
const customerAiChatStream = async (req, res) => {
    const requestStartedAt = Date.now();
    const quality = {
        tenant_id: req.tenantId || null,
        customer_id: null,
        person_id: null,
        source: 'customer_chat_stream',
        orchestration_mode: 'native_tools_streaming',
        tool_selected: null,
        tool_had_error: false,
        ended_in_sr_referral: false,
        intent_model_requested: null,
        intent_model_used: null,
        intent_used_fallback: false,
        final_model_requested: null,
        final_model_used: null,
        final_used_fallback: false,
        intent_latency_ms: null,
        final_latency_ms: null,
        total_latency_ms: null,
        llm_call_count: null,
        tools_called: null,
        any_used_fallback: false,
        hit_loop_limit: false,
        request_failed: false,
        failure_reason: null,
    };

    try {
        const { message, new_thread } = req.body; // ✅ ধাপ ১ (মেমরি): client history আর ব্যবহার হয় না

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: 'বার্তা দিন।' });
        }
        if (message.trim().length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({
                success:     false,
                message:     `বার্তা সর্বোচ্চ ${MAX_MESSAGE_LENGTH} অক্ষরের মধ্যে রাখুন।`,
                error_code:  'MESSAGE_TOO_LONG',
                max_length:  MAX_MESSAGE_LENGTH,
                sent_length: message.trim().length,
            });
        }

        const customerId = req.portalUser.customer_id;
        quality.customer_id = customerId;

        const customerResult = await query(
            `SELECT shop_name, owner_name, customer_code FROM customers WHERE id = $1 AND tenant_id = $2`,
            [customerId, req.tenantId]
        );
        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer তথ্য পাওয়া যায়নি।' });
        }
        const customerInfo = customerResult.rows[0];

        let personId;
        let companies = [];
        try {
            personId  = await getPersonId(customerId);
            companies = await getConnectedCompanies(personId);
            quality.person_id = personId;
        } catch (err) {
            if (err.message === 'PERSON_NOT_LINKED') {
                return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি। সাপোর্টে যোগাযোগ করুন।' });
            }
            throw err;
        }

        const systemPrompt = buildSystemPrompt(customerInfo, companies);

        // ✅ ধাপ ১ (মেমরি): non-streaming controller-এর ঠিক same প্যাটার্ন
        const { threadId } = await getOrCreateThreadId(customerId, !!new_thread);
        const chatHistory  = await getThreadHistory(customerId, threadId);

        // ── এখান থেকে SSE — এর আগে যেকোনো ভ্যালিডেশন/এরর normal JSON-এই থাকে ──
        res.writeHead(200, {
            'Content-Type':  'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection':    'keep-alive',
            'X-Accel-Buffering': 'no', // nginx buffering বন্ধ — না হলে আসল streaming হবে না
        });
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        // req.aiTokens না থাকলে (middleware bypass হলে) gracefully handle — non-streaming controller-এর same প্যাটার্ন
        const tokenInfo = req.aiTokens || null;

        let fullText = '';
        const onTextChunk = (delta) => {
            fullText += delta;
            res.write(`data: ${JSON.stringify({ type: 'chunk', text: delta })}\n\n`);
        };

        const agentic = await runAgenticChatStream({
            personId, message: message.trim(), chatHistory, systemPrompt,
            tenantId: req.tenantId, onTextChunk,
        });

        // quality mapping — non-streaming controller-এর ঠিক same প্যাটার্ন
        const toolNames = agentic.callLog.flatMap(c => c.toolNames);
        quality.llm_call_count       = agentic.callLog.length;
        quality.tool_selected        = toolNames.length ? toolNames.join(',') : null;
        quality.tools_called         = quality.tool_selected;
        quality.any_used_fallback    = agentic.callLog.some(c => c.usedFallback);
        quality.hit_loop_limit       = agentic.hitLoopLimit;
        quality.tool_had_error       = agentic.anyToolError;
        quality.ended_in_sr_referral = agentic.anyToolError;

        const firstCall = agentic.callLog[0];
        const lastCall  = agentic.callLog[agentic.callLog.length - 1];
        if (firstCall) {
            quality.intent_model_requested = firstCall.requestedModel;
            quality.intent_model_used      = firstCall.model;
            quality.intent_used_fallback   = firstCall.usedFallback;
            quality.intent_latency_ms      = firstCall.latencyMs;
        }
        if (lastCall) {
            quality.final_model_requested = lastCall.requestedModel;
            quality.final_model_used      = lastCall.model;
            quality.final_used_fallback   = lastCall.usedFallback;
            quality.final_latency_ms      = lastCall.latencyMs;
        }

        await saveToLog(customerId, message.trim(), agentic.text || fullText);

        // ✅ ধাপ ১ (মেমরি): non-streaming controller-এর ঠিক same প্যাটার্ন
        appendMessages(req.tenantId, customerId, threadId, [
            { role: 'user', content: message.trim() },
            { role: 'assistant', content: agentic.text || fullText },
        ]);

        quality.total_latency_ms = Date.now() - requestStartedAt;
        logChatQuality(quality);

        // ✅ ফিক্স (frontend wiring করতে গিয়ে ধরা পড়েছে): non-streaming controller
        // token info রেসপন্সে পাঠায় (UI-র token indicator এটা দেখায়), কিন্তু এখানে
        // req.aiTokens (aiTokenBucket middleware আগে থেকেই সেট করে রাখে) ব্যবহারই
        // হচ্ছিল না — done ইভেন্টে এখন যোগ হলো
        res.write(`data: ${JSON.stringify({
            type: 'done',
            tool_used: toolNames,
            ...(tokenInfo && {
                tokens_remaining:  tokenInfo.remaining,
                tokens_max:        tokenInfo.max,
                cost_this_request: tokenInfo.cost,
                refill_in_seconds: tokenInfo.refill_in_seconds,
            }),
        })}\n\n`);
        return res.end();

    } catch (error) {
        quality.total_latency_ms = Date.now() - requestStartedAt;
        quality.request_failed   = true;

        if (res.headersSent) {
            // ⚠️ স্ট্রিম ইতিমধ্যে শুরু হয়ে গেছে — res.status().json() আর কাজ
            // করবে না, SSE ইভেন্ট হিসেবেই error জানিয়ে সংযোগ বন্ধ করতে হবে
            quality.failure_reason = error instanceof AIAccessBlockedError
                ? (error.code || 'access_blocked')
                : (error.response?.status === 429 ? 'rate_limited' : 'provider_error');
            logChatQuality(quality);
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।' })}\n\n`);
            } catch { /* সংযোগ হয়তো আগেই বন্ধ হয়ে গেছে, আর কিছু করার নেই */ }
            return res.end();
        }

        if (error instanceof AIAccessBlockedError) {
            quality.failure_reason = error.code || 'access_blocked';
            logChatQuality(quality);
            logger.warn('⚠️ Customer AI Chat Stream blocked:', error.message);
            return res.status(403).json({ success: false, message: error.message, error_code: error.code });
        }
        logger.error('❌ Customer AI Chat Stream Error:', error.message);
        const status = error.response?.status;
        quality.failure_reason = status === 429 ? 'rate_limited' : 'provider_error';
        logChatQuality(quality);
        const msg = status === 429 ? 'একটু পরে আবার চেষ্টা করুন।' : 'AI চ্যাটে সমস্যা হয়েছে।';
        return res.status(500).json({ success: false, message: msg });
    }
};

module.exports = { customerAiChat, customerAiChatStream, getCustomerChatHistory };
