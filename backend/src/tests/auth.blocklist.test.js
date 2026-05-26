/**
 * auth.blocklist.test.js
 * ─────────────────────────────────────────────────────────────
 * Redis Blocklist + Updated Auth Middleware টেস্ট
 *
 * কভারেজ:
 *   1. parseTtlSeconds utility
 *   2. auth middleware — blocklist hit → 403 USER_BLOCKED
 *   3. auth middleware — blocklist miss → স্বাভাবিক flow
 *   4. auth middleware — token-এ status=active কিন্তু blocked
 *   5. auth middleware — payload status check (suspended/pending/archived)
 *   6. deleteAllUserSessions — suspend path
 *   7. deleteAllUserSessions — reactivate path
 * ─────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');

jest.mock('../config/redis', () => ({
    isUserBlocked:   jest.fn(),
    blockUserTokens: jest.fn(),
    unblockUser:     jest.fn(),
}));

jest.mock('../config/db', () => ({
    query: jest.fn(),
}));

const { isUserBlocked, blockUserTokens, unblockUser } = require('../config/redis');
const { query }                                        = require('../config/db');
const { auth }                                         = require('../middlewares/auth');
const { deleteAllUserSessions, parseTtlSeconds }       = require('../services/auth.service');

// ── Helpers ───────────────────────────────────────────────────
const SECRET = 'test_secret';

const makeToken = (payload) =>
    jwt.sign(payload, SECRET, { expiresIn: '15m' });

const activePayload = {
    userId:        42,
    role:          'employee',
    status:        'active',
    name_bn:       'টেস্ট ইউজার',
    name_en:       'Test User',
    manager_id:    null,
    employee_code: 'EMP001',
    phone:         '01700000000',
};

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
};

beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    process.env.JWT_ACCESS_EXPIRES = '15m';
    jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// ১. parseTtlSeconds utility
// ═══════════════════════════════════════════════════════════════

describe('parseTtlSeconds', () => {
    test.each([
        ['15m',  900],
        ['1h',   3600],
        ['7d',   604800],
        ['30s',  30],
        ['2h',   7200],
        ['',     900],
        [null,   900],
        ['bad',  900],
        ['15x',  900],
    ])('parseTtlSeconds(%s) === %i', (input, expected) => {
        expect(parseTtlSeconds(input)).toBe(expected);
    });
});

// ═══════════════════════════════════════════════════════════════
// ২. auth middleware — blocklist miss (সাধারণ flow)
// ═══════════════════════════════════════════════════════════════

describe('auth middleware — blocklist miss', () => {
    test('valid token + NOT blocked → req.user set, next() ডাকা হয়', async () => {
        isUserBlocked.mockResolvedValue(false);

        const token = makeToken(activePayload);
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        await auth(req, res, next);

        expect(isUserBlocked).toHaveBeenCalledWith(activePayload.userId);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user.id).toBe(activePayload.userId);
        expect(req.user.role).toBe('employee');
    });
});

// ═══════════════════════════════════════════════════════════════
// ৩. auth middleware — blocklist hit
// ═══════════════════════════════════════════════════════════════

describe('auth middleware — blocklist hit', () => {
    test('user blocked → 403 USER_BLOCKED, next() ডাকা হয় না', async () => {
        isUserBlocked.mockResolvedValue(true);

        const token = makeToken(activePayload);
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'USER_BLOCKED', success: false })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('মূল bug fix: token-এ status=active কিন্তু blocklist-এ আছে → block', async () => {
        // suspend করা হয়েছে কিন্তু token এখনো expire হয়নি
        // token payload: status='active', কিন্তু Redis বলছে blocked
        isUserBlocked.mockResolvedValue(true);

        const token = makeToken({ ...activePayload, status: 'active' });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'USER_BLOCKED' })
        );
        expect(next).not.toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════
// ৪. auth middleware — payload status check (blocklist miss)
// ═══════════════════════════════════════════════════════════════

describe('auth middleware — payload status (blocklist miss)', () => {
    beforeEach(() => isUserBlocked.mockResolvedValue(false));

    test('status=suspended → 403', async () => {
        const token = makeToken({ ...activePayload, status: 'suspended' });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('status=pending → 403', async () => {
        const token = makeToken({ ...activePayload, status: 'pending' });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('status=archived → 403', async () => {
        const token = makeToken({ ...activePayload, status: 'archived' });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════
// ৫. deleteAllUserSessions — suspend path
// ═══════════════════════════════════════════════════════════════

describe('deleteAllUserSessions — suspend/archive path', () => {
    beforeEach(() => {
        query.mockResolvedValue({ rowCount: 1 });
        blockUserTokens.mockResolvedValue(undefined);
    });

    test('DB DELETE + blockUserTokens(42, 900) ডাকা হয়', async () => {
        await deleteAllUserSessions(42);

        expect(query).toHaveBeenCalledWith(
            'DELETE FROM user_sessions WHERE user_id = $1',
            [42]
        );
        expect(blockUserTokens).toHaveBeenCalledWith(42, 900);
        expect(unblockUser).not.toHaveBeenCalled();
    });

    test('JWT_ACCESS_EXPIRES=1h হলে TTL=3600', async () => {
        process.env.JWT_ACCESS_EXPIRES = '1h';
        await deleteAllUserSessions(99);
        expect(blockUserTokens).toHaveBeenCalledWith(99, 3600);
    });
});

// ═══════════════════════════════════════════════════════════════
// ৬. deleteAllUserSessions — reactivate path
// ═══════════════════════════════════════════════════════════════

describe('deleteAllUserSessions — reactivate path', () => {
    beforeEach(() => {
        query.mockResolvedValue({ rowCount: 0 });
        unblockUser.mockResolvedValue(undefined);
    });

    test('reactivating=true → unblockUser ডাকা হয়, blockUserTokens নয়', async () => {
        await deleteAllUserSessions(42, { reactivating: true });

        expect(unblockUser).toHaveBeenCalledWith(42);
        expect(blockUserTokens).not.toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════
// ৭. auth middleware — token নেই বা invalid
// ═══════════════════════════════════════════════════════════════

describe('auth middleware — token errors', () => {
    test('header না পাঠালে 401', async () => {
        const req  = { headers: {} };
        const res  = mockRes();
        const next = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('expired token → 401 TOKEN_EXPIRED', async () => {
        const token = jwt.sign({ userId: 1 }, SECRET, { expiresIn: -1 });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'TOKEN_EXPIRED' })
        );
    });

    test('customer_portal token → 403 WRONG_TOKEN_TYPE', async () => {
        isUserBlocked.mockResolvedValue(false);
        const token = makeToken({ ...activePayload, type: 'customer_portal' });
        const req   = { headers: { authorization: `Bearer ${token}` } };
        const res   = mockRes();
        const next  = jest.fn();

        await auth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: 'WRONG_TOKEN_TYPE' })
        );
    });
});
