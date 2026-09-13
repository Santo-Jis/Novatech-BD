// backend/src/config/sentry.js
// ─────────────────────────────────────────────────────────────
// Sentry error tracking — Phase 0 hygiene item।
//
// ⚠️ গুরুত্বপূর্ণ context: এই কোডবেসে প্রায় প্রতিটা controller নিজেই
// try/catch করে logger.error(...) কল করে, তারপর সরাসরি res.status(500)
// দিয়ে respond করে (দেখুন logger.js-এর টপ কমেন্ট)। মানে error কখনো
// Express-এর next(err) দিয়ে global error handler-এ পৌঁছায় না।
//
// তাই শুধু Sentry-র standard Express middleware (setupExpressErrorHandler)
// বসালে প্রায় কিছুই capture হবে না — সেটা শুধু সেই errors ধরে যেগুলো
// next(err) দিয়ে propagate হয়।
//
// আসল capture point তাই এখানে না — logger.js-এর error() ফাংশনের ভেতরে
// (দেখুন logger.js)। এখানে শুধু init + Express instrumentation, যেটা
// truly-unhandled error/middleware crash-এর জন্য defense-in-depth হিসেবে
// থাকবে।
//
// SENTRY_DSN env var সেট না থাকলে পুরো জিনিসটা silently no-op থাকবে,
// dev/local-এ কোনো account লাগবে না।
// ─────────────────────────────────────────────────────────────

'use strict';

// require defensively — logger.js (প্রায় সবার আগে load হয়) এই ফাইল
// require করে, তাই "npm install" এখনো না করা থাকলেও/package resolve না
// হলেও যেন পুরো server crash না করে বসে, শুধু Sentry off থাকুক।
let Sentry = null;
try {
    Sentry = require('@sentry/node');
} catch (_e) {
    // প্যাকেজ নেই — নিচের সবকিছু no-op হয়ে যাবে
}

let enabled = false;

function initSentry() {
    const dsn = process.env.SENTRY_DSN;

    if (!dsn || !Sentry) {
        // dev/local-এ স্বাভাবিক — DSN না থাকলে বা প্যাকেজ install না হলে চুপচাপ skip
        return false;
    }

    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.RENDER_GIT_COMMIT || undefined, // Render auto-inject করে
        // প্রথমে কম রাখা ভালো — traffic বাড়লে/cost নিয়ে চিন্তা থাকলে কমানো যাবে।
        // পুরোপুরি বন্ধ করতে চাইলে 0 করে দিন।
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    });

    enabled = true;
    return true;
}

function isEnabled() {
    return enabled;
}

module.exports = { Sentry, initSentry, isEnabled };
