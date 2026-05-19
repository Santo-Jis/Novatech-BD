const { query }              = require('../config/db');
const { uploadToCloudinary } = require('../services/employee.service');
const {
    canCheckIn,
    canCheckOut,
    calculateLateDeduction,
    isHoliday,
    isWeeklyOff,
    getWorkingDays,
    updateFirebaseAttendance,
    notifyManagerOnCheckIn,
    getSettings
} = require('../services/attendance.service');

// ============================================================
// CHECK-IN
// POST /api/attendance/checkin
// ============================================================

const checkIn = async (req, res) => {
    try {
        const userId = req.user.id;
        const today  = new Date().toISOString().split('T')[0];

        // ১. সময় যাচাই
        const timeCheck = await canCheckIn();
        if (!timeCheck.allowed) {
            return res.status(400).json({
                success: false,
                message: timeCheck.message
            });
        }

        // ২. ছুটির দিন যাচাই (টিম-ওয়াইজ সাপ্তাহিক ছুটি সহ)
        const holiday  = await isHoliday(today);
        const weeklyOff = await isWeeklyOff(today, userId);

        if (holiday || weeklyOff) {
            return res.status(400).json({
                success: false,
                message: 'আজকে ছুটির দিন। চেক-ইন করা যাবে না।'
            });
        }

        // ৩. আজকে আগে চেক-ইন হয়েছে কিনা
        const existing = await query(
            'SELECT id, check_in_time FROM attendance WHERE user_id = $1 AND date = $2',
            [userId, today]
        );

        if (existing.rows.length > 0 && existing.rows[0].check_in_time) {
            return res.status(400).json({
                success: false,
                message: 'আজকে ইতোমধ্যে চেক-ইন হয়েছে।'
            });
        }

        // ৪. Location যাচাই ও parse
        // ✅ FIX: কখনোই latitude/longitude সরাসরি SQL string-এ রাখা যাবে না।
        // parseFloat + isFinite দিয়ে validate করে parameterized ST_MakePoint ব্যবহার করো।
        const rawLat = req.body.latitude;
        const rawLng = req.body.longitude;
        const lat    = parseFloat(rawLat);
        const lng    = parseFloat(rawLng);
        const hasLocation = isFinite(lat) && isFinite(lng)
                         && lat >= -90  && lat <= 90
                         && lng >= -180 && lng <= 180;

        // ৫. সেলফি Cloudinary তে আপলোড
        let selfieUrl = null;
        if (req.file) {
            selfieUrl = await uploadToCloudinary(
                req.file.buffer,
                'checkin',
                `checkin_${userId}_${today}`
            );
        }

        // ৬. লেট হিসাব
        const checkInTime = new Date();
        const { lateMinutes, deduction, isLate } = await calculateLateDeduction(
            checkInTime,
            req.user.basic_salary || 0
        );

        // ৭. Attendance সেভ
        const status = isLate ? 'late' : 'present';

        if (existing.rows.length > 0) {
            // রেকর্ড আছে কিন্তু check_in_time নেই (absent ছিল)
            await query(
                `UPDATE attendance
                 SET check_in_time     = $1,
                     check_in_selfie   = $2,
                     check_in_location = ${hasLocation ? 'ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography' : 'NULL'},
                     status            = ${hasLocation ? '$5' : '$3'},
                     late_minutes      = ${hasLocation ? '$6' : '$4'},
                     salary_deduction  = ${hasLocation ? '$7' : '$5'},
                     updated_at        = NOW()
                 WHERE user_id = ${hasLocation ? '$8' : '$6'} AND date = ${hasLocation ? '$9' : '$7'}`,
                hasLocation
                    ? [checkInTime, selfieUrl, lng, lat, status, lateMinutes, deduction, userId, today]
                    : [checkInTime, selfieUrl,          status, lateMinutes, deduction, userId, today]
            );
        } else {
            // নতুন রেকর্ড
            await query(
                `INSERT INTO attendance
                 (user_id, date, check_in_time, check_in_selfie,
                  check_in_location, status, late_minutes, salary_deduction)
                 VALUES ($1, $2, $3, $4,
                  ${hasLocation ? 'ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography' : 'NULL'},
                  ${hasLocation ? '$7, $8, $9' : '$5, $6, $7'})`,
                hasLocation
                    ? [userId, today, checkInTime, selfieUrl, lng, lat, status, lateMinutes, deduction]
                    : [userId, today, checkInTime, selfieUrl,          status, lateMinutes, deduction]
            );
        }

        // ৮. Firebase রিয়েলটাইম আপডেট
        await updateFirebaseAttendance(userId, today, {
            name:        req.user.name_bn,
            checkInTime: checkInTime.toISOString(),
            status,
            isLate,
            lateMinutes
        });

        // ৯. Manager কে নোটিফিকেশন
        if (req.user.manager_id) {
            await notifyManagerOnCheckIn(
                req.user.manager_id,
                req.user.name_bn,
                isLate,
                lateMinutes
            );
        }

        return res.status(200).json({
            success: true,
            message: isLate
                ? `চেক-ইন সফল। ${lateMinutes} মিনিট দেরি হয়েছে।`
                : 'চেক-ইন সফল। সময়মতো এসেছেন।',
            data: {
                checkInTime: checkInTime.toISOString(),
                status,
                isLate,
                lateMinutes,
                deduction,
                selfieUrl
            }
        });

    } catch (error) {
        console.error('❌ CheckIn Error:', error.message);
        return res.status(500).json({ success: false, message: 'চেক-ইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// CHECK-OUT
// POST /api/attendance/checkout
// ============================================================

const checkOut = async (req, res) => {
    try {
        const userId = req.user.id;
        const today  = new Date().toISOString().split('T')[0];

        // ১. আজকের attendance রেকর্ড আছে কিনা
        const attendance = await query(
            'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
            [userId, today]
        );

        if (attendance.rows.length === 0 || !attendance.rows[0].check_in_time) {
            return res.status(400).json({
                success: false,
                message: 'আজকে চেক-ইন করা হয়নি।'
            });
        }

        if (attendance.rows[0].check_out_time) {
            return res.status(400).json({
                success: false,
                message: 'আজকে ইতোমধ্যে চেক-আউট হয়েছে।'
            });
        }

        // ২. Settlement অনুমোদন হয়েছে কিনা (Worker এর জন্য)
        if (req.user.role === 'worker') {
            const checkOutAllowed = await canCheckOut(userId, today);
            if (!checkOutAllowed.allowed) {
                return res.status(400).json({
                    success: false,
                    message: checkOutAllowed.message
                });
            }
        }

        // ৩. Location যাচাই ও parse
        // ✅ FIX: latitude/longitude validate করে parameterized ST_MakePoint ব্যবহার
        const rawLat = req.body.latitude;
        const rawLng = req.body.longitude;
        const lat    = parseFloat(rawLat);
        const lng    = parseFloat(rawLng);
        const hasLocation = isFinite(lat) && isFinite(lng)
                         && lat >= -90  && lat <= 90
                         && lng >= -180 && lng <= 180;

        // ৪. সেলফি আপলোড
        let selfieUrl = null;
        if (req.file) {
            selfieUrl = await uploadToCloudinary(
                req.file.buffer,
                'checkout',
                `checkout_${userId}_${today}`
            );
        }

        const checkOutTime = new Date();

        // ৫. Attendance আপডেট
        await query(
            `UPDATE attendance
             SET check_out_time     = $1,
                 check_out_selfie   = $2,
                 check_out_location = ${hasLocation ? 'ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography' : 'NULL'},
                 updated_at         = NOW()
             WHERE user_id = ${hasLocation ? '$5' : '$3'} AND date = ${hasLocation ? '$6' : '$4'}`,
            hasLocation
                ? [checkOutTime, selfieUrl, lng, lat, userId, today]
                : [checkOutTime, selfieUrl,          userId, today]
        );

        // ৬. Firebase আপডেট
        await updateFirebaseAttendance(userId, today, {
            name:         req.user.name_bn,
            checkOutTime: checkOutTime.toISOString(),
            completed:    true
        });

        return res.status(200).json({
            success: true,
            message: 'চেক-আউট সফল। আজকের কাজ শেষ।',
            data: {
                checkOutTime: checkOutTime.toISOString(),
                selfieUrl
            }
        });

    } catch (error) {
        console.error('❌ CheckOut Error:', error.message);
        return res.status(500).json({ success: false, message: 'চেক-আউটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET MY ATTENDANCE
// GET /api/attendance/my
// ============================================================

const getMyAttendance = async (req, res) => {
    try {
        const { month, year } = req.query;
        const currentYear  = year  || new Date().getFullYear();
        const currentMonth = month || new Date().getMonth() + 1;

        const result = await query(
            `SELECT date, check_in_time, check_out_time,
                    status, late_minutes, salary_deduction,
                    leave_approved
             FROM attendance
             WHERE user_id = $1
               AND EXTRACT(YEAR  FROM date) = $2
               AND EXTRACT(MONTH FROM date) = $3
             ORDER BY date DESC`,
            [req.user.id, currentYear, currentMonth]
        );

        // সারসংক্ষেপ
        const summary = {
            present:    result.rows.filter(r => r.status === 'present').length,
            late:       result.rows.filter(r => r.status === 'late').length,
            absent:     result.rows.filter(r => r.status === 'absent').length,
            leave:      result.rows.filter(r => r.status === 'leave').length,
            totalDeduction: result.rows.reduce((sum, r) => sum + parseFloat(r.salary_deduction || 0), 0)
        };

        // এই মাসে বোনাসের অগ্রগতি — crash হলেও response দাও
        let workingDays = 26; // ডিফল্ট
        try {
            workingDays = await getWorkingDays(currentYear, currentMonth);
        } catch (wdErr) {
            console.warn('⚠️ getWorkingDays error, using default 26:', wdErr.message);
        }
        const presentDays = summary.present + summary.late;

        return res.status(200).json({
            success: true,
            data: {
                attendance: result.rows,
                summary,
                bonus_progress: {
                    working_days:  workingDays,
                    present_days:  presentDays,
                    is_perfect:    presentDays >= workingDays,
                    percentage:    workingDays > 0
                        ? Math.round((presentDays / workingDays) * 100)
                        : 0
                }
            }
        });

    } catch (error) {
        console.error('❌ My Attendance Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TODAY LIVE
// GET /api/attendance/today
// ============================================================

const getTodayLive = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        let conditions = ['a.date = $1', "u.role = 'worker'", "u.status = 'active'"];
        let params     = [today];
        let paramCount = 1;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        const result = await query(
            `SELECT u.id, u.name_bn, u.employee_code, u.profile_photo,
                    a.check_in_time, a.check_out_time,
                    a.status, a.late_minutes, a.salary_deduction
             FROM users u
             LEFT JOIN attendance a ON u.id = a.user_id AND a.date = $1
             WHERE ${conditions.join(' AND ')}
             ORDER BY a.check_in_time ASC NULLS LAST`,
            params
        );

        const summary = {
            total:    result.rows.length,
            present:  result.rows.filter(r => r.check_in_time).length,
            absent:   result.rows.filter(r => !r.check_in_time).length,
            checkedOut: result.rows.filter(r => r.check_out_time).length
        };

        return res.status(200).json({
            success: true,
            data: { workers: result.rows, summary, date: today }
        });

    } catch (error) {
        console.error('❌ Today Live Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TEAM ATTENDANCE
// GET /api/attendance/team
// ============================================================

const getTeamAttendance = async (req, res) => {
    try {
        const { from, to, worker_id } = req.query;
        const fromDate = from || new Date().toISOString().split('T')[0];
        const toDate   = to   || fromDate;

        let conditions = ['a.date BETWEEN $1 AND $2', "u.status = 'active'"];
        let params     = [fromDate, toDate];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        if (worker_id) {
            paramCount++;
            conditions.push(`u.id = $${paramCount}`);
            params.push(worker_id);
        }

        const result = await query(
            `SELECT u.name_bn, u.employee_code,
                    a.date, a.check_in_time, a.check_out_time,
                    a.status, a.late_minutes, a.salary_deduction
             FROM attendance a
             JOIN users u ON a.user_id = u.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY a.date DESC, u.name_bn ASC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ Team Attendance Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ALL ATTENDANCE (Admin)
// GET /api/attendance/all
// ============================================================

const getAllAttendance = async (req, res) => {
    try {
        const { from, to, worker_id, status } = req.query;
        const fromDate = from || new Date().toISOString().split('T')[0];
        const toDate   = to   || fromDate;

        let conditions = ['a.date BETWEEN $1 AND $2'];
        let params     = [fromDate, toDate];
        let paramCount = 2;

        if (worker_id) {
            paramCount++;
            conditions.push(`a.user_id = $${paramCount}`);
            params.push(worker_id);
        }

        if (status) {
            paramCount++;
            conditions.push(`a.status = $${paramCount}`);
            params.push(status);
        }

        const result = await query(
            `SELECT u.name_bn, u.employee_code, u.role,
                    a.date, a.check_in_time, a.check_out_time,
                    a.status, a.late_minutes, a.salary_deduction
             FROM attendance a
             JOIN users u ON a.user_id = u.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY a.date DESC`,
            params
        );

        return res.status(200).json({ success: true, data: result.rows });

    } catch (error) {
        console.error('❌ All Attendance Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MONTHLY REPORT
// GET /api/attendance/monthly
// ============================================================

const getMonthlyReport = async (req, res) => {
    try {
        const { month, year } = req.query;
        const currentYear  = year  || new Date().getFullYear();
        const currentMonth = month || new Date().getMonth() + 1;

        let conditions = [
            'EXTRACT(YEAR FROM a.date) = $1',
            'EXTRACT(MONTH FROM a.date) = $2',
            "u.role = 'worker'",
            "u.status = 'active'"
        ];
        let params = [currentYear, currentMonth];
        let paramCount = 2;

        if (req.teamFilter) {
            paramCount++;
            conditions.push(`u.manager_id = $${paramCount}`);
            params.push(req.teamFilter);
        }

        const result = await query(
            `SELECT u.id, u.name_bn, u.employee_code, u.basic_salary,
                    COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present_days,
                    COUNT(CASE WHEN a.status = 'late'    THEN 1 END) AS late_days,
                    COUNT(CASE WHEN a.status = 'absent'  THEN 1 END) AS absent_days,
                    COUNT(CASE WHEN a.status = 'leave'   THEN 1 END) AS leave_days,
                    SUM(a.late_minutes)      AS total_late_minutes,
                    SUM(a.salary_deduction)  AS total_deduction
             FROM users u
             LEFT JOIN attendance a ON u.id = a.user_id
                AND EXTRACT(YEAR  FROM a.date) = $1
                AND EXTRACT(MONTH FROM a.date) = $2
             WHERE ${conditions.join(' AND ')}
             GROUP BY u.id, u.name_bn, u.employee_code, u.basic_salary
             ORDER BY u.name_bn`,
            params
        );

        const workingDays = await getWorkingDays(currentYear, currentMonth);

        return res.status(200).json({
            success: true,
            data: {
                workers:      result.rows,
                working_days: workingDays,
                month:        currentMonth,
                year:         currentYear
            }
        });

    } catch (error) {
        console.error('❌ Monthly Report Error:', error.message);
        return res.status(500).json({ success: false, message: 'রিপোর্ট আনতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// GET ATTENDANCE SETTINGS (Worker-accessible)
// GET /api/attendance/settings
// ============================================================

const getAttendanceSettings = async (req, res) => {
    try {
        const settings = await getSettings();
        // holidays পার্স করে array হিসেবে দাও
        let holidays = [];
        try {
            holidays = JSON.parse(settings.holidays || '[]');
        } catch {
            holidays = [];
        }

        return res.json({
            success: true,
            data: {
                attendance_checkin_start: settings.attendance_checkin_start || '09:00',
                attendance_popup_cutoff:  settings.attendance_popup_cutoff  || '14:30',
                attendance_checkin_end:   settings.attendance_checkin_end   || '10:00',
                checkout_time:            settings.checkout_time            || '20:30',
                weekly_off_day:           parseInt(settings.weekly_off_day  || '5'),
                holidays,
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'সেটিংস আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// APPLY FOR LEAVE (SR/Worker নিজে আবেদন করবে)
// POST /api/attendance/leave/apply
// ============================================================

const applyLeave = async (req, res) => {
    try {
        const userId = req.user.id;
        const { start_date, end_date, reason, leave_type } = req.body;

        if (!start_date || !end_date || !reason) {
            return res.status(400).json({
                success: false,
                message: 'তারিখ ও কারণ আবশ্যক।'
            });
        }

        if (new Date(start_date) > new Date(end_date)) {
            return res.status(400).json({
                success: false,
                message: 'শেষ তারিখ শুরুর তারিখের আগে হতে পারবে না।'
            });
        }

        // টেবিল না থাকলে তৈরি করো
        await query(`
            CREATE TABLE IF NOT EXISTS leave_requests (
                id              SERIAL PRIMARY KEY,
                user_id         UUID NOT NULL,
                start_date      DATE    NOT NULL,
                end_date        DATE    NOT NULL,
                leave_type      VARCHAR(50) DEFAULT 'casual',
                reason          TEXT    NOT NULL,
                status          VARCHAR(20) DEFAULT 'pending',
                reviewed_by     UUID,
                reviewed_at     TIMESTAMP,
                reviewer_note   TEXT,
                created_at      TIMESTAMP DEFAULT NOW()
            )
        `);

        const result = await query(
            `INSERT INTO leave_requests (user_id, start_date, end_date, leave_type, reason)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, start_date, end_date, leave_type, reason, status, created_at`,
            [userId, start_date, end_date, leave_type || 'casual', reason]
        );

        return res.status(201).json({
            success: true,
            message: 'ছুটির আবেদন সফলভাবে জমা হয়েছে।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Apply Leave Error:', error.message);
        return res.status(500).json({ success: false, message: 'আবেদন জমা দিতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// MY LEAVE REQUESTS (নিজের আবেদনের তালিকা)
// GET /api/attendance/leave/my
// ============================================================

const getMyLeaveRequests = async (req, res) => {
    try {
        const userId = req.user.id;

        await query(`
            CREATE TABLE IF NOT EXISTS leave_requests (
                id              SERIAL PRIMARY KEY,
                user_id         UUID NOT NULL,
                start_date      DATE    NOT NULL,
                end_date        DATE    NOT NULL,
                leave_type      VARCHAR(50) DEFAULT 'casual',
                reason          TEXT    NOT NULL,
                status          VARCHAR(20) DEFAULT 'pending',
                reviewed_by     UUID,
                reviewed_at     TIMESTAMP,
                reviewer_note   TEXT,
                created_at      TIMESTAMP DEFAULT NOW()
            )
        `);

        const result = await query(
            `SELECT id, start_date, end_date, leave_type, reason,
                    status, reviewer_note, reviewed_at, created_at
             FROM leave_requests
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 30`,
            [userId]
        );

        return res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Get My Leave Requests Error:', error.message);
        return res.status(500).json({ success: false, message: 'আবেদন তালিকা আনতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// GET ALL LEAVE REQUESTS (Manager/Admin — অনুমোদনের জন্য)
// GET /api/attendance/leave/all
// ============================================================

const getAllLeaveRequests = async (req, res) => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS leave_requests (
                id              SERIAL PRIMARY KEY,
                user_id         UUID NOT NULL,
                start_date      DATE    NOT NULL,
                end_date        DATE    NOT NULL,
                leave_type      VARCHAR(50) DEFAULT 'casual',
                reason          TEXT    NOT NULL,
                status          VARCHAR(20) DEFAULT 'pending',
                reviewed_by     UUID,
                reviewed_at     TIMESTAMP,
                reviewer_note   TEXT,
                created_at      TIMESTAMP DEFAULT NOW()
            )
        `);

        const result = await query(
            `SELECT lr.id, lr.start_date, lr.end_date, lr.leave_type,
                    lr.reason, lr.status, lr.reviewer_note, lr.reviewed_at, lr.created_at,
                    u.name_bn AS employee_name, u.employee_code AS employee_id, u.role
             FROM leave_requests lr
             JOIN users u ON u.id = lr.user_id
             ORDER BY
               CASE WHEN lr.status = 'pending' THEN 0 ELSE 1 END,
               lr.created_at DESC
             LIMIT 100`
        );

        return res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Get All Leave Requests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তালিকা আনতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// REVIEW LEAVE REQUEST (Manager/Admin — অনুমোদন বা প্রত্যাখ্যান)
// PUT /api/attendance/leave/:id/review
// ============================================================

const reviewLeaveRequest = async (req, res) => {
    try {
        const reviewerId = req.user.id;
        const { id }     = req.params;
        const { status, reviewer_note } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'স্ট্যাটাস approved বা rejected হতে হবে।' });
        }

        const leaveResult = await query(
            `UPDATE leave_requests
             SET status = $1, reviewed_by = $2, reviewed_at = NOW(), reviewer_note = $3
             WHERE id = $4 AND status = 'pending'
             RETURNING *`,
            [status, reviewerId, reviewer_note || null, id]
        );

        if (leaveResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'আবেদনটি পাওয়া যায়নি অথবা ইতিমধ্যে পর্যালোচনা হয়েছে।'
            });
        }

        const leave = leaveResult.rows[0];

        // অনুমোদন হলে attendance table-এ 'leave' status সেট করো
        if (status === 'approved') {
            const start = new Date(leave.start_date);
            const end   = new Date(leave.end_date);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                await query(
                    `INSERT INTO attendance (user_id, date, status, leave_approved)
                     VALUES ($1, $2, 'leave', TRUE)
                     ON CONFLICT (user_id, date)
                     DO UPDATE SET status = 'leave', leave_approved = TRUE`,
                    [leave.user_id, dateStr]
                );
            }
        }

        return res.json({
            success: true,
            message: status === 'approved' ? 'ছুটি অনুমোদিত হয়েছে।' : 'ছুটির আবেদন প্রত্যাখ্যান করা হয়েছে।',
            data: leave
        });

    } catch (error) {
        console.error('❌ Review Leave Error:', error.message);
        return res.status(500).json({ success: false, message: 'পর্যালোচনা করতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// CORRECT ATTENDANCE (Manual Correction)
// PUT /api/attendance/correct
// Manager/Admin → SR এর ভুল check-in/out সংশোধন করবে
// Body: { user_id, date, check_in_time, check_out_time, note }
// ============================================================

const correctAttendance = async (req, res) => {
    try {
        const { user_id, date, check_in_time, check_out_time, note } = req.body;

        if (!user_id || !date) {
            return res.status(400).json({ success: false, message: 'user_id ও date দিন।' });
        }

        // Manager শুধু নিজের টিমের SR কে সংশোধন করতে পারবে
        if (req.user.role === 'manager') {
            const teamCheck = await query(
                `SELECT u.id FROM users u
                 JOIN team_members tm ON tm.worker_id = u.id
                 JOIN teams t ON tm.team_id = t.id
                 WHERE u.id = $1 AND t.manager_id = $2`,
                [user_id, req.user.id]
            );
            if (teamCheck.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'এই SR আপনার টিমে নেই।' });
            }
        }

        // বর্তমান রেকর্ড আছে কিনা চেক
        const existing = await query(
            'SELECT id FROM attendance WHERE user_id = $1 AND date = $2',
            [user_id, date]
        );

        // check_in_time থেকে late_minutes পুনর্গণনা
        let lateMinutes = 0;
        let status = 'present';
        if (check_in_time) {
            const settings = await query('SELECT check_in_start, check_in_end FROM attendance_settings LIMIT 1');
            if (settings.rows.length > 0) {
                const { check_in_end } = settings.rows[0];
                const [endH, endM] = check_in_end.split(':').map(Number);
                const inTime = new Date(check_in_time);
                const deadline = new Date(inTime);
                deadline.setHours(endH, endM, 0, 0);
                if (inTime > deadline) {
                    lateMinutes = Math.round((inTime - deadline) / 60000);
                    status = 'late';
                }
            }
        }

        let result;
        if (existing.rows.length > 0) {
            // আপডেট
            result = await query(
                `UPDATE attendance SET
                    check_in_time   = COALESCE($1, check_in_time),
                    check_out_time  = COALESCE($2, check_out_time),
                    late_minutes    = $3,
                    status          = $4,
                    correction_note = $5,
                    corrected_by    = $6,
                    corrected_at    = NOW(),
                    updated_at      = NOW()
                 WHERE user_id = $7 AND date = $8
                 RETURNING id, check_in_time, check_out_time, status`,
                [check_in_time || null, check_out_time || null, lateMinutes, status,
                 note || null, req.user.id, user_id, date]
            );
        } else {
            // নতুন রেকর্ড তৈরি
            result = await query(
                `INSERT INTO attendance
                 (user_id, date, check_in_time, check_out_time, late_minutes, status, correction_note, corrected_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id, check_in_time, check_out_time, status`,
                [user_id, date, check_in_time || null, check_out_time || null,
                 lateMinutes, status, note || null, req.user.id]
            );
        }

        // Audit log
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_value)
             VALUES ($1, 'ATTENDANCE_CORRECTION', 'attendance', $2, $3)`,
            [req.user.id, result.rows[0].id,
             JSON.stringify({ user_id, date, check_in_time, check_out_time, note })]
        );

        return res.status(200).json({
            success: true,
            message: 'হাজিরা সংশোধন সফল।',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Correct Attendance Error:', error.message);
        return res.status(500).json({ success: false, message: 'সংশোধনে সমস্যা হয়েছে।' });
    }
};


module.exports = {
    checkIn,
    checkOut,
    getMyAttendance,
    getTodayLive,
    getTeamAttendance,
    getAllAttendance,
    getMonthlyReport,
    getAttendanceSettings,
    applyLeave,
    getMyLeaveRequests,
    getAllLeaveRequests,
    reviewLeaveRequest,
    correctAttendance
};

