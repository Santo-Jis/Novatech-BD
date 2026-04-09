const admin = require('firebase-admin');

// ============================================================
// Firebase Admin SDK
// Realtime Database এর সাথে সংযোগ
// ============================================================

let firebaseApp;

const initializeFirebase = () => {
    if (firebaseApp) return firebaseApp;

    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });

        console.log('✅ Firebase Admin SDK সংযোগ সফল');
    } catch (error) {
        console.error('❌ Firebase Admin SDK সংযোগ ব্যর্থ:', error.message);
    }

    return firebaseApp;
};

// Firebase Realtime Database reference
const getDB = () => {
    if (!firebaseApp) initializeFirebase();
    return admin.database();
};

// ============================================================
// REALTIME DATA HELPERS
// ============================================================

// লাইভ লোকেশন সেট করো
const setLiveLocation = async (userId, locationData) => {
    await getDB().ref(`liveLocations/${userId}`).set({
        ...locationData,
        updatedAt: Date.now()
    });
};

// কর্মী status সেট করো
const setWorkerStatus = async (userId, status) => {
    await getDB().ref(`workerStatus/${userId}`).set({
        status,
        updatedAt: Date.now()
    });
};

// Online/Offline presence সেট করো
const setPresence = async (userId, isOnline) => {
    await getDB().ref(`presence/${userId}`).set({
        online: isOnline,
        lastSeen: Date.now()
    });
};

// Notification পাঠাও
const sendNotification = async (userId, notification) => {
    await getDB().ref(`notifications/${userId}/${Date.now()}`).set({
        ...notification,
        read: false,
        createdAt: Date.now()
    });
};

// Audit log লিখো
const writeAuditLog = async (userId, action, details) => {
    await getDB().ref(`auditLogs/${Date.now()}`).set({
        userId,
        action,
        details,
        createdAt: Date.now()
    });
};

// GPS trail যোগ করো
const addGpsTrail = async (userId, location) => {
    await getDB().ref(`gpsTrail/${userId}/${Date.now()}`).set({
        ...location,
        timestamp: Date.now()
    });
};

// AI chat log লিখো
const writeAiChatLog = async (userId, message, reply) => {
    await getDB().ref(`aiChatLogs/${userId}/${Date.now()}`).set({
        message,
        reply,
        createdAt: Date.now()
    });
};

module.exports = {
    initializeFirebase,
    getDB,
    setLiveLocation,
    setWorkerStatus,
    setPresence,
    sendNotification,
    writeAuditLog,
    addGpsTrail,
    writeAiChatLog
};
