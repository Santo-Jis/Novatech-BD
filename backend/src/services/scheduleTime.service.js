// backend/src/services/scheduleTime.service.js
// ============================================================
// Scheduled/Recurring Notification-এর জন্য "পরবর্তী কখন চলবে" হিসাব।
// বাংলাদেশে DST নেই (creditReminder.job.js-এও একই ধারণা ব্যবহার হয়েছে),
// তাই Asia/Dhaka = সবসময় UTC+6 ধরে সরল offset math ব্যবহার করা হলো —
// আলাদা কোনো timezone লাইব্রেরি লাগছে না।
// ============================================================

const DHAKA_OFFSET_HOURS = 6;

/**
 * once — নির্দিষ্ট একটা তারিখ+সময়ে একবার চলবে
 * @param {{date: string, hour: number, minute: number}} meta  date = 'YYYY-MM-DD' (Dhaka local)
 */
const computeOnce = ({ date, hour, minute }) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hour - DHAKA_OFFSET_HOURS, minute, 0, 0));
};

/** daily — প্রতিদিন নির্দিষ্ট সময়ে */
const computeNextDaily = ({ hour, minute }, from = new Date()) => {
    const run = new Date(Date.UTC(
        from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
        hour - DHAKA_OFFSET_HOURS, minute, 0, 0
    ));
    if (run <= from) run.setUTCDate(run.getUTCDate() + 1);
    return run;
};

/** weekly — সপ্তাহের নির্দিষ্ট দিনে (day_of_week: 0=রবি ... 6=শনি, Dhaka local) */
const computeNextWeekly = ({ day_of_week, hour, minute }, from = new Date()) => {
    const dhakaNow = new Date(from.getTime() + DHAKA_OFFSET_HOURS * 3600 * 1000);
    const diff = (day_of_week - dhakaNow.getUTCDay() + 7) % 7;
    const run = new Date(Date.UTC(
        from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + diff,
        hour - DHAKA_OFFSET_HOURS, minute, 0, 0
    ));
    if (run <= from) run.setUTCDate(run.getUTCDate() + 7);
    return run;
};

/** monthly — মাসের নির্দিষ্ট তারিখে (day_of_month: 1-31, Dhaka local) */
const computeNextMonthly = ({ day_of_month, hour, minute }, from = new Date()) => {
    const dhakaNow = new Date(from.getTime() + DHAKA_OFFSET_HOURS * 3600 * 1000);
    let year  = dhakaNow.getUTCFullYear();
    let month = dhakaNow.getUTCMonth();

    let run = new Date(Date.UTC(year, month, day_of_month, hour - DHAKA_OFFSET_HOURS, minute, 0, 0));
    if (run <= from) {
        month += 1;
        run = new Date(Date.UTC(year, month, day_of_month, hour - DHAKA_OFFSET_HOURS, minute, 0, 0));
    }
    return run;
};

/**
 * কোনো schedule row থেকে পরবর্তী next_run_at বের করা।
 * recurrence_type === 'once' হলে null রিটার্ন করে (মানে আর চলবে না — schedule deactivate হবে)
 */
const computeNextRun = (recurrence_type, recurrence_meta, from = new Date()) => {
    switch (recurrence_type) {
        case 'daily':   return computeNextDaily(recurrence_meta, from);
        case 'weekly':  return computeNextWeekly(recurrence_meta, from);
        case 'monthly': return computeNextMonthly(recurrence_meta, from);
        case 'once':
        default:        return null;
    }
};

module.exports = { computeOnce, computeNextRun };
