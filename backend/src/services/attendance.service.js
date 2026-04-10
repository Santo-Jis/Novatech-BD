const { query } = require('../config/db');

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

const getSettings = async () => {
    try {
        const result = await query('SELECT key, value FROM system_settings');
        const settings = { ...DEFAULT_SETTINGS };
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });
        return settings;
    } catch (error) {
        console.warn('⚠️ system_settings পড়া যায়নি, ডিফল্ট ব্যবহার হচ্ছে:', error.message);
        return { ...DEFAULT_SETTINGS };
    }
};

// ============================================================
// চেক-ইন করা যাবে কিনা যাচাই
// ============================================================

const canCheckIn = async () => {
    const settings = await getSettings();

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

const calculateLateDeduction = async (checkInTime, basicSalary) => {
    const settings = await getSettings();

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

const isHoliday = async (date) => {
    const settings = await getSettings();

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
// সাপ্তাহিক ছুটি কিনা যাচাই (শুক্রবার)
// ============================================================

const isWeeklyOff = async (date) => {
    const settings  = await getSettings();
    const offDay    = parseInt(settings.weekly_off_day || '5'); // 5 = শুক্রবার
    const dateObj   = typeof date === 'string' ? new Date(date) : date;
    return dateObj.getDay() === offDay;
};

// ============================================================
// মাসের কর্মদিবস গণনা
// (শুক্রবার + ছুটি বাদে)
// ============================================================

const getWorkingDays = async (year, month) => {
    const settings = await getSettings();
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

        const axios  = require('axios');
        const path   = `${firebaseUrl}/live/attendance/${date}/${userId}.json`;

        await axios.put(path, {
            ...data,
            updatedAt: new Date().toISOString()
        });

        console.log(`✅ Firebase attendance আপডেট: ${userId}`);
    } catch (error) {
        console.error('⚠️ Firebase Update Error:', error.message);
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

        const axios = require('axios');
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
        console.error('⚠️ Firebase Notify Error:', error.message);
    }
};

module.exports = {
    getSettings,
    canCheckIn,
    calculateLateDeduction,
    isHoliday,
    isWeeklyOff,
    getWorkingDays,
    canCheckOut,
    updateFirebaseAttendance,
    notifyManagerOnCheckIn
};
