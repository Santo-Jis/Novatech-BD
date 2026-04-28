const { setLiveLocation, setPresence, addGpsTrail, getDB } = require('../config/firebase');
const { query } = require('../config/db');

// ============================================================
// লাইভ লোকেশন আপডেট (Worker → Firebase)
// POST /api/location/update
// ✅ FIX: addGpsTrail() এখন call হচ্ছে — movement history সংরক্ষিত হবে
// ============================================================
const updateLocation = async (req, res) => {
    try {
        const { latitude, longitude, accuracy } = req.body;
        const userId = req.user.id;
        const userName = req.user.name_bn || req.user.name_en;
        const employeeCode = req.user.employee_code;

        if (!latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'GPS কোঅর্ডিনেট দেওয়া হয়নি।' });
        }

        const locationData = {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: accuracy || null,
            name_bn: userName,
            employee_code: employeeCode,
            role: req.user.role,
        };

        // লাইভ লোকেশন আপডেট (সবসময় overwrite)
        await setLiveLocation(userId, locationData);

        // ✅ GPS trail সংরক্ষণ (movement history)
        await addGpsTrail(userId, locationData);

        res.json({ success: true, message: 'লোকেশন আপডেট হয়েছে।' });
    } catch (error) {
        console.error('Location update error:', error);
        res.status(500).json({ success: false, message: 'লোকেশন আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// Worker অনলাইন/অফলাইন স্ট্যাটাস সেট করো
// POST /api/location/presence
// ============================================================
const updatePresence = async (req, res) => {
    try {
        const { online } = req.body;
        const userId = req.user.id;

        await setPresence(userId, !!online);

        if (!online) {
            await getDB().ref(`liveLocations/${userId}`).remove();
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Presence আপডেটে সমস্যা।' });
    }
};

// ============================================================
// Manager/Supervisor/ASM/RSM — শুধু নিজের team-এর লোকেশন দেখো
// GET /api/location/team
//
// ✅ FIX: আগে সব worker-এর লোকেশন দেখাতো — কোনো filter ছিল না।
// এখন role অনুযায়ী শুধু authorized worker-দের লোকেশন দেখাবে:
//
//   admin     → সবার লোকেশন দেখতে পারবে
//   manager   → শুধু নিজের team-এর worker (teams.manager_id = req.user.id)
//   supervisor/asm/rsm → নিজের manager_id-এর team-এর worker
//                        (users.manager_id = req.user.id)
// ============================================================
const getTeamLocations = async (req, res) => {
    try {
        const { role, id: currentUserId } = req.user;

        // ── Step 1: Role অনুযায়ী authorized worker ID-গুলো DB থেকে আনো ──
        let authorizedWorkerIds;

        if (role === 'admin') {
            // Admin সব worker দেখতে পারবে — DB query দরকার নেই
            authorizedWorkerIds = null; // null = সবাই
        } else {
            // manager / supervisor / asm / rsm:
            // users table-এ manager_id field আছে।
            // Worker-দের manager_id = তাদের উপরের manager/supervisor-এর id।
            // তাই: যেসব worker-এর manager_id = আমার id, শুধু তারাই আমার team।
            const result = await query(
                `SELECT id
                 FROM users
                 WHERE manager_id = $1
                   AND role = 'worker'
                   AND status = 'active'`,
                [currentUserId]
            );
            authorizedWorkerIds = new Set(result.rows.map(r => String(r.id)));
        }

        // ── Step 2: Firebase থেকে সব live location আনো ──
        const db = getDB();
        const snapshot = await db.ref('liveLocations').once('value');
        const data = snapshot.val() || {};

        // ── Step 3: Role অনুযায়ী filter করো ──
        const locations = Object.entries(data)
            .filter(([userId]) => authorizedWorkerIds === null || authorizedWorkerIds.has(userId))
            .map(([userId, loc]) => ({ userId, ...loc }));

        res.json({ success: true, data: locations });
    } catch (error) {
        console.error('getTeamLocations error:', error);
        res.status(500).json({ success: false, message: 'লোকেশন আনতে সমস্যা।' });
    }
};

// ============================================================
// Google Maps API Key — Frontend-এ secure ভাবে দাও
// GET /api/location/maps-key
// ============================================================
const getMapsKey = (req, res) => {
    const key = process.env.GOOGLE_MAPS_KEY;
    if (!key) {
        return res.status(500).json({ success: false, message: 'Maps key configured নেই।' });
    }
    res.json({ success: true, key });
};

// ============================================================
// GPS Trail History — একজন SR-এর নির্দিষ্ট দিনের movement
// GET /api/location/trail/:workerId?date=YYYY-MM-DD
//
// - Manager শুধু নিজের team-এর SR-এর trail দেখতে পারবে
// - Firebase থেকে সেই দিনের সব GPS point আনো
// - দূরত্ব calculate করে পাঠাও (Haversine formula)
// ============================================================
const getGpsTrail = async (req, res) => {
    try {
        const { workerId }          = req.params;
        const { date }              = req.query;   // YYYY-MM-DD
        const { role, id: currentUserId } = req.user;

        if (!workerId || !date) {
            return res.status(400).json({ success: false, message: 'workerId ও date দরকার।' });
        }

        // ── Authorization: Manager শুধু নিজের team-এর SR দেখবে ──
        if (role !== 'admin') {
            const authCheck = await query(
                `SELECT id FROM users
                 WHERE id = $1 AND manager_id = $2 AND role = 'worker'`,
                [workerId, currentUserId]
            );
            if (authCheck.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'এই SR আপনার team-এ নেই।' });
            }
        }

        // ── SR-এর নাম ও info আনো ──
        const workerInfo = await query(
            `SELECT name_bn, employee_code FROM users WHERE id = $1`,
            [workerId]
        );
        if (workerInfo.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'SR পাওয়া যায়নি।' });
        }

        // ── Firebase থেকে সেই দিনের trail আনো ──
        const db       = getDB();
        const snapshot = await db.ref(`gpsTrail/${workerId}`).once('value');
        const allTrail = snapshot.val() || {};

        // date অনুযায়ী filter (timestamp থেকে date বের করো)
        const dayStart = new Date(date + 'T00:00:00+06:00').getTime();
        const dayEnd   = new Date(date + 'T23:59:59+06:00').getTime();

        const points = Object.entries(allTrail)
            .filter(([ts]) => {
                const t = parseInt(ts);
                return t >= dayStart && t <= dayEnd;
            })
            .map(([ts, loc]) => ({ ...loc, timestamp: parseInt(ts) }))
            .sort((a, b) => a.timestamp - b.timestamp);  // সময় অনুযায়ী sort

        // ── Haversine formula দিয়ে মোট দূরত্ব calculate করো ──
        const toRad = (deg) => deg * Math.PI / 180;
        const haversine = (p1, p2) => {
            const R    = 6371000; // পৃথিবীর radius মিটারে
            const dLat = toRad(p2.latitude  - p1.latitude);
            const dLon = toRad(p2.longitude - p1.longitude);
            const a    = Math.sin(dLat/2) ** 2 +
                         Math.cos(toRad(p1.latitude)) * Math.cos(toRad(p2.latitude)) *
                         Math.sin(dLon/2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };

        let totalMeters = 0;
        for (let i = 1; i < points.length; i++) {
            totalMeters += haversine(points[i-1], points[i]);
        }

        const totalKm = (totalMeters / 1000).toFixed(2);

        res.json({
            success:  true,
            worker:   workerInfo.rows[0],
            date,
            points,
            totalPoints: points.length,
            totalKm,
        });

    } catch (error) {
        console.error('getGpsTrail error:', error);
        res.status(500).json({ success: false, message: 'Trail আনতে সমস্যা।' });
    }
};

module.exports = { updateLocation, updatePresence, getTeamLocations, getMapsKey, getGpsTrail };
