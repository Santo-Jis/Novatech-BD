const { setLiveLocation, setPresence, getDB } = require('../config/firebase');

// ============================================================
// লাইভ লোকেশন আপডেট (Worker → Firebase)
// POST /api/location/update
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

        await setLiveLocation(userId, {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: accuracy || null,
            name_bn: userName,
            employee_code: employeeCode,
            role: req.user.role,
        });

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
// Manager — সব active worker-এর লোকেশন দেখো
// GET /api/location/team
// ============================================================
const getTeamLocations = async (req, res) => {
    try {
        const db = getDB();
        const snapshot = await db.ref('liveLocations').once('value');
        const data = snapshot.val() || {};

        const locations = Object.entries(data).map(([userId, loc]) => ({
            userId,
            ...loc,
        }));

        res.json({ success: true, data: locations });
    } catch (error) {
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
