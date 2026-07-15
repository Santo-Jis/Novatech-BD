// ============================================================
// CONNECTION CONTROLLER — Company ↔ Customer Multi-Company Network
// Base: /api/connections   (staff/company side — req.user, req.tenantId)
//
// Phase 1: person identity + connection request/accept/reject/disconnect
// এই ফাইলটা নতুন — কোনো বিদ্যমান ফাইল স্পর্শ করা হয়নি।
// ============================================================

const { query }   = require('../config/db');
const logger      = require('../config/logger');
const { generateCustomerCode } = require('../services/employee.service');

// ── Helper: একটা connection row থেকে বিদ্যমান/নতুন customer row বানিয়ে/খুঁজে দাও ──
async function ensureCustomerForPerson(personId, tenantId, createdByUserId) {
    // এই tenant-এ এই person-এর জন্য customer row আগে থেকেই আছে কিনা
    const existing = await query(
        `SELECT id FROM customers WHERE person_id = $1 AND tenant_id = $2 LIMIT 1`,
        [personId, tenantId]
    );
    if (existing.rows.length > 0) return existing.rows[0].id;

    // না থাকলে person-এর তথ্য দিয়ে একটা নতুন customer row বানাও
    const person = await query(`SELECT * FROM persons WHERE id = $1`, [personId]);
    if (person.rows.length === 0) throw new Error('Person পাওয়া যায়নি।');
    const p = person.rows[0];

    const customerCode = await generateCustomerCode(new Date());
    const created = await query(
        `INSERT INTO customers
            (customer_code, shop_name, owner_name, whatsapp, sms_phone, email,
             created_by, tenant_id, person_id, registration_source, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'connection', true)
         RETURNING id`,
        [
            customerCode,
            p.full_name || 'নতুন কাস্টমার',
            p.full_name || 'নতুন কাস্টমার',
            p.whatsapp || null,
            p.phone || null,
            p.email || null,
            createdByUserId,
            tenantId,
            personId,
        ]
    );
    return created.rows[0].id;
}

// ============================================================
// GET /api/connections/search-persons?q=...
// ফোন/হোয়াটসঅ্যাপ/ইমেইল/QR-কোড/নাম দিয়ে গ্লোবাল person সার্চ
// ============================================================
const searchPersons = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 3) {
            return res.status(400).json({ success: false, message: 'কমপক্ষে ৩ অক্ষর লিখুন।' });
        }

        const result = await query(
            `SELECT p.id, p.full_name, p.phone, p.whatsapp, p.email, p.qr_code,
                    ccc.status AS existing_status
             FROM persons p
             LEFT JOIN customer_company_connections ccc
                    ON ccc.person_id = p.id AND ccc.tenant_id = $2
                    AND ccc.status IN ('pending','connected')
             WHERE p.phone ILIKE $1 OR p.whatsapp ILIKE $1
                OR p.email ILIKE $1 OR p.full_name ILIKE $1 OR p.qr_code = $3
             LIMIT 20`,
            [`%${q}%`, req.tenantId, q]
        );

        res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('❌ searchPersons error:', err.message);
        res.status(500).json({ success: false, message: 'সার্চ করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/request   { person_id }
// কোম্পানি → কাস্টমার রিকোয়েস্ট (Accept লাগবে)
// ============================================================
const sendConnectionRequest = async (req, res) => {
    try {
        const { person_id } = req.body;
        if (!person_id) {
            return res.status(400).json({ success: false, message: 'person_id দিন।' });
        }

        const dup = await query(
            `SELECT id, status FROM customer_company_connections
             WHERE person_id = $1 AND tenant_id = $2 AND status IN ('pending','connected')`,
            [person_id, req.tenantId]
        );
        if (dup.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: dup.rows[0].status === 'connected'
                    ? 'ইতিমধ্যে সংযুক্ত।'
                    : 'রিকোয়েস্ট আগে থেকেই পাঠানো আছে।',
            });
        }

        const created = await query(
            `INSERT INTO customer_company_connections
                (person_id, tenant_id, status, initiated_by, requested_by_user_id)
             VALUES ($1, $2, 'pending', 'company_search', $3)
             RETURNING *`,
            [person_id, req.tenantId, req.user.id]
        );

        res.status(201).json({ success: true, data: created.rows[0] });
    } catch (err) {
        logger.error('❌ sendConnectionRequest error:', err.message);
        res.status(500).json({ success: false, message: 'রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/qr-scan   { qr_code }
// SR সামনাসামনি স্ক্যান করলে — সাথে সাথে connect (approval লাগবে না)
// ============================================================
const connectViaQrScan = async (req, res) => {
    try {
        const { qr_code } = req.body;
        if (!qr_code) {
            return res.status(400).json({ success: false, message: 'qr_code দিন।' });
        }

        const person = await query(`SELECT id FROM persons WHERE qr_code = $1`, [qr_code]);
        if (person.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'এই QR কোড দিয়ে কোনো কাস্টমার পাওয়া যায়নি।' });
        }
        const personId = person.rows[0].id;

        // আগে থেকে connected/pending থাকলে সেটাই ফেরত দাও
        const existing = await query(
            `SELECT * FROM customer_company_connections
             WHERE person_id = $1 AND tenant_id = $2
               AND status IN ('pending','connected')`,
            [personId, req.tenantId]
        );
        if (existing.rows.length > 0 && existing.rows[0].status === 'connected') {
            return res.json({ success: true, message: 'ইতিমধ্যে সংযুক্ত।', data: existing.rows[0] });
        }

        const customerId = await ensureCustomerForPerson(personId, req.tenantId, req.user.id);

        let connectionRow;
        if (existing.rows.length > 0) {
            const updated = await query(
                `UPDATE customer_company_connections
                 SET status = 'connected', customer_id = $2, responded_at = NOW()
                 WHERE id = $1 RETURNING *`,
                [existing.rows[0].id, customerId]
            );
            connectionRow = updated.rows[0];
        } else {
            const created = await query(
                `INSERT INTO customer_company_connections
                    (person_id, tenant_id, customer_id, status, initiated_by, requested_by_user_id, responded_at)
                 VALUES ($1, $2, $3, 'connected', 'qr_scan', $4, NOW())
                 RETURNING *`,
                [personId, req.tenantId, customerId, req.user.id]
            );
            connectionRow = created.rows[0];
        }

        res.status(201).json({ success: true, message: 'সংযুক্ত হয়েছে!', data: connectionRow });
    } catch (err) {
        logger.error('❌ connectViaQrScan error:', err.message);
        res.status(500).json({ success: false, message: 'QR স্ক্যান করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/connections?status=pending|connected|rejected|disconnected
// এই tenant-এর সব connection লিস্ট
// ============================================================
const listConnections = async (req, res) => {
    try {
        const { status } = req.query;
        const params = [req.tenantId];
        let where = 'ccc.tenant_id = $1';
        if (status) {
            params.push(status);
            where += ` AND ccc.status = $${params.length}`;
        }

        const result = await query(
            `SELECT ccc.*, p.full_name, p.phone, p.whatsapp, p.email,
                    c.shop_name, c.customer_code
             FROM customer_company_connections ccc
             JOIN persons p ON p.id = ccc.person_id
             LEFT JOIN customers c ON c.id = ccc.customer_id
             WHERE ${where}
             ORDER BY ccc.created_at DESC`,
            params
        );

        res.json({ success: true, data: result.rows });
    } catch (err) {
        logger.error('❌ listConnections error:', err.message);
        res.status(500).json({ success: false, message: 'লিস্ট আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/:id/accept   (কাস্টমারের পাঠানো রিকোয়েস্ট)
// ============================================================
const acceptConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const conn = await query(
            `SELECT * FROM customer_company_connections WHERE id = $1 AND tenant_id = $2 AND status = 'pending'`,
            [id, req.tenantId]
        );
        if (conn.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পেন্ডিং রিকোয়েস্ট পাওয়া যায়নি।' });
        }

        const customerId = await ensureCustomerForPerson(conn.rows[0].person_id, req.tenantId, req.user.id);

        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'connected', customer_id = $2, responded_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id, customerId]
        );

        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        logger.error('❌ acceptConnection error:', err.message);
        res.status(500).json({ success: false, message: 'Accept করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/:id/reject
// ============================================================
const rejectConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'rejected', responded_at = NOW()
             WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
             RETURNING *`,
            [id, req.tenantId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'পেন্ডিং রিকোয়েস্ট পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        logger.error('❌ rejectConnection error:', err.message);
        res.status(500).json({ success: false, message: 'Reject করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/connections/:id/disconnect
// ============================================================
const disconnectConnection = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await query(
            `UPDATE customer_company_connections
             SET status = 'disconnected', disconnected_at = NOW()
             WHERE id = $1 AND tenant_id = $2 AND status = 'connected'
             RETURNING *`,
            [id, req.tenantId]
        );
        if (updated.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'সংযোগ পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: updated.rows[0] });
    } catch (err) {
        logger.error('❌ disconnectConnection error:', err.message);
        res.status(500).json({ success: false, message: 'বিচ্ছিন্ন করতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    searchPersons,
    sendConnectionRequest,
    connectViaQrScan,
    listConnections,
    acceptConnection,
    rejectConnection,
    disconnectConnection,
};
