const { query } = require('../config/db');
const { encrypt } = require('../config/encryption');
const logger = require('../config/logger');
const walletService = require('../services/wallet.service');
const billingService = require('../services/billing.service');

// ============================================================
// SETTINGS GROUPS — key গুলো বিভাগ অনুযায়ী ভাগ করা
// ============================================================
const SETTINGS_GROUPS = {
    attendance: {
        label: 'হাজিরা সেটিংস',
        keys: [
            'attendance_checkin_time', 'attendance_checkout_time',
            'attendance_late_threshold', 'attendance_checkin_start',
            'attendance_checkin_end', 'attendance_popup_cutoff',
            'late_deduction_interval', 'weekly_off_day',
        ],
    },
    expense: {
        label: 'খরচ সীমা',
        keys: [
            'expense_daily_limit', 'expense_transport_limit',
            'expense_food_limit', 'expense_misc_limit',
        ],
    },
    credit: {
        label: 'ক্রেডিট নিয়ন্ত্রণ',
        keys: ['max_credit_limit', 'default_credit_limit'],
    },
    sales: {
        label: 'বিক্রয় / OTP / GPS',
        keys: [
            'otp_required', 'otp_expiry_minutes',
            'location_check_radius',
        ],
    },
    vat: {
        label: 'ভ্যাট ও ডিসকাউন্ট',
        keys: ['vat_enabled', 'default_vat_rate', 'max_discount_percent'],
    },
    notice: {
        label: 'নোটিশ',
        keys: ['notice_max_days'],
    },
    company: {
        label: 'কোম্পানি তথ্য',
        keys: ['company_name', 'company_address', 'company_phone', 'company_email'],
    },
};

// ✅ Phase 1 (26 July 2026): এই key গুলো এখন platform-level (Super Admin
// panel-এ, platform_settings টেবিলে) — tenant admin আর এগুলো GET/PUT
// কোনোভাবেই করতে পারবে না, এমনকি সরাসরি API call করলেও।
const PLATFORM_ONLY_KEY_PREFIXES = ['sms_api_key', 'sms_provider', 'sms_sender_id', 'sms_device_id', 'sms_enabled', 'sms_custom_url', 'email_host', 'email_port', 'email_user', 'email_pass', 'email_from', 'email_enabled'];

// ============================================================
// AUDIT LOG CATEGORIES — action গুলো বিভাগ অনুযায়ী ভাগ
// ============================================================
const AUDIT_CATEGORIES = {
    employee: {
        label: 'কর্মচারী',
        actions: [
            'APPROVE_EMPLOYEE', 'REJECT_EMPLOYEE', 'SUSPEND_EMPLOYEE',
            'REACTIVATE_EMPLOYEE', 'EDIT_EMPLOYEE', 'PAY_SALARY',
            'CANCEL_SALARY', 'PAY_COMMISSION', 'ATTENDANCE_CORRECTION',
        ],
    },
    team: {
        label: 'টিম',
        actions: [
            'CREATE_TEAM', 'UPDATE_TEAM',
            'MOVE_SR_TO_TEAM', 'REMOVE_SR_FROM_TEAM',
            'SET_SR_TARGET', 'SET_TEAM_TARGET',
        ],
    },
    portal: {
        label: 'কাস্টমার পোর্টাল',
        actions: [
            'REVOKE_PORTAL_DEVICE', 'REVOKE_ALL_PORTAL_DEVICES',
            'RESTORE_PORTAL_DEVICE', 'APPROVE_CUSTOMER_EDIT',
            'SET_CREDIT_LIMIT',
        ],
    },
    system: {
        label: 'সিস্টেম',
        actions: [
            'UPDATE_SETTINGS', 'UPDATE_AI_CONFIG',
            'UPDATE_COMMISSION_SETTINGS',
        ],
    },
};

// ============================================================
// GET SETTINGS
// GET /api/admin/settings
// ============================================================

const getSettings = async (req, res) => {
    try {
        const result = await query(
            'SELECT id, key, value, description FROM system_settings WHERE tenant_id = $1 ORDER BY key',
            [req.tenantId]
        );

        // সংবেদনশীল keys মাস্ক করো (আপাতত tenant-level system_settings-এ
        // কোনো sensitive key নেই — sms/email gateway platform_settings-এ সরানো
        // হয়েছে — তবু ভবিষ্যতের জন্য মাস্কিং লজিকটা রাখা হলো)
        const MASKED_KEYS = [];
        const flat = result.rows.map(s => ({
            ...s,
            value: MASKED_KEYS.includes(s.key) && s.value
                ? s.value.slice(0, 4) + '****'
                : s.value
        }));

        // flat list → key:value map (Frontend সহজে access করতে পারবে)
        const map = {};
        flat.forEach(s => { map[s.key] = s.value; });

        // grouped — বিভাগ অনুযায়ী সাজানো
        const grouped = {};
        for (const [groupKey, group] of Object.entries(SETTINGS_GROUPS)) {
            grouped[groupKey] = {
                label: group.label,
                settings: group.keys
                    .filter(k => map[k] !== undefined)
                    .map(k => flat.find(s => s.key === k)),
            };
        }

        // ungrouped — কোনো group-এ নেই এমন settings
        const groupedKeys = Object.values(SETTINGS_GROUPS).flatMap(g => g.keys);
        const others = flat.filter(s => !groupedKeys.includes(s.key));
        if (others.length > 0) {
            grouped.others = { label: 'অন্যান্য', settings: others };
        }

        return res.status(200).json({
            success: true,
            data: flat,       // backward compatible (আগের মতোই)
            grouped,          // নতুন — বিভাগ অনুযায়ী
        });

    } catch (error) {
        logger.error('❌ Get Settings Error:', error.message);
        return res.status(500).json({ success: false, message: 'সেটিংস আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE SETTINGS
// PUT /api/admin/settings
// ============================================================

const updateSettings = async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || !Array.isArray(settings)) {
            return res.status(400).json({
                success: false,
                message: 'settings array দিন। [{key, value}]'
            });
        }

        // Encrypt করার keys (আপাতত কোনোটা নেই — sms_api_key platform_settings-এ সরানো হয়েছে)
        const ENCRYPT_KEYS = [];

        for (const setting of settings) {
            if (!setting.key || setting.value === undefined) continue;

            // ✅ Phase 1 (26 July 2026): sms_*/email_* gateway config এখন
            // Super Admin-only (platform_settings) — tenant admin এই এন্ডপয়েন্ট
            // দিয়ে সরাসরি POST করলেও চুপচাপ স্কিপ করা হলো।
            if (PLATFORM_ONLY_KEY_PREFIXES.includes(setting.key)) continue;

            let value = setting.value;

            // Sensitive keys এনক্রিপ্ট করো (masked value এলে skip)
            if (ENCRYPT_KEYS.includes(setting.key) && value && !value.includes('****')) {
                value = encrypt(value);
            }

            // original এর মতো UPDATE — নতুন key migration SQL এ insert হবে
            const updateResult = await query(
                `UPDATE system_settings
                 SET value = $1, updated_by = $2, updated_at = NOW()
                 WHERE key = $3
             AND tenant_id = $4`,
                [value, req.user.id, setting.key,
                req.tenantId]
            );

            // ✅ FIX: এই key-টা এই tenant-এর জন্য আগে কখনো insert না হয়ে থাকলে
            // (নতুন key, বা migration seed মিস) উপরের UPDATE কোনো row-ই ছোঁয় না —
            // চুপচাপ কিছুই সেভ হয় না, অথচ endpoint তবু success রিটার্ন করে, তাই
            // Admin UI-তে "সেভ হয়েছে" দেখালেও আসলে ভ্যালু কখনো বদলায়নি।
            // rowCount 0 হলে row-টা INSERT করে দাও।
            if (updateResult.rowCount === 0) {
                await query(
                    `INSERT INTO system_settings (key, value, updated_by, updated_at, tenant_id)
                     VALUES ($1, $2, $3, NOW(), $4)`,
                    [setting.key, value, req.user.id, req.tenantId]
                );
            }
        }

        // Audit log
        const safeSettings = settings.map(s => ({
            ...s,
            value: PLATFORM_ONLY_KEY_PREFIXES.includes(s.key) ? '***' : s.value
        }));

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value, tenant_id) VALUES ($1, 'UPDATE_SETTINGS', 'system_settings', $2, $3)`,
            [req.user.id, JSON.stringify(safeSettings), req.tenantId]
        );

        return res.status(200).json({
            success: true,
            message: 'সেটিংস আপডেট সফল।'
        });

    } catch (error) {
        logger.error('❌ Update Settings Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// WALLET STATUS (Tenant Admin — read-only)
// GET /api/admin/wallet?page=&limit=
// আগে এটা শুধু Super Admin দেখতে পেতো। এখন নিজের tenant-এর Admin
// নিজের ব্যালেন্স ও SMS/Email deduction হিস্টরি দেখতে পারবে —
// কিন্তু রিচার্জ করার ক্ষমতা এখানে নেই (ইচ্ছাকৃতভাবে), সেটা এখনো
// শুধু Super Admin API (/api/superadmin/tenants/:id/wallet/recharge)।
// ============================================================
const getWalletStatus = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const [wallet, history, pricing] = await Promise.all([
            walletService.getWallet(req.tenantId),
            walletService.getHistory(req.tenantId, { page: parseInt(page, 10), limit: parseInt(limit, 10) }),
            walletService.getPricing(),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                balance_paisa: Number(wallet.balance_paisa),
                updated_at:    wallet.updated_at,
                low_balance:   Number(wallet.balance_paisa) < walletService.LOW_BALANCE_THRESHOLD_PAISA,
                low_balance_threshold_paisa: walletService.LOW_BALANCE_THRESHOLD_PAISA,
                pricing:       pricing,
                transactions:  history.rows,
                pagination:    history.pagination,
            },
        });

    } catch (error) {
        logger.error('❌ Get Wallet Status Error:', error.message);
        return res.status(500).json({ success: false, message: 'ওয়ালেট তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// BILLING SUMMARY
// GET /api/admin/billing/summary
// প্ল্যান, স্ট্যাটাস (trial/active), রিনিউয়াল তারিখ, আর রোল-ভিত্তিক
// সিট + rate_locked — Billing পেজের টপ সামারির জন্য।
// ============================================================
const getBillingSummary = async (req, res) => {
    try {
        const summary = await billingService.getBillingSummary(req.tenantId);

        if (!summary) {
            return res.status(404).json({ success: false, message: 'টেন্যান্ট তথ্য পাওয়া যায়নি।' });
        }

        return res.status(200).json({ success: true, data: summary });

    } catch (error) {
        logger.error('❌ Get Billing Summary Error:', error.message);
        return res.status(500).json({ success: false, message: 'বিলিং তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// INVOICE HISTORY
// GET  /api/admin/billing/invoices?page=&limit=
// GET  /api/admin/billing/invoices/:id/pdf
// jobs/tenantInvoice.job.js প্রতি মাসের ১ তারিখে রেকর্ড বসায়।
// ============================================================
const getInvoices = async (req, res) => {
    try {
        const { page, limit } = req.query;
        const result = await billingService.listInvoices(req.tenantId, { page, limit });
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        logger.error('❌ Get Invoices Error:', error.message);
        return res.status(500).json({ success: false, message: 'ইনভয়েস তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

const downloadInvoicePdf = async (req, res) => {
    try {
        const invoice = await billingService.getInvoiceById(req.tenantId, req.params.id);
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'ইনভয়েস পাওয়া যায়নি।' });
        }
        const pdfBuffer = await billingService.generateInvoicePdfBuffer(invoice);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
        return res.status(200).send(pdfBuffer);
    } catch (error) {
        logger.error('❌ Download Invoice PDF Error:', error.message);
        return res.status(500).json({ success: false, message: 'ইনভয়েস PDF তৈরি করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SMS LOGS
// GET /api/admin/sms-logs?status=&type=&from=&to=&page=&limit=
// ============================================================
const getSmsLogs = async (req, res) => {
    try {
        const { status, type, from, to, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let conds = [], params = [], p = 0;

        if (status) { p++; conds.push(`sl.status = $${p}`);         params.push(status); }
        if (type)   { p++; conds.push(`sl.message_type = $${p}`);   params.push(type); }
        if (from)   { p++; conds.push(`sl.sent_at::date >= $${p}`); params.push(from); }
        if (to)     { p++; conds.push(`sl.sent_at::date <= $${p}`); params.push(to); }

        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const [countRes, logsRes, summaryRes] = await Promise.all([
            query(`SELECT COUNT(*) AS total FROM sms_logs sl ${where}`, params),

            query(`
                SELECT sl.id, sl.phone, sl.message_type AS type, sl.provider,
                       sl.status, sl.error_message, sl.sent_at,
                       u.name_bn AS sent_by
                FROM sms_logs sl
                LEFT JOIN users u ON u.id = sl.sent_by
                ${where}
                ORDER BY sl.sent_at DESC
                LIMIT $${p + 1} OFFSET $${p + 2}
            `, [...params, limit, offset]),

            query(`
                SELECT
                    COUNT(*)                                   AS total,
                    COUNT(*) FILTER (WHERE status='sent')      AS sent,
                    COUNT(*) FILTER (WHERE status='failed')    AS failed,
                    COUNT(*) FILTER (WHERE status='disabled')  AS disabled,
                    COUNT(*) FILTER (WHERE status='dev')       AS dev_mode
                FROM sms_logs sl ${where}
            `, params),
        ]);

        const total = parseInt(countRes.rows[0].total);

        return res.status(200).json({
            success:    true,
            summary:    summaryRes.rows[0],
            data:       logsRes.rows,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) },
        });

    } catch (error) {
        logger.error('❌ SMS Logs Error:', error.message);
        return res.status(500).json({ success: false, message: 'SMS লগ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET AUDIT LOGS
// GET /api/admin/audit-logs
// ============================================================

const getAuditLogs = async (req, res) => {
    try {
        const { action, category, user_role, from, to, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let conditions = ['al.tenant_id = $1'];
        let params = [req.tenantId];
    let paramCount = 1;

        // নির্দিষ্ট action filter
        if (action) {
            paramCount++;
            conditions.push(`al.action = $${paramCount}`);
            params.push(action);
        }

        // category filter — একটি বিভাগের সব action একসাথে
        if (category && AUDIT_CATEGORIES[category] && !action) {
            paramCount++;
            conditions.push(`al.action = ANY($${paramCount})`);
            params.push(AUDIT_CATEGORIES[category].actions);
        }

        // role filter — কোন role-এর কাজ দেখতে চাও
        if (user_role) {
            paramCount++;
            conditions.push(`u.role = $${paramCount}`);
            params.push(user_role);
        }

        if (from && to) {
            paramCount++;
            conditions.push(`al.created_at::date >= $${paramCount}`);
            params.push(from);
            paramCount++;
            conditions.push(`al.created_at::date <= $${paramCount}`);
            params.push(to);
        }

        const whereClause = conditions.length > 0
            ? 'WHERE ' + conditions.join(' AND ')
            : '';

        // মোট count (pagination-এর জন্য)
        const countResult = await query(
            `SELECT COUNT(*) AS total
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);

        paramCount++;
        params.push(limit);
        paramCount++;
        params.push(offset);

        const result = await query(
            `SELECT al.id, al.action, al.table_name, al.record_id,
                    al.old_value, al.new_value, al.ip_address, al.created_at,
                    u.name_bn AS user_name, u.role AS user_role
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             ${whereClause}
             ORDER BY al.created_at DESC
             LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
            params
        );

        return res.status(200).json({
            success: true,
            data: result.rows,
            pagination: {
                page:       parseInt(page),
                limit:      parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit),
            },
            // Frontend-এর জন্য categories list
            categories: Object.entries(AUDIT_CATEGORIES).map(([key, val]) => ({
                key,
                label:   val.label,
                actions: val.actions,
            })),
        });

    } catch (error) {
        logger.error('❌ Audit Logs Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET SYSTEM STATS
// GET /api/admin/stats
// ============================================================

const getSystemStats = async (req, res) => {
    try {
        // ── তারিখ নির্ধারণ ──────────────────────────────────────────────
        const from     = req.query.from || new Date().toISOString().split('T')[0];
        const to       = req.query.to   || from;
        const tenantId = req.tenantId;

        const [
            workers,
            customers,
            products,
            todaySales,
            pendingItems,
            attendance,
            topSR,
            expenses,
            returns,
            history,
        ] = await Promise.all([

            // ── কর্মচারী ────────────────────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'active')    AS active,
                    COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
                    COUNT(*) FILTER (WHERE status = 'suspended') AS suspended
                FROM users WHERE role = 'worker' AND tenant_id = $1
            `, [tenantId]),

            // ── কাস্টমার ─────────────────────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE is_active = true)               AS active,
                    COALESCE(SUM(current_credit), 0)                        AS total_outstanding,
                    COUNT(*) FILTER (WHERE current_credit > 0)              AS customers_with_dues
                FROM customers WHERE tenant_id = $1
            `, [tenantId]),

            // ── পণ্য ──────────────────────────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE is_active = true) AS active,
                    COALESCE(SUM(stock), 0)                   AS total_stock,
                    COUNT(*) FILTER (WHERE stock = 0 AND is_active = true) AS out_of_stock
                FROM products WHERE tenant_id = $1
            `, [tenantId]),

            // ── নির্বাচিত দিনের বিক্রয় (cash vs credit) ─────────────────
            // ✅ FIX: sales_transactions-এর আসল column নাম payment_method
            // (ENUM: cash/credit/replacement) — payment_type কখনোই ছিল না,
            // তাই এই query সবসময় "column payment_type does not exist" দিয়ে
            // fail করতো (পুরো /api/admin/stats 500 দিতো)।
            query(`
                SELECT
                    COUNT(id)                                                    AS invoice_count,
                    COALESCE(SUM(total_amount), 0)                               AS total_sales,
                    COALESCE(SUM(CASE WHEN payment_method = 'cash'   THEN total_amount ELSE 0 END), 0) AS cash_sales,
                    COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_sales,
                    COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_given,
                    COUNT(DISTINCT worker_id)                                     AS active_workers
                FROM sales_transactions
                WHERE date BETWEEN $1 AND $2 AND tenant_id = $3
            `, [from, to, tenantId]),

            // ── পেন্ডিং আইটেম ────────────────────────────────────────────
            // employees_audit-এ tenant_id নেই (user_id দিয়ে users-এর সাথে join করে scope করা হলো)
            query(`
                SELECT
                    (SELECT COUNT(*) FROM orders             WHERE status = 'pending' AND tenant_id = $1)  AS pending_orders,
                    (SELECT COUNT(*) FROM daily_settlements  WHERE status = 'pending' AND tenant_id = $1)  AS pending_settlements,
                    (SELECT COUNT(*) FROM employees_audit ea
                        JOIN users u ON u.id = ea.user_id
                        WHERE ea.status = 'pending' AND u.tenant_id = $1)                                   AS pending_edits,
                    (SELECT COUNT(*) FROM users              WHERE status = 'pending' AND tenant_id = $1)  AS pending_employees,
                    (SELECT COUNT(*) FROM customer_return_requests WHERE status = 'pending' AND tenant_id = $1) AS pending_returns
            `, [tenantId]),

            // ── হাজিরা (নির্বাচিত দিনের) ────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'present') AS present,
                    COUNT(*) FILTER (WHERE status = 'absent')  AS absent,
                    COUNT(*) FILTER (WHERE status = 'late')    AS late,
                    COUNT(*)                                    AS total_marked
                FROM attendance
                WHERE date BETWEEN $1 AND $2 AND tenant_id = $3
            `, [from, to, tenantId]),

            // ── শীর্ষ ৫ SR (নির্বাচিত দিনের বিক্রয় অনুযায়ী) ───────────
            query(`
                SELECT
                    u.name_bn                                AS worker_name,
                    u.employee_code,
                    COUNT(s.id)                              AS invoice_count,
                    COALESCE(SUM(s.total_amount), 0)         AS total_sales
                FROM sales_transactions s
                JOIN users u ON u.id = s.worker_id
                WHERE s.date BETWEEN $1 AND $2 AND s.tenant_id = $3
                GROUP BY u.id, u.name_bn, u.employee_code
                ORDER BY total_sales DESC
                LIMIT 5
            `, [from, to, tenantId]),

            // ── খরচ (নির্বাচিত দিনের) ────────────────────────────────────
            // ✅ FIX: expenses টেবিলে status column-ই নেই (approval workflow
            // DB-level এ implement হয়নি), তাই pending/approved breakdown
            // বাদ দেওয়া হলো — এই query সবসময় "column status does not exist"
            // দিয়ে fail করতো। Frontend (Dashboard.jsx) এই breakdown ব্যবহারও
            // করে না, শুধু total_expense-ই যথেষ্ট।
            query(`
                SELECT
                    COALESCE(SUM(amount), 0) AS total_expense
                FROM expenses
                WHERE date BETWEEN $1 AND $2 AND tenant_id = $3
            `, [from, to, tenantId]),

            // ── Return Request সংখ্যা ─────────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
                    COUNT(*) FILTER (WHERE status = 'approved')  AS approved,
                    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                    COALESCE(SUM(CASE WHEN status != 'rejected'
                        THEN total_return_value END), 0)         AS total_value
                FROM customer_return_requests
                WHERE created_at::date BETWEEN $1 AND $2 AND tenant_id = $3
            `, [from, to, tenantId]),

            // ── ঐতিহাসিক Snapshot (শুধু trend% এর জন্য) ──────────────────
            // "মোট বকেয়া" আর "সক্রিয় SR" তারিখ দিয়ে ফিল্টার হয় না (উপরের
            // customers/workers query সবসময় "এখন"-এর ভ্যালু দেয়), তাই আলাদা
            // করে kpiSnapshot.job.js-এর রাখা পুরনো দিনের রেকর্ড খোঁজা হচ্ছে।
            // কোনো snapshot না থাকলে (এখনো এত পুরনো ডেটা জমেনি) → NULL,
            // frontend তখন trend arrow দেখাবে না — ভুল/আন্দাজি সংখ্যা না।
            query(`
                SELECT total_outstanding, active_workers
                FROM daily_kpi_snapshots
                WHERE tenant_id = $1 AND snapshot_date = $2::date
            `, [tenantId, to]),
        ]);

        return res.status(200).json({
            success: true,
            period: { from, to },
            data: {
                workers:     workers.rows[0],
                customers:   customers.rows[0],
                products:    products.rows[0],
                sales:       todaySales.rows[0],
                today_sales: todaySales.rows[0],  // backward compat — Dashboard.jsx এর জন্য
                pending:     pendingItems.rows[0],
                attendance:  attendance.rows[0],
                top_workers: topSR.rows,
                expenses:    expenses.rows[0],
                returns:     returns.rows[0],
                // snapshot না থাকলে rows[0] undefined — দুটোই null থাকবে,
                // Dashboard.jsx-এর pctChange() সেটাকে "trend দেখাবে না" ধরে নেবে
                history: {
                    total_outstanding: history.rows[0]?.total_outstanding ?? null,
                    active_workers:    history.rows[0]?.active_workers    ?? null,
                },
            },
        });

    } catch (error) {
        logger.error('❌ System Stats Error:', error.message);
        return res.status(500).json({ success: false, message: 'পরিসংখ্যান আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET PUBLIC SETTINGS
// GET /api/settings/public
// লগইন করা যেকোনো user এই endpoint call করতে পারবে।
// শুধু public/safe keys ফেরত দেয় — sensitive keys (sms_api_key ইত্যাদি) দেয় না।
// ExpenseForm, worker dashboard ইত্যাদি এটি ব্যবহার করে।
// ============================================================

const PUBLIC_SETTINGS_KEYS = [
    'expense_daily_limit',
    'expense_transport_limit',
    'expense_food_limit',
    'expense_misc_limit',
    'attendance_checkin_time',
    'attendance_checkout_time',
    'attendance_late_threshold',
    'commission_slab',
    'max_credit_limit',
    'default_credit_limit',
];

const getPublicSettings = async (req, res) => {
    try {
        const placeholders = PUBLIC_SETTINGS_KEYS.map((_, i) => `$${i + 2}`).join(', ');

        const result = await query(
            `SELECT key, value FROM system_settings WHERE tenant_id = $1 AND key IN (${placeholders}) ORDER BY key`,
            [req.tenantId, ...PUBLIC_SETTINGS_KEYS]
        );

        // Array → Object: { expense_daily_limit: '500', ... }
        const data = {};
        for (const row of result.rows) {
            data[row.key] = row.value;
        }

        return res.status(200).json({ success: true, data });

    } catch (error) {
        logger.error('❌ Get Public Settings Error:', error.message);
        return res.status(500).json({ success: false, message: 'সেটিংস আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    getAuditLogs,
    getSystemStats,
    getSmsLogs,
    getPublicSettings,
    getWalletStatus,
    getBillingSummary,
    getInvoices,
    downloadInvoicePdf,
};
