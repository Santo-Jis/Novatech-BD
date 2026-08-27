/**
 * aiStreaming.test.js
 * ─────────────────────────────────────────────────────────────
 * ধাপ ১ (স্ট্রিমিং — ১ম অংশ) — ai.service.js-এর streamAI/streamOpenAIFormat
 * আর customerAiChat.service.js-এর runAgenticChatStream।
 *
 * সম্পূর্ণ কভারেজ (adversarial chunk-boundary splitting সহ) আগে
 * /home/claude/verify2/run_verification_streaming.js-এ dependency-free
 * harness দিয়ে verify করা হয়েছিল (jest sandbox-এ ইনস্টল করা যায়নি)।
 * এখানে সেই core কেসগুলো Jest কনভেনশনে।
 * ─────────────────────────────────────────────────────────────
 */

const { EventEmitter } = require('events');

let streamQueue = [];
let axiosCalls = [];

const makeFakeStream = (chunks) => {
    const emitter = new EventEmitter();
    setImmediate(async () => {
        for (const c of chunks) {
            emitter.emit('data', Buffer.from(c, 'utf8'));
            await new Promise(r => setImmediate(r));
        }
        emitter.emit('end');
    });
    return emitter;
};

jest.mock('axios', () => ({
    post: jest.fn(async (url, body) => {
        axiosCalls.push({ url, body });
        const next = streamQueue.shift();
        if (!next) throw new Error('TEST SETUP: no fake stream queued');
        if (next.__throw) {
            const err = new Error('FAKE_ERROR');
            err.response = { status: next.status };
            throw err;
        }
        return { data: makeFakeStream(next.chunks) };
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
jest.mock('../services/aiPricing.service', () => ({ calculateChargePaisa: jest.fn(async () => ({ chargePaisa: 0 })) }));
jest.mock('../services/wallet.service', () => ({ deduct: jest.fn(async () => true) }));
jest.mock('../services/price.utils', () => ({ calcFinalPrice: (p) => ({ finalPrice: Number(p) || 0 }) }));

const { streamAI } = require('../services/ai.service');
const { runAgenticChatStream, CUSTOMER_TOOLS } = require('../services/customerAiChat.service');

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const SSE_DONE = 'data: [DONE]\n\n';

beforeEach(() => {
    streamQueue = [];
    axiosCalls = [];
    jest.clearAllMocks();
});

test('text স্ট্রিম — chunk-বাই-chunk forward হয়, পুরো টেক্সট সঠিকভাবে জোড়া লাগে', async () => {
    const full =
        sse({ choices: [{ delta: { content: 'হ্যালো' } }] }) +
        sse({ choices: [{ delta: { content: ', বাকি ৫০০০ টাকা।' } }] }) +
        sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }) +
        SSE_DONE;
    streamQueue = [{ chunks: [full] }];

    const received = [];
    const result = await streamAI([{ role: 'user', content: 'বাকি কত?' }], 'sys', null, { source: 'test' }, (d) => received.push(d));

    expect(result.type).toBe('text');
    expect(received.join('')).toBe('হ্যালো, বাকি ৫০০০ টাকা।');
});

test('SSE ইভেন্ট মাঝপথে কেটে একাধিক network chunk-এ এলেও সঠিকভাবে reconstruct হয়', async () => {
    const full =
        sse({ choices: [{ delta: { content: 'আপনার বাকি ৫০০০ টাকা।' } }] }) +
        sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }) +
        SSE_DONE;
    const cut = Math.floor(full.length * 0.4);
    streamQueue = [{ chunks: [full.slice(0, cut), full.slice(cut)] }];

    const received = [];
    const result = await streamAI([{ role: 'user', content: 'test' }], 'sys', null, { source: 'test' }, (d) => received.push(d));

    expect(received.join('')).toBe('আপনার বাকি ৫০০০ টাকা।');
});

test('tool_calls mode — customer-কে কখনো raw JSON forward হয় না', async () => {
    const full =
        sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_my_credit_status', arguments: '' } }] } }] }) +
        sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] }) +
        sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }) +
        SSE_DONE;
    streamQueue = [{ chunks: [full] }];

    const received = [];
    const result = await streamAI([{ role: 'user', content: 'বাকি কত?' }], 'sys', CUSTOMER_TOOLS, { source: 'test' }, (d) => received.push(d));

    expect(received.length).toBe(0);
    expect(result.type).toBe('tool_calls');
    expect(result.toolCalls[0].name).toBe('get_my_credit_status');
});

test('পূর্ণ orchestration — tool round স্ট্রিম হয় না, শুধু চূড়ান্ত text round স্ট্রিম হয়', async () => {
    streamQueue = [
        { chunks: [
            sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'get_my_credit_status', arguments: '' } }] } }] }) +
            sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] }) +
            sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }) +
            SSE_DONE,
        ] },
        { chunks: [
            sse({ choices: [{ delta: { content: 'আপনার বাকি ৫০০০ টাকা।' } }] }) +
            sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 } }) +
            SSE_DONE,
        ] },
    ];

    const received = [];
    const agentic = await runAgenticChatStream({
        personId: 'p1', message: 'বাকি কত?', chatHistory: [], systemPrompt: 'sys', tenantId: 't1',
        onTextChunk: (d) => received.push(d),
    });

    expect(agentic.callLog.length).toBe(2);
    expect(received.join('')).toBe('আপনার বাকি ৫০০০ টাকা।');
});

test('৪২৯ status হলে streaming-এও fallback chain কাজ করে', async () => {
    streamQueue = [
        { __throw: true, status: 429 },
        { chunks: [
            sse({ choices: [{ delta: { content: 'fallback থেকে উত্তর' } }] }) +
            sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }) +
            SSE_DONE,
        ] },
    ];

    const received = [];
    const result = await streamAI([{ role: 'user', content: 'test' }], 'sys', null, { source: 'test' }, (d) => received.push(d));

    expect(result.usedFallback).toBe(true);
    expect(received.join('')).toBe('fallback থেকে উত্তর');
});
