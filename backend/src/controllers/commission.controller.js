const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// Commission হিসাব Helper
// বিক্রয় অনুযায়ী কমিশন রেট বের করা
// ============================================================

const { calculateCommission, calculateCommissionRate } = require('../services/commission.service');

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
                    c.commission_amount, c.type, c.paid,
                    c.paid_at, c.payment_reference,
                    approver.name_bn AS approved_by_name
             FROM commission c
             LEFT JOIN users approver ON c.approved_by = approver.id
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

        const basicSalary     = parseFloat(worker.rows[0]?.basic_salary      || 0);
        const totalCommission = parseFloat(summary.rows[0]?.total_commission || 0);
        const outstandingDues = parseFloat(worker.rows[0]?.outstanding_dues  || 0);
        const cashDues        = parseFloat(worker.rows[0]?.cash_dues         || 0);
        const productDues     = Math.max(0, outstandingDues - cashDues);
        const netPayable      = basicSalary + totalCommission - outstandingDues;

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
                    cash_dues:        cashDues,
                    product_dues:     productDues,
                    net_payable:      Math.max(0, netPayable)
                }
            }
        });

    } catch (error) {
        logger.error('❌ My Commission Error:', error.message);
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
        logger.error('❌ Bonus Status Error:', error.message);
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
        logger.error('❌ Team Commission Error:', error.message);
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
        logger.error('❌ All Commission Error:', error.message);
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
        logger.error('❌ Get Settings Error:', error.message);
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
                `INSERT INTO commission_settings (slab_min, slab_max, rate, effective_from, is_active, tenant_id) VALUES ($1, $2, $3, CURRENT_DATE, true, $4)`,
                [slab.slab_min, slab.slab_max || null, slab.rate, req.tenantId]
            );
        }

        // Audit log
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value, tenant_id) VALUES ($1, 'UPDATE_COMMISSION_SETTINGS', 'commission_settings', $2, $3)`,
            [req.user.id, JSON.stringify(slabs), req.tenantId]
        );

        return res.status(200).json({
            success: true,
            message: 'কমিশন স্ল্যাব আপডেট সফল।'
        });

    } catch (error) {
        logger.error('❌ Update Settings Error:', error.message);
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
        logger.error('❌ Commission Summary Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PAY COMMISSION
// POST /api/commission/pay
// Admin/Accountant একজন worker এর মাসের কমিশন পরিশোধ করবে
// ============================================================

const payCommission = async (req, res) => {
    try {
        const { worker_id, month, year, payment_reference, note } = req.body;

        if (!worker_id || !month || !year) {
            return res.status(400).json({
                success: false,
                message: 'worker_id, month এবং year দিন।'
            });
        }

        // unpaid commission আছে কিনা দেখো
        const unpaid = await query(
            `SELECT id, commission_amount FROM commission
             WHERE user_id = $1
               AND EXTRACT(YEAR  FROM date) = $2
               AND EXTRACT(MONTH FROM date) = $3
               AND paid = false`,
            [worker_id, parseInt(year), parseInt(month)]
        );

        if (unpaid.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'এই মাসে পরিশোধযোগ্য কোনো কমিশন নেই।'
            });
        }

        const totalAmount = unpaid.rows.reduce(
            (sum, r) => sum + parseFloat(r.commission_amount || 0), 0
        );

        // payment reference না দিলে auto generate করো
        const ref = payment_reference?.trim() ||
            `PAY-${year}-${String(month).padStart(2, '0')}-${Date.now().toString().slice(-5)}`;

        // সব unpaid কমিশন একসাথে আপডেট করো
        await query(
            `UPDATE commission
             SET paid              = true,
                 paid_at           = NOW(),
                 approved_by       = $1,
                 payment_reference = $2,
                 updated_at        = NOW()
             WHERE user_id = $3
               AND EXTRACT(YEAR  FROM date) = $4
               AND EXTRACT(MONTH FROM date) = $5
               AND paid = false`,
            [req.user.id, ref, worker_id, parseInt(year), parseInt(month)]
        );

        // Audit log
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value, tenant_id) VALUES ($1, 'PAY_COMMISSION', 'commission', $2, $3)`,
            [req.user.id, JSON.stringify({
                worker_id, month, year,
                total_amount: totalAmount,
                payment_reference: ref,
                entries_count: unpaid.rows.length,
                note: note || null
            })]
        );

        // Worker কে notification
        const worker = await query('SELECT name_bn FROM users WHERE id = $1', [worker_id]);

        return res.status(200).json({
            success: true,
            message: `${worker.rows[0]?.name_bn || 'Worker'} এর ৳${Math.round(totalAmount)} কমিশন পরিশোধ সফল।`,
            data: {
                entries_paid:      unpaid.rows.length,
                total_amount:      totalAmount,
                payment_reference: ref,
                paid_at:           new Date().toISOString(),
                approved_by_name:  req.user.name_bn
            }
        });

    } catch (error) {
        logger.error('❌ Pay Commission Error:', error.message);
        return res.status(500).json({ success: false, message: 'পরিশোধে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET PAYABLE COMMISSIONS (Admin)
// GET /api/commission/payable
// সব worker এর unpaid commission summary
// ============================================================

const getPayableCommissions = async (req, res) => {
    try {
        const { month, year } = req.query;
        const currentYear  = parseInt(year  || new Date().getFullYear());
        const currentMonth = parseInt(month || new Date().getMonth() + 1);

        const result = await query(
            `SELECT
                u.id          AS worker_id,
                u.name_bn,
                u.employee_code,
                u.basic_salary,
                COALESCE(SUM(c.commission_amount), 0)                              AS total_commission,
                COALESCE(SUM(CASE WHEN c.type='daily' THEN c.commission_amount END), 0) AS sales_commission,
                COALESCE(SUM(CASE WHEN c.type='attendance_bonus' THEN c.commission_amount END), 0) AS bonus,
                COUNT(c.id)   AS total_entries,
                COUNT(CASE WHEN c.paid = false THEN 1 END) AS unpaid_entries,
                COALESCE(SUM(CASE WHEN c.paid = false THEN c.commission_amount END), 0) AS unpaid_amount,
                bool_and(c.paid) AS fully_paid,
                MAX(c.paid_at)   AS last_paid_at,
                MAX(c.payment_reference) AS last_payment_ref
             FROM users u
             LEFT JOIN commission c
                ON u.id = c.user_id
                AND EXTRACT(YEAR  FROM c.date) = $1
                AND EXTRACT(MONTH FROM c.date) = $2
             WHERE u.role   = 'worker'
               AND u.status = 'active'
             GROUP BY u.id, u.name_bn, u.employee_code, u.basic_salary
             ORDER BY unpaid_amount DESC, u.name_bn ASC`,
            [currentYear, currentMonth]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('❌ Payable Commissions Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET LIVE COMMISSION — আজকের চলমান commission (real-time)
// GET /api/commission/live
// SR প্রতিটি sale-এর পরে এই endpoint poll করবে অথবা
// Firebase live/commission/{userId} node listen করবে
// ============================================================

const getLiveCommission = async (req, res) => {
    try {
        const workerId = req.user.id;
        const bdOffset = 6 * 60 * 60 * 1000;
        const today    = new Date(Date.now() + bdOffset).toISOString().split('T')[0];

        // আজকের commission DB থেকে নাও
        const commRes = await query(
            `SELECT
                sales_amount      AS total_sales,
                commission_rate   AS rate,
                commission_amount AS amount,
                paid,
                paid_at
             FROM commission
             WHERE user_id = $1 AND date = $2 AND type = 'daily'`,
            [workerId, today,
                req.tenantId]
        );

        // আজকের বিক্রয় সংখ্যা
        const saleCountRes = await query(
            `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
             FROM sales_transactions
             WHERE worker_id = $1 AND date = $2
             AND tenant_id = $3`,
            [workerId, today]
        );

        // commission slab info — SR জানবে পরের slab কত দূরে
        const slabRes = await query(
            `SELECT slab_min, slab_max, rate
             FROM commission_settings
             WHERE is_active = true
             ORDER BY slab_min ASC`
        );

        const commission   = commRes.rows[0] || null;
        const sales        = saleCountRes.rows[0];
        const totalSales   = parseFloat(sales.total) || 0;
        const currentRate  = parseFloat(commission?.rate   || 0);
        const earnedAmount = parseFloat(commission?.amount || 0);

        // পরের slab কত দূরে
        const currentSlab = slabRes.rows.find(s =>
            totalSales >= parseFloat(s.slab_min) &&
            (s.slab_max === null || totalSales <= parseFloat(s.slab_max))
        );
        const nextSlab = slabRes.rows.find(s =>
            parseFloat(s.slab_min) > totalSales
        );

        return res.status(200).json({
            success: true,
            data: {
                date:           today,
                total_sales:    totalSales,
                sale_count:     parseInt(sales.count) || 0,
                commission: {
                    rate:       currentRate,
                    amount:     earnedAmount,
                    paid:       commission?.paid || false,
                    paid_at:    commission?.paid_at || null,
                },
                current_slab: currentSlab
                    ? { min: currentSlab.slab_min, max: currentSlab.slab_max, rate: currentSlab.rate }
                    : null,
                // পরের slab-এ যেতে আর কত বিক্রি করতে হবে
                next_slab: nextSlab
                    ? {
                        min:          nextSlab.slab_min,
                        rate:         nextSlab.rate,
                        needed_sales: parseFloat(nextSlab.slab_min) - totalSales,
                        bonus_if_reached: Math.round(
                            (parseFloat(nextSlab.slab_min) * parseFloat(nextSlab.rate) / 100) - earnedAmount
                        )
                      }
                    : null, // সর্বোচ্চ slab-এ আছে
            }
        });

    } catch (error) {
        logger.error('❌ Live Commission Error:', error.message);
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
    calculateCommission,
    payCommission,
    getPayableCommissions,
    getLiveCommission
};
