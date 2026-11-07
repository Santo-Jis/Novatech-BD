/**
 * recruitmentFormConfig.js
 *
 * SR নিয়োগ আবেদন ফর্মের Admin-সম্পাদনযোগ্য লেখা ও সেটিংস (Level 1)।
 *
 * - প্রতিটি tenant-এর config `system_settings` টেবিলে একটি JSON key-তে থাকে
 *   (key = RECRUITMENT_CONFIG_KEY)।
 * - কিছু সেভ না থাকলে DEFAULT_CONFIG ব্যবহার হয় — যা আগের hardcoded ফর্মের
 *   হুবহু লেখা, ফলে আগের আচরণ বদলায় না।
 * - Admin-এর পাঠানো ডেটা sanitizeConfig() দিয়ে যাচাই হয়: অজানা key বাদ,
 *   দৈর্ঘ্যের সীমা, কেবল plain text (HTML ট্যাগ ফেলে দেওয়া হয়)।
 *
 * ⚠ ফ্রন্টএন্ডেও frontend/src/pages/recruitmentFormDefaults.js-এ একই DEFAULT আছে
 *   (API ব্যর্থ হলে ফর্ম যেন তবুও কাজ করে)। এখানে বদলালে ওখানেও বদলান।
 */

const RECRUITMENT_CONFIG_KEY = 'recruitment_form_config';

const LIMITS = {
    short:        80,    // শিরোনাম, লেবেল
    medium:       200,   // এক লাইনের বার্তা
    long:         1200,  // ঘোষণাপত্র, বড় বার্তা
    termsMax:     8,     // সর্বোচ্চ শর্তের সংখ্যা
    termsText:    300,
    termsIcon:    8,
};

const DEFAULT_CONFIG = Object.freeze({
    version: 1,

    // আবেদন নেওয়া চলছে কিনা
    accepting: true,
    closed_message: 'এই মুহূর্তে নতুন আবেদন নেওয়া হচ্ছে না। পরে আবার চেষ্টা করুন।',

    // WhatsApp OTP যাচাই বাধ্যতামূলক কিনা
    require_otp: true,

    header: {
        subtitle:     'SR নিয়োগ আবেদন ফর্ম',
        status_badge: 'নিয়োগ চলছে',
    },

    job: {
        show_banner: true,
        title:       'Sales Representative (SR)',
        company:     '',                 // ফাঁকা = কোম্পানির নাম স্বয়ংক্রিয়
        work_area:   'বরিশাল',
        salary:      'আলোচনা সাপেক্ষে',
    },

    address_note: {
        enabled: true,
        text:    'কর্মএলাকা: বরিশাল সদর ও আশেপাশের জেলায় কাজ করতে আগ্রহী প্রার্থীরা অগ্রাধিকার পাবেন।',
    },

    terms: {
        enabled: true,
        title:   'চাকরির শর্তাবলী সারসংক্ষেপ',
        items: [
            { icon: '📅', text: 'প্রথম ৭ কর্মদিবস প্রশিক্ষণ পর্যায় — দৈনিক কমিশন ও TA/DA প্রযোজ্য' },
            { icon: '💼', text: 'গ্রেস পিরিয়ড শেষে স্থায়ী নিয়োগ — বেতন আলোচনা সাপেক্ষে নির্ধারিত হবে' },
            { icon: '📈', text: 'দৈনিক বিক্রয়ের উপর আকর্ষণীয় কমিশন সুবিধা' },
            { icon: '🏆', text: 'পারফরম্যান্স অনুযায়ী পদোন্নতি ও বোনাসের সুযোগ' },
        ],
    },

    declaration: {
        title: 'ঘোষণাপত্র',
        text:
            'আমি ঘোষণা করছি যে এই ফর্মে প্রদত্ত সকল তথ্য সঠিক ও পূর্ণাঙ্গ। কোম্পানির সকল নিয়ম ও নীতিমালা ' +
            'মেনে চলতে এবং প্রয়োজনে যেকোনো কর্মএলাকায় দায়িত্ব পালন করতে সম্মত। কোনো তথ্য মিথ্যা ' +
            'প্রমাণিত হলে নিয়োগ তাৎক্ষণিকভাবে বাতিলযোগ্য।',
    },

    success: {
        title:   'আবেদন সফলভাবে জমা হয়েছে!',
        message: 'আপনার আবেদন আমাদের নিয়োগ টিম পর্যালোচনা করবে। শীঘ্রই আপনার সাথে যোগাযোগ করা হবে।',
    },
});

// ── ছোট ইউটিলিটি ─────────────────────────────────────────────
const clone = (o) => JSON.parse(JSON.stringify(o));

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// plain text করা: HTML ট্যাগ ও control character ফেলে দেয়, ট্রিম ও দৈর্ঘ্য সীমা।
// নতুন লাইন রাখা হয় (ঘোষণাপত্র ইত্যাদির জন্য), তবে \r বাদ।
const cleanText = (v, max, { multiline = false } = {}) => {
    if (typeof v !== 'string') return null;
    let s = v.replace(/<[^>]*>/g, '');
    s = multiline
        ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
        : s.replace(/[\u0000-\u001F\u007F]/g, ' ');
    s = s.trim();
    if (s.length > max) s = s.slice(0, max).trim();
    return s;
};

const pickText = (src, key, fallback, max, opts) => {
    if (!isPlainObject(src) || !(key in src)) return fallback;
    const t = cleanText(src[key], max, opts);
    return t === null ? fallback : t;
};

const pickBool = (src, key, fallback) =>
    (isPlainObject(src) && typeof src[key] === 'boolean') ? src[key] : fallback;

// ── মূল ফাংশন ───────────────────────────────────────────────
/**
 * ব্যবহারকারীর ইনপুটকে DEFAULT_CONFIG-এর আকারে আনে।
 * - যে ফিল্ড নেই/ভুল ধরনের → default
 * - শর্ত তালিকা: ফাঁকা text বাদ, সর্বোচ্চ LIMITS.termsMax
 * - আবশ্যিক লেখা (job.title, header.subtitle, declaration.text, success.*) ফাঁকা হলে default
 */
const sanitizeConfig = (input) => {
    const d   = DEFAULT_CONFIG;
    const src = isPlainObject(input) ? input : {};
    const out = clone(d);

    out.accepting      = pickBool(src, 'accepting', d.accepting);
    out.require_otp    = pickBool(src, 'require_otp', d.require_otp);
    out.closed_message = pickText(src, 'closed_message', d.closed_message, LIMITS.medium, { multiline: true }) || d.closed_message;

    const h = src.header;
    out.header.subtitle     = pickText(h, 'subtitle',     d.header.subtitle,     LIMITS.short) || d.header.subtitle;
    out.header.status_badge = pickText(h, 'status_badge', d.header.status_badge, LIMITS.short); // ফাঁকা = ব্যাজ লুকানো

    const j = src.job;
    out.job.show_banner = pickBool(j, 'show_banner', d.job.show_banner);
    out.job.title       = pickText(j, 'title',     d.job.title,     LIMITS.short) || d.job.title;
    out.job.company     = pickText(j, 'company',   d.job.company,   LIMITS.short);
    out.job.work_area   = pickText(j, 'work_area', d.job.work_area, LIMITS.short);
    out.job.salary      = pickText(j, 'salary',    d.job.salary,    LIMITS.short);

    const a = src.address_note;
    out.address_note.enabled = pickBool(a, 'enabled', d.address_note.enabled);
    out.address_note.text    = pickText(a, 'text', d.address_note.text, LIMITS.medium, { multiline: true });
    if (!out.address_note.text) out.address_note.enabled = false;

    const t = src.terms;
    out.terms.enabled = pickBool(t, 'enabled', d.terms.enabled);
    out.terms.title   = pickText(t, 'title', d.terms.title, LIMITS.short) || d.terms.title;
    if (isPlainObject(t) && Array.isArray(t.items)) {
        out.terms.items = t.items
            .filter(isPlainObject)
            .map(it => ({
                icon: cleanText(it.icon, LIMITS.termsIcon) || '•',
                text: cleanText(it.text, LIMITS.termsText) || '',
            }))
            .filter(it => it.text)
            .slice(0, LIMITS.termsMax);
    }
    if (out.terms.items.length === 0) out.terms.enabled = false;

    const dc = src.declaration;
    out.declaration.title = pickText(dc, 'title', d.declaration.title, LIMITS.short) || d.declaration.title;
    out.declaration.text  = pickText(dc, 'text',  d.declaration.text,  LIMITS.long, { multiline: true }) || d.declaration.text;

    const s = src.success;
    out.success.title   = pickText(s, 'title',   d.success.title,   LIMITS.short) || d.success.title;
    out.success.message = pickText(s, 'message', d.success.message, LIMITS.long, { multiline: true }) || d.success.message;

    return out;
};

/**
 * DB-তে সেভ করা মান (JSON string) → পূর্ণ config।
 * ভাঙা/ফাঁকা মান হলে DEFAULT_CONFIG।
 */
const parseStoredConfig = (raw) => {
    if (!raw) return clone(DEFAULT_CONFIG);
    try {
        return sanitizeConfig(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
        return clone(DEFAULT_CONFIG);
    }
};

/** tenant-এর config পড়ে। (query ফাংশন inject করা হয় — টেস্ট সহজ রাখতে) */
const loadTenantConfig = async (query, tenantId) => {
    const r = await query(
        `SELECT value FROM system_settings WHERE tenant_id = $1 AND key = $2 LIMIT 1`,
        [tenantId, RECRUITMENT_CONFIG_KEY]
    );
    return parseStoredConfig(r.rows[0] && r.rows[0].value);
};

/** tenant-এর config সেভ করে (sanitize সহ) এবং সেভ হওয়া config ফেরত দেয়। */
const saveTenantConfig = async (query, tenantId, userId, input) => {
    const clean = sanitizeConfig(input);
    const updated = await query(
        `UPDATE system_settings
            SET value = $1, updated_by = $2, updated_at = NOW()
          WHERE tenant_id = $3 AND key = $4`,
        [JSON.stringify(clean), userId, tenantId, RECRUITMENT_CONFIG_KEY]
    );
    if (updated.rowCount === 0) {
        await query(
            `INSERT INTO system_settings (key, value, updated_by, updated_at, tenant_id)
             VALUES ($1, $2, $3, NOW(), $4)`,
            [RECRUITMENT_CONFIG_KEY, JSON.stringify(clean), userId, tenantId]
        );
    }
    return clean;
};

/** সেভ করা config মুছে default-এ ফেরে। */
const resetTenantConfig = async (query, tenantId) => {
    await query(
        `DELETE FROM system_settings WHERE tenant_id = $1 AND key = $2`,
        [tenantId, RECRUITMENT_CONFIG_KEY]
    );
    return clone(DEFAULT_CONFIG);
};

module.exports = {
    RECRUITMENT_CONFIG_KEY,
    DEFAULT_CONFIG,
    LIMITS,
    sanitizeConfig,
    parseStoredConfig,
    loadTenantConfig,
    saveTenantConfig,
    resetTenantConfig,
};
