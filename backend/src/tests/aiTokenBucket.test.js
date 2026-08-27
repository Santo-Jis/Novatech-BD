/**
 * aiTokenBucket.test.js
 * ─────────────────────────────────────────────────────────────
 * AI Token Bucket Middleware — Redis-backed (ধাপ ১) টেস্ট
 *
 * কভারেজ:
 *   1. req.portalUser না থাকলে → 401
 *   2. নতুন customer → full bucket, request pass হয়, token কাটে
 *   3. টোকেন COST_PER_REQUEST-এর কম থাকলে → 429 TOKEN_EXHAUSTED
 *   4. যথেষ্ট সময় গেলে refill হয়ে আগে-ব্লকড customer আবার pass করে
 *   5. Redis/fallback ব্যর্থ হলে → fail-open (customer block হয় না)
 * ─────────────────────────────────────────────────────────────
 */

jest.mock('../config/redis', () => ({
    getRedisClient: jest.fn(),
}));

const { getRedisClient } = require('../config/redis');
const {
    aiTokenBucket,
    MAX_TOKENS,
    COST_PER_REQUEST,
    REFILL_RATE_MS,
} = require('../middlewares/aiTokenBucket');

// ── Helper: fake Redis client — get/set শুধু (memoryFallback-এর মতোই ইন্টারফেস) ──
const makeFakeClient = (initialStore = {}) => {
    const store = { ...initialStore };
    return {
        get: jest.fn(async (key) => (key in store ? store[key] : null)),
        set: jest.fn(async (key, value) => { store[key] = value; return 'OK'; }),
        _store: store,
    };
};

const makeReq = (customerId) => ({
    portalUser: customerId ? { customer_id: customerId } : null,
});

const makeRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json   = jest.fn(() => res);
    return res;
};

beforeEach(() => {
    jest.clearAllMocks();
});

test('req.portalUser না থাকলে 401 রিটার্ন করে, next() কল হয় না', async () => {
    const req  = makeReq(null);
    const res  = makeRes();
    const next = jest.fn();

    await aiTokenBucket(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
});

test('নতুন customer পুরো bucket দিয়ে শুরু করে, request pass হয়, টোকেন কাটে', async () => {
    const client = makeFakeClient(); // খালি store = নতুন customer
    getRedisClient.mockResolvedValue(client);

    const req  = makeReq('cust-1');
    const res  = makeRes();
    const next = jest.fn();

    await aiTokenBucket(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.aiTokens.remaining).toBe(MAX_TOKENS - COST_PER_REQUEST);
    expect(req.aiTokens.max).toBe(MAX_TOKENS);
    expect(client.set).toHaveBeenCalledTimes(1); // updated bucket সেভ হয়েছে
});

test('টোকেন COST_PER_REQUEST-এর কম থাকলে 429 TOKEN_EXHAUSTED দেয়', async () => {
    // এখনই lastRefill (কোনো নতুন refill হওয়ার কথা না), টোকেন খুবই কম
    const bucket = { tokens: COST_PER_REQUEST - 1, lastRefill: Date.now() };
    const client = makeFakeClient({ 'ai_tokenbucket:cust-2': JSON.stringify(bucket) });
    getRedisClient.mockResolvedValue(client);

    const req  = makeReq('cust-2');
    const res  = makeRes();
    const next = jest.fn();

    await aiTokenBucket(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.error_code).toBe('TOKEN_EXHAUSTED');
    expect(body.tokens_remaining).toBe(COST_PER_REQUEST - 1);
});

test('যথেষ্ট সময় (৪ পিরিয়ড) গেলে refill হয়ে খালি bucket-ও আবার pass করে', async () => {
    // ০ টোকেন, কিন্তু lastRefill অনেক আগে — এতটা সময় গেছে যে ঠিক
    // COST_PER_REQUEST-এর সমান টোকেন ফিরে আসার কথা
    const longAgo = Date.now() - COST_PER_REQUEST * REFILL_RATE_MS;
    const bucket  = { tokens: 0, lastRefill: longAgo };
    const client  = makeFakeClient({ 'ai_tokenbucket:cust-3': JSON.stringify(bucket) });
    getRedisClient.mockResolvedValue(client);

    const req  = makeReq('cust-3');
    const res  = makeRes();
    const next = jest.fn();

    await aiTokenBucket(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.aiTokens.remaining).toBe(0); // 0 + 4 refill − 4 cost = 0
});

test('Redis/fallback ব্যর্থ হলে fail-open হয় — customer block হয় না', async () => {
    getRedisClient.mockRejectedValue(new Error('ECONNREFUSED'));

    const req  = makeReq('cust-4');
    const res  = makeRes();
    const next = jest.fn();

    await aiTokenBucket(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.aiTokens).toBeUndefined(); // fail-open পথে token info সেট হয় না, শুধু pass
});
