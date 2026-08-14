// ============================================================
// backend/src/services/geoip.service.js
//
// IP address থেকে আনুমানিক city/country বের করা — কাস্টমার পোর্টাল
// লগইন সিকিউরিটি অ্যালার্টে "কোথা থেকে লগইন হয়েছে" দেখানোর জন্য।
//
// প্রোভাইডার: ip-api.com (free tier, API key লাগে না, ৪৫ req/min)।
// এটা একটা enrichment/nice-to-have ফিচার — geolocation lookup ব্যর্থ
// হলে (rate limit, network issue, service down) কখনোই login/error
// থ্রো করবে না, শুধু city/country null রেখে দেবে। এই সার্ভিসের
// ব্যর্থতা কখনো মূল অথেনটিকেশন ফ্লো ব্লক করবে না।
// ============================================================

const axios  = require('axios');
const logger = require('../config/logger');

// প্রাইভেট/লোকাল IP-এর জন্য lookup করার কোনো মানে নেই (dev environment,
// localhost, internal network) — এগুলো স্কিপ করে দ্রুত null ফেরত দেওয়া
const isPrivateOrLocalIP = (ip) => {
    if (!ip) return true;
    const clean = ip.replace('::ffff:', ''); // IPv4-mapped IPv6 প্রিফিক্স বাদ
    if (clean === '::1' || clean === '127.0.0.1' || clean === 'localhost') return true;
    if (/^10\./.test(clean)) return true;
    if (/^192\.168\./.test(clean)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
    return false;
};

/**
 * IP address থেকে আনুমানিক city/country বের করে।
 * ব্যর্থ হলে (যেকোনো কারণে) {city: null, country: null} ফেরত দেয় —
 * কখনো throw করে না।
 *
 * @param {string} ip
 * @returns {Promise<{city: string|null, country: string|null}>}
 */
const getLocationFromIP = async (ip) => {
    if (isPrivateOrLocalIP(ip)) {
        return { city: null, country: null };
    }

    try {
        const clean = ip.replace('::ffff:', '');
        const res = await axios.get(
            `http://ip-api.com/json/${encodeURIComponent(clean)}`,
            { params: { fields: 'status,city,country' }, timeout: 3_000 }
        );
        if (res.data?.status === 'success') {
            return { city: res.data.city || null, country: res.data.country || null };
        }
        return { city: null, country: null };
    } catch (err) {
        logger.warn(`⚠️ [GeoIP] Lookup ব্যর্থ (${ip}):`, err.message);
        return { city: null, country: null };
    }
};

module.exports = { getLocationFromIP };
