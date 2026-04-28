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
// শুধু logged-in user পাবে — GitHub-এ key থাকবে না
// ============================================================
const getMapsKey = (req, res) => {
    const key = process.env.GOOGLE_MAPS_KEY;
    if (!key) {
        return res.status(500).json({ success: false, message: 'Maps key configured নেই।' });
    }
    res.json({ success: true, key });
};

module.exports = { updateLocation, updatePresence, getTeamLocations, getMapsKey };
