// ============================================================
// Environment Variable Validator
// server.js-এর একদম শুরুতে call করতে হবে — dotenv load-এর পরে।
//
// কেন দরকার:
//   - JWT_ACCESS_SECRET না থাকলে jsonwebtoken empty string দিয়ে
//     sign করে — যেকোনো token valid মনে হবে (বিশাল security hole)।
//   - DB_HOST না থাকলে Pool connect করার সময় crash — কিন্তু
//     error message বিভ্রান্তিকর হয়।
//   - Missing env startup-এ ধরা না পড়লে production-এ silent
//     failure বা data corruption হতে পারে।
//
// তিন স্তরে ভাগ করা হয়েছে:
//   REQUIRED  — না থাকলে server উঠবেই না (process.exit)
//   SECRET    — থাকলেও weak হলে warn/exit (min length + placeholder check)
//   OPTIONAL  — না থাকলে শুধু warn, feature কাজ নাও করতে পারে
// ============================================================

// ── রঙিন console output ─────────────────────────────────────
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

// ── Variable definitions ─────────────────────────────────────

// server না উঠলেই ভালো — এগুলো ছাড়া কিছুই কাজ করবে না
const REQUIRED = [
    { key: 'NODE_ENV',    hint: '"development" বা "production" দিন' },
    { key: 'DB_HOST',     hint: 'Supabase host (e.g. db.xxxx.supabase.co)' },
    { key: 'DB_NAME',     hint: 'সাধারণত "postgres"' },
    { key: 'DB_USER',     hint: 'সাধারণত "postgres"' },
    { key: 'DB_PASSWORD', hint: 'Supabase database password' },
];

// secret হওয়া দরকার — placeholder বা খুব ছোট হলে বিপজ্জনক
const SECRETS = [
    {
        key:    'JWT_ACCESS_SECRET',
        minLen: 32,
        hint:   'node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"',
        // empty বা placeholder দিলে JWT সব token accept করবে
        fatal:  true,
    },
    {
        key:    'JWT_REFRESH_SECRET',
        minLen: 32,
        hint:   'node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"',
        fatal:  true,
    },
    {
        key:    'JWT_PORTAL_SECRET',
        minLen: 32,
        hint:   'node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"',
        fatal:  true,
    },
    {
        key:    'ENCRYPTION_KEY',
        minLen: 64,   // 32 bytes hex = 64 chars
        hint:   'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
        fatal:  true,
    },
];

// না থাকলে সেই feature কাজ করবে না — server উঠবে, warn দেবে
const OPTIONAL = [
    { key: 'FIREBASE_SERVICE_ACCOUNT', feature: 'Push Notification / Realtime GPS' },
    { key: 'FIREBASE_DATABASE_URL',    feature: 'Realtime GPS Tracking' },
    { key: 'EMAIL_HOST',               feature: 'Email (OTP / Notification)' },
    { key: 'EMAIL_USER',               feature: 'Email (OTP / Notification)' },
    { key: 'EMAIL_PASS',               feature: 'Email (OTP / Notification)' },
    { key: 'SMS_API_KEY',              feature: 'SMS Notification' },
    { key: 'CLOUDINARY_CLOUD_NAME',    feature: 'Image Upload (Cloudinary)' },
    { key: 'CLOUDINARY_UPLOAD_PRESET', feature: 'Image Upload (Cloudinary)' },
    { key: 'GOOGLE_MAPS_KEY',          feature: 'Google Maps' },
    { key: 'RENDER_EXTERNAL_URL',      feature: 'Keep-Alive Ping (Render)' },
    { key: 'FRONTEND_URL',             feature: 'CORS (default: localhost:3000)' },
    { key: 'CLAUDE_API_KEY',           feature: 'AI Insights (Claude)' },
];

// placeholder যেগুলো .env.example-এ আছে — এগুলো দিয়ে production চালানো নিষিদ্ধ
const PLACEHOLDER_PATTERNS = [
    /^your_/i,
    /^your-/i,
    /\.\.\./,
    /^change.?me$/i,
    /^replace.?me$/i,
    /^example/i,
    /^test.?secret$/i,
    /^xxx/i,
];

const isPlaceholder = (val) =>
    PLACEHOLDER_PATTERNS.some(rx => rx.test(val.trim()));

// ── Main validator ───────────────────────────────────────────

const validateEnv = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    const errors   = [];   // fatal — server উঠবে না
    const warnings = [];   // non-fatal — warn করে চলবে

    // ── ১. REQUIRED চেক ─────────────────────────────────────
    for (const { key, hint } of REQUIRED) {
        const val = process.env[key];
        if (!val || val.trim() === '') {
            errors.push(`${key} সেট নেই।  → ${hint}`);
        } else if (isPlaceholder(val)) {
            errors.push(`${key} এখনো placeholder মান আছে।  → আসল মান বসান।`);
        }
    }

    // ── ২. SECRETS চেক ──────────────────────────────────────
    for (const { key, minLen, hint, fatal } of SECRETS) {
        const val = process.env[key];

        if (!val || val.trim() === '') {
            const msg = `${key} সেট নেই।  → ${hint}`;
            if (fatal) errors.push(msg);
            else warnings.push(msg);
            continue;
        }

        if (isPlaceholder(val)) {
            const msg = `${key} এখনো placeholder মান আছে।  → আসল secret দিন।`;
            if (fatal || isProduction) errors.push(msg);
            else warnings.push(msg);
            continue;
        }

        if (val.trim().length < minLen) {
            const msg = `${key} খুব ছোট (${val.trim().length} char, minimum ${minLen})।  → ${hint}`;
            // production-এ সবসময় fatal; development-এ শুধু warn
            if (isProduction || fatal) errors.push(msg);
            else warnings.push(msg);
        }
    }

    // ── ৩. OPTIONAL চেক (warn only) ─────────────────────────
    for (const { key, feature } of OPTIONAL) {
        const val = process.env[key];
        if (!val || val.trim() === '' || isPlaceholder(val || '')) {
            warnings.push(`${key} নেই  →  "${feature}" কাজ নাও করতে পারে।`);
        }
    }

    // ── ৪. Extra: JWT secret দুটো একই হওয়া উচিত নয় ─────────
    const accessSecret  = process.env.JWT_ACCESS_SECRET  || '';
    const refreshSecret = process.env.JWT_REFRESH_SECRET || '';
    const portalSecret  = process.env.JWT_PORTAL_SECRET  || '';

    if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
        errors.push(
            'JWT_ACCESS_SECRET ও JWT_REFRESH_SECRET একই — আলাদা করুন।\n' +
            '  (একই secret হলে refresh token দিয়ে access token forge করা সম্ভব)'
        );
    }
    if (accessSecret && portalSecret && accessSecret === portalSecret) {
        errors.push(
            'JWT_ACCESS_SECRET ও JWT_PORTAL_SECRET একই — আলাদা করুন।\n' +
            '  (customer portal token দিয়ে employee route access হয়ে যাবে)'
        );
    }

    // ── Output ──────────────────────────────────────────────
    console.log('');
    console.log(`${CYAN}${BOLD}── Environment Validation ──────────────────────────${RESET}`);

    if (warnings.length > 0) {
        console.log(`${YELLOW}⚠️  Warnings (${warnings.length}):${RESET}`);
        warnings.forEach(w => console.log(`${YELLOW}   • ${w}${RESET}`));
    }

    if (errors.length > 0) {
        console.log('');
        console.log(`${RED}${BOLD}❌ Fatal Errors (${errors.length}) — Server বন্ধ হচ্ছে:${RESET}`);
        errors.forEach(e => console.log(`${RED}   ✖ ${e}${RESET}`));
        console.log('');
        console.log(`${RED}${BOLD}   .env ফাইল ঠিক করে আবার চালু করুন।${RESET}`);
        console.log(`${RED}   Template: backend/.env.example${RESET}`);
        console.log('');
        process.exit(1);   // non-zero exit — Render/Docker বুঝবে crash হয়েছে
    }

    const optionalMissing = warnings.filter(w => OPTIONAL.some(o => w.startsWith(o.key)));
    const secretWarnings  = warnings.filter(w => !optionalMissing.includes(w));

    if (errors.length === 0 && secretWarnings.length === 0) {
        console.log(`${GREEN}✅ সব required environment variables সেট আছে।${RESET}`);
    }

    if (optionalMissing.length > 0) {
        console.log(`${YELLOW}   (${optionalMissing.length}টি optional variable নেই — উপরে দেখুন)${RESET}`);
    }

    console.log(`${CYAN}────────────────────────────────────────────────────${RESET}`);
    console.log('');
};

module.exports = { validateEnv };
