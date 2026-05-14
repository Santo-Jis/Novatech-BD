// ============================================================
// Firebase Notify — Shared Utility
// আগে sales, order, settlement controller-এ হুবহু একই
// function তিনবার লেখা ছিল — এখন এক জায়গায়।
//
// order.controller.js — Admin SDK (getDB) ব্যবহার করত
// sales.controller.js — axios REST API ব্যবহার করত
// settlement.controller.js — axios REST API ব্যবহার করত
//
// সব Admin SDK-তে একীভূত করা হয়েছে — বেশি নির্ভরযোগ্য,
// unauthenticated REST call-এর চেয়ে নিরাপদ।
// ============================================================

const { getDB } = require('../config/firebase');

/**
 * Firebase Realtime Database-এ data push করো।
 * @param {string} path  - DB path, e.g. 'notifications/userId/orders'
 * @param {object} data  - যা store করতে হবে
 */
const firebaseNotify = async (path, data) => {
    try {
        await getDB().ref(path).push({
            ...data,
            timestamp: Date.now(),
        });
    } catch (err) {
        // Notification failure কখনো main flow আটকাবে না
        console.error('⚠️ Firebase Notify Error:', err.message);
    }
};

module.exports = { firebaseNotify };
