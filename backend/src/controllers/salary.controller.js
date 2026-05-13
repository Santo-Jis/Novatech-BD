const { query, withTransaction } = require('../config/db');

// ============================================================
// GET SALARY SHEET (Admin/Accountant)
// GET /api/salary/sheet?month=&year=
// সব worker এর মাসিক বেতন হিসাব
// ============================================================

const getSalarySheet = async (req, res) => {
    try {
        const { month, year } = req.query;
        const currentYear  = parseInt(year  || new Date().getFullYear());
        const currentMonth = parseInt(month || new Date().getMonth() + 1);

        const result = await query(
            `SELECT
                u.id             AS worker_id,
                u.name_bn,
                u.employee_code,
                u.basic_salary,
                u.outstanding_dues,

                -- উপস্থিতি
                COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS present_days,
                COUNT(CASE WHEN a.status = 'absent'            THEN 1 END) AS absent_days,
                COUNT(CASE WHEN a.status = 'late'              THEN 1 END) AS late_days,
                COALESCE(SUM(a.salary_deduction), 0)                       AS attendance_deduction,

                -- কমিশন
                COALESCE(SUM(CASE WHEN c.type='daily'            THEN c.commission_amount END), 0) AS sales_commission,
                COALESCE(SUM(CASE WHEN c.type='attendance_bonus' THEN c.commission_amount END), 0) AS attendance_bonus,
                COALESCE(SUM(c.commission_amount), 0)                      AS total_commission,

                -- বেতন পরিশোধ ইতিহাস
                sp.id                         AS payment_id,
                sp.status                     AS payment_status,
                sp.net_payable                AS paid_amount,
                sp.outstanding_dues_deducted,
                sp.paid_at,
                sp.payment_reference,
                sp.payment_method,
                sp.note,
                approver.name_bn              AS approved_by_name

             FROM users u

             LEFT JOIN attendance a
                ON u.id = a.user_id
                AND EXTRACT(YEAR  FROM a.date) = $1
                AND EXTRACT(MONTH FROM a.date) = $2

             LEFT JOIN commission c
                ON u.id = c.user_id
                AND EXTRACT(YEAR  FROM c.date) = $1
                AND EXTRACT(MONTH FROM c.date) = $2

             LEFT JOIN salary_payments sp
                ON u.id = sp.worker_id
                AND sp.month = $2
                AND sp.year  = $1

             LEFT JOIN users approver ON sp.approved_by = approver.id

             WHERE u.role   = 'worker'
               AND u.status = 'active'

             GROUP BY
                u.id, u.name_bn, u.employee_code, u.basic_salary, u.outstanding_dues,
                sp.id, sp.status, sp.net_payable, sp.outstanding_dues_deducted,
                sp.paid_at, sp.payment_reference, sp.payment_method, sp.note, approver.name_bn

             ORDER BY u.name_bn ASC`,
            [currentYear, currentMonth]
        );

        // নেট বেতন হিসাব (পরিশোধ না হলে)
        const enriched = result.rows.map(row => {
            const basic      = parseFloat(row.basic_salary         || 0);
            const commission = parseFloat(row.total_commission      || 0);
            const attDed     = parseFloat(row.attendance_deduction  || 0);

            // ✅ FIX: paid হলে salary_payments থেকে actual deducted dues নাও,
            //         না হলে users.outstanding_dues (current) দেখাও
            const dues = row.payment_id
                ? parseFloat(row.outstanding_dues_deducted || 0)
                : parseFloat(row.outstanding_dues          || 0);

            const net = Math.max(0, basic + commission - attDed - dues);

            return {
                ...row,
                basic_salary:          basic,
                total_commission:      commission,
                attendance_deduction:  attDed,
                outstanding_dues:      dues,
                net_payable:           row.payment_id ? parseFloat(row.paid_amount || 0) : net,
                calculated_net:        net,
                is_paid:               !!row.payment_id && row.payment_status === 'paid'
            };
        });

        return res.status(200).json({
            success: true,
            data: { month: currentMonth, year: currentYear, workers: enriched }
        });

    } catch (error) {
        console.error('❌ Salary Sheet Error:', error.message);
        return res.status(500).json({ success: false, message: 'বেতন শীট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET SINGLE WORKER SALARY DETAILS
// GET /api/salary/worker/:id?month=&year=
// একজন worker এর বিস্তারিত বেতন স্লিপ
// ============================================================

const getWorkerSalaryDetail = async (req, res) => {
    try {
        const workerId = req.params.id;
        const { month, year } = req.query;
        const currentYear  = parseInt(year  || new Date().getFullYear());
        const currentMonth = parseInt(month || new Date().getMonth() + 1);

        // Worker info
        const workerRes = await query(
            `SELECT id, name_bn, employee_code, basic_salary, outstanding_dues, phone
             FROM users WHERE id = $1`,
            [workerId]
        );
        if (!workerRes.rows.length) {
            return res.status(404).json({ success: false, message: 'কর্মী পাওয়া যায়নি।' });
        }
        const worker = workerRes.rows[0];

        // উপস্থিতি বিবরণ
        const attRes = await query(
            `SELECT date, status, check_in_time, check_out_time,
                    late_minutes, salary_deduction
             FROM attendance
             WHERE user_id = $1
               AND EXTRACT(YEAR  FROM date) = $2
               AND EXTRACT(MONTH FROM date) = $3
             ORDER BY date ASC`,
            [workerId, currentYear, currentMonth]
        );

        // কমিশন বিবরণ
        const commRes = await query(
            `SELECT date, type, sales_amount, commission_rate, commission_amount,
                    paid, paid_at, payment_reference
             FROM commission
             WHERE user_id = $1
               AND EXTRACT(YEAR  FROM date) = $2
               AND EXTRACT(MONTH FROM date) = $3
             ORDER BY date ASC`,
            [workerId, currentYear, currentMonth]
        );

        // বেতন পরিশোধ রেকর্ড
        const payRes = await query(
            `SELECT sp.*, approver.name_bn AS approved_by_name
             FROM salary_payments sp
             LEFT JOIN users approver ON sp.approved_by = approver.id
             WHERE sp.worker_id = $1
               AND sp.month = $2
               AND sp.year  = $3`,
            [workerId, currentMonth, currentYear]
        );

        // হিসাব
        const att         = attRes.rows;
        const comm        = commRes.rows;
        const payment     = payRes.rows[0] || null;
        const presentDays = att.filter(a => ['present','late'].includes(a.status)).length;
        const absentDays  = att.filter(a => a.status === 'absent').length;
        const lateDays    = att.filter(a => a.status === 'late').length;
        const attDed      = att.reduce((s, a) => s + parseFloat(a.salary_deduction || 0), 0);
        const salesComm   = comm.filter(c => c.type === 'daily')
                               .reduce((s, c) => s + parseFloat(c.commission_amount || 0), 0);
        const bonus       = comm.filter(c => c.type === 'attendance_bonus')
                               .reduce((s, c) => s + parseFloat(c.commission_amount || 0), 0);
        const basic       = parseFloat(worker.basic_salary    || 0);

        // ✅ FIX: paid হলে salary_payments থেকে actual deducted dues নাও,
        //         না হলে users.outstanding_dues (current) দেখাও
        const dues        = payment
                               ? parseFloat(payment.outstanding_dues_deducted || 0)
                               : parseFloat(worker.outstanding_dues            || 0);

        const netPayable  = Math.max(0, basic + salesComm + bonus - attDed - dues);

        return res.status(200).json({
            success: true,
            data: {
                worker,
                month: currentMonth,
                year:  currentYear,
                attendance: {
                    records:      att,
                    present_days: presentDays,
                    absent_days:  absentDays,
                    late_days:    lateDays,
                    deduction:    attDed
                },
                commission: {
                    records:           comm,
                    sales_commission:  salesComm,
                    attendance_bonus:  bonus,
                    total:             salesComm + bonus
                },
                salary: {
                    basic_salary:         basic,
                    sales_commission:     salesComm,
                    attendance_bonus:     bonus,
                    attendance_deduction: attDed,
                    outstanding_dues:     dues,
                    net_payable:          netPayable
                },
                payment: payment
            }
        });

    } catch (error) {
        console.error('❌ Worker Salary Detail Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PAY SALARY
// POST /api/salary/pay
// একজন worker এর মাসিক বেতন পরিশোধ
// ============================================================

const paySalary = async (req, res) => {
    try {
        const {
            worker_id, month, year,
            payment_method = 'cash',
            payment_reference,
            note,
            deduct_dues = true
        } = req.body;

        if (!worker_id || !month || !year) {
            return res.status(400).json({
                success: false,
                message: 'worker_id, month এবং year দিন।'
            });
        }

        // ইতিমধ্যে পরিশোধ হয়েছে কিনা
        const existing = await query(
            `SELECT id FROM salary_payments
             WHERE worker_id = $1 AND month = $2 AND year = $3`,
            [worker_id, parseInt(month), parseInt(year)]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'এই মাসের বেতন ইতিমধ্যে পরিশোধ করা হয়েছে।'
            });
        }

        // Worker ও হিসাব
        const workerRes = await query(
            `SELECT name_bn, basic_salary, outstanding_dues FROM users WHERE id = $1`,
            [worker_id]
        );
        if (!workerRes.rows.length) {
            return res.status(404).json({ success: false, message: 'কর্মী পাওয়া যায়নি।' });
        }
        const worker = workerRes.rows[0];

        // উপস্থিতি কর্তন
        const attRes = await query(
            `SELECT COALESCE(SUM(salary_deduction), 0) AS total_deduction
             FROM attendance
             WHERE user_id = $1
               AND EXTRACT(YEAR  FROM date) = $2
               AND EXTRACT(MONTH FROM date) = $3`,
            [worker_id, parseInt(year), parseInt(month)]
        );

        // কমিশন
        const commRes = await query(
            `SELECT
                COALESCE(SUM(CASE WHEN type='daily'            THEN commission_amount END), 0) AS sales_commission,
                COALESCE(SUM(CASE WHEN type='attendance_bonus' THEN commission_amount END), 0) AS attendance_bonus,
                COALESCE(SUM(commission_amount), 0) AS total_commission
             FROM commission
             WHERE user_id = $1
               AND EXTRACT(YEAR  FROM date) = $2
               AND EXTRACT(MONTH FROM date) = $3`,
            [worker_id, parseInt(year), parseInt(month)]
        );

        const basic      = parseFloat(worker.basic_salary         || 0);
        const attDed     = parseFloat(attRes.rows[0]?.total_deduction || 0);
        const salesComm  = parseFloat(commRes.rows[0]?.sales_commission  || 0);
        const attBonus   = parseFloat(commRes.rows[0]?.attendance_bonus  || 0);
        const totalComm  = parseFloat(commRes.rows[0]?.total_commission  || 0);
        const dues       = deduct_dues ? parseFloat(worker.outstanding_dues || 0) : 0;
        const netPayable = Math.max(0, basic + totalComm - attDed - dues);

        // payment reference
        const ref = payment_reference?.trim() ||
            `SAL-${year}-${String(month).padStart(2,'0')}-${Date.now().toString().slice(-5)}`;

        await withTransaction(async (client) => {
            // salary_payments এ রেকর্ড সংরক্ষণ
            await client.query(
                `INSERT INTO salary_payments
                    (worker_id, month, year, basic_salary, sales_commission,
                     attendance_bonus, total_commission, attendance_deduction,
                     outstanding_dues_deducted, net_payable, payment_method,
                     payment_reference, note, approved_by, paid_at, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),'paid')`,
                [
                    worker_id, parseInt(month), parseInt(year),
                    basic, salesComm, attBonus, totalComm,
                    attDed, dues, netPayable,
                    payment_method, ref,
                    note || null, req.user.id
                ]
            );

            // commission টেবিলও paid=true করো
            await client.query(
                `UPDATE commission
                 SET paid = true, paid_at = NOW(),
                     approved_by = $1, payment_reference = $2, updated_at = NOW()
                 WHERE user_id = $3
                   AND EXTRACT(YEAR  FROM date) = $4
                   AND EXTRACT(MONTH FROM date) = $5
                   AND paid = false`,
                [req.user.id, ref, worker_id, parseInt(year), parseInt(month)]
            );

            // dues পরিশোধ হলে users টেবিল থেকে কমাও
            if (deduct_dues && dues > 0) {
                await client.query(
                    `UPDATE users
                     SET outstanding_dues = GREATEST(0, outstanding_dues - $1)
                     WHERE id = $2`,
                    [dues, worker_id]
                );
            }

            // Audit log
            await client.query(
                `INSERT INTO audit_logs (user_id, action, table_name, new_value)
                 VALUES ($1, 'PAY_SALARY', 'salary_payments', $2)`,
                [req.user.id, JSON.stringify({
                    worker_id, month, year,
                    basic, salesComm, attBonus, attDed, dues,
                    net_payable: netPayable,
                    payment_reference: ref,
                    payment_method
                })]
            );
        });

        return res.status(200).json({
            success: true,
            message: `${worker.name_bn} এর ৳${Math.round(netPayable)} বেতন পরিশোধ সফল।`,
            data: {
                net_payable:       netPayable,
                payment_reference: ref,
                paid_at:           new Date().toISOString(),
                approved_by_name:  req.user.name_bn
            }
        });

    } catch (error) {
        console.error('❌ Pay Salary Error:', error.message);
        return res.status(500).json({ success: false, message: 'বেতন পরিশোধে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY SALARY HISTORY (Worker)
// GET /api/salary/my
// SR এর নিজের বেতন ইতিহাস
// ============================================================

const getMySalaryHistory = async (req, res) => {
    try {
        const result = await query(
            `SELECT sp.*, approver.name_bn AS approved_by_name
             FROM salary_payments sp
             LEFT JOIN users approver ON sp.approved_by = approver.id
             WHERE sp.worker_id = $1
             ORDER BY sp.year DESC, sp.month DESC
             LIMIT 24`,
            [req.user.id]
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ My Salary History Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CANCEL SALARY PAYMENT (Admin only)
// DELETE /api/salary/payment/:id
// ভুল পরিশোধ বাতিল (শুধু same-day)
// ============================================================

const cancelSalaryPayment = async (req, res) => {
    try {
        const { id } = req.params;

        const payRes = await query(
            `SELECT * FROM salary_payments WHERE id = $1`,
            [id]
        );
        if (!payRes.rows.length) {
            return res.status(404).json({ success: false, message: 'রেকর্ড পাওয়া যায়নি।' });
        }

        const pay = payRes.rows[0];
        const paidAt = new Date(pay.paid_at);
        const now    = new Date();
        const hoursDiff = (now - paidAt) / (1000 * 60 * 60);

        if (hoursDiff > 24) {
            return res.status(400).json({
                success: false,
                message: '২৪ ঘণ্টার বেশি আগের পরিশোধ বাতিল করা যাবে না।'
            });
        }

        await withTransaction(async (client) => {
            // salary_payments মুছুন
            await client.query(`DELETE FROM salary_payments WHERE id = $1`, [id]);

            // commission unpaid করুন
            await client.query(
                `UPDATE commission
                 SET paid = false, paid_at = NULL,
                     approved_by = NULL, payment_reference = NULL, updated_at = NOW()
                 WHERE user_id = $1
                   AND EXTRACT(YEAR  FROM date) = $2
                   AND EXTRACT(MONTH FROM date) = $3
                   AND payment_reference = $4`,
                [pay.worker_id, pay.year, pay.month, pay.payment_reference]
            );

            // dues ফেরত দিন
            if (parseFloat(pay.outstanding_dues_deducted) > 0) {
                await client.query(
                    `UPDATE users
                     SET outstanding_dues = outstanding_dues + $1
                     WHERE id = $2`,
                    [pay.outstanding_dues_deducted, pay.worker_id]
                );
            }

            await client.query(
                `INSERT INTO audit_logs (user_id, action, table_name, new_value)
                 VALUES ($1, 'CANCEL_SALARY', 'salary_payments', $2)`,
                [req.user.id, JSON.stringify({ payment_id: id, worker_id: pay.worker_id, month: pay.month, year: pay.year })]
            );
        });

        return res.status(200).json({ success: true, message: 'বেতন পরিশোধ বাতিল করা হয়েছে।' });

    } catch (error) {
        console.error('❌ Cancel Salary Error:', error.message);
        return res.status(500).json({ success: false, message: 'বাতিল করতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getSalarySheet,
    getWorkerSalaryDetail,
    paySalary,
    getMySalaryHistory,
    cancelSalaryPayment
};
