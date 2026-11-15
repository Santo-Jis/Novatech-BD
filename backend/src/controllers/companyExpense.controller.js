const multer = require('multer');
const sharp  = require('sharp');
const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');
const { uploadToStorage } = require('../config/firebase');
const { generateRecurringExpenses, generatePrepaidExpenses } = require('../services/recurringExpense.service');

// ============================================================
// কোম্পানির সাধারণ খরচ (ভাড়া, বিদ্যুৎ, ইন্টারনেট ইত্যাদি)
//
// খরচ:
//   GET    /api/expense/company                 — তালিকা + সারাংশ
//   POST   /api/expense/company                 — নতুন খরচ (multipart, ঐচ্ছিক receipt ছবি)
//   PUT    /api/expense/company/:id             — edit (manual/recurring)
//   DELETE /api/expense/company/:id             — delete (manual/recurring)
// ক্যাটাগরি:
//   GET/POST /api/expense/company/categories, PUT/DELETE .../categories/:id
// নির্দিষ্ট মাসিক খরচ:
//   GET/POST /api/expense/company/recurring, PUT/DELETE .../recurring/:id
// ============================================================

const EDITABLE_SOURCES = ['manual', 'recurring', 'prepaid'];
const PAYMENT_METHODS  = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'card', 'cheque', 'other'];

const DEFAULT_CATEGORIES = [
    'অফিস ভাড়া', 'গুদাম ভাড়া', 'বিদ্যুৎ বিল', 'পানি/গ্যাস বিল', 'ইন্টারনেট/ফোন বিল',
    'গাড়ি/জ্বালানি', 'মেরামত ও রক্ষণাবেক্ষণ', 'অফিস সামগ্রী', 'মার্কেটিং/বিজ্ঞাপন',
    'আপ্যায়ন', 'আইনি/ট্যাক্স/লাইসেন্স ফি', 'অন্যান্য',
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
        file.mimetype && file.mimetype.startsWith('image/')
            ? cb(null, true)
            : cb(new Error('রসিদ হিসেবে শুধু ছবি (JPG/PNG) দেওয়া যাবে।')),
});

// multer-এর error (ফাইল বড়/ভুল ধরন) পরিষ্কার বাংলা বার্তায় ফেরত দেয়
const receiptUpload = (req, res, next) => {
    upload.single('receipt')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'রসিদের ছবি ১০MB-এর বেশি হতে পারবে না।' : err.message;
        return res.status(400).json({ success: false, message });
    });
};

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(new Date(v + 'T00:00:00').getTime());
const todayBD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const clean = (v, max) => { const s = v == null ? '' : String(v).trim(); return s ? s.slice(0, max) : null; };

// ── ক্যাটাগরি সহায়ক ──────────────────────────────────────────

// tenant-এর প্রথমবার ব্যবহারে (migration-এর পরে তৈরি নতুন tenant) ডিফল্ট তালিকা বসায়
const ensureCategories = async (tenantId) => {
    const c = await query('SELECT 1 FROM expense_categories WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    if (c.rows.length > 0) return;
    await query(
        `INSERT INTO expense_categories (tenant_id, name, sort_order)
         SELECT $1, n, o FROM unnest($2::text[]) WITH ORDINALITY AS t(n, o)
         ON CONFLICT (tenant_id, name) DO NOTHING`,
        [tenantId, DEFAULT_CATEGORIES]
    );
};

const findCategory = async (tenantId, categoryId, { requireActive = true } = {}) => {
    if (!categoryId) return null;
    const r = await query(
        `SELECT id, name, is_active FROM expense_categories WHERE id = $1 AND tenant_id = $2`,
        [categoryId, tenantId]
    );
    const row = r.rows[0];
    if (!row || (requireActive && !row.is_active)) return null;
    return row;
};

// ── খরচের ইনপুট যাচাই ─────────────────────────────────────────

const validateCommon = (body) => {
    const amount = parseFloat(body.amount);
    const note   = clean(body.note, 500);
    const paid_to = clean(body.paid_to, 150);
    const payment_method = body.payment_method ? String(body.payment_method).trim() : null;

    if (!Number.isFinite(amount) || amount <= 0) return { error: 'সঠিক পরিমাণ দিন (০-এর বেশি)।' };
    if (amount > 100000000)                       return { error: 'পরিমাণ অস্বাভাবিক বেশি।' };
    if (body.note && String(body.note).trim().length > 500) return { error: 'নোট ৫০০ অক্ষরের বেশি হতে পারবে না।' };
    if (payment_method && !PAYMENT_METHODS.includes(payment_method)) return { error: 'পেমেন্ট পদ্ধতি সঠিক নয়।' };
    return { amount, note, paid_to, payment_method };
};

// ক্যাটাগরি ঠিক করে: category_id দিলে সেটার নাম, না দিলে পুরনো ক্লায়েন্টের expense_type
const resolveCategory = async (tenantId, body, existing = null) => {
    if (body.category_id) {
        // edit-এ আগের (বন্ধ করা) ক্যাটাগরি রেখে দেওয়া যাবে
        const keepingOld = existing && existing.category_id === body.category_id;
        const cat = await findCategory(tenantId, body.category_id, { requireActive: !keepingOld });
        if (!cat) return { error: 'ক্যাটাগরি পাওয়া যায়নি বা বন্ধ করা আছে।' };
        return { category_id: cat.id, expense_type: cat.name };
    }
    const expense_type = clean(body.expense_type, 100);
    if (!expense_type) return { error: 'খরচের ধরন দিন।' };
    return { category_id: null, expense_type };
};

const uploadReceipt = async (file, tenantId) => {
    const compressed = await sharp(file.buffer)
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    const path = `expenses/${tenantId}/${Date.now()}_receipt.jpg`;
    return uploadToStorage(compressed, path, 'image/jpeg');
};

// ── খরচ ───────────────────────────────────────────────────────

const listCompanyExpenses = async (req, res) => {
    try {
        const { from, to, expense_type, category_id, payment_method, source, page = 1, limit = 30 } = req.query;
        const today = todayBD();
        const first = today.slice(0, 8) + '01';
        const fromDate = isDate(from) ? from : first;
        const toDate   = isDate(to)   ? to   : today;

        const pageInt  = Math.max(1, parseInt(page) || 1);
        const limitInt = Math.min(100, Math.max(1, parseInt(limit) || 30));

        const params  = [req.tenantId, fromDate, toDate];
        let   filters = 'e.tenant_id = $1 AND e.date BETWEEN $2 AND $3';
        if (expense_type)   { params.push(expense_type);   filters += ` AND e.expense_type = $${params.length}`; }
        if (category_id)    { params.push(category_id);    filters += ` AND e.category_id = $${params.length}`; }
        if (payment_method) { params.push(payment_method); filters += ` AND e.payment_method = $${params.length}`; }
        if (source)         { params.push(source);         filters += ` AND e.source = $${params.length}`; }

        const [rows, totals, byType, bySource] = await Promise.all([
            query(
                `SELECT e.id, e.expense_type, e.category_id, e.amount, e.date, e.note, e.source,
                        e.payment_method, e.paid_to, e.receipt_url, e.recurring_expense_id, e.created_at,
                        cu.name_bn AS created_by_name, wu.name_bn AS worker_name
                   FROM expenses e
                   LEFT JOIN users cu ON cu.id = e.created_by
                   LEFT JOIN users wu ON wu.id = e.user_id
                  WHERE ${filters}
                  ORDER BY e.date DESC, e.id DESC
                  LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limitInt, (pageInt - 1) * limitInt]
            ),
            query(`SELECT COUNT(*) AS total, COALESCE(SUM(e.amount),0) AS total_amount
                     FROM expenses e WHERE ${filters}`, params),
            query(`SELECT e.expense_type, COALESCE(SUM(e.amount),0) AS amount, COUNT(*) AS count
                     FROM expenses e WHERE ${filters}
                    GROUP BY e.expense_type ORDER BY amount DESC`, params),
            query(`SELECT e.source, COALESCE(SUM(e.amount),0) AS amount
                     FROM expenses e WHERE ${filters}
                    GROUP BY e.source`, params),
        ]);

        const total = parseInt(totals.rows[0].total);
        return res.json({
            success: true,
            data: rows.rows,
            summary: {
                total_amount: parseFloat(totals.rows[0].total_amount),
                by_type:   byType.rows.map(r => ({ ...r, amount: parseFloat(r.amount), count: parseInt(r.count) })),
                by_source: bySource.rows.map(r => ({ ...r, amount: parseFloat(r.amount) })),
            },
            pagination: { page: pageInt, limit: limitInt, total, totalPages: Math.ceil(total / limitInt) },
            period: { from: fromDate, to: toDate },
        });
    } catch (error) {
        logger.error('❌ listCompanyExpenses Error:', error.message);
        return res.status(500).json({ success: false, message: 'খরচের তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

const createCompanyExpense = async (req, res) => {
    try {
        const v = validateCommon(req.body);
        if (v.error) return res.status(400).json({ success: false, message: v.error });

        const date = req.body.date;
        if (!isDate(date))        return res.status(400).json({ success: false, message: 'তারিখের ফরম্যাট সঠিক নয়।' });
        if (date > todayBD())     return res.status(400).json({ success: false, message: 'ভবিষ্যতের তারিখে খরচ যোগ করা যাবে না।' });

        const cat = await resolveCategory(req.tenantId, req.body);
        if (cat.error) return res.status(400).json({ success: false, message: cat.error });

        let receipt_url = null;
        if (req.file) {
            try { receipt_url = await uploadReceipt(req.file, req.tenantId); }
            catch (e) { logger.warn('⚠️ খরচের রসিদ আপলোড ব্যর্থ:', e.message); /* খরচ আটকাবো না */ }
        }

        const result = await query(
            `INSERT INTO expenses (user_id, expense_type, amount, date, note, created_by, tenant_id, source,
                                   category_id, payment_method, paid_to, receipt_url)
             VALUES ($1, $2, $3, $4, $5, $1, $6, 'manual', $7, $8, $9, $10)
             RETURNING *`,
            [req.user.id, cat.expense_type, v.amount, date, v.note, req.tenantId,
             cat.category_id, v.payment_method, v.paid_to, receipt_url]
        );
        return res.status(201).json({
            success: true,
            message: req.file && !receipt_url ? 'খরচ যোগ হয়েছে, কিন্তু রসিদের ছবি আপলোড হয়নি।' : 'খরচ যোগ হয়েছে।',
            data: result.rows[0],
        });
    } catch (error) {
        logger.error('❌ createCompanyExpense Error:', error.message);
        return res.status(500).json({ success: false, message: 'খরচ যোগ করতে সমস্যা হয়েছে।' });
    }
};

const updateCompanyExpense = async (req, res) => {
    try {
        const cur = await query(
            `SELECT id, category_id, receipt_url FROM expenses
              WHERE id = $1 AND tenant_id = $2 AND source = ANY($3)`,
            [req.params.id, req.tenantId, EDITABLE_SOURCES]
        );
        if (cur.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'খরচ পাওয়া যায়নি, অথবা এটি স্বয়ংক্রিয়ভাবে এসেছে (SR রিপোর্ট/ব্যাচ রাইট-অফ) — এটি edit করা যাবে না।'
            });
        }

        const v = validateCommon(req.body);
        if (v.error) return res.status(400).json({ success: false, message: v.error });
        const date = req.body.date;
        if (!isDate(date))    return res.status(400).json({ success: false, message: 'তারিখের ফরম্যাট সঠিক নয়।' });
        if (date > todayBD()) return res.status(400).json({ success: false, message: 'ভবিষ্যতের তারিখে খরচ যোগ করা যাবে না।' });

        const cat = await resolveCategory(req.tenantId, req.body, cur.rows[0]);
        if (cat.error) return res.status(400).json({ success: false, message: cat.error });

        let receipt_url = cur.rows[0].receipt_url;
        if (req.file) {
            try { receipt_url = await uploadReceipt(req.file, req.tenantId); }
            catch (e) { logger.warn('⚠️ খরচের রসিদ আপলোড ব্যর্থ:', e.message); }
        } else if (req.body.remove_receipt === 'true' || req.body.remove_receipt === true) {
            receipt_url = null;
        }

        const result = await query(
            `UPDATE expenses
                SET expense_type = $1, category_id = $2, amount = $3, date = $4, note = $5,
                    payment_method = $6, paid_to = $7, receipt_url = $8
              WHERE id = $9 AND tenant_id = $10 AND source = ANY($11)
              RETURNING *`,
            [cat.expense_type, cat.category_id, v.amount, date, v.note,
             v.payment_method, v.paid_to, receipt_url, req.params.id, req.tenantId, EDITABLE_SOURCES]
        );
        return res.json({ success: true, message: 'খরচ আপডেট হয়েছে।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ updateCompanyExpense Error:', error.message);
        return res.status(500).json({ success: false, message: 'খরচ আপডেট করতে সমস্যা হয়েছে।' });
    }
};

const deleteCompanyExpense = async (req, res) => {
    try {
        const result = await query(
            `DELETE FROM expenses
              WHERE id = $1 AND tenant_id = $2 AND source = ANY($3)
              RETURNING id`,
            [req.params.id, req.tenantId, EDITABLE_SOURCES]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'খরচ পাওয়া যায়নি, অথবা এটি স্বয়ংক্রিয়ভাবে এসেছে — মুছা যাবে না।'
            });
        }
        return res.json({ success: true, message: 'খরচ মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ deleteCompanyExpense Error:', error.message);
        return res.status(500).json({ success: false, message: 'খরচ মুছতে সমস্যা হয়েছে।' });
    }
};

// ── ক্যাটাগরি ─────────────────────────────────────────────────

const listCategories = async (req, res) => {
    try {
        await ensureCategories(req.tenantId);
        const r = await query(
            `SELECT c.id, c.name, c.is_active, c.sort_order,
                    (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id)::int AS usage_count
               FROM expense_categories c
              WHERE c.tenant_id = $1
              ORDER BY c.is_active DESC, c.sort_order, c.name`,
            [req.tenantId]
        );
        return res.json({ success: true, data: r.rows });
    } catch (error) {
        logger.error('❌ listCategories Error:', error.message);
        return res.status(500).json({ success: false, message: 'ক্যাটাগরির তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

const createCategory = async (req, res) => {
    try {
        const name = clean(req.body.name, 100);
        if (!name) return res.status(400).json({ success: false, message: 'ক্যাটাগরির নাম দিন।' });
        await ensureCategories(req.tenantId);
        const next = await query(
            'SELECT COALESCE(MAX(sort_order),0) + 1 AS n FROM expense_categories WHERE tenant_id = $1', [req.tenantId]);
        const r = await query(
            `INSERT INTO expense_categories (tenant_id, name, sort_order) VALUES ($1,$2,$3) RETURNING *`,
            [req.tenantId, name, next.rows[0].n]
        );
        return res.status(201).json({ success: true, message: 'ক্যাটাগরি যোগ হয়েছে।', data: r.rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ success: false, message: 'এই নামে ক্যাটাগরি আগেই আছে।' });
        logger.error('❌ createCategory Error:', error.message);
        return res.status(500).json({ success: false, message: 'ক্যাটাগরি যোগ করতে সমস্যা হয়েছে।' });
    }
};

// নাম বদলালে আগের সব খরচ/টেমপ্লেটেও নতুন নাম বসে, যাতে P&L-এ একটাই লাইন থাকে
const updateCategory = async (req, res) => {
    try {
        const name = req.body.name !== undefined ? clean(req.body.name, 100) : undefined;
        if (name === null) return res.status(400).json({ success: false, message: 'ক্যাটাগরির নাম দিন।' });
        const is_active = req.body.is_active === undefined ? undefined : !!req.body.is_active;
        if (name === undefined && is_active === undefined)
            return res.status(400).json({ success: false, message: 'কিছুই বদলানো হয়নি।' });

        const updated = await withTransaction(async (client) => {
            const cq = client.query.bind(client);
            const r = await cq(
                `UPDATE expense_categories
                    SET name = COALESCE($1, name), is_active = COALESCE($2, is_active)
                  WHERE id = $3 AND tenant_id = $4 RETURNING *`,
                [name ?? null, is_active ?? null, req.params.id, req.tenantId]
            );
            if (r.rows.length === 0) return null;
            if (name !== undefined) {
                await cq(`UPDATE expenses SET expense_type = $1 WHERE category_id = $2 AND tenant_id = $3`,
                         [name, req.params.id, req.tenantId]);
                await cq(`UPDATE recurring_expenses SET expense_type = $1 WHERE category_id = $2 AND tenant_id = $3`,
                         [name, req.params.id, req.tenantId]);
            }
            return r.rows[0];
        });
        if (!updated) return res.status(404).json({ success: false, message: 'ক্যাটাগরি পাওয়া যায়নি।' });
        return res.json({ success: true, message: 'ক্যাটাগরি আপডেট হয়েছে।', data: updated });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ success: false, message: 'এই নামে ক্যাটাগরি আগেই আছে।' });
        logger.error('❌ updateCategory Error:', error.message);
        return res.status(500).json({ success: false, message: 'ক্যাটাগরি আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// ব্যবহার হয়ে থাকলে মুছে না ফেলে বন্ধ (is_active=false) করা হয়
const deleteCategory = async (req, res) => {
    try {
        const used = await query(
            `SELECT (SELECT COUNT(*) FROM expenses WHERE category_id = $1 AND tenant_id = $2)
                  + (SELECT COUNT(*) FROM recurring_expenses WHERE category_id = $1 AND tenant_id = $2) AS n`,
            [req.params.id, req.tenantId]
        );
        if (parseInt(used.rows[0].n) > 0) {
            const r = await query(
                `UPDATE expense_categories SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING id`,
                [req.params.id, req.tenantId]
            );
            if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'ক্যাটাগরি পাওয়া যায়নি।' });
            return res.json({ success: true, deactivated: true, message: 'ক্যাটাগরিতে আগের খরচ আছে, তাই মোছা হয়নি — বন্ধ করে রাখা হয়েছে।' });
        }
        const r = await query(
            `DELETE FROM expense_categories WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );
        if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'ক্যাটাগরি পাওয়া যায়নি।' });
        return res.json({ success: true, message: 'ক্যাটাগরি মুছে ফেলা হয়েছে।' });
    } catch (error) {
        logger.error('❌ deleteCategory Error:', error.message);
        return res.status(500).json({ success: false, message: 'ক্যাটাগরি মুছতে সমস্যা হয়েছে।' });
    }
};

// ── নির্দিষ্ট মাসিক খরচ ───────────────────────────────────────

const validateRecurring = async (tenantId, body, existing = null) => {
    const v = validateCommon(body);
    if (v.error) return v;

    const day = parseInt(body.day_of_month, 10);
    if (!Number.isInteger(day) || day < 1 || day > 28)
        return { error: 'মাসের তারিখ ১ থেকে ২৮-এর মধ্যে দিন (২৯-৩১ তারিখ সব মাসে নেই)।' };

    if (!isDate(body.start_date)) return { error: 'শুরুর তারিখের ফরম্যাট সঠিক নয়।' };
    const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    if (!existing && body.start_date < yearAgo.toISOString().slice(0, 10))
        return { error: 'শুরুর তারিখ ১ বছরের বেশি আগের হতে পারবে না।' };

    let end_date = null;
    if (body.end_date) {
        if (!isDate(body.end_date)) return { error: 'শেষ তারিখের ফরম্যাট সঠিক নয়।' };
        if (body.end_date < body.start_date) return { error: 'শেষ তারিখ শুরুর আগে হতে পারে না।' };
        end_date = body.end_date;
    }

    const cat = await resolveCategory(tenantId, body, existing);
    if (cat.error) return cat;

    return { ...v, ...cat, day_of_month: day, start_date: body.start_date, end_date };
};

const listRecurring = async (req, res) => {
    try {
        const r = await query(
            `SELECT r.*,
                    (SELECT MAX(e.date) FROM expenses e WHERE e.recurring_expense_id = r.id) AS last_generated_date
               FROM recurring_expenses r
              WHERE r.tenant_id = $1
              ORDER BY r.is_active DESC, r.day_of_month, r.expense_type`,
            [req.tenantId]
        );
        return res.json({ success: true, data: r.rows });
    } catch (error) {
        logger.error('❌ listRecurring Error:', error.message);
        return res.status(500).json({ success: false, message: 'নিয়মিত খরচের তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

const createRecurring = async (req, res) => {
    try {
        const v = await validateRecurring(req.tenantId, req.body);
        if (v.error) return res.status(400).json({ success: false, message: v.error });

        const r = await query(
            `INSERT INTO recurring_expenses
                (tenant_id, category_id, expense_type, amount, day_of_month, start_date, end_date,
                 payment_method, paid_to, note, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [req.tenantId, v.category_id, v.expense_type, v.amount, v.day_of_month, v.start_date, v.end_date,
             v.payment_method, v.paid_to, v.note, req.user.id]
        );
        // শুরুর তারিখ আজ বা আগের হলে সাথে সাথেই জমা হোক, রাতের job-এর অপেক্ষা না করে
        const generated = await generateRecurringExpenses({ tenantId: req.tenantId });
        return res.status(201).json({
            success: true,
            message: generated > 0 ? `নিয়মিত খরচ যোগ হয়েছে। ${generated}টা খরচ এখনই জমা হয়েছে।` : 'নিয়মিত খরচ যোগ হয়েছে।',
            data: r.rows[0], generated,
        });
    } catch (error) {
        logger.error('❌ createRecurring Error:', error.message);
        return res.status(500).json({ success: false, message: 'নিয়মিত খরচ যোগ করতে সমস্যা হয়েছে।' });
    }
};

// আগে জমা হওয়া খরচ বদলায় না — নতুন পরিমাণ/তথ্য কেবল পরের মাস থেকে প্রযোজ্য
const updateRecurring = async (req, res) => {
    try {
        const cur = await query(`SELECT id, category_id FROM recurring_expenses WHERE id = $1 AND tenant_id = $2`,
                                [req.params.id, req.tenantId]);
        if (cur.rows.length === 0) return res.status(404).json({ success: false, message: 'নিয়মিত খরচ পাওয়া যায়নি।' });

        const v = await validateRecurring(req.tenantId, req.body, cur.rows[0]);
        if (v.error) return res.status(400).json({ success: false, message: v.error });
        const is_active = req.body.is_active === undefined ? true : !!req.body.is_active;

        const r = await query(
            `UPDATE recurring_expenses
                SET category_id=$1, expense_type=$2, amount=$3, day_of_month=$4, start_date=$5, end_date=$6,
                    payment_method=$7, paid_to=$8, note=$9, is_active=$10, updated_at=NOW()
              WHERE id=$11 AND tenant_id=$12 RETURNING *`,
            [v.category_id, v.expense_type, v.amount, v.day_of_month, v.start_date, v.end_date,
             v.payment_method, v.paid_to, v.note, is_active, req.params.id, req.tenantId]
        );
        const generated = is_active ? await generateRecurringExpenses({ tenantId: req.tenantId }) : 0;
        return res.json({ success: true, message: 'নিয়মিত খরচ আপডেট হয়েছে।', data: r.rows[0], generated });
    } catch (error) {
        logger.error('❌ updateRecurring Error:', error.message);
        return res.status(500).json({ success: false, message: 'নিয়মিত খরচ আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// টেমপ্লেট মুছলে আগে জমা হওয়া খরচগুলো থেকে যায় (recurring_expense_id শুধু NULL হয়)
const deleteRecurring = async (req, res) => {
    try {
        const r = await query(`DELETE FROM recurring_expenses WHERE id = $1 AND tenant_id = $2 RETURNING id`,
                              [req.params.id, req.tenantId]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'নিয়মিত খরচ পাওয়া যায়নি।' });
        return res.json({ success: true, message: 'নিয়মিত খরচ মুছে ফেলা হয়েছে। আগে জমা হওয়া খরচ হিসাবে থাকছে।' });
    } catch (error) {
        logger.error('❌ deleteRecurring Error:', error.message);
        return res.status(500).json({ success: false, message: 'নিয়মিত খরচ মুছতে সমস্যা হয়েছে।' });
    }
};

// ── অগ্রিম খরচ (কয়েক মাসে ভাগ) ───────────────────────────────

const listPrepaid = async (req, res) => {
    try {
        const r = await query(
            `SELECT p.*,
                    (SELECT COUNT(*) FROM expenses e WHERE e.prepaid_expense_id = p.id)::int AS posted_count,
                    (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.prepaid_expense_id = p.id) AS posted_amount
               FROM prepaid_expenses p
              WHERE p.tenant_id = $1
              ORDER BY p.start_month DESC, p.created_at DESC`,
            [req.tenantId]
        );
        return res.json({ success: true, data: r.rows.map(x => ({ ...x, posted_amount: parseFloat(x.posted_amount) })) });
    } catch (error) {
        logger.error('❌ listPrepaid Error:', error.message);
        return res.status(500).json({ success: false, message: 'অগ্রিম খরচের তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

const createPrepaid = async (req, res) => {
    try {
        const v = validateCommon({ ...req.body, amount: req.body.total_amount });
        if (v.error) return res.status(400).json({ success: false, message: v.error.replace('পরিমাণ', 'মোট পরিমাণ') });

        const months = parseInt(req.body.months, 10);
        if (!Number.isInteger(months) || months < 2 || months > 60)
            return res.status(400).json({ success: false, message: 'মাসের সংখ্যা ২ থেকে ৬০-এর মধ্যে দিন।' });
        const paid_date = req.body.paid_date;
        if (!isDate(paid_date))    return res.status(400).json({ success: false, message: 'পরিশোধের তারিখ সঠিক নয়।' });
        if (paid_date > todayBD()) return res.status(400).json({ success: false, message: 'পরিশোধের তারিখ ভবিষ্যতের হতে পারে না।' });
        if (!/^\d{4}-\d{2}$/.test(req.body.start_month || ''))
            return res.status(400).json({ success: false, message: 'কোন মাস থেকে ভাগ শুরু হবে তা দিন।' });
        const start_month = req.body.start_month + '-01';
        if (!isDate(start_month)) return res.status(400).json({ success: false, message: 'শুরুর মাস সঠিক নয়।' });
        const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        if (start_month < yearAgo.toISOString().slice(0, 8) + '01')
            return res.status(400).json({ success: false, message: 'শুরুর মাস ১ বছরের বেশি আগের হতে পারবে না।' });

        const cat = await resolveCategory(req.tenantId, req.body);
        if (cat.error) return res.status(400).json({ success: false, message: cat.error });

        let receipt_url = null;
        if (req.file) {
            try { receipt_url = await uploadReceipt(req.file, req.tenantId); }
            catch (e) { logger.warn('⚠️ অগ্রিম খরচের রসিদ আপলোড ব্যর্থ:', e.message); }
        }

        const r = await query(
            `INSERT INTO prepaid_expenses
                (tenant_id, category_id, expense_type, total_amount, months, start_month, paid_date,
                 payment_method, paid_to, receipt_url, note, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
            [req.tenantId, cat.category_id, cat.expense_type, v.amount, months, start_month, paid_date,
             v.payment_method, v.paid_to, receipt_url, v.note, req.user.id]
        );
        const generated = await generatePrepaidExpenses({ tenantId: req.tenantId });
        return res.status(201).json({
            success: true,
            message: `অগ্রিম খরচ যোগ হয়েছে। ${months} মাসে ভাগ হবে${generated > 0 ? `, ${generated}টা কিস্তি এখনই ধরা হয়েছে` : ''}।`,
            data: r.rows[0], generated,
        });
    } catch (error) {
        logger.error('❌ createPrepaid Error:', error.message);
        return res.status(500).json({ success: false, message: 'অগ্রিম খরচ যোগ করতে সমস্যা হয়েছে।' });
    }
};

// ?keep_posted=false দিলে আগে ধরা কিস্তিগুলোও মুছে যায়; ডিফল্টে সেগুলো থাকে, শুধু বাকি কিস্তি বন্ধ
const deletePrepaid = async (req, res) => {
    try {
        const removePosted = req.query.remove_posted === 'true';
        const result = await withTransaction(async (client) => {
            const cq = client.query.bind(client);
            if (removePosted)
                await cq(`DELETE FROM expenses WHERE prepaid_expense_id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId]);
            return cq(`DELETE FROM prepaid_expenses WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, req.tenantId]);
        });
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'অগ্রিম খরচ পাওয়া যায়নি।' });
        return res.json({ success: true, message: removePosted
            ? 'অগ্রিম খরচ ও আগে ধরা সব কিস্তি মুছে ফেলা হয়েছে।'
            : 'অগ্রিম খরচ বাতিল। আগে ধরা কিস্তি হিসাবে থাকছে, বাকি কিস্তি আর ধরা হবে না।' });
    } catch (error) {
        logger.error('❌ deletePrepaid Error:', error.message);
        return res.status(500).json({ success: false, message: 'অগ্রিম খরচ মুছতে সমস্যা হয়েছে।' });
    }
};

// ── বাজেট বনাম আসল খরচ ────────────────────────────────────────

const monthRange = (ym) => {
    const start = `${ym}-01`;
    const [y, m] = ym.split('-').map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // মাসের শেষ দিন
    return { start, end };
};

// GET /company/budgets?month=YYYY-MM — প্রতিটি সক্রিয় ক্যাটাগরির বাজেট, আসল খরচ ও ব্যবধান
const getBudgets = async (req, res) => {
    try {
        const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : todayBD().slice(0, 7);
        const { start, end } = monthRange(ym);
        await ensureCategories(req.tenantId);

        const [cats, budgets, actuals] = await Promise.all([
            query(`SELECT id, name FROM expense_categories WHERE tenant_id = $1 AND is_active = true ORDER BY sort_order, name`, [req.tenantId]),
            query(`SELECT category_id, month, amount FROM expense_budgets
                    WHERE tenant_id = $1 AND (month IS NULL OR month = $2)`, [req.tenantId, start]),
            query(`SELECT expense_type, COALESCE(SUM(amount),0) AS amount FROM expenses
                    WHERE tenant_id = $1 AND date BETWEEN $2 AND $3 GROUP BY expense_type`, [req.tenantId, start, end]),
        ]);

        const actualByName = new Map(actuals.rows.map(r => [r.expense_type, parseFloat(r.amount)]));
        const rows = cats.rows.map(c => {
            const override = budgets.rows.find(b => b.category_id === c.id && b.month);
            const def      = budgets.rows.find(b => b.category_id === c.id && !b.month);
            const hit = override || def;
            const budget = hit ? parseFloat(hit.amount) : null;
            const actual = actualByName.get(c.name) || 0;
            return {
                category_id: c.id, name: c.name, budget,
                budget_source: override ? 'month' : def ? 'default' : null,
                actual,
                diff: budget === null ? null : budget - actual,            // ধনাত্মক = বাজেটের ভেতরে
                used_pct: budget ? Math.round((actual / budget) * 100) : null,
            };
        });

        const catNames = new Set(cats.rows.map(c => c.name));
        const unbudgeted = [...actualByName.entries()]
            .filter(([name]) => !catNames.has(name))
            .map(([name, actual]) => ({ name, actual }));

        const totalBudget = rows.reduce((s, r) => s + (r.budget || 0), 0);
        const totalActual = [...actualByName.values()].reduce((s, v) => s + v, 0);
        return res.json({ success: true, month: ym, data: rows, unbudgeted,
            totals: { budget: totalBudget, actual: totalActual } });
    } catch (error) {
        logger.error('❌ getBudgets Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাজেটের তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// PUT /company/budgets { category_id, amount, month: 'YYYY-MM' | null }
// amount খালি/null → ওই বাজেট মুছে যায় (মাসের ব্যতিক্রম মুছলে ডিফল্টে ফেরে)
const setBudget = async (req, res) => {
    try {
        const cat = await findCategory(req.tenantId, req.body.category_id, { requireActive: false });
        if (!cat) return res.status(404).json({ success: false, message: 'ক্যাটাগরি পাওয়া যায়নি।' });

        let month = null;
        if (req.body.month) {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.body.month))
                return res.status(400).json({ success: false, message: 'মাসের ফরম্যাট সঠিক নয়।' });
            month = req.body.month + '-01';
        }

        const raw = req.body.amount;
        if (raw === null || raw === undefined || raw === '') {
            await query(
                `DELETE FROM expense_budgets WHERE tenant_id = $1 AND category_id = $2
                    AND COALESCE(month, DATE '1900-01-01') = COALESCE($3::date, DATE '1900-01-01')`,
                [req.tenantId, cat.id, month]
            );
            return res.json({ success: true, message: 'বাজেট সরানো হয়েছে।' });
        }
        const amount = parseFloat(raw);
        if (!Number.isFinite(amount) || amount < 0 || amount > 100000000)
            return res.status(400).json({ success: false, message: 'সঠিক বাজেটের পরিমাণ দিন।' });

        await query(
            `INSERT INTO expense_budgets (tenant_id, category_id, month, amount)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (tenant_id, category_id, COALESCE(month, DATE '1900-01-01'))
             DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()`,
            [req.tenantId, cat.id, month, amount]
        );
        return res.json({ success: true, message: month ? 'এই মাসের বাজেট সংরক্ষিত হয়েছে।' : 'প্রতি মাসের বাজেট সংরক্ষিত হয়েছে।' });
    } catch (error) {
        logger.error('❌ setBudget Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাজেট সংরক্ষণ করতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    receiptUpload,
    listPrepaid, createPrepaid, deletePrepaid, getBudgets, setBudget,
    listCompanyExpenses, createCompanyExpense, updateCompanyExpense, deleteCompanyExpense,
    listCategories, createCategory, updateCategory, deleteCategory,
    listRecurring, createRecurring, updateRecurring, deleteRecurring,
    PAYMENT_METHODS,
};
