const cron      = require('node-cron');
const { query } = require('../config/db');
const {
    getWorkingDays,
    isHoliday,
    isWeeklyOff
} = require('../services/attendance.service');
const { sendPushNotification } = require('../services/fcm.service');

// ============================================================
// Attendance Bonus Background Job
// প্রতি মাসের ১ তারিখ রাত ১২টায় চলবে
// গত মাসের উপস্থিতি যাচাই করে বোনাস সেভ করবে
// ============================================================

const runMonthlyBonusJob = async (targetYear = null, targetMonth = null) => {
    // গত মাসের হিসাব
    const now          = new Date();
    const year         = targetYear  || (targetMonth === 1 ? now.getFullYear() - 1 : now.getFullYear());
    const month        = targetMonth || (now.getMonth() === 0 ? 12 : now.getMonth());

    console.log(`\n🎁 Bonus Job শুরু: ${year}-${String(month).padStart(2, '0')}`);

    try {
        // সব active worker নাও
        const workers = await query(
            `SELECT id, name_bn, basic_salary
             FROM users
             WHERE role = 'worker' AND status = 'active'`
        );

        console.log(`📊 মোট SR: ${workers.rows.length}`);

        // সেই মাসের কর্মদিবস
        const workingDays = await getWorkingDays(year, month);
        console.log(`📅 কর্মদিবস: ${workingDays}`);

        let bonusCount = 0;

        for (const worker of workers.rows) {
            try {
                // সেই মাসের উপস্থিতি
                const attendance = await query(
                    `SELECT
                        COUNT(*) AS total_days,
                        COUNT(CASE WHEN status IN ('present', 'late') THEN 1 END) AS present_days,
                        COUNT(CASE WHEN status = 'leave' AND leave_approved = true THEN 1 END) AS approved_leaves
                     FROM attendance
                     WHERE user_id = $1
                       AND EXTRACT(YEAR  FROM date) = $2
                       AND EXTRACT(MONTH FROM date) = $3`,
                    [worker.id, year, month]
                );

                const att         = attendance.rows[0];
                const presentDays = parseInt(att.present_days) + parseInt(att.approved_leaves);
                const isPerfect   = presentDays >= workingDays;

                // বোনাস হিসাব (মূল বেতনের ১০%)
                const bonusAmount = isPerfect
                    ? Math.round(parseFloat(worker.basic_salary || 0) * 0.1)
                    : 0;

                // attendance_bonus_tracking এ সেভ
                await query(
                    `INSERT INTO attendance_bonus_tracking
                     (user_id, year, month, working_days, present_days, is_perfect, bonus_amount)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (user_id, year, month) DO UPDATE SET
                         working_days  = $4,
                         present_days  = $5,
                         is_perfect    = $6,
                         bonus_amount  = $7,
                         calculated_at = NOW()`,
                    [worker.id, year, month, workingDays, presentDays, isPerfect, bonusAmount]
                );

                if (isPerfect) {
                    console.log(`✅ ${worker.name_bn}: ১০০% উপস্থিতি → বোনাস ৳${bonusAmount}`);
                    bonusCount++;

                    // ৮ মাস চেক করো
                    await checkAndPayEightMonthBonus(worker.id);
                }

            } catch (workerError) {
                console.error(`❌ ${worker.name_bn} বোনাস হিসাবে সমস্যা:`, workerError.message);
            }
        }

        console.log(`\n🎁 Bonus Job সম্পন্ন:`);
        console.log(`   ✅ বোনাস প্রাপ্য: ${bonusCount}`);

    } catch (error) {
        console.error('❌ Bonus Job Error:', error.message);
    }
};

// ============================================================
// ৮ মাসের বোনাস চেক
// ============================================================

const checkAndPayEightMonthBonus = async (userId) => {
    try {
        // গত ৮ মাসের perfect মাস গণনা
        const result = await query(
            `SELECT COUNT(*) AS perfect_count,
                    SUM(bonus_amount) AS total_bonus
             FROM (
                SELECT year, month, bonus_amount
                FROM attendance_bonus_tracking
                WHERE user_id = $1
                  AND is_perfect = true
                  AND bonus_paid = false
                ORDER BY year DESC, month DESC
                LIMIT 8
             ) AS recent`,
            [userId]
        );

        const perfectCount = parseInt(result.rows[0].perfect_count);
        const totalBonus   = parseFloat(result.rows[0].total_bonus || 0);

        // ৮ মাস পূর্ণ হলে বোনাস দেওয়া হবে
        if (perfectCount >= 8 && totalBonus > 0) {
            console.log(`🎉 ${userId}: ৮ মাস পূর্ণ! বোনাস: ৳${totalBonus}`);

            // commission টেবিলে যোগ করো
            await query(
                `INSERT INTO commission
                 (user_id, date, commission_amount, type, sales_amount, commission_rate)
                 VALUES ($1, CURRENT_DATE, $2, 'attendance_bonus', 0, 0)`,
                [userId, totalBonus]
            );

            // bonus_paid = true করো
            await query(
                `UPDATE attendance_bonus_tracking
                 SET bonus_paid = true, bonus_paid_at = NOW()
                 WHERE user_id = $1
                   AND is_perfect = true
                   AND bonus_paid = false`,
                [userId]
            );

            // Firebase নোটিফিকেশন
            try {
                const axios       = require('axios');
                const firebaseUrl = process.env.FIREBASE_DATABASE_URL;
                if (firebaseUrl) {
                    await axios.post(
                        `${firebaseUrl}/notifications/${userId}/bonus.json`,
                        {
                            type:    'attendance_bonus',
                            amount:  totalBonus,
                            message: `🎉 অভিনন্দন! ৮ মাসের উপস্থিতি বোনাস ৳${totalBonus} আপনার কমিশনে যোগ হয়েছে।`,
                            timestamp: new Date().toISOString()
                        }
                    );
                }
                // FCM Push
                sendPushNotification(userId, {
                    title: '🎉 বোনাস পেয়েছেন!',
                    body:  `৮ মাসের উপস্থিতি বোনাস ৳${totalBonus} আপনার কমিশনে যোগ হয়েছে।`,
                    type:  'bonus',
                    data:  { amount: String(totalBonus) }
                }).catch(() => {});
            } catch (fbErr) {
                console.error('⚠️ Firebase Bonus Notify Error:', fbErr.message);
            }
        }

    } catch (error) {
        console.error('❌ Eight Month Bonus Check Error:', error.message);
    }
};

// ============================================================
// Job শুরু করো
// প্রতি মাসের ১ তারিখ রাত ১২:০০ তে
// ============================================================

const startBonusJob = () => {
    console.log('⏰ Bonus Job নিবন্ধিত: প্রতি মাসের ১ তারিখ রাত ১২:০০');

    cron.schedule('0 0 1 * *', async () => {
        console.log('🔔 Monthly Bonus Job ট্রিগার হয়েছে');
        await runMonthlyBonusJob();
    }, {
        timezone: 'Asia/Dhaka'
    });
};

module.exports = { startBonusJob, runMonthlyBonusJob };
