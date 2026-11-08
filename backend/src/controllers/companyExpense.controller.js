const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// কোম্পানির সাধারণ খরচ (ভাড়া, বিদ্যুৎ, ইন্টারনেট ইত্যাদি)
// GET    /api/expense/company            — তালিকা + সারাংশ
// POST   /api/expense/company            — নতুন খরচ
// PUT    /api/expense/company/:id        — edit (শুধু manual)
// DELETE /api/expense/company/:id        — delete (শুধু manual)
// ============================================================

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(new Date(v + 'T00:00:00').getTime());

const validate = (body) => {
    const expense_type = String(body.expense_type || '').trim();
    const amount       = parseFloat(body.amount);
    const date         = body.date;
    const note         = body.note ? String(body.note).trim() : null;

    if (!expense_type)               return { error: 'খরচের ধরন দিন।' };
    if (expense_type.length > 100)   return { error: 'খরচের ধরন ১০০ অক্ষরের বেশি হতে পারবে না।' };
    if (!Number.isFinite(amount) || amount <= 0)
                                     return { error: 'সঠিক পরিমাণ দিন (০-এর বেশি)।' };
    if (amount > 100000000)          return { error: 'পরিমাণ অস্বাভাবিক বেশি।' };
    if (!isDate(date))               return { error: 'তারিখের ফরম্যাট সঠিক নয়।' };
    if (new Date(date + 'T00:00:00') > new Date()) return { error: 'ভবিষ্যতের তারিখে খরচ যোগ করা যাবে না।' };
    if (note && note.length > 500)   return { error: 'নোট ৫০০ অক্ষরের বেশি হতে পারবে না।' };

    return { expense_type, amount, date, note };
};

const listCompanyExpenses = async (req, res) => {
    try {
        const { from, to, expense_type, source, page = 1, limit = 30 } = req.query;
        const today = new Date().toISOString().slice(0, 10);
        const first = today.slice(0, 8) + '01';
        const fromDate = isDate(from) ? from : first;
        const toDate   = isDate(to)   ? to   : today;

        const pageInt  = Math.max(1, parseInt(page) || 1);
        const limitInt = Math.min(100, Math.max(1, parseInt(limit) || 30));

        const params  = [req.tenantId, fromDate, toDate];
        let   filters = 'e.tenant_id = $1 AND e.date BETWEEN $2 AND $3';
        if (expense_type) { params.push(expense_type); filters += ` AND e.expense_type = $${params.length}`; }
        if (source)       { params.push(source);       filters += ` AND e.source = $${params.length}`; }

        const [rows, totals, byType, bySource] = await Promise.all([
            query(
                `SELECT e.id, e.expense_type, e.amount, e.date, e.note, e.source, e.created_at,
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
        const v = validate(req.body);
        if (v.error) return res.status(400).json({ success: false, message: v.error });

        const result = await query(
            `INSERT INTO expenses (user_id, expense_type, amount, date, note, created_by, tenant_id, source)
             VALUES ($1, $2, $3, $4, $5, $1, $6, 'manual')
             RETURNING *`,
            [req.user.id, v.expense_type, v.amount, v.date, v.note, req.tenantId]
        );
        return res.status(201).json({ success: true, message: 'খরচ যোগ হয়েছে।', data: result.rows[0] });
    } catch (error) {
        logger.error('❌ createCompanyExpense Error:', error.message);
        return res.status(500).json({ success: false, message: 'খরচ যোগ করতে সমস্যা হয়েছে।' });
    }
};

const updateCompanyExpense = async (req, res) => {
    try {
        const v = validate(req.body);
        if (v.error) return res.status(400).json({ success: false, message: v.error });

        const result = await query(
            `UPDATE expenses SET expense_type = $1, amount = $2, date = $3, note = $4
              WHERE id = $5 AND tenant_id = $6 AND source = 'manual'
              RETURNING *`,
            [v.expense_type, v.amount, v.date, v.note, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'খরচ পাওয়া যায়নি, অথবা এটি স্বয়ংক্রিয়ভাবে এসেছে (SR রিপোর্ট/ব্যাচ রাইট-অফ) — এটি edit করা যাবে না।'
            });
        }
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
              WHERE id = $1 AND tenant_id = $2 AND source = 'manual'
              RETURNING id`,
            [req.params.id, req.tenantId]
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

module.exports = { listCompanyExpenses, createCompanyExpense, updateCompanyExpense, deleteCompanyExpense };
