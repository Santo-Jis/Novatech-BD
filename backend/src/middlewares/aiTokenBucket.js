// ============================================================
// AI Token Bucket Middleware
// File: backend/src/middlewares/aiTokenBucket.js
//
// কিভাবে কাজ করে:
//   • প্রতি customer পায় MAX_TOKENS টোকেন (hourly budget)
//   • প্রতি AI request খরচ করে COST_PER_REQUEST টোকেন
//   • টোকেন ধীরে ধীরে refill হয় (REFILL_RATE_MS প্রতি ১ টোকেন)
//
// ✅ ধাপ ১ (in-process Map → Redis): config/redis.js-এর
// getRedisClient() reuse করা হয়েছে — portalCache.service.js যেভাবে
// ব্যবহার করে ঠিক সেই একই প্যাটার্নে (prefix + JSON get/set + EX)।
// নতুন কোনো Redis connection বানানো হয়নি। REDIS_URL না থাকলে
// getRedisClient() নিজে থেকেই in-memory fallback দেয় (config/redis.js-এর
// নিজস্ব ব্যবস্থা) — dev/staging-এ Redis ছাড়াই আগের মতো single-instance
// আচরণ বহাল থাকে, কোনো এক্সট্রা কোড ছাড়াই।
//
// Trade-off (ইচ্ছাকৃত): bucket state plain get/set দিয়ে read-modify-write
// হয় (atomic Lua/INCR না) — config/redis.js-এর memoryFallback ইন্টারফেস
// (get/set/del) অপরিবর্তিত রাখতে, শেয়ার্ড ফাইল না ছুঁয়ে। একই customer
// থেকে সত্যিকারের millisecond-level concurrent রিকোয়েস্ট এলে সামান্য
// race সম্ভব — কিন্তু chat UI-তে বাস্তবে এটা ঘটার সম্ভাবনা নগণ্য, আর
// worst-case মানে বড়জোর ১টা বাড়তি request পাস হওয়া। security-critical
// resource না বলে এই ট্রেড-অফ গ্রহণযোগ্য।
//
// Fail-open: Redis/fallback দুটোই ব্যর্থ হলে rate-limit স্কিপ করে
// request pass করে দেওয়া হয় (isUserBlocked()-এ যেভাবে "Redis down হলে
// safe default: block করা হয় না" — একই established fail-safe দিক)।
// ============================================================

const logger = require('../config/logger');
const { getRedisClient } = require('../config/redis');

const MAX_TOKENS       = 20;             // hourly budget (প্রতি ঘণ্টায় সর্বোচ্চ ২০টি request)
const COST_PER_REQUEST = 4;              // প্রতি AI call-এ কত টোকেন খরচ
const REFILL_RATE_MS   = 3 * 60 * 1000;  // প্রতি ৩ মিনিটে ১ টোকেন refill
const MAX_BURST        = MAX_TOKENS;     // burst ceiling

const BUCKET_KEY_PREFIX = 'ai_tokenbucket:';
const BUCKET_TTL_SEC    = 60 * 60; // ১ ঘণ্টা inactive → key নিজে থেকেই expire (আগের setInterval cleanup-এর বদলে Redis TTL)

/**
 * getBucket(client, customerId) → { tokens, lastRefill }
 * না থাকলে (নতুন customer) বা corrupt হলে full bucket দিয়ে শুরু
 */
const getBucket = async (client, customerId) => {
    const raw = await client.get(`${BUCKET_KEY_PREFIX}${customerId}`);
    if (!raw) return { tokens: MAX_TOKENS, lastRefill: Date.now() };
    try {
        return JSON.parse(raw);
    } catch {
        return { tokens: MAX_TOKENS, lastRefill: Date.now() };
    }
};

const saveBucket = async (client, customerId, bucket) => {
    await client.set(
        `${BUCKET_KEY_PREFIX}${customerId}`,
        JSON.stringify(bucket),
        { EX: BUCKET_TTL_SEC }
    );
};

/**
 * refill(bucket) → updated bucket with new tokens (লজিক অপরিবর্তিত)
 * শেষবার refill-এর পর কত সময় গেছে সেই হিসেবে টোকেন যোগ করো
 */
const refill = (bucket) => {
    const now     = Date.now();
    const elapsed = now - bucket.lastRefill;
    const gained  = Math.floor(elapsed / REFILL_RATE_MS);

    if (gained > 0) {
        bucket.tokens     = Math.min(MAX_BURST, bucket.tokens + gained);
        bucket.lastRefill = now;
    }

    return bucket;
};

/**
 * aiTokenBucket middleware
 * portalAuth-এর পরে ব্যবহার করুন (req.portalUser থাকতে হবে)
 *
 * ✅ ধাপ ১: এখন async (Redis I/O)। ভেতরের সব await try/catch-এর মধ্যে,
 * তাই unhandled rejection-এর ঝুঁকি নেই — প্রতিটা পথ শেষে হয় next()
 * নয়তো res.status().json() কল হয়।
 */
const aiTokenBucket = async (req, res, next) => {
    const customerId = req.portalUser?.customer_id;
    if (!customerId) {
        return res.status(401).json({ success: false, message: 'অননুমোদিত অ্যাক্সেস।' });
    }

    try {
        const client = await getRedisClient();
        const bucket = refill(await getBucket(client, customerId));

        // পরবর্তী refill কতক্ষণ পরে
        const msUntilNext   = REFILL_RATE_MS - ((Date.now() - bucket.lastRefill) % REFILL_RATE_MS);
        const secsUntilNext = Math.ceil(msUntilNext / 1000);

        if (bucket.tokens < COST_PER_REQUEST) {
            // refill হওয়া state-টা save করি যদিও reject করছি — তা না হলে
            // পরপর reject হতে থাকা রিকোয়েস্টে storage-এ স্টেট বহুক্ষণ stale
            // দেখাবে (গণনা সঠিক থাকে তবু, শুধু ops/debug-এর সুবিধার জন্য)
            await saveBucket(client, customerId, bucket);
            return res.status(429).json({
                success:           false,
                message:           `টোকেন শেষ! ${secsUntilNext} সেকেন্ড পরে আবার চেষ্টা করুন।`,
                error_code:        'TOKEN_EXHAUSTED',
                tokens_remaining:  bucket.tokens,
                refill_in_seconds: secsUntilNext,
                cost_per_request:  COST_PER_REQUEST,
            });
        }

        // টোকেন কাটো
        bucket.tokens -= COST_PER_REQUEST;
        await saveBucket(client, customerId, bucket);

        // পরের handler-এ token info পাঠাও (controller response-এ দেখাতে পারবে)
        req.aiTokens = {
            remaining:         bucket.tokens,
            cost:              COST_PER_REQUEST,
            max:               MAX_TOKENS,
            refill_in_seconds: secsUntilNext,
        };

        next();
    } catch (err) {
        // Fail-open: Redis সাময়িক down হলেও পুরো AI চ্যাট ফিচার বন্ধ করে
        // দেওয়ার চেয়ে rate-limit সাময়িক স্কিপ করা ভালো।
        logger.error('❌ aiTokenBucket Redis error (fail-open, request pass করা হলো):', err.message);
        next();
    }
};

module.exports = { aiTokenBucket, MAX_TOKENS, COST_PER_REQUEST, REFILL_RATE_MS };
