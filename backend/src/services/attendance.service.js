const { query } = require('../config/db');
const axios     = require('axios');
const logger    = require('../config/logger');

// ============================================================
// Attendance Service
// লেট হিসাব, ছুটি যাচাই, কর্মদিবস গণনা
// ============================================================

// ============================================================
// সিস্টেম সেটিংস পড়া
// ============================================================

// ডিফল্ট সেটিংস — system_settings টেবিল না থাকলে বা খালি থাকলে
const DEFAULT_SETTINGS = {
    attendance_checkin_start: '09:00',
    attendance_checkin_end:   '10:00',
    attendance_popup_cutoff:  '14:30',
    late_deduction_interval:  '10',
    weekly_off_day:           '5',
    holidays:                 '[]'
};

const getSettings = async (tenantId) => {
    try {
        // ✅ FIX: আগে tenant_id ফিল্টার ছাড়াই সব tenant-এর row পড়ত —
        // একাধিক tenant থাকলে যেকোনোটার ভ্যালু অন্যেরটাকে ওভাররাইট করে
        // দিতে পারত (কোন row শেষে আসবে তার উপর নির্ভর করে, ORDER BY ছাড়া)।
        const result = await query(
            'SELECT key, value FROM system_settings WHERE tenant_id = $1',
            [tenantId]
        );
        const settings = { ...DEFAULT_SETTINGS };
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });
        return settings;
    } catch (error) {
        logger.warn('⚠️ system_settings পড়া যায়নি, ডিফল্ট ব্যবহার হচ্ছে', { err: error });
        return { ...DEFAULT_SETTINGS };
    }
};

// ============================================================
// চেক-ইন করা যাবে কিনা যাচাই
// ============================================================

const canCheckIn = async (tenantId) => {
    const settings = await getSettings(tenantId);

    const now      = new Date();
    const nowBD    = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
    const hours    = nowBD.getHours();
    const minutes  = nowBD.getMinutes();
    const nowTime  = hours * 60 + minutes; // মিনিটে

    // সেটিংস থেকে সময় পার্স
    const [startH, startM] = (settings.attendance_checkin_start || '09:00').split(':').map(Number);
    const [cutH,   cutM]   = (settings.attendance_popup_cutoff  || '14:30').split(':').map(Number);

    const startTime  = startH * 60 + startM;
    const cutoffTime = cutH   * 60 + cutM;

    if (nowTime < startTime) {
        return {
            allowed: false,
            message: `চেক-ইন সকাল ${settings.attendance_checkin_start} থেকে শুরু হবে।`
        };
    }

    if (nowTime > cutoffTime) {
        return {
            allowed: false,
            message: `চেক-ইনের সময় শেষ। দুপুর ${settings.attendance_popup_cutoff} পর্যন্ত চেক-ইন করা যায়।`
        };
    }

    return { allowed: true };
};

// ============================================================
// লেট মিনিট ও কর্তন হিসাব
// ============================================================

const calculateLateDeduction = async (checkInTime, basicSalary, tenantId) => {
    const settings = await getSettings(tenantId);

    const [lateH, lateM] = (settings.attendance_checkin_end || '10:00').split(':').map(Number);
    const lateThreshold  = lateH * 60 + lateM; // ১০:০০ = ৬০০ মিনিট

    const checkInBD = new Date(checkInTime.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
    const checkInMinutes = checkInBD.getHours() * 60 + checkInBD.getMinutes();

    if (checkInMinutes <= lateThreshold) {
        return { lateMinutes: 0, deduction: 0, isLate: false };
    }

    const lateMinutes     = checkInMinutes - lateThreshold;
    const deductionInterval = parseInt(settings.late_deduction_interval || '10');

    // প্রতি ১০ মিনিটে ১ ঘণ্টার বেতন কাটা
    const lateUnits = Math.floor(lateMinutes / deductionInterval);

    // ঘণ্টাপ্রতি বেতন = মূল বেতন / ২৬ কর্মদিবস / ৮ ঘণ্টা
    const hourlyRate = basicSalary / 26 / 8;
    const deduction  = Math.round(lateUnits * hourlyRate);

    return {
        lateMinutes,
        deduction,
        isLate:     true,
        lateUnits,
        hourlyRate: Math.round(hourlyRate)
    };
};

// ============================================================
// ছুটির দিন কিনা যাচাই
// ============================================================

const isHoliday = async (date, tenantId) => {
    const settings = await getSettings(tenantId);

    let holidays = [];
    try {
        holidays = JSON.parse(settings.holidays || '[]');
    } catch {
        holidays = [];
    }

    const dateStr = typeof date === 'string'
        ? date
        : date.toISOString().split('T')[0];

    return holidays.includes(dateStr);
};

// ============================================================
// effective weekly off day বের করা
// userId দিলে → সেই user-এর টিমের weekly_off_day (override) থাকলে সেটা
// না থাকলে (বা userId না দিলে) → global settings থেকে নেবে
// isWeeklyOff() ও attendance settings API — দুই জায়গায়ই এই একই
// লজিক ব্যবহার করে, যাতে ক্যালেন্ডারে যা দেখায় আর চেক-ইনে যা এনফোর্স
// হয় তার মধ্যে মিসম্যাচ না হয়
// ============================================================

const getEffectiveWeeklyOffDay = async (userId = null, tenantId) => {
    const settings = await getSettings(tenantId);
    let offDay     = parseInt(settings.weekly_off_day || '5'); // global default

    // যদি userId থাকে → টিমের নিজস্ব ছুটির দিন আছে কিনা দেখো
    if (userId) {
        try {
            const { query: dbQuery } = require('../config/db');
            // ✅ FIX: এই কোডবেসে team membership হয় সরাসরি users.team_id দিয়ে —
            // team_members নামে আলাদা কোনো join table নেই (team.controller.js-এর
            // বাকি সব query একই pattern ব্যবহার করে)। আগের ভার্সন এই ভুল টেবিল
            // ধরে লেখা ছিল, তাই এই lookup প্রতিবার silently fail করে global-এ
            // fallback করত — টিম override কখনো কার্যকর হতো না।
            const teamResult = await dbQuery(
                `SELECT t.weekly_off_day
                 FROM users u
                 JOIN teams t ON t.id = u.team_id
                 WHERE u.id = $1
                   AND u.role = 'worker'
                   AND t.is_active = true
                 LIMIT 1`,
                [userId]
            );
            if (
                teamResult.rows.length > 0 &&
                teamResult.rows[0].weekly_off_day !== null &&
                teamResult.rows[0].weekly_off_day !== undefined
            ) {
                offDay = parseInt(teamResult.rows[0].weekly_off_day);
            }
        } catch (err) {
            // ✅ FIX: logger দ্বিতীয় argument-এ object চায় (যেমন { err }) —
            // string দিলে (err.message) character-by-character লগ হয়ে যায়
            logger.warn('⚠️ টিমের weekly_off_day পড়া যায়নি, global ব্যবহার হচ্ছে', { err });
        }
    }

    return offDay;
};

// ============================================================
// সাপ্তাহিক ছুটি কিনা যাচাই
// userId দিলে → সেই user-এর টিমের weekly_off_day চেক করবে
// না দিলে → global settings থেকে নেবে
// ============================================================

const isWeeklyOff = async (date, userId = null, tenantId) => {
    const offDay   = await getEffectiveWeeklyOffDay(userId, tenantId);
    const dateObj  = typeof date === 'string' ? new Date(date) : date;
    return dateObj.getDay() === offDay;
};

// ============================================================
// মাসের কর্মদিবস গণনা
// (শুক্রবার + ছুটি বাদে)
// ============================================================

const getWorkingDays = async (year, month, tenantId) => {
    const settings = await getSettings(tenantId);
    const offDay   = parseInt(settings.weekly_off_day || '5');

    let holidays = [];
    try {
        holidays = JSON.parse(settings.holidays || '[]');
    } catch {
        holidays = [];
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    let workingDays   = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const date    = new Date(year, month - 1, day);
        const dateStr = date.toISOString().split('T')[0];

        // শুক্রবার বাদ
        if (date.getDay() === offDay) continue;

        // ছুটির দিন বাদ
        if (holidays.includes(dateStr)) continue;

        workingDays++;
    }

    return workingDays;
};

// ============================================================
// চেক-আউট করা যাবে কিনা
// Settlement অনুমোদন হয়েছে কিনা যাচাই
// ============================================================

const canCheckOut = async (userId, date) => {
    const dateStr = typeof date === 'string'
        ? date
        : date.toISOString().split('T')[0];

    // Settlement অনুমোদন হয়েছে কিনা
    const settlement = await query(
        `SELECT status FROM daily_settlements
         WHERE worker_id = $1 AND settlement_date = $2`,
        [userId, dateStr]
    );

    // Settlement না থাকলে অথবা approved হলে চেক-আউট করা যাবে
    if (settlement.rows.length === 0) {
        return {
            allowed: true,
            message: 'আজকের কোনো settlement নেই।'
        };
    }

    if (settlement.rows[0].status === 'approved') {
        return { allowed: true };
    }

    if (settlement.rows[0].status === 'pending') {
        return {
            allowed:  false,
            message: 'Manager এখনো হিসাব অনুমোদন করেননি। অনুমোদনের পরে চেক-আউট করুন।'
        };
    }

    if (settlement.rows[0].status === 'disputed') {
        return {
            allowed:  false,
            message: 'মাল ঘাটতির বিষয়টি সমাধান করুন। তারপর চেক-আউট করতে পারবেন।'
        };
    }

    return { allowed: true };
};

// ============================================================
// Firebase রিয়েলটাইম আপডেট
// ============================================================

const updateFirebaseAttendance = async (userId, date, data) => {
    try {
        const firebaseUrl = process.env.FIREBASE_DATABASE_URL;
        if (!firebaseUrl) return;

        const path   = `${firebaseUrl}/live/attendance/${date}/${userId}.json`;

        await axios.put(path, {
            ...data,
            updatedAt: new Date().toISOString()
        });

        logger.info(`✅ Firebase attendance আপডেট: ${userId}`);
    } catch (error) {
        logger.error('⚠️ Firebase Update Error:', error.message);
        // Firebase error হলে main flow বন্ধ হবে না
    }
};

// ============================================================
// Firebase নোটিফিকেশন (Manager কে জানানো)
// ============================================================

const notifyManagerOnCheckIn = async (managerId, workerName, isLate, lateMinutes) => {
    try {
        const firebaseUrl = process.env.FIREBASE_DATABASE_URL;
        if (!firebaseUrl || !managerId) return;

        const path  = `${firebaseUrl}/notifications/${managerId}/checkins.json`;

        await axios.post(path, {
            workerName,
            isLate,
            lateMinutes,
            time:      new Date().toISOString(),
            message:   isLate
                ? `⚠️ ${workerName} ${lateMinutes} মিনিট দেরিতে চেক-ইন করেছে।`
                : `✅ ${workerName} চেক-ইন করেছে।`
        });
    } catch (error) {
        logger.error('⚠️ Firebase Notify Error:', error.message);
    }
};

module.exports = {
    getSettings,
    canCheckIn,
    calculateLateDeduction,
    isHoliday,
    isWeeklyOff,
    getEffectiveWeeklyOffDay,
    getWorkingDays,
    canCheckOut,
    updateFirebaseAttendance,
    notifyManagerOnCheckIn
};
