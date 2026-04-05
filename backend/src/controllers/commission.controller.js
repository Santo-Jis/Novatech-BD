const { query } = require('../config/db');

// ============================================================
// Commission হিসাব Helper
// বিক্রয় অনুযায়ী কমিশন রেট বের করা
// ============================================================

const calculateCommissionRate = async (salesAmount) => {
    const result = await query(
        `SELECT rate FROM commission_settings
         WHERE is_active = true
           AND slab_min <= $1
           AND (slab_max IS NULL OR slab_max >= $1)
         ORDER BY slab_min DESC
         LIMIT 1`,
        [salesAmount]
    );

    return result.rows[0]?.rate || 0;
};

const calculateCommission = async (salesAmount) => {
    const rate   = await calculateCommissionRate(salesAmount);
    const amount = Math.round((salesAmount * rate) / 100);
    return { rate, amount };
};

// ============================================================
// GET MY COMMISSION
// GET /api/commission/my
// ============================================================

const getMyCommission = async (req, res) => {
    try {
        const { month, year } = req.query;
        const currentYear     = parseInt(year  || new Date().getFullYear());
        const currentMonth    = parseInt(month || new Date().getMonth() + 1);

        // দৈনিক কমিশন
        const daily = await query(
            `SELECT c.date, c.sales_amount, c.commission_rate,
                    c.commission_amount, c.type, c.paid
             FROM commission c
             WHERE c.user_id = $1
               AND EXTRACT(YEAR  FROM c.date) = $2
               AND EXTRACT(MONTH FROM c.date) = $3
             ORDER BY c.date DESC`,
            [req.user.id, currentYear, currentMonth]
        );

        // মাসিক সারসংক্ষেপ
        const summary = await query(
            `SELECT
                COALESCE(SUM(sales_amount), 0)                              AS total_sales,
                COALESCE(SUM(CASE WHEN type='daily' THEN commission_amount END), 0) AS daily_commission,
                COALESCE(SUM(CASE WHEN type='attendance_bonus' THEN commission_amount END), 0) AS bonus,
                COALESCE(SUM(commission_amount), 0)                         AS total_commission
             FROM commission
             WHERE user_id = $1
               AND EXTRACT(YEAR  FROM date) = $2
               AND EXTRACT(MONTH FROM date) = $3`,
            [req.user.id, currentYear, currentMonth]
        );

        // বেতনের সাথে যোগ হওয়ার হিসাব
        const worker = await query(
            'SELECT basic_salary, outstanding_dues FROM users WHERE id = $1',
            [req.user.id]
        );

        const basicSalary       = parseFloat(worker.rows[0]?.basic_salary || 0);
        const totalCommission   = parseFloat(summary.rows[0]?.total_commission || 0);
        const outstandingDues   = parseFloat(worker.rows[0]?.outstanding_dues || 0);
        const netPayable        = basicSalary + totalCommission - outstandingDues;

        return res.status(200).json({
            success: true,
            data: {
                month:          currentMonth,
                year:           currentYear,
                daily:          daily.rows,
                summary:        summary.rows[0],
                salary_preview: {
                    basic_salary:     basicSalary,
                    total_commission: totalCommission,
                    outstanding_dues: outstandingDues,
                    net_payable:      Math.max(0, netPayable)
                }
            }
        });

    } catch (error) {
        console.error('❌ My Commission Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET BONUS STATUS
// GET /api/commission/bonus-status
// বোনাসের অগ্রগতি
// ============================================================

const getBonusStatus = async (req, res) => {
    try {
        // গত ৮ মাসের বোনাস ট্র্যাকিং
        const result = await query(
            `SELECT year, month, working_days, present_days,
                    is_perfect, bonus_amount, bonus_paid, bonus_paid_at
             FROM attendance_bonus_tracking
             WHERE user_id = $1
             ORDER BY year DESC, month DESC
             LIMIT 8`,
            [req.user.id]
        );

        const perfectMonths = result.rows.filter(r => r.is_perfect).length;
        const totalBonus    = result.rows
            .filter(r => r.is_perfect && !r.bonus_paid)
            .reduce((sum, r) => sum + parseFloat(r.bonus_amount || 0), 0);

        return res.status(200).json({
            success: true,
            data: {
                months:          result.rows,
                perfect_months:  perfectMonths,
                total_8_months:  8,
                pending_bonus:   totalBonus,
                next_bonus_in:   Math.max(0, 8 - perfectMonths)
            }
        });

    } catch (error) {
        console.error('❌ Bonus Status Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET TEAM COMMISSION
// GET /api/commission/team
// ============================================================

const getTeamCommission = async (req, res) => {
    try {
        const { month, year } = req.query;
        const currentYear     = parseInt(year  || new Date().getFullYear());
        const currentMonth    = parseInt(month || new Date().getMonth() + 1);

        let conditions = [
            "u.role = 'worker'",
            "u.status = 'active'",
            'EXTRACT(YEAR FROM c.date) = $1',
            'EXTRACT(MONTH FROM c.date) = $2'
        ];
        let params     = [currentYear, currentMonth];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        const result = await query(
            `SELECT u.id, u.name_bn, u.employee_code,
                    COALESCE(SUM(c.sales_amount), 0)     AS total_sales,
                    COALESCE(SUM(CASE WHEN c.type='daily' THEN c.commission_amount END), 0) AS commission,
                    COALESCE(SUM(CASE WHEN c.type='attendance_bonus' THEN c.commission_amount END), 0) AS bonus
             FROM users u
             LEFT JOIN commission c ON u.id = c.user_id
                AND EXTRACT(YEAR FROM c.date)  = $1
                AND EXTRACT(MONTH FROM c.date) = $2
             WHERE ${conditions.join(' AND ')}
             GROUP BY u.id, u.name_bn, u.employee_code
             ORDER BY total_sales DESC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Team Commission Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET ALL COMMISSION (Admin)
// GET /api/commission/all
// ============================================================

const getAllCommission = async (req, res) => {
    try {
        const { month, year, worker_id } = req.query;
        const currentYear                = parseInt(year  || new Date().getFullYear());
        const currentMonth               = parseInt(month || new Date().getMonth() + 1);

        let conditions = [
            'EXTRACT(YEAR FROM c.date) = $1',
            'EXTRACT(MONTH FROM c.date) = $2'
        ];
        let params     = [currentYear, currentMonth];
        let paramCount = 2;

        if (worker_id) {
            paramCount++;
            conditions.push(`c.user_id = $${paramCount}`);
            params.push(worker_id);
        }

        const result = await query(
            `SELECT c.*, u.name_bn, u.employee_code
             FROM commission c
             JOIN users u ON c.user_id = u.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY c.date DESC, u.name_bn ASC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ All Commission Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET COMMISSION SETTINGS
// GET /api/commission/settings
// ============================================================

const getSettings = async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM commission_settings
             WHERE is_active = true
             ORDER BY slab_min ASC`
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Get Settings Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE COMMISSION SETTINGS
// PUT /api/commission/settings
// Admin কমিশন স্ল্যাব পরিবর্তন করবে
// ============================================================

const updateSettings = async (req, res) => {
    try {
        const { slabs } = req.body;

        if (!slabs || !Array.isArray(slabs) || slabs.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'কমিশন স্ল্যাব তালিকা দিন।'
            });
        }

        // পুরনো স্ল্যাব নিষ্ক্রিয় করো
        await query('UPDATE commission_settings SET is_active = false');

        // নতুন স্ল্যাব যোগ করো
        for (const slab of slabs) {
            await query(
                `INSERT INTO commission_settings (slab_min, slab_max, rate, effective_from, is_active)
                 VALUES ($1, $2, $3, CURRENT_DATE, true)`,
                [slab.slab_min, slab.slab_max || null, slab.rate]
            );
        }

        // Audit log
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value)
             VALUES ($1, 'UPDATE_COMMISSION_SETTINGS', 'commission_settings', $2)`,
            [req.user.id, JSON.stringify(slabs)]
        );

        return res.status(200).json({
            success: true,
            message: 'কমিশন স্ল্যাব আপডেট সফল।'
        });

    } catch (error) {
        console.error('❌ Update Settings Error:', error.message);
        return res.status(500).json({ success: false, message: 'আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET COMMISSION SUMMARY (Admin Dashboard)
// GET /api/commission/summary
// ============================================================

const getCommissionSummary = async (req, res) => {
    try {
        const { month, year } = req.query;
        const currentYear     = parseInt(year  || new Date().getFullYear());
        const currentMonth    = parseInt(month || new Date().getMonth() + 1);

        const result = await query(
            `SELECT
                COUNT(DISTINCT user_id)              AS total_workers,
                COALESCE(SUM(sales_amount), 0)       AS total_sales,
                COALESCE(SUM(CASE WHEN type='daily' THEN commission_amount END), 0) AS total_commission,
                COALESCE(SUM(CASE WHEN type='attendance_bonus' THEN commission_amount END), 0) AS total_bonus,
                COALESCE(SUM(commission_amount), 0)  AS grand_total
             FROM commission
             WHERE EXTRACT(YEAR  FROM date) = $1
               AND EXTRACT(MONTH FROM date) = $2`,
            [currentYear, currentMonth]
        );

        return res.status(200).json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('❌ Commission Summary Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getMyCommission,
    getBonusStatus,
    getTeamCommission,
    getAllCommission,
    getSettings,
    updateSettings,
    getCommissionSummary,
    calculateCommission
};
