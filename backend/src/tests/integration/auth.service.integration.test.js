/**
 * auth.service.integration.test.js
 * ─────────────────────────────────────────────────────────────
 * Auth Service — Real DB Integration Test
 *
 * কী টেস্ট হচ্ছে:
 *   - saveRefreshToken DB-তে row insert করে কিনা
 *   - verifyRefreshToken valid session ও user ফেরত দেয় কিনা
 *   - deleteRefreshToken DB থেকে সরিয়ে দেয় কিনা
 *   - মেয়াদোত্তীর্ণ session reject হয় কিনা
 *   - generateAccessToken/generateRefreshToken সঠিক JWT দেয় কিনা
 *
 * ⚠️  Real DB লাগবে (user_sessions টেবিল)
 *     npm run test:integration দিয়ে চালাও
 * ─────────────────────────────────────────────────────────────
 */

const jwt    = require('jsonwebtoken');
const { query, pool } = require('../../../config/db');
const {
    generateAccessToken,
    generateRefreshToken,
    saveRefreshToken,
    verifyRefreshToken,
    deleteRefreshToken,
    cleanExpiredSessions,
} = require('../../../services/auth.service');

// ─── Test user — DB-তে যে admin আছে সেটা ব্যবহার করব ─────────

let testUser;
let testRefreshToken;

beforeAll(async () => {
    // TEST_ADMIN_EMAIL দিয়ে real user তুলি (secrets থেকে)
    const email = process.env.TEST_ADMIN_EMAIL;
    if (!email) throw new Error('TEST_ADMIN_EMAIL secret নেই');

    const result = await query(
        `SELECT id, role, status, name_bn, name_en,
                email, phone, manager_id, employee_code
         FROM users WHERE email = $1 LIMIT 1`,
        [email]
    );

    if (result.rows.length === 0) {
        throw new Error(`Test user পাওয়া যায়নি: ${email}`);
    }

    testUser = result.rows[0];
});

afterAll(async () => {
    // test-এ তৈরি session পরিষ্কার করো
    if (testRefreshToken) {
        await deleteRefreshToken(testRefreshToken).catch(() => {});
    }
    await pool.end();
});

// ─── generateAccessToken ──────────────────────────────────────

describe('generateAccessToken — JWT payload যাচাই', () => {

    test('valid JWT string ফেরত দেয়', () => {
        const token = generateAccessToken(testUser);
        expect(typeof token).toBe('string');
        expect(token.split('.').length).toBe(3); // header.payload.signature
    });

    test('payload-এ সঠিক userId ও role আছে', () => {
        const token = generateAccessToken(testUser);
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        expect(decoded.userId).toBe(testUser.id);
        expect(decoded.role).toBe(testUser.role);
    });

    test('token-এ sensitive data (basic_salary) নেই', () => {
        const token = generateAccessToken(testUser);
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        expect(decoded).not.toHaveProperty('basic_salary');
        expect(decoded).not.toHaveProperty('outstanding_dues');
    });

    test('token 15 মিনিটের মধ্যে expire হবে', () => {
        const token = generateAccessToken(testUser);
        const decoded = jwt.decode(token);
        const nowSeconds = Math.floor(Date.now() / 1000);
        const expiresIn = decoded.exp - nowSeconds;
        // ১৫ মিনিট = ৯০০ সেকেন্ড, কিছুটা tolerance রাখি
        expect(expiresIn).toBeGreaterThan(850);
        expect(expiresIn).toBeLessThanOrEqual(900);
    });
});

// ─── generateRefreshToken ─────────────────────────────────────

describe('generateRefreshToken — JWT payload যাচাই', () => {

    test('valid JWT string ফেরত দেয়', () => {
        const token = generateRefreshToken(testUser);
        expect(typeof token).toBe('string');
    });

    test('payload-এ শুধু userId আছে — role নেই', () => {
        const token = generateRefreshToken(testUser);
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        expect(decoded.userId).toBe(testUser.id);
        // refresh token-এ role থাকার দরকার নেই
        expect(decoded).not.toHaveProperty('role');
    });
});

// ─── saveRefreshToken — DB write ─────────────────────────────

describe('saveRefreshToken — DB-তে session save হয়', () => {

    test('DB-তে row insert হয়', async () => {
        testRefreshToken = generateRefreshToken(testUser);
        await saveRefreshToken(testUser.id, testRefreshToken);

        const result = await query(
            `SELECT user_id, expires_at
             FROM user_sessions
             WHERE refresh_token = $1`,
            [testRefreshToken]
        );

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].user_id).toBe(testUser.id);
    });

    test('duplicate token-এ ON CONFLICT update হয় (crash না)', async () => {
        // একই token আবার save করলে error হওয়া উচিত না
        await expect(
            saveRefreshToken(testUser.id, testRefreshToken)
        ).resolves.not.toThrow();
    });

    test('expires_at ভবিষ্যতে set হয়', async () => {
        const result = await query(
            `SELECT expires_at FROM user_sessions WHERE refresh_token = $1`,
            [testRefreshToken]
        );
        const expiresAt = new Date(result.rows[0].expires_at);
        expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
});

// ─── verifyRefreshToken — DB read + user fetch ────────────────

describe('verifyRefreshToken — Real DB session + user যাচাই', () => {

    test('valid token দিলে user object ফেরত দেয়', async () => {
        const user = await verifyRefreshToken(testRefreshToken);
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('role');
        expect(user.id).toBe(testUser.id);
    });

    test('invalid JWT string দিলে error throw করে', async () => {
        await expect(
            verifyRefreshToken('this.is.not.valid')
        ).rejects.toThrow();
    });

    test('DB-তে নেই এমন (কিন্তু valid JWT) token reject হয়', async () => {
        // Valid JWT বানাই কিন্তু DB-তে save করি না
        const ghostToken = generateRefreshToken(testUser);
        await expect(
            verifyRefreshToken(ghostToken)
        ).rejects.toThrow('Session পাওয়া যায়নি');
    });
});

// ─── deleteRefreshToken — DB delete ──────────────────────────

describe('deleteRefreshToken — DB থেকে session মুছে যায়', () => {

    test('token delete করার পর DB-তে থাকে না', async () => {
        await deleteRefreshToken(testRefreshToken);

        const result = await query(
            `SELECT id FROM user_sessions WHERE refresh_token = $1`,
            [testRefreshToken]
        );
        expect(result.rows.length).toBe(0);

        // cleanup-এ আর দরকার নেই
        testRefreshToken = null;
    });
});

// ─── cleanExpiredSessions — purge job ────────────────────────

describe('cleanExpiredSessions — মেয়াদোত্তীর্ণ session মুছে দেয়', () => {

    test('error ছাড়া চলে এবং কোনো value return করে না', async () => {
        // শুধু error না হলেই যথেষ্ট (rowCount 0 হতে পারে)
        await expect(cleanExpiredSessions()).resolves.not.toThrow();
    });

    test('expired session insert করলে clean হয়', async () => {
        // ইচ্ছাকৃতভাবে পুরনো session insert করি
        const expiredToken = generateRefreshToken(testUser);
        await query(
            `INSERT INTO user_sessions (user_id, refresh_token, expires_at)
             VALUES ($1, $2, NOW() - INTERVAL '1 hour')`,
            [testUser.id, expiredToken]
        );

        await cleanExpiredSessions();

        const result = await query(
            `SELECT id FROM user_sessions WHERE refresh_token = $1`,
            [expiredToken]
        );
        expect(result.rows.length).toBe(0);
    });
});
