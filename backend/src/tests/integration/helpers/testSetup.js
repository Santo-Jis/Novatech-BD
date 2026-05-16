/**
 * testSetup.js
 * ─────────────────────────────────────────────────────────────
 * Integration টেস্টের জন্য shared helper
 * Real Supabase Test DB ব্যবহার করে
 * ─────────────────────────────────────────────────────────────
 */

const request = require('supertest');

// ─── App import (server start না করে) ────────────────────────
// server.js module.exports = app করে, তাই সরাসরি import করা যায়
let app;
const getApp = () => {
    if (!app) app = require('../../src/server');
    return app;
};

// ─── Test User Credentials ────────────────────────────────────
// GitHub Secrets থেকে আসবে (নিচে দেখুন কোন Secrets বানাতে হবে)
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

    tokenCache[role] = res.body.accessToken;
    return tokenCache[role];
};

/**
 * Authenticated GET request
 */
const authGet = async (url, role = 'admin') => {
    const token = await getToken(role);
    return request(getApp())
        .get(url)
        .set('Authorization', `Bearer ${token}`);
};

/**
 * Authenticated POST request
 */
const authPost = async (url, body, role = 'admin') => {
    const token = await getToken(role);
    return request(getApp())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
};

/**
 * Authenticated PUT request
 */
const authPut = async (url, body, role = 'admin') => {
    const token = await getToken(role);
    return request(getApp())
        .put(url)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
};

/**
 * Unauthenticated request (auth test-এর জন্য)
 */
const publicPost = (url, body) =>
    request(getApp()).post(url).send(body);

const publicGet = (url) =>
    request(getApp()).get(url);

// ─── Response Validator Helpers ───────────────────────────────

/**
 * Successful response যাচাই
 */
const expectSuccess = (res, statusCode = 200) => {
    expect(res.status).toBe(statusCode);
    expect(res.body.success).toBe(true);
};

/**
 * Error response যাচাই
 */
const expectError = (res, statusCode) => {
    expect(res.status).toBe(statusCode);
    expect(res.body.success).toBe(false);
};

module.exports = {
    getApp,
    getToken,
    authGet,
    authPost,
    authPut,
    publicPost,
    publicGet,
    expectSuccess,
    expectError,
    TEST_USERS,
};
