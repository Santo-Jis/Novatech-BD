// ============================================================
// CUSTOMER PORTAL PROFILE CONTROLLER — নিজের এরিয়া/ফিল্ড/ঠিকানা
// Base: /api/portal/profile   (req.portalUser.customer_id)
// ============================================================

const { query } = require('../config/db');
const logger    = require('../config/logger');

async function getPersonId(customerId) {
    const r = await query(`SELECT person_id FROM customers WHERE id = $1`, [customerId]);
    if (r.rows.length === 0 || !r.rows[0].person_id) {
        throw new Error('PERSON_NOT_LINKED');
    }
    return r.rows[0].person_id;
}

// ============================================================
// GET /api/portal/profile/area-field
// ============================================================
const getMyAreaAndField = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser.customer_id);

        const p = await query(
            `SELECT shop_name, address, division_id, district_id, discoverable
             FROM persons WHERE id = $1`,
            [personId]
        );
        const fields = await query(
            `SELECT bf.id, bf.name_bn, bf.name_en
             FROM entity_business_fields ebf
             JOIN business_fields bf ON bf.id = ebf.business_field_id
             WHERE ebf.entity_type = 'person' AND ebf.entity_id = $1
             ORDER BY bf.sort_order`,
            [personId]
        );

        res.json({ success: true, data: { ...p.rows[0], business_fields: fields.rows } });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getMyAreaAndField error:', err.message);
        res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/portal/profile/area-field
// { shop_name, address, division_id, district_id, discoverable, business_field_ids: [] }
// সব ফিল্ড optional — যা পাঠানো হবে শুধু তা আপডেট হবে
// ============================================================
const updateMyAreaAndField = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser.customer_id);
        const { shop_name, address, division_id, district_id, discoverable, business_field_ids } = req.body;

        await query(
            `UPDATE persons SET
                shop_name    = COALESCE($2, shop_name),
                address      = COALESCE($3, address),
                division_id  = COALESCE($4, division_id),
                district_id  = COALESCE($5, district_id),
                discoverable = COALESCE($6, discoverable),
                updated_at   = NOW()
             WHERE id = $1`,
            [personId, shop_name, address, division_id, district_id, discoverable]
        );

        if (Array.isArray(business_field_ids)) {
            await query(
                `DELETE FROM entity_business_fields WHERE entity_type = 'person' AND entity_id = $1`,
                [personId]
            );
            if (business_field_ids.length > 0) {
                const values = business_field_ids.map((_, i) => `('person', $1, $${i + 2})`).join(',');
                await query(
                    `INSERT INTO entity_business_fields (entity_type, entity_id, business_field_id) VALUES ${values}
                     ON CONFLICT DO NOTHING`,
                    [personId, ...business_field_ids]
                );
            }
        }

        res.json({ success: true, message: 'প্রোফাইল আপডেট হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ updateMyAreaAndField error:', err.message);
        res.status(500).json({ success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getMyAreaAndField, updateMyAreaAndField };
