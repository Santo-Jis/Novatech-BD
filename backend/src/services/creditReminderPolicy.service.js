// backend/src/services/creditReminderPolicy.service.js
// ============================================================
// স্মার্ট বাকি-রিমাইন্ডার নীতি (pure functions — DB/নেটওয়ার্ক ছোঁয় না, তাই টেস্ট করা সহজ)
//
// ধারণা: প্রতিদিন সবাইকে নয় — শুধু তাদের, যাদের বাকি যথেষ্ট পুরনো, যথেষ্ট বড়, সম্প্রতি
// পেমেন্ট করেননি, snooze করেননি, এবং শেষ রিমাইন্ডারের পর যথেষ্ট সময় গেছে।
// "বাকির বয়স" = সবচেয়ে পুরনো অপরিশোধিত ইনভয়েস (credit_used − allocations > 0)-এর বয়স।
// ধাপ = এই চক্রে (শেষ পেমেন্টের পর) কয়টা রিমাইন্ডার গেছে + ১। পেমেন্ট করলে চক্র রিসেট।
// ============================================================

const num = (v, d) => {
    const n = parseFloat(process.env[v]);
    return Number.isFinite(n) ? n : d;
};

const DEFAULT_CONFIG = {
    minAmount:           num('CREDIT_REMINDER_MIN_AMOUNT', 500),   // এর নিচে বাকি হলে পাঠানো হবে না (৳)
    graceDays:           num('CREDIT_REMINDER_GRACE_DAYS', 7),     // ইনভয়েসের বয়স এর কম হলে পাঠানো হবে না
    paymentCooldownDays: num('CREDIT_REMINDER_PAYMENT_COOLDOWN_DAYS', 3),
    // রিমাইন্ডার #n-এর পর #n+1 পাঠাতে কত দিন অপেক্ষা
    gapsAfterStage:      { 1: 7, 2: 7, 3: 14, 4: 14 },
    maxCustomerStage:    3,   // ধাপ ১–৩ কাস্টমারকে; ৪–৫ শুধু SR/Manager-কে
    maxStage:            5,   // এরপর পেমেন্ট না আসা পর্যন্ত স্বয়ংক্রিয় কিছু নয়
    sendHourFrom:        10,  // ঢাকার সময়, [from, to)
    sendHourTo:          19,
    skipWeekdays:        [5], // ০=রবি … ৫=শুক্র
};

/**
 * আজ এই কাস্টমারকে রিমাইন্ডার পাঠানো হবে কিনা।
 * @param {object} i
 * @param {number} i.amountDue              ইনভয়েস-ভিত্তিক মোট বাকি
 * @param {number} i.oldestDueDays          সবচেয়ে পুরনো অপরিশোধিত ইনভয়েসের বয়স (দিন)
 * @param {number|null} i.daysSinceLastPayment
 * @param {number} i.remindersInCycle       শেষ পেমেন্টের পর পাঠানো রিমাইন্ডার সংখ্যা
 * @param {number|null} i.daysSinceLastReminder
 * @param {Date|string|null} i.snoozedUntil
 * @param {Date} [i.now]
 * @returns {{send:boolean, stage?:number, audience?:'customer'|'staff', reason:string}}
 */
const decideReminder = (i, cfg = DEFAULT_CONFIG) => {
    const now = i.now || new Date();

    if (!(i.amountDue >= cfg.minAmount)) return { send: false, reason: 'below_min_amount' };

    if (i.snoozedUntil) {
        const until = new Date(i.snoozedUntil);
        // snooze-এর তারিখ পর্যন্ত (ওই দিনসহ) বন্ধ
        until.setHours(23, 59, 59, 999);
        if (until > now) return { send: false, reason: 'snoozed' };
    }

    if (!(i.oldestDueDays >= cfg.graceDays)) return { send: false, reason: 'in_grace_period' };

    if (i.daysSinceLastPayment != null && i.daysSinceLastPayment < cfg.paymentCooldownDays) {
        return { send: false, reason: 'recent_payment' };
    }

    const stage = (i.remindersInCycle || 0) + 1;
    if (stage > cfg.maxStage) return { send: false, reason: 'max_stage_reached' };

    if (stage > 1) {
        const gap = cfg.gapsAfterStage[stage - 1] ?? 14;
        if (i.daysSinceLastReminder != null && i.daysSinceLastReminder < gap) {
            return { send: false, reason: 'too_soon' };
        }
    }

    return {
        send: true,
        stage,
        audience: stage <= cfg.maxCustomerStage ? 'customer' : 'staff',
        reason: 'due',
    };
};

/**
 * ধাপ অনুযায়ী চ্যানেল পরিকল্পনা।
 *   mode 'first' = তালিকার ক্রমে প্রথমটা সফল হলেই থামো (বাকিগুলো fallback)
 *   mode 'all'   = সবগুলোতে পাঠাও
 * in-app সবসময় অতিরিক্ত (বিনামূল্যে, বিরক্তিকর নয়)।
 */
const channelPlan = (stage) => {
    if (stage === 1) return { mode: 'first', order: ['whatsapp', 'email'], inApp: false };
    if (stage === 2) return { mode: 'first', order: ['whatsapp', 'email'], inApp: true };
    if (stage === 3) return { mode: 'all',   order: ['whatsapp', 'email'], inApp: true };
    return { mode: 'none', order: [], inApp: false };
};

/** এখন কি পাঠানোর উপযুক্ত সময়? (ঢাকার সময়, ছুটির দিন বাদ) */
const isSendWindow = (now = new Date(), cfg = DEFAULT_CONFIG) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka', hour: 'numeric', hour12: false, weekday: 'short',
    }).formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour').value, 10) % 24;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        .indexOf(parts.find(p => p.type === 'weekday').value);
    return hour >= cfg.sendHourFrom && hour < cfg.sendHourTo && !cfg.skipWeekdays.includes(wd);
};

module.exports = { DEFAULT_CONFIG, decideReminder, channelPlan, isSendWindow };
