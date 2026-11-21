const multer = require('multer');
const sharp  = require('sharp');
const logger = require('../config/logger');
const { query, withTransaction } = require('../config/db');
const { uploadToStorage } = require('../config/firebase');

// ── SR খরচ ফর্ম multipart/form-data পাঠায় (রিসিট ছবিসহ)। multer ছাড়া req.body
// খালি থাকত, ফলে সব খরচ ০ হিসেবে সেভ হতো। এই middleware routes-এ বসানো হয়েছে।
const receiptUploader = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
        file.mimetype && file.mimetype.startsWith('image/')
            ? cb(null, true)
            : cb(new Error('রিসিট হিসেবে শুধু ছবি (JPG/PNG) দেওয়া যাবে।')),
});
const expenseReceiptUpload = (req, res, next) => {
    receiptUploader.single('receipt')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'রিসিটের ছবি ১০MB-এর বেশি হতে পারবে না।' : err.message;
        return res.status(400).json({ success: false, message });
    });
};

// ============================================================
// POST /api/expense/submit
// SR নতুন খরচ রিপোর্ট জমা দেবে (অথবা আজকেরটা edit করবে)
// ============================================================

// ── কার্যকর সীমা: কোম্পানির সেটিংস + কর্মীর নিজস্ব দৈনিক সীমা ─────────────
// পুরোনো কোড settings পড়ত tenant ছাড়া (অন্য কোম্পানির মানও মিশে যেত) — এখন tenant ধরে।
// "অন্যান্য" সীমা আগে শুধু ফ্রন্টএন্ডে ২০০ হার্ডকোড ছিল; সেটিং না থাকলে সেই ২০০-ই ডিফল্ট।
const getEffectiveLimits = async (workerId, tenantId) => {
    const [settingsRes, userRes] = await Promise.all([
        query(`SELECT key, value FROM system_settings
                WHERE tenant_id = $1
                  AND key IN ('expense_daily_limit','expense_transport_limit',
                              'expense_food_limit','expense_misc_limit','expense_receipt_required')`, [tenantId]),
        query(`SELECT expense_daily_limit FROM users WHERE id = $1 AND tenant_id = $2`, [workerId, tenantId]),
    ]);
    const st = {};
    settingsRes.rows.forEach(r => { st[r.key] = r.value; });
    const pos = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : d; };

    const companyDaily = pos(st.expense_daily_limit, 9999);
    const personal = userRes.rows[0] ? userRes.rows[0].expense_daily_limit : null;
    const personalNum = personal === null || personal === undefined ? null : pos(personal, null);
    return {
        daily:     personalNum !== null ? personalNum : companyDaily,
        dailyIsPersonal: personalNum !== null,
        companyDaily,
        transport: pos(st.expense_transport_limit, 9999),
        food:      pos(st.expense_food_limit,      9999),
        misc:      pos(st.expense_misc_limit,      200),
        receiptRequired: st.expense_receipt_required === 'true',
    };
};

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
            receipt_url,
            over_limit_reason
        } = req.body;

        const today = new Date().toISOString().slice(0, 10);
        const date  = report_date || today;

        // নতুন রিসিট ছবি এলে আপলোড করো (ব্যর্থ হলে খরচ জমা আটকাবে না)
        let receiptUrl = receipt_url || null;
        if (req.file) {
            try {
                const compressed = await sharp(req.file.buffer)
                    .rotate()
                    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 82 })
                    .toBuffer();
                receiptUrl = await uploadToStorage(
                    compressed, `expense-reports/${req.tenantId}/${req.user.id}_${Date.now()}.jpg`, 'image/jpeg');
            } catch (e) {
                logger.error('❌ submitExpense receipt upload:', e.message);
            }
        }

        // ── Date Validation ──────────────────────────────────────────────
        // ⚠️ Security Fix: report_date validate না করলে SR যেকোনো তারিখে
        // expense জমা দিতে পারে — গতমাসে বা ভবিষ্যতেও।
        // Rule: শুধু আজকের বা গতকালের তারিখ অনুমোদিত।
        // গতকাল allow — কারণ রাত ১১টায় submit করতে না পারলে পরদিন সকালে দেওয়া স্বাভাবিক।
        const dateObj  = new Date(date + 'T00:00:00');
        const todayObj = new Date(today + 'T00:00:00');

        if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ success: false, message: 'তারিখের ফরম্যাট সঠিক নয়।' });
        }
        if (dateObj > todayObj) {
            return res.status(400).json({ success: false, message: 'ভবিষ্যতের তারিখে খরচ জমা দেওয়া যাবে না।' });
        }
        const diffDays = Math.floor((todayObj - dateObj) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
            return res.status(400).json({ success: false, message: 'আজকের বা গতকালের তারিখ ছাড়া খরচ জমা দেওয়া যাবে না।' });
        }
        // ────────────────────────────────────────────────────────────────

        // আজকে আগে জমা দেওয়া আছে কিনা চেক করো
        const existing = await query(
            `SELECT id, status, receipt_url FROM expense_reports
              WHERE worker_id = $1 AND report_date = $2
             AND tenant_id = $3`,
            [workerId, date,
                req.tenantId]
        );

        // approved রিপোর্ট edit করা যাবে না
        if (existing.rows.length > 0 && existing.rows[0].status === 'approved') {
            return res.status(400).json({
                success: false,
                message: 'অনুমোদিত রিপোর্ট পরিবর্তন করা যাবে না।'
            });
        }

        // সীমা: কোম্পানির সেটিংস (শুধু নিজের tenant) + কর্মীর নিজস্ব দৈনিক সীমা (থাকলে)
        const limits = await getEffectiveLimits(workerId, req.tenantId);
        const receiptReq = limits.receiptRequired;

        const tCost = parseFloat(transport_cost);
        const fCost = parseFloat(food_cost);
        const mCost = parseFloat(misc_cost);
        const total = tCost + fCost + mCost;

        // ── ন্যূনতম যাচাই (সার্ভার-সাইড) ────────────────────────────────
        // আগে শুধু ফর্মের বাটন বন্ধ থাকত; সরাসরি API কল/পুরোনো অ্যাপে ০-খরচ ও
        // ধরনহীন রিপোর্ট ঢুকে যেত (ম্যানেজার "যানবাহন —, ৳০" দেখতেন)।
        const VALID_TRANSPORT = ['rickshaw', 'bus', 'cng', 'bike', 'own_vehicle', 'other'];
        if (![tCost, fCost, mCost].every(Number.isFinite) || tCost < 0 || fCost < 0 || mCost < 0) {
            return res.status(400).json({ success: false, message: 'খরচের পরিমাণ সঠিক নয় (ঋণাত্মক বা অসংখ্যা মান)।' });
        }
        if (total <= 0) {
            return res.status(400).json({ success: false, message: 'অন্তত একটি খরচের পরিমাণ ০-এর বেশি দিতে হবে।' });
        }
        if (!transport_type || !VALID_TRANSPORT.includes(transport_type)) {
            return res.status(400).json({ success: false, message: 'যানবাহনের ধরন বেছে নিন।' });
        }

        // ── সীমা: ছাড়ালে বাতিল নয় — কারণসহ "অনুমোদন সাপেক্ষে" জমা হয় ─────────
        const overParts = [];
        if (tCost > limits.transport) overParts.push(`যাতায়াত ৳${tCost} (সীমা ৳${limits.transport})`);
        if (fCost > limits.food)      overParts.push(`খাবার ৳${fCost} (সীমা ৳${limits.food})`);
        if (mCost > limits.misc)      overParts.push(`অন্যান্য ৳${mCost} (সীমা ৳${limits.misc})`);
        if (total > limits.daily)     overParts.push(`মোট ৳${total} (সীমা ৳${limits.daily})`);
        const overLimit = overParts.length > 0;
        const overReason = (over_limit_reason == null ? '' : String(over_limit_reason)).trim().slice(0, 500);
        if (overLimit && overReason.length < 3) {
            return res.status(400).json({
                success: false,
                code: 'OVER_LIMIT_REASON_REQUIRED',
                message: `সীমা ছাড়িয়েছে — ${overParts.join(', ')}। ম্যানেজারের অনুমোদনের জন্য কারণ লিখুন।`
            });
        }

        // এডিটে নতুন ছবি না দিলে আগের রিসিট থাকে
        if (!receiptUrl && existing.rows.length > 0) receiptUrl = existing.rows[0].receipt_url || null;
        if (receiptReq && !receiptUrl) {
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
                    over_limit        = $9,
                    over_limit_reason = $10,
                    status          = 'pending',
                    reviewed_by     = NULL,
                    review_note     = NULL,
                    reviewed_at     = NULL
                 WHERE worker_id = $7 AND report_date = $8
                 RETURNING *`,
                [transport_type, tCost, fCost, mCost, misc_note || null,
                 receiptUrl, workerId, date, overLimit, overLimit ? overReason : null]
            );
        } else {
            // INSERT — নতুন রিপোর্ট
            result = await query(
                `INSERT INTO expense_reports (worker_id, report_date, transport_type, transport_cost,
                     food_cost, misc_cost, misc_note, receipt_url, tenant_id,
                     over_limit, over_limit_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $9, $10, $11)
                 RETURNING *`,
                [workerId, date, transport_type, tCost, fCost, mCost,
                 misc_note || null, receiptUrl, req.tenantId,
                 overLimit, overLimit ? overReason : null]
            );
        }

        return res.status(200).json({
            success: true,
            message: overLimit
                ? 'সীমা ছাড়ানো খরচ জমা হয়েছে — ম্যানেজারের অনুমোদনের অপেক্ষায়।'
                : 'খরচ রিপোর্ট সফলভাবে জমা হয়েছে।',
            over_limit: overLimit,
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ submitExpense Error:', error.message);
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

        // কার্যকর সীমা (কোম্পানির সীমা + এই কর্মীর নিজস্ব দৈনিক সীমা) — ফর্ম এটাই দেখাবে
        const limits = await getEffectiveLimits(req.user.id, req.tenantId);

        return res.json({
            success: true,
            data: result.rows[0] || null,
            limits
        });

    } catch (error) {
        logger.error('❌ getTodayExpense Error:', error.message);
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
        logger.error('❌ getMyExpenses Error:', error.message);
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

        // ✅ সবসময় নিজের কোম্পানির (tenant) ডেটাতেই সীমাবদ্ধ
        const params  = [req.tenantId];
        const filters = ['er.tenant_id = $1'];

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
        logger.error('❌ getTeamExpenses Error:', error.message);
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
             WHERE er.id = $1 AND er.tenant_id = $2`,
            [id, req.tenantId]
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

        // ✅ Approve হলে expenses টেবিলেও entry যাবে (P&L/Ledger/Dashboard-এ আসার জন্য)।
        // একই transaction-এ, যাতে একটা ব্যর্থ হলে অন্যটাও rollback হয়।
        const result = await withTransaction(async (client) => {
            const upd = await client.query(
                `UPDATE expense_reports SET
                    status      = $1,
                    reviewed_by = $2,
                    review_note = $3,
                    reviewed_at = NOW()
                 WHERE id = $4 AND tenant_id = $5 AND status = 'pending'
                 RETURNING *`,
                [status, reviewerId, review_note || null, id, req.tenantId]
            );
            if (upd.rows.length === 0) return upd;   // অন্য কেউ আগেই review করেছে

            if (status === 'approved') {
                const r = upd.rows[0];
                const total = parseFloat(r.transport_cost || 0)
                            + parseFloat(r.food_cost || 0)
                            + parseFloat(r.misc_cost || 0);
                if (total > 0) {
                    const parts = [];
                    if (parseFloat(r.transport_cost) > 0) parts.push(`যাতায়াত: ${r.transport_cost}`);
                    if (parseFloat(r.food_cost) > 0)      parts.push(`খাবার: ${r.food_cost}`);
                    if (parseFloat(r.misc_cost) > 0)      parts.push(`বিবিধ: ${r.misc_cost}`);
                    if (r.misc_note)                      parts.push(r.misc_note);

                    await client.query(
                        `INSERT INTO expenses
                            (user_id, expense_type, amount, date, note, created_by, tenant_id, expense_report_id, source)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sr_report')
                         ON CONFLICT (expense_report_id) WHERE expense_report_id IS NOT NULL
                         DO NOTHING`,
                        [r.worker_id, 'SR খরচ (যাতায়াত/খাবার/বিবিধ)', total, r.report_date,
                         parts.join(' | '), reviewerId, req.tenantId, r.id]
                    );
                }
            }
            return upd;
        });

        if (result.rows.length === 0) {
            return res.status(409).json({
                success: false,
                message: 'এই রিপোর্ট ইতিমধ্যে review হয়ে গেছে।'
            });
        }

        return res.json({
            success: true,
            message: status === 'approved' ? 'রিপোর্ট অনুমোদিত হয়েছে।' : 'রিপোর্ট বাতিল করা হয়েছে।',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('❌ reviewExpense Error:', error.message);
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
        // ⚠️ pg DATE কলাম JS Date অবজেক্ট হিসেবে ফেরত আসে; submitExpense স্ট্রিং
        // (YYYY-MM-DD) আশা করে ও `date + 'T00:00:00'` জোড়ে। Date সরাসরি দিলে
        // "Invalid Date" হয়ে SR কখনোই নিজের রিপোর্ট edit করতে পারত না।
        const rd = existing.rows[0].report_date;
        req.body.report_date = rd instanceof Date ? rd.toISOString().slice(0, 10) : String(rd).slice(0, 10);
        return submitExpense(req, res);

    } catch (error) {
        logger.error('❌ updateExpense Error:', error.message);
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
               AND er.tenant_id = $3
             ORDER BY er.report_date DESC, u.name_bn ASC`,
            [y, m, req.tenantId]
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
        logger.error('❌ getExpenseReport Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    expenseReceiptUpload,
    submitExpense,
    getTodayExpense,
    getMyExpenses,
    getTeamExpenses,
    reviewExpense,
    updateExpense,
    getExpenseReport
};
