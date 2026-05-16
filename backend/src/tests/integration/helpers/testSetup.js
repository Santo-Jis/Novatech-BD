/**
 * testSetup.js
 * ─────────────────────────────────────────────────────────────
 * Integration টেস্টের জন্য shared helper
 * Real Supabase Test DB ব্যবহার করে
 *
 * Available helpers:
 *   getApp()                   → Express app instance
 *   getToken(role)             → Bearer token (cached)
 *   authGet(url, role)         → Authenticated GET
 *   authPost(url, body, role)  → Authenticated POST
 *   authPut(url, body, role)   → Authenticated PUT
 *   authPatch(url, body, role) → Authenticated PATCH  ← নতুন
 *   authDelete(url, role)      → Authenticated DELETE ← নতুন
 *   publicPost(url, body)      → Unauthenticated POST
 *   publicGet(url)             → Unauthenticated GET
 *   expectSuccess(res, code)   → 2xx + success:true assert
 *   expectError(res, code)     → 4xx/5xx + success:false assert
 * ─────────────────────────────────────────────────────────────
 */

const request = require('supertest');

// ─── App import (server start না করে) ────────────────────────
// server.js module.exports = app করে, তাই সরাসরি import করা যায়
let app;
const getApp = () => {
    if (!app) app = require('../../../server');
    return app;
};

// ─── Test User Credentials ────────────────────────────────────
// GitHub Secrets থেকে আসবে
const TEST_USERS = {
    admin: {
        identifier: process.env.TEST_ADMIN_EMAIL,
        password:   process.env.TEST_ADMIN_PASSWORD,
    },
    manager: {
        identifier: process.env.TEST_MANAGER_EMAIL,
        password:   process.env.TEST_MANAGER_PASSWORD,
    },
    worker: {
        identifier: process.env.TEST_WORKER_EMAIL,
        password:   process.env.TEST_WORKER_PASSWORD,
    },
};

// ─── Token Cache ──────────────────────────────────────────────
// প্রতিটি test-এ login না করে cache থেকে নেওয়া হবে
const tokenCache = {};

/**
 * Login করে access token নাও (cache সহ)
 * @param {'admin'|'manager'|'worker'} role
 * @returns {Promise<string>} Bearer token
 */
const getToken = async (role = 'admin') => {
    if (tokenCache[role]) return tokenCache[role];

    const creds = TEST_USERS[role];
    if (!creds?.identifier) {
        throw new Error(
            `TEST_${role.toUpperCase()}_EMAIL env variable নেই। ` +
            `GitHub Secrets-এ যোগ করুন।`
        );
    }

    const res = await request(getApp())
        .post('/api/auth/login')
        .send(creds);

    if (res.status !== 200) {
        throw new Error(
            `Test login failed for ${role}: ${res.status} — ${JSON.stringify(res.body)}`
        );
    }

    tokenCache[role] = res.body.data.accessToken;
    return tokenCache[role];
};

// ─── Cache reset (logout test-এর পরে দরকার হতে পারে) ─────────
const clearTokenCache = (role) => {
    if (role) {
        delete tokenCache[role];
    } else {
        Object.keys(tokenCache).forEach(k => delete tokenCache[k]);
    }
};

// ─── Authenticated Request Helpers ───────────────────────────

const authGet = async (url, role = 'admin') => {
    const token = await getToken(role);
    return request(getApp())
        .get(url)
        .set('Authorization', `Bearer ${token}`);
};

const authPost = async (url, body, role = 'admin') => {
    const token = await getToken(role);
    return request(getApp())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
};

const authPut = async (url, body, role = 'admin') => {
    const token = await getToken(role);
    return request(getApp())
        .put(url)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
};

// ← নতুন: PATCH request helper
const authPatch = async (url, body, role = 'admin') => {
    const token = await getToken(role);
    return request(getApp())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
};

// ← নতুন: DELETE request helper
const authDelete = async (url, role = 'admin') => {
    const token = await getToken(role);
    return request(getApp())
        .delete(url)
        .set('Authorization', `Bearer ${token}`);
};

// ─── Unauthenticated Helpers ──────────────────────────────────

const publicPost = (url, body) =>
    request(getApp()).post(url).send(body);

const publicGet = (url) =>
    request(getApp()).get(url);

// ─── Response Validator Helpers ───────────────────────────────

/**
 * Successful response যাচাই
 * @param {object} res - supertest response
 * @param {number} statusCode - expected HTTP status (default 200)
 */
const expectSuccess = (res, statusCode = 200) => {
    expect(res.status).toBe(statusCode);
    expect(res.body.success).toBe(true);
};

/**
 * Error response যাচাই
 * @param {object} res - supertest response
 * @param {number} statusCode - expected HTTP status
 */
const expectError = (res, statusCode) => {
    expect(res.status).toBe(statusCode);
    expect(res.body.success).toBe(false);
};

module.exports = {
    getApp,
    getToken,
    clearTokenCache,
    authGet,
    authPost,
    authPut,
    authPatch,      // ← নতুন
    authDelete,     // ← নতুন
    publicPost,
    publicGet,
    expectSuccess,
    expectError,
    TEST_USERS,
};
