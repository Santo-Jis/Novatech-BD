// ============================================================
// AI Token Bucket Middleware
// File: backend/src/middlewares/aiTokenBucket.js
//
// কিভাবে কাজ করে:
//   • প্রতি customer পায় MAX_TOKENS টোকেন (hourly budget)
//   • প্রতি AI request খরচ করে COST_PER_REQUEST টোকেন
//   • টোকেন ধীরে ধীরে refill হয় (REFILL_RATE_MS প্রতি ১ টোকেন)
//   • Redis নেই → in-process Map (Render single-instance-এ যথেষ্ট)
//
// Trade-off:
//   Server restart হলে token count reset হয় — acceptable।
//   Multi-instance deploy হলে Redis-এ migrate করতে হবে।
// ============================================================

const MAX_TOKENS         = 20;           // hourly budget (প্রতি ঘণ্টায় সর্বোচ্চ ২০টি request)
const COST_PER_REQUEST   = 4;            // প্রতি AI call-এ কত টোকেন খরচ
const REFILL_RATE_MS     = 3 * 60 * 1000; // প্রতি ৩ মিনিটে ১ টোকেন refill
const MAX_BURST          = MAX_TOKENS;   // burst ceiling

// in-process store: customerId → { tokens, lastRefill }
const tokenStore = new Map();

// ── Cleanup: ১ ঘণ্টা inactive থাকলে entry মুছো (memory leak রোধ)
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, bucket] of tokenStore) {
        if (bucket.lastRefill < cutoff) tokenStore.delete(id);
    }
}, 15 * 60 * 1000); // ১৫ মিনিট পর পর চেক

/**
 * getBucket(customerId) → { tokens, lastRefill }
 * নতুন customer হলে full bucket দিয়ে শুরু
 */
const getBucket = (customerId) => {
    if (!tokenStore.has(customerId)) {
        tokenStore.set(customerId, {
            tokens:     MAX_TOKENS,
            lastRefill: Date.now(),
        });
    }
    return tokenStore.get(customerId);
};

/**
 * refill(bucket) → updated bucket with new tokens
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
 */
const aiTokenBucket = (req, res, next) => {
    const customerId = req.portalUser?.customer_id;
    if (!customerId) {
        return res.status(401).json({ success: false, message: 'অননুমোদিত অ্যাক্সেস।' });
    }

    const bucket = refill(getBucket(customerId));

    // পরবর্তী refill কতক্ষণ পরে
    const msUntilNext    = REFILL_RATE_MS - ((Date.now() - bucket.lastRefill) % REFILL_RATE_MS);
    const secsUntilNext  = Math.ceil(msUntilNext / 1000);

    if (bucket.tokens < COST_PER_REQUEST) {
        return res.status(429).json({
            success:         false,
            message:         `টোকেন শেষ! ${secsUntilNext} সেকেন্ড পরে আবার চেষ্টা করুন।`,
            error_code:      'TOKEN_EXHAUSTED',
            tokens_remaining: bucket.tokens,
            refill_in_seconds: secsUntilNext,
            cost_per_request:  COST_PER_REQUEST,
        });
    }

    // টোকেন কাটো
    bucket.tokens -= COST_PER_REQUEST;

    // পরের handler-এ token info পাঠাও (controller response-এ দেখাতে পারবে)
    req.aiTokens = {
        remaining:         bucket.tokens,
        cost:              COST_PER_REQUEST,
        max:               MAX_TOKENS,
        refill_in_seconds: secsUntilNext,
    };

    next();
};

module.exports = { aiTokenBucket, MAX_TOKENS, COST_PER_REQUEST, REFILL_RATE_MS };
