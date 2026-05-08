const { query, withTransaction } = require('../config/db');

// ============================================================
// POST /api/expense/submit
// SR নতুন খরচ রিপোর্ট জমা দেবে (অথবা আজকেরটা edit করবে)
// ============================================================

const submitExpense = async (req, res) => {
    try {
        const workerId = req.user.id;
        const {
            report_date,
            transport_type,
            transport_cost = 0,
            food_cost      = 0,
            misc_cost      = 0,
            misc_note,
            receipt_url
        } = req.body;

        const date = report_date || new Date().toISOString().slice(0, 10);

        // আজকে আগে জমা দেওয়া আছে কিনা চেক করো
        const existing = await query(
            `SELECT id, status FROM expense_reports
              WHERE worker_id = $1 AND report_date = $2`,
            [workerId, date]
        );

        // approved রিপোর্ট edit করা যাবে না
        if (existing.rows.length > 0 && existing.rows[0].status === 'approved') {
            return res.status(400).json({
                success: false,
                message: 'অনুমোদিত রিপোর্ট পরিবর্তন করা যাবে না।'
            });
        }

        // settings থেকে limit নাও
        const settingsRes = await query(
            `SELECT key, value FROM system_settings
              WHERE key IN ('expense_daily_limit','expense_transport_limit',
                            'expense_food_limit','expense_receipt_required')`
        );
        const settings = {};
        settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

        const dailyLimit     = parseFloat(settings['expense_daily_limit']     || 9999);
        const transportLimit = parseFloat(settings['expense_transport_limit'] || 9999);
        const foodLimit      = parseFloat(settings['expense_food_limit']      || 9999);
        const receiptReq     = settings['expense_receipt_required'] === 'true';

        const tCost = parseFloat(transport_cost);
        const fCost = parseFloat(food_cost);
        const mCost = parseFloat(misc_cost);
        const total = tCost + fCost + mCost;

        // Validation
        if (tCost > transportLimit) {
            return res.status(400).json({
                success: false,
                message: `যাতায়াত খরচ সর্বোচ্চ ৳${transportLimit} হতে পারবে।`
            });
        }
        if (fCost > foodLimit) {
            return res.status(400).json({
                success: false,
                message: `খাবার খরচ সর্বোচ্চ ৳${foodLimit} হতে পারবে।`
            });
        }
        if (total > dailyLimit) {
            return res.status(400).json({
                success: false,
                message: `মোট দৈনিক খরচ সর্বোচ্চ ৳${dailyLimit} হতে পারবে।`
            });
        }
        if (receiptReq && !receipt_url) {
            return res.status(400).json({
                success: false,
                message: 'রিসিট ছবি আপলোড করা বাধ্যতামূলক।'
            });
        }

        let result;

        if (existing.rows.length > 0) {
            // UPDATE — আগের pending রিপোর্ট edit
            result = await query(
                `UPDATE expense_reports SET
                    transport_type  = $1,
                    transport_cost  = $2,
                    food_cost       = $3,
                    misc_cost       = $4,
                    misc_note       = $5,
                    receipt_url     = $6,
                    status          = 'pending',
                    reviewed_by     = NULL,
                    review_note     = NULL,
                    reviewed_at     = NULL
                 WHERE worker_id = $7 AND report_date = $8
                 RETURNING *`,
                [transport_type, tCost, fCost, mCost, misc_note || null,
                 receipt_url || null, workerId, date]
            );
        } else {
            // INSERT — নতুন রিপোর্ট
            result = await query(
                `INSERT INTO expense_reports
                    (worker_id, report_date, transport_type, transport_cost,
                     food_cost, misc_cost, misc_note, receipt_url)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 RETURNING *`,
                [workerId, date, transport_type, tCost, fCost, mCost,
                 misc_note || null, receipt_url || null]
            );
        }

        return res.status(200).json({
            success: true,
            message: 'খরচ রিপোর্ট সফলভাবে জমা হয়েছে।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ submitExpense Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/expense/today
// আজকের রিপোর্ট আছে কিনা চেক করে (SR নিজের)
// ============================================================

const getTodayExpense = async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);

        const result = await query(
            `SELECT er.*,
                    u.name_bn AS reviewed_by_name
             FROM   expense_reports er
             LEFT JOIN users u ON u.id = er.reviewed_by
             WHERE  er.worker_id   = $1
               AND  er.report_date = $2`,
            [req.user.id, today]
        );

        // settings পাঠাও যাতে frontend limit দেখাতে পারে
        const settingsRes = await query(
            `SELECT key, value FROM system_settings
              WHERE key LIKE 'expense_%'`
        );
        const settings = {};
        settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

        return res.json({
            success: true,
            data: result.rows[0] || null,
            settings
        });

    } catch (error) {
        console.error('❌ getTodayExpense Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/expense/my?year=&month=
// SR নিজের ইতিহাস দেখবে
// ============================================================

const getMyExpenses = async (req, res) => {
    try {
        const { year, month } = req.query;
        const y = parseInt(year  || new Date().getFullYear());
        const m = parseInt(month || new Date().getMonth() + 1);

        const result = await query(
            `SELECT er.*,
                    u.name_bn AS reviewed_by_name
             FROM   expense_reports er
             LEFT JOIN users u ON u.id = er.reviewed_by
             WHERE  er.worker_id = $1
               AND  EXTRACT(YEAR  FROM er.report_date) = $2
               AND  EXTRACT(MONTH FROM er.report_date) = $3
             ORDER BY er.report_date DESC`,
            [req.user.id, y, m]
        );

        // মাসের summary
        const summary = {
            total_transport: 0,
            total_food:      0,
            total_misc:      0,
            total_amount:    0,
            approved_count:  0,
            pending_count:   0,
            rejected_count:  0
        };

        result.rows.forEach(r => {
            summary.total_transport += parseFloat(r.transport_cost || 0);
            summary.total_food      += parseFloat(r.food_cost      || 0);
            summary.total_misc      += parseFloat(r.misc_cost      || 0);
            summary.total_amount    += parseFloat(r.total_amount   || 0);
            if (r.status === 'approved')  summary.approved_count++;
            if (r.status === 'pending')   summary.pending_count++;
            if (r.status === 'rejected')  summary.rejected_count++;
        });

        return res.json({
            success: true,
            data: result.rows,
            summary,
            meta: { year: y, month: m }
        });

    } catch (error) {
        console.error('❌ getMyExpenses Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/expense/team?status=&date_from=&date_to=
// Manager দলের সব রিপোর্ট দেখবে
// ============================================================

const getTeamExpenses = async (req, res) => {
    try {
        const managerId = req.user.id;
        const role      = req.user.role;

        const { status, date_from, date_to, worker_id } = req.query;

        const params  = [];
        const filters = [];

        // Admin/accountant সব দেখতে পারবে; manager শুধু নিজের team
        if (!['admin', 'accountant'].includes(role)) {
            params.push(managerId);
            filters.push(`u.manager_id = $${params.length}`);
        }

        if (status) {
            params.push(status);
            filters.push(`er.status = $${params.length}`);
        }
        if (date_from) {
            params.push(date_from);
            filters.push(`er.report_date >= $${params.length}`);
        }
        if (date_to) {
            params.push(date_to);
            filters.push(`er.report_date <= $${params.length}`);
        }
        if (worker_id) {
            params.push(worker_id);
            filters.push(`er.worker_id = $${params.length}`);
        }

        const whereClause = filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : '';

        const result = await query(
            `SELECT
                er.*,
                u.name_bn          AS worker_name,
                u.employee_code,
                rv.name_bn         AS reviewed_by_name
             FROM   expense_reports er
             JOIN   users u  ON u.id  = er.worker_id
             LEFT JOIN users rv ON rv.id = er.reviewed_by
             ${whereClause}
             ORDER BY er.report_date DESC, er.created_at DESC`,
            params
        );

        return res.json({
            success: true,
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('❌ getTeamExpenses Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PATCH /api/expense/:id/review
// Manager approve অথবা reject করবে
// ============================================================

const reviewExpense = async (req, res) => {
    try {
        const { id }                          = req.params;
        const { status, review_note = '' }    = req.body;
        const reviewerId                      = req.user.id;
        const reviewerRole                    = req.user.role;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'status হতে হবে: approved অথবা rejected'
            });
        }

        // রিপোর্ট খোঁজো
        const expRes = await query(
            `SELECT er.*, u.manager_id
             FROM expense_reports er
             JOIN users u ON u.id = er.worker_id
             WHERE er.id = $1`,
            [id]
        );

        if (expRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিপোর্ট পাওয়া যায়নি।' });
        }

        const expense = expRes.rows[0];

        // Manager শুধু নিজের team-এর রিপোর্ট review করতে পারবে
        if (!['admin', 'accountant'].includes(reviewerRole)) {
            if (expense.manager_id !== reviewerId) {
                return res.status(403).json({
                    success: false,
                    message: 'এই রিপোর্ট review করার অনুমতি নেই।'
                });
            }
        }

        if (expense.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `এই রিপোর্ট আগেই ${expense.status === 'approved' ? 'অনুমোদিত' : 'বাতিল'} হয়েছে।`
            });
        }

        const result = await query(
            `UPDATE expense_reports SET
                status      = $1,
                reviewed_by = $2,
                review_note = $3,
                reviewed_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [status, reviewerId, review_note || null, id]
        );

        return res.json({
            success: true,
            message: status === 'approved' ? 'রিপোর্ট অনুমোদিত হয়েছে।' : 'রিপোর্ট বাতিল করা হয়েছে।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ reviewExpense Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/expense/:id
// SR নিজের pending রিপোর্ট edit করবে
// ============================================================

const updateExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const workerId = req.user.id;

        const existing = await query(
            `SELECT * FROM expense_reports WHERE id = $1 AND worker_id = $2`,
            [id, workerId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'রিপোর্ট পাওয়া যায়নি।' });
        }

        if (existing.rows[0].status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'শুধুমাত্র pending রিপোর্ট পরিবর্তন করা যাবে।'
            });
        }

        // reuse submitExpense logic — redirect করো body তে date দিয়ে
        req.body.report_date = existing.rows[0].report_date;
        return submitExpense(req, res);

    } catch (error) {
        console.error('❌ updateExpense Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/reports/expense?year=&month=&export=excel
// Admin মাসিক expense রিপোর্ট
// ============================================================

const getExpenseReport = async (req, res) => {
    try {
        const { year, month, export: exportType } = req.query;
        const y = parseInt(year  || new Date().getFullYear());
        const m = parseInt(month || new Date().getMonth() + 1);

        const result = await query(
            `SELECT
                er.*,
                u.name_bn       AS worker_name,
                u.employee_code,
                mgr.name_bn     AS manager_name,
                rv.name_bn      AS reviewed_by_name
             FROM expense_reports er
             JOIN users u   ON u.id   = er.worker_id
             LEFT JOIN users mgr ON mgr.id = u.manager_id
             LEFT JOIN users rv  ON rv.id  = er.reviewed_by
             WHERE EXTRACT(YEAR  FROM er.report_date) = $1
               AND EXTRACT(MONTH FROM er.report_date) = $2
             ORDER BY er.report_date DESC, u.name_bn ASC`,
            [y, m]
        );

        // Summary তৈরি করো
        const byWorker = {};
        let total_amount    = 0;
        let approved_amount = 0;

        result.rows.forEach(r => {
            const amt = parseFloat(r.total_amount || 0);
            total_amount += amt;
            if (r.status === 'approved') approved_amount += amt;

            if (!byWorker[r.worker_id]) {
                byWorker[r.worker_id] = {
                    worker_id:    r.worker_id,
                    worker_name:  r.worker_name,
                    employee_code:r.employee_code,
                    manager_name: r.manager_name,
                    total:        0,
                    approved:     0,
                    count:        0
                };
            }
            byWorker[r.worker_id].total   += amt;
            byWorker[r.worker_id].count   += 1;
            if (r.status === 'approved') byWorker[r.worker_id].approved += amt;
        });

        const summary = {
            total_amount,
            approved_amount,
            pending_amount:  total_amount - approved_amount,
            total_count:     result.rows.length,
            approved_count:  result.rows.filter(r => r.status === 'approved').length,
            pending_count:   result.rows.filter(r => r.status === 'pending').length,
            rejected_count:  result.rows.filter(r => r.status === 'rejected').length,
            by_worker:       Object.values(byWorker)
        };

        // Excel export request হলে data পাঠাও (frontend নিজে generate করবে)
        if (exportType === 'excel') {
            return res.json({
                success: true,
                data: result.rows,
                summary,
                meta: { year: y, month: m, export: true }
            });
        }

        return res.json({
            success: true,
            data: result.rows,
            summary,
            meta: { year: y, month: m }
        });

    } catch (error) {
        console.error('❌ getExpenseReport Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    submitExpense,
    getTodayExpense,
    getMyExpenses,
    getTeamExpenses,
    reviewExpense,
    updateExpense,
    getExpenseReport
};
