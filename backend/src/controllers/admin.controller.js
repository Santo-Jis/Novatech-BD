const { query } = require('../config/db');
const { encrypt } = require('../config/encryption');
const smsService = require('../services/sms.service');

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
        const settings = result.rows.map(s => ({
            ...s,
            value: MASKED_KEYS.includes(s.key) && s.value
                ? s.value.slice(0, 4) + '****'
                : s.value
        }));

        return res.status(200).json({ success: true, data: settings });

    } catch (error) {
        console.error('❌ Get Settings Error:', error.message);
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
                 WHERE key = $3`,
                [value, req.user.id, setting.key]
            );
        }

        // Audit log
        const safeSettings = settings.map(s => ({
            ...s,
            value: ['sms_api_key'].includes(s.key) ? '***' : s.value
        }));

        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value)
             VALUES ($1, 'UPDATE_SETTINGS', 'system_settings', $2)`,
            [req.user.id, JSON.stringify(safeSettings)]
        );

        // SMS config cache বাতিল করো
        smsService.clearSmsConfigCache();

        return res.status(200).json({
            success: true,
            message: 'সেটিংস আপডেট সফল।'
        });

    } catch (error) {
        console.error('❌ Update Settings Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TEST SMS GATEWAY
// POST /api/admin/sms-test
// ============================================================

const testSmsGateway = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: 'phone নম্বর দিন।' });
        }

        const result = await smsService.sendSMS(
            phone,
            `NovaTechBD\nটেস্ট SMS সফল!\nSMS গেটওয়ে সঠিকভাবে কাজ করছে।\nসময়: ${new Date().toLocaleTimeString('bn-BD')}`
        );

        if (result.success) {
            return res.status(200).json({ success: true, message: 'টেস্ট SMS পাঠানো সফল।', data: result });
        }

        return res.status(502).json({ success: false, message: result.error || 'SMS গেটওয়ে সাড়া দেয়নি।' });

    } catch (error) {
        console.error('❌ SMS Test Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভার সমস্যা।' });
    }
};

// ============================================================
// GET AUDIT LOGS
// GET /api/admin/audit-logs
// ============================================================

const getAuditLogs = async (req, res) => {
    try {
        const { action, from, to, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let conditions = [];
        let params     = [];
        let paramCount = 0;

        if (action) {
            paramCount++;
            conditions.push(`al.action = $${paramCount}`);
            params.push(action);
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

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Audit Logs Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET SYSTEM STATS
// GET /api/admin/stats
// ============================================================

const getSystemStats = async (req, res) => {
    try {
        const [workers, customers, products, todaySales, pendingItems] = await Promise.all([
            // কর্মচারী সংখ্যা
            query(`SELECT
                COUNT(*) FILTER (WHERE status = 'active')   AS active,
                COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
                COUNT(*) FILTER (WHERE status = 'suspended') AS suspended
                FROM users WHERE role = 'worker'`),

            // কাস্টমার সংখ্যা
            query(`SELECT
                COUNT(*) FILTER (WHERE is_active = true) AS active,
                SUM(current_credit) AS total_outstanding
                FROM customers`),

            // পণ্য সংখ্যা
            query(`SELECT COUNT(*) FILTER (WHERE is_active = true) AS active,
                SUM(stock) AS total_stock FROM products`),

            // আজকের বিক্রয়
            query(`SELECT
                COUNT(id) AS invoice_count,
                COALESCE(SUM(total_amount), 0) AS total_sales
                FROM sales_transactions WHERE date = CURRENT_DATE`),

            // পেন্ডিং আইটেম
            query(`SELECT
                (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
                (SELECT COUNT(*) FROM daily_settlements WHERE status = 'pending') AS pending_settlements,
                (SELECT COUNT(*) FROM employees_audit WHERE status = 'pending') AS pending_edits,
                (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pending_employees`)
        ]);

        return res.status(200).json({
            success: true,
            data: {
                workers:      workers.rows[0],
                customers:    customers.rows[0],
                products:     products.rows[0],
                today_sales:  todaySales.rows[0],
                pending:      pendingItems.rows[0]
            }
        });

    } catch (error) {
        console.error('❌ System Stats Error:', error.message);
        return res.status(500).json({ success: false, message: 'পরিসংখ্যান আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    getAuditLogs,
    getSystemStats,
    testSmsGateway
};
