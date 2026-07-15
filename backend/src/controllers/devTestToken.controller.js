// ============================================================
// ⚠️ TEMPORARY — শুধু Phase 1 ফাংশনাল টেস্টের জন্য
// টেস্ট শেষ হলে এই ফাইল + routes/devTestToken.routes.js মুছে ফেলতে হবে
// এবং Render থেকে DEV_TEST_SECRET env var remove করে দিতে হবে।
//
// কাজ: x-dev-secret header (DEV_TEST_SECRET env var-এর সাথে মিলতে হবে)
// ছাড়া কিছুই করে না (fail-closed)। মিললে, বিদ্যমান real user/customer-এর
// জন্য ঠিক সেই একই ফাংশন/পেলোড দিয়ে টোকেন বানায় যা আসল লগইন ব্যবহার করে।
// ============================================================

const jwt   = require('jsonwebtoken');
const { query } = require('../config/db');
const { generateAccessToken } = require('../services/auth.service');

const mintTestToken = async (req, res) => {
    const provided = req.headers['x-dev-secret'];
    if (!process.env.DEV_TEST_SECRET || !provided || provided !== process.env.DEV_TEST_SECRET) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { kind, id } = req.body || {};
    try {
        if (kind === 'staff') {
            const r = await query(
                `SELECT id, role, status, name_bn, name_en, manager_id, employee_code, phone, tenant_id
                 FROM users WHERE id = $1`,
                [id]
            );
            if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'user not found' });
            const token = generateAccessToken(r.rows[0]);
            return res.json({ success: true, token });
        }

        if (kind === 'portal') {
            const r = await query(
                `SELECT id, customer_code FROM customers WHERE id = $1 AND is_active = true`,
                [id]
            );
            if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'customer not found' });

            const tv = await query(
                `SELECT token_version FROM customer_portal_tokens WHERE customer_id = $1`,
                [id]
            );
            const token_version = tv.rows[0]?.token_version || 1;

            const token = jwt.sign(
                {
                    customer_id:   r.rows[0].id,
                    customer_code: r.rows[0].customer_code,
                    type:          'customer_portal',
                    token_version,
                },
                process.env.JWT_PORTAL_SECRET,
                { expiresIn: '2h', algorithm: 'HS256' }
            );
            return res.json({ success: true, token });
        }

        return res.status(400).json({ success: false, message: 'kind must be staff|portal' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { mintTestToken };
