const { query } = require('../config/db');
const { encrypt } = require('../config/encryption');
const smsService = require('../services/sms.service');
const logger = require('../config/logger');

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
    sms: {
        label: 'SMS গেটওয়ে',
        keys: [
            'sms_api_key', 'sms_provider', 'sms_sender_id',
            'sms_device_id', 'sms_enabled', 'sms_custom_url',
        ],
    },
};

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
            'SELECT id, key, value, description FROM system_settings ORDER BY key'
        );

        // সংবেদনশীল keys মাস্ক করো
        const MASKED_KEYS = ['sms_api_key'];
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

        // Encrypt করার keys
        const ENCRYPT_KEYS = ['sms_api_key'];

        for (const setting of settings) {
            if (!setting.key || setting.value === undefined) continue;

            let value = setting.value;

            // Sensitive keys এনক্রিপ্ট করো (masked value এলে skip)
            if (ENCRYPT_KEYS.includes(setting.key) && value && !value.includes('****')) {
                value = encrypt(value);
            }

            // original এর মতো UPDATE — নতুন key migration SQL এ insert হবে
            await query(
                `UPDATE system_settings
                 SET value = $1, updated_by = $2, updated_at = NOW()
                 WHERE key = $3
             AND tenant_id = $4`,
                [value, req.user.id, setting.key,
                req.tenantId]
            );
        }

        // Audit log
        const safeSettings = settings.map(s => ({
            ...s,
            value: ['sms_api_key'].includes(s.key) ? '***' : s.value
        }));

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value, tenant_id) VALUES ($1, 'UPDATE_SETTINGS', 'system_settings', $2, $3)`,
            [req.user.id, JSON.stringify(safeSettings), req.tenantId]
        );

        // SMS config cache বাতিল করো
        smsService.clearSmsConfigCache();

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
// TEST SMS GATEWAY
// POST /api/admin/sms-test
// ============================================================

// ============================================================
// SMS STATUS
// GET /api/admin/sms-status
// ============================================================
const getSmsStatus = async (req, res) => {
    try {
        const config = await smsService.getSmsConfig();

        const REQUIRED = {
            softbarta:    ['apiKey'],
            ssl_wireless: ['apiKey', 'senderId'],
            twilio:       ['apiKey', 'senderId'],
            textbee:      ['apiKey', 'deviceId'],
            custom:       ['apiKey', 'customUrl'],
        };

        const required  = REQUIRED[config.provider] || ['apiKey'];
        const missing   = required.filter(f => !config[f]);
        const isHealthy = config.enabled && missing.length === 0;

        const todayStats = await query(`
            SELECT
                COUNT(*)                                     AS total_today,
                COUNT(*) FILTER (WHERE status = 'sent')     AS sent_today,
                COUNT(*) FILTER (WHERE status = 'failed')   AS failed_today
            FROM sms_logs WHERE sent_at::date = CURRENT_DATE
        `);

        return res.status(200).json({
            success: true,
            data: {
                provider:       config.provider,
                enabled:        config.enabled,
                healthy:        isHealthy,
                has_api_key:    !!config.apiKey,
                has_device_id:  !!config.deviceId,
                has_sender_id:  !!config.senderId,
                has_custom_url: !!config.customUrl,
                missing_fields: missing,
                today:          todayStats.rows[0],
            },
        });

    } catch (error) {
        logger.error('❌ SMS Status Error:', error.message);
        return res.status(500).json({ success: false, message: 'SMS অবস্থা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// SMS TEST (Enhanced)
// POST /api/admin/sms-test
// Body: { phone, type?, provider? }
// type     → test | otp | invoice | login
// provider → softbarta | ssl_wireless | twilio | textbee | custom
// ============================================================
const testSmsGateway = async (req, res) => {
    try {
        const { phone, type = 'test', provider } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: 'phone নম্বর দিন।' });
        }

        // provider override হলে সাময়িকভাবে cache বাতিল করে নতুন config লোড হবে
        if (provider) {
            await query(`UPDATE system_settings SET value = $1 WHERE key = 'sms_provider'`, [provider]);
            smsService.clearSmsConfigCache();
        }

        const meta = { type: `test_${type}`, sent_by: req.user.id };
        let result;

        switch (type) {
            case 'otp':
                result = await smsService.sendOTP(phone, '123456', 'টেস্ট দোকান', meta);
                break;
            case 'invoice':
                result = await smsService.sendInvoice(phone, 'INV-TEST-001', 5000, 'টেস্ট দোকান', meta);
                break;
            case 'login':
                result = await smsService.sendLoginCredentials(phone, 'SR-0001', 'Pass@123', 'পরীক্ষার্থী', meta);
                break;
            default:
                result = await smsService.sendSMS(
                    phone,
                    `ZovoriX\nটেস্ট SMS সফল!\nSMS গেটওয়ে সঠিকভাবে কাজ করছে।\nসময়: ${new Date().toLocaleTimeString('bn-BD')}`,
                    meta
                );
        }

        const config = await smsService.getSmsConfig();

        return res.status(result.success ? 200 : 502).json({
            success:       result.success,
            message:       result.success ? 'SMS পাঠানো সফল।' : 'SMS পাঠানো ব্যর্থ।',
            provider_used: config.provider,
            type_sent:     type,
            disabled:      result.disabled || false,
            dev_mode:      result.dev      || false,
            error:         result.error    || null,
        });

    } catch (error) {
        logger.error('❌ SMS Test Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভার সমস্যা।' });
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

        let conditions = [];
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
        const from = req.query.from || new Date().toISOString().split('T')[0];
        const to   = req.query.to   || from;

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
        ] = await Promise.all([

            // ── কর্মচারী ────────────────────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'active')    AS active,
                    COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
                    COUNT(*) FILTER (WHERE status = 'suspended') AS suspended
                FROM users WHERE role = 'worker'
            `),

            // ── কাস্টমার ─────────────────────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE is_active = true)               AS active,
                    COALESCE(SUM(current_credit), 0)                        AS total_outstanding,
                    COUNT(*) FILTER (WHERE current_credit > 0)              AS customers_with_dues
                FROM customers
            `),

            // ── পণ্য ──────────────────────────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE is_active = true) AS active,
                    COALESCE(SUM(stock), 0)                   AS total_stock,
                    COUNT(*) FILTER (WHERE stock = 0 AND is_active = true) AS out_of_stock
                FROM products
            `),

            // ── নির্বাচিত দিনের বিক্রয় (cash vs credit) ─────────────────
            query(`
                SELECT
                    COUNT(id)                                                    AS invoice_count,
                    COALESCE(SUM(total_amount), 0)                               AS total_sales,
                    COALESCE(SUM(CASE WHEN payment_type = 'cash'   THEN total_amount ELSE 0 END), 0) AS cash_sales,
                    COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_sales,
                    COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_given,
                    COUNT(DISTINCT worker_id)                                     AS active_workers
                FROM sales_transactions
                WHERE date BETWEEN $1 AND $2
            `, [from, to]),

            // ── পেন্ডিং আইটেম ────────────────────────────────────────────
            query(`
                SELECT
                    (SELECT COUNT(*) FROM orders             WHERE status = 'pending')  AS pending_orders,
                    (SELECT COUNT(*) FROM daily_settlements  WHERE status = 'pending')  AS pending_settlements,
                    (SELECT COUNT(*) FROM employees_audit    WHERE status = 'pending')  AS pending_edits,
                    (SELECT COUNT(*) FROM users              WHERE status = 'pending')  AS pending_employees,
                    (SELECT COUNT(*) FROM customer_return_requests WHERE status = 'pending') AS pending_returns
            `),

            // ── হাজিরা (নির্বাচিত দিনের) ────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'present') AS present,
                    COUNT(*) FILTER (WHERE status = 'absent')  AS absent,
                    COUNT(*) FILTER (WHERE status = 'late')    AS late,
                    COUNT(*)                                    AS total_marked
                FROM attendance
                WHERE date BETWEEN $1 AND $2
            `, [from, to]),

            // ── শীর্ষ ৫ SR (নির্বাচিত দিনের বিক্রয় অনুযায়ী) ───────────
            query(`
                SELECT
                    u.name_bn                                AS worker_name,
                    u.employee_code,
                    COUNT(s.id)                              AS invoice_count,
                    COALESCE(SUM(s.total_amount), 0)         AS total_sales
                FROM sales_transactions s
                JOIN users u ON u.id = s.worker_id
                WHERE s.date BETWEEN $1 AND $2
                GROUP BY u.id, u.name_bn, u.employee_code
                ORDER BY total_sales DESC
                LIMIT 5
            `, [from, to]),

            // ── খরচ (নির্বাচিত দিনের) ────────────────────────────────────
            query(`
                SELECT
                    COALESCE(SUM(amount), 0)                                            AS total_expense,
                    COALESCE(SUM(CASE WHEN status = 'pending'  THEN amount END), 0)     AS pending_expense,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN amount END), 0)     AS approved_expense,
                    COUNT(*) FILTER (WHERE status = 'pending')                          AS pending_expense_count
                FROM expenses
                WHERE date BETWEEN $1 AND $2
            `, [from, to]),

            // ── Return Request সংখ্যা ─────────────────────────────────────
            query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
                    COUNT(*) FILTER (WHERE status = 'approved')  AS approved,
                    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                    COALESCE(SUM(CASE WHEN status != 'rejected'
                        THEN total_return_value END), 0)         AS total_value
                FROM customer_return_requests
                WHERE created_at::date BETWEEN $1 AND $2
            `, [from, to]),
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
        const placeholders = PUBLIC_SETTINGS_KEYS.map((_, i) => `$${i + 1}`).join(', ');

        const result = await query(
            `SELECT key, value FROM system_settings WHERE key IN (${placeholders}) ORDER BY key`,
            PUBLIC_SETTINGS_KEYS
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
    getSmsStatus,
    testSmsGateway,
    getSmsLogs,
    getPublicSettings
};
