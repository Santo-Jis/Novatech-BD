/**
 * aiToolCalling.test.js
 * ─────────────────────────────────────────────────────────────
 * ধাপ ১ — Native tool-calling (ai.service.js + customerAiChat.service.js)
 *
 * এই টেস্টগুলো আগে /home/claude/verify2/run_verification.js-এ
 * dependency-free harness হিসেবে চালিয়ে verify করা হয়েছিল (jest এই
 * sandbox-এ ইনস্টল করা যায়নি — নিচে দেখুন)। এখানে সেই একই যুক্তি
 * তোমাদের Jest + jest.mock() কনভেনশনে (auth.blocklist.test.js-এর
 * প্যাটার্ন অনুসরণ করে) আনা হয়েছে, যাতে CI-তে স্থায়ীভাবে থাকে।
 *
 * সম্পূর্ণ কভারেজ (১০+৭ কেস) manual harness-এ ছিল; এখানে সবচেয়ে
 * গুরুত্বপূর্ণ কেসগুলো রাখা হয়েছে — backward compatibility, মূল
 * motivating example (multi-tool call), আর ধাপ ০-এর fallback লজিক
 * অক্ষত থাকা।
 * ─────────────────────────────────────────────────────────────
 */

let axiosResponses = [];
let axiosCalls = [];
let testProvider = 'openrouter';

jest.mock('axios', () => ({
    post: jest.fn(async (url, body) => {
        axiosCalls.push({ url, body });
        const next = axiosResponses.shift();
        if (!next) throw new Error('TEST SETUP: no fake response queued');
        if (next.__throw) {
            const err = new Error('FAKE_ERROR');
            err.response = { status: next.status };
            throw err;
        }
        return { data: next };
    }),
}));

jest.mock('../config/logger', () => ({ info() {}, warn() {}, error() {} }));
jest.mock('../config/encryption', () => ({ decrypt: (x) => x }));

jest.mock('../config/db', () => ({
    query: jest.fn(async (sql) => {
        if (sql.includes('FROM ai_config')) {
            return { rows: [
                { config_key: 'daily_model', config_value: 'meta-llama/llama-3.3-70b-instruct:free' },
                { config_key: 'max_tokens', config_value: '1000' },
            ] };
        }
        return { rows: [] };
    }),
}));

jest.mock('../services/tenantAI.service', () => {
    class AIAccessBlockedError extends Error {
        constructor(message, code) { super(message); this.code = code; }
    }
    return {
        resolveAIAccess: jest.fn(async () => ({
            provider: 'openrouter', apiKey: 'fake-key', keySource: 'platform',
            modelOverride: null, tenantSettings: {},
        })),
        AIAccessBlockedError,
    };
});

jest.mock('../services/aiPricing.service', () => ({
    calculateChargePaisa: jest.fn(async () => ({ chargePaisa: 0 })),
}));
jest.mock('../services/wallet.service', () => ({ deduct: jest.fn(async () => true) }));
jest.mock('../services/price.utils', () => ({ calcFinalPrice: (p) => ({ finalPrice: Number(p) || 0 }) }));

const { callAI } = require('../services/ai.service');
const { runAgenticChat, CUSTOMER_TOOLS } = require('../services/customerAiChat.service');

beforeEach(() => {
    axiosResponses = [];
    axiosCalls = [];
    jest.clearAllMocks();
});

test('tools ছাড়া callAI — backward compatible, body-তে tools key যায় না', async () => {
    axiosResponses.push({
        choices: [{ message: { content: 'সাধারণ উত্তর' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await callAI('প্রশ্ন', 'daily', 'sys', [], { source: 'test' });

    expect(result.type).toBe('text');
    expect(result.text).toBe('সাধারণ উত্তর');
    expect('tools' in axiosCalls[0].body).toBe(false);
});

test('tools দিলে schema সঠিকভাবে যায় এবং tool_calls response parse হয়', async () => {
    axiosResponses.push({
        choices: [{ message: { content: null, tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'get_my_credit_status', arguments: '{}' } },
        ] } }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
    });

    const result = await callAI(null, 'daily', 'sys', [], {
        source: 'test', tools: CUSTOMER_TOOLS,
        rawMessages: [{ role: 'user', content: 'বাকি কত?' }],
    });

    expect(axiosCalls[0].body.tools.length).toBe(CUSTOMER_TOOLS.length);
    expect(result.type).toBe('tool_calls');
    expect(result.toolCalls[0].name).toBe('get_my_credit_status');
});

test('একসাথে একাধিক tool call — সব execute হয়ে ফলাফল থ্রেড হয়ে ফাইনাল answer আসে', async () => {
    axiosResponses.push({
        choices: [{ message: { content: null, tool_calls: [
            { id: 'call_a', type: 'function', function: { name: 'get_my_credit_status', arguments: '{}' } },
            { id: 'call_b', type: 'function', function: { name: 'get_my_recent_purchases', arguments: '{"limit":5}' } },
        ] } }],
        usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
    });
    axiosResponses.push({
        choices: [{ message: { content: 'আপনার বাকি ও কেনাকাটার তথ্য...' } }],
        usage: { prompt_tokens: 60, completion_tokens: 20, total_tokens: 80 },
    });

    const agentic = await runAgenticChat({
        personId: 'p1', message: 'বাকি আর কেনাকাটা দুটোই দেখাও',
        chatHistory: [], systemPrompt: 'sys', tenantId: 't1',
    });

    expect(agentic.callLog.length).toBe(2);
    expect(agentic.callLog[0].toolNames.sort()).toEqual(
        ['get_my_credit_status', 'get_my_recent_purchases'].sort()
    );
    const toolMsgs = axiosCalls[1].body.messages.filter(m => m.role === 'tool');
    expect(toolMsgs.length).toBe(2);
});

test('MAX_TOOL_LOOPS ছুঁলে crash না করে গ্রেসফুল fallback দেয়', async () => {
    for (let i = 0; i < 5; i++) {
        axiosResponses.push({
            choices: [{ message: { content: null, tool_calls: [
                { id: `l${i}`, type: 'function', function: { name: 'get_my_credit_status', arguments: '{}' } },
            ] } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
    }

    const agentic = await runAgenticChat({
        personId: 'p1', message: 'test', chatHistory: [], systemPrompt: 'sys', tenantId: 't1',
    });

    expect(agentic.hitLoopLimit).toBe(true);
    expect(agentic.callLog.length).toBe(3);
    expect(agentic.text.length).toBeGreaterThan(0);
});

test('৪২৯ status হলে ধাপ ০-এর fallback chain এখনো ঠিকভাবে কাজ করে', async () => {
    axiosResponses.push({ __throw: true, status: 429 });
    axiosResponses.push({
        choices: [{ message: { content: 'fallback থেকে উত্তর' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await callAI('test', 'daily', null, [], { source: 'test' });

    expect(result.usedFallback).toBe(true);
    expect(result.text).toBe('fallback থেকে উত্তর');
});
