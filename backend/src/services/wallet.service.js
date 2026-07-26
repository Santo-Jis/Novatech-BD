const { query, withTransaction } = require('../config/db');

/**
 * ওয়ালেট / ক্রেডিট সিস্টেম (Phase 2, 26 July 2026)
 * ------------------------------------------------------------
 * - ব্যালেন্স সবসময় পয়সায় রাখা হয় (৳১ = ১০০ পয়সা) — ভাসমান বিন্দুর
 *   (floating point) হিসাব-ভুল এড়াতে।
 * - প্রতিটা ব্যালেন্স পরিবর্তনের সাথে credit_transactions-এ একটা
 *   অপরিবর্তনীয় (immutable) ledger এন্ট্রি যায় — তাই সবসময়
 *   SUM(amount_paisa) WHERE tenant_id = X  ==  tenant_wallets.balance_paisa
 *   (এটা দিয়ে ভবিষ্যতে reconciliation/audit চালানো যাবে)।
 * - recharge()/deduct() উভয়ই `FOR UPDATE` দিয়ে row-lock করে, তাই
 *   একই সময়ে একাধিক SMS/Email পাঠালেও ব্যালেন্স রেসের কারণে ভুল হবে না।
 * ------------------------------------------------------------
 * এই ফাইলটা এখনো কোথাও থেকে call হচ্ছে না (Phase 3-এ sms.service.js/
 * email.service.js এখান থেকে deduct() কল করবে; Phase 4-এ Super Admin
 * API এখান থেকে recharge()/getHistory() কল করবে)।
 */

// ── বর্তমান ব্যালেন্স ────────────────────────────────────────────
// wallet না থাকলে (নতুন/পুরনো edge-case tenant) ০ ব্যালেন্সে বানিয়ে দেয়
const getWallet = async (tenantId) => {
    const result = await query(
        `SELECT tenant_id, balance_paisa, updated_at FROM tenant_wallets WHERE tenant_id = $1`,
        [tenantId]
    );
    if (result.rows[0]) return result.rows[0];

    const created = await query(
        `INSERT INTO tenant_wallets (tenant_id, balance_paisa) VALUES ($1, 0)
         ON CONFLICT (tenant_id) DO NOTHING
         RETURNING tenant_id, balance_paisa, updated_at`,
        [tenantId]
    );
    return created.rows[0] || { tenant_id: tenantId, balance_paisa: 0, updated_at: null };
};

// ── ক্রেডিট যোগ করো (রিচার্জ / রিফান্ড / ম্যানুয়াল সংশোধন) ──────
// options: { type: 'recharge'|'refund'|'adjustment', reference, description, createdBy }
const recharge = async (tenantId, amountPaisa, options = {}) => {
    const { type = 'recharge', reference = null, description = null, createdBy = null } = options;

    if (!Number.isInteger(amountPaisa) || amountPaisa <= 0) {
        throw new Error('amountPaisa একটা positive integer হতে হবে।');
    }
    if (!['recharge', 'refund', 'adjustment'].includes(type)) {
        throw new Error("recharge()-এ শুধু 'recharge' | 'refund' | 'adjustment' type দেওয়া যাবে।");
    }

    return withTransaction(async (client) => {
        await client.query(
            `INSERT INTO tenant_wallets (tenant_id, balance_paisa) VALUES ($1, 0)
             ON CONFLICT (tenant_id) DO NOTHING`,
            [tenantId]
        );

        const walletRes = await client.query(
            `SELECT balance_paisa FROM tenant_wallets WHERE tenant_id = $1 FOR UPDATE`,
            [tenantId]
        );
        const newBalance = Number(walletRes.rows[0].balance_paisa) + amountPaisa;

        await client.query(
            `UPDATE tenant_wallets SET balance_paisa = $1, updated_at = NOW() WHERE tenant_id = $2`,
            [newBalance, tenantId]
        );

        const txn = await client.query(
            `INSERT INTO credit_transactions
                (tenant_id, type, amount_paisa, balance_after_paisa, reference, description, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [tenantId, type, amountPaisa, newBalance, reference, description, createdBy]
        );

        return { balance_paisa: newBalance, transaction: txn.rows[0] };
    });
};

// ── ক্রেডিট কাটো (SMS/Email charge) ─────────────────────────────
// ব্যালেন্স অপ্রতুল হলে err.code = 'INSUFFICIENT_BALANCE' সহ throw করে —
// caller (sms/email service) এটা ধরে send আটকাতে পারবে।
// options: { type: 'sms_charge'|'email_charge', reference, description }
const deduct = async (tenantId, amountPaisa, options = {}) => {
    const { type, reference = null, description = null } = options;

    if (!Number.isInteger(amountPaisa) || amountPaisa <= 0) {
        throw new Error('amountPaisa একটা positive integer হতে হবে।');
    }
    if (!['sms_charge', 'email_charge'].includes(type)) {
        throw new Error("deduct()-এ শুধু 'sms_charge' | 'email_charge' type দেওয়া যাবে।");
    }

    return withTransaction(async (client) => {
        await client.query(
            `INSERT INTO tenant_wallets (tenant_id, balance_paisa) VALUES ($1, 0)
             ON CONFLICT (tenant_id) DO NOTHING`,
            [tenantId]
        );

        const walletRes = await client.query(
            `SELECT balance_paisa FROM tenant_wallets WHERE tenant_id = $1 FOR UPDATE`,
            [tenantId]
        );
        const currentBalance = Number(walletRes.rows[0].balance_paisa);

        if (currentBalance < amountPaisa) {
            const err = new Error('অপ্রতুল ব্যালেন্স।');
            err.code = 'INSUFFICIENT_BALANCE';
            err.balance_paisa = currentBalance;
            throw err;
        }

        const newBalance = currentBalance - amountPaisa;

        await client.query(
            `UPDATE tenant_wallets SET balance_paisa = $1, updated_at = NOW() WHERE tenant_id = $2`,
            [newBalance, tenantId]
        );

        const txn = await client.query(
            `INSERT INTO credit_transactions
                (tenant_id, type, amount_paisa, balance_after_paisa, reference, description)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [tenantId, type, -amountPaisa, newBalance, reference, description]
        );

        return { balance_paisa: newBalance, transaction: txn.rows[0] };
    });
};

// ── লেনদেনের ইতিহাস (পেজিনেটেড) ─────────────────────────────────
const getHistory = async (tenantId, { page = 1, limit = 20 } = {}) => {
    const offset = (page - 1) * limit;

    const [rows, countRes] = await Promise.all([
        query(
            `SELECT id, type, amount_paisa, balance_after_paisa, reference, description, created_at
             FROM credit_transactions
             WHERE tenant_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset]
        ),
        query(`SELECT COUNT(*) FROM credit_transactions WHERE tenant_id = $1`, [tenantId]),
    ]);

    const total = Number(countRes.rows[0].count);

    return {
        rows: rows.rows,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
};

// ── প্রতি-ইউনিট দাম (পয়সায়), platform_settings থেকে — ৬০ সেকেন্ড cache ──
let _priceCache   = null;
let _priceCacheAt = 0;

const getPricing = async () => {
    if (_priceCache && Date.now() - _priceCacheAt < 60_000) return _priceCache;

    const result = await query(
        `SELECT key, value FROM platform_settings WHERE key IN ('sms_price_paisa', 'email_price_paisa')`
    );
    const map = {};
    result.rows.forEach((r) => { map[r.key] = r.value; });

    _priceCache = {
        smsPricePaisa:   parseInt(map.sms_price_paisa,   10) || 55,
        emailPricePaisa: parseInt(map.email_price_paisa, 10) || 50,
    };
    _priceCacheAt = Date.now();
    return _priceCache;
};

const clearPricingCache = () => { _priceCache = null; };

module.exports = {
    getWallet,
    recharge,
    deduct,
    getHistory,
    getPricing,
    clearPricingCache,
};
