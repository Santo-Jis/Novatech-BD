const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// নির্দিষ্ট মাসিক খরচ → expenses টেবিলে নিজে জমা
//
// প্রতিটি সক্রিয় টেমপ্লেটের জন্য start_date-এর মাস থেকে চলতি মাস পর্যন্ত
// প্রতি মাসের day_of_month তারিখে একটা expenses row বানায় (শুধু আজ বা আগের
// তারিখ)। unique index (recurring_expense_id, date) আর ON CONFLICT DO NOTHING
// থাকায় যতবার চলুক, একই মাসের খরচ দুবার ঢুকবে না। সার্ভার কয়েক দিন বন্ধ
// থাকলেও পরের রানে ছেড়ে যাওয়া মাসগুলো পূরণ হয়ে যায়।
// ============================================================

const pad = (n) => String(n).padStart(2, '0');

// আজকের তারিখ ঢাকার সময়ে (YYYY-MM-DD)
const todayBD = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

const toYmd = (v) => (v instanceof Date
    ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
    : String(v).slice(0, 10));

// start..today-এর মধ্যে যে যে তারিখে খরচ হওয়ার কথা তার তালিকা
const dueDates = ({ start_date, end_date, day_of_month }, today) => {
    const start = toYmd(start_date);
    const end   = end_date ? toYmd(end_date) : null;
    let y = parseInt(start.slice(0, 4), 10);
    let m = parseInt(start.slice(5, 7), 10);
    const out = [];

    // সর্বোচ্চ ৬০ মাস — ভুল start_date দিলে অসীম লুপ/অতিরিক্ত row ঠেকাতে
    for (let i = 0; i < 60; i++) {
        const d = `${y}-${pad(m)}-${pad(day_of_month)}`;
        if (d > today) break;
        if (end && d > end) break;
        if (d >= start) out.push(d);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
};

const generateRecurringExpenses = async ({ tenantId = null } = {}) => {
    const params = [];
    let where = 'is_active = true';
    if (tenantId) { params.push(tenantId); where += ` AND tenant_id = $${params.length}`; }

    const templates = await query(`SELECT * FROM recurring_expenses WHERE ${where}`, params);
    const today = todayBD();
    let created = 0;

    for (const t of templates.rows) {
        if (!t.created_by) continue; // expenses.user_id দরকার (P&L-এ users-এর সাথে JOIN)
        for (const date of dueDates(t, today)) {
            const r = await query(
                `INSERT INTO expenses
                    (user_id, expense_type, amount, date, note, created_by, tenant_id, source,
                     category_id, payment_method, paid_to, recurring_expense_id)
                 VALUES ($1,$2,$3,$4,$5,$1,$6,'recurring',$7,$8,$9,$10)
                 ON CONFLICT (recurring_expense_id, date) WHERE recurring_expense_id IS NOT NULL
                 DO NOTHING`,
                [t.created_by, t.expense_type, t.amount, date, t.note, t.tenant_id,
                 t.category_id, t.payment_method, t.paid_to, t.id]
            );
            created += r.rowCount;
        }
    }
    return created;
};

// ── অগ্রিম খরচ: মোট টাকা N মাসে সমান ভাগ, প্রতি মাসের ১ তারিখে একটা কিস্তি ──
// ভাগ না মিললে (যেমন ১০০০০ ÷ ৩) শেষ কিস্তিতে অবশিষ্ট যোগ হয়, যাতে মোট ঠিক থাকে।
const addMonths = (ymd, n) => {
    let y = parseInt(ymd.slice(0, 4), 10);
    let m = parseInt(ymd.slice(5, 7), 10) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return `${y}-${pad(m + 1)}-01`;
};

const installments = ({ total_amount, months, start_month }) => {
    const totalCents = Math.round(parseFloat(total_amount) * 100);
    const base = Math.floor(totalCents / months);
    const first = toYmd(start_month).slice(0, 8) + '01';
    return Array.from({ length: months }, (_, i) => ({
        date: addMonths(first, i),
        amount: (i === months - 1 ? totalCents - base * (months - 1) : base) / 100,
    }));
};

const generatePrepaidExpenses = async ({ tenantId = null } = {}) => {
    const params = [];
    let where = 'TRUE';
    if (tenantId) { params.push(tenantId); where += ` AND tenant_id = $${params.length}`; }

    const templates = await query(`SELECT * FROM prepaid_expenses WHERE ${where}`, params);
    const today = todayBD();
    let created = 0;

    for (const t of templates.rows) {
        if (!t.created_by) continue;
        const total = t.months;
        for (const [i, inst] of installments(t).entries()) {
            if (inst.date > today) break;
            const r = await query(
                `INSERT INTO expenses
                    (user_id, expense_type, amount, date, note, created_by, tenant_id, source,
                     category_id, payment_method, paid_to, receipt_url, prepaid_expense_id)
                 VALUES ($1,$2,$3,$4,$5,$1,$6,'prepaid',$7,$8,$9,$10,$11)
                 ON CONFLICT (prepaid_expense_id, date) WHERE prepaid_expense_id IS NOT NULL
                 DO NOTHING`,
                [t.created_by, t.expense_type, inst.amount, inst.date,
                 [t.note, `অগ্রিম খরচের কিস্তি ${i + 1}/${total}`].filter(Boolean).join(' | '),
                 t.tenant_id, t.category_id, t.payment_method, t.paid_to, t.receipt_url, t.id]
            );
            created += r.rowCount;
        }
    }
    return created;
};

const generateScheduledExpenses = async (opts = {}) =>
    (await generateRecurringExpenses(opts)) + (await generatePrepaidExpenses(opts));

module.exports = {
    generateRecurringExpenses, generatePrepaidExpenses, generateScheduledExpenses,
    dueDates, installments, todayBD,
};
