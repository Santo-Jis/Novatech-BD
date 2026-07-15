// ============================================================
// DISCOVERY CONTROLLER — Area + Business Field ভিত্তিক শপ ডিসকভারি
// Base: /api/discovery   (staff/company side — req.user, req.tenantId)
// ============================================================

const { query } = require('../config/db');
const logger    = require('../config/logger');

// ============================================================
// GET /api/discovery/settings
// তেনন্টের বর্তমান সার্ভিস এরিয়া + বিজনেস ফিল্ড
// ============================================================
const getSettings = async (req, res) => {
    try {
        const areas = await query(
            `SELECT d.id, d.name_bn, d.name_en, dv.name_bn AS division_name_bn
             FROM tenant_service_areas tsa
             JOIN bd_districts d  ON d.id = tsa.district_id
             JOIN bd_divisions dv ON dv.id = d.division_id
             WHERE tsa.tenant_id = $1
             ORDER BY d.name_bn`,
            [req.tenantId]
        );
        const fields = await query(
            `SELECT bf.id, bf.name_bn, bf.name_en
             FROM entity_business_fields ebf
             JOIN business_fields bf ON bf.id = ebf.business_field_id
             WHERE ebf.entity_type = 'tenant' AND ebf.entity_id = $1
             ORDER BY bf.sort_order`,
            [req.tenantId]
        );
        res.json({ success: true, data: { service_areas: areas.rows, business_fields: fields.rows } });
    } catch (err) {
        logger.error('❌ getSettings error:', err.message);
        res.status(500).json({ success: false, message: 'সেটিংস আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/discovery/settings/service-areas   { district_ids: [1,2,3] }
// সম্পূর্ণ replace করে (পুরনোগুলো মুছে নতুন লিস্ট বসায়)
// ============================================================
const setServiceAreas = async (req, res) => {
    try {
        const { district_ids } = req.body;
        if (!Array.isArray(district_ids)) {
            return res.status(400).json({ success: false, message: 'district_ids (array) দিন।' });
        }

        await query(`DELETE FROM tenant_service_areas WHERE tenant_id = $1`, [req.tenantId]);

        if (district_ids.length > 0) {
            const values = district_ids.map((_, i) => `($1, $${i + 2})`).join(',');
            await query(
                `INSERT INTO tenant_service_areas (tenant_id, district_id) VALUES ${values}
                 ON CONFLICT DO NOTHING`,
                [req.tenantId, ...district_ids]
            );
        }
        res.json({ success: true, message: 'সার্ভিস এরিয়া আপডেট হয়েছে।' });
    } catch (err) {
        logger.error('❌ setServiceAreas error:', err.message);
        res.status(500).json({ success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/discovery/settings/business-fields   { business_field_ids: [1,2] }
// ============================================================
const setBusinessFields = async (req, res) => {
    try {
        const { business_field_ids } = req.body;
        if (!Array.isArray(business_field_ids)) {
            return res.status(400).json({ success: false, message: 'business_field_ids (array) দিন।' });
        }

        await query(
            `DELETE FROM entity_business_fields WHERE entity_type = 'tenant' AND entity_id = $1`,
            [req.tenantId]
        );

        if (business_field_ids.length > 0) {
            const values = business_field_ids.map((_, i) => `('tenant', $1, $${i + 2})`).join(',');
            await query(
                `INSERT INTO entity_business_fields (entity_type, entity_id, business_field_id) VALUES ${values}
                 ON CONFLICT DO NOTHING`,
                [req.tenantId, ...business_field_ids]
            );
        }
        res.json({ success: true, message: 'বিজনেস ফিল্ড আপডেট হয়েছে।' });
    } catch (err) {
        logger.error('❌ setBusinessFields error:', err.message);
        res.status(500).json({ success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/discovery/shops
// তেনন্টের সার্ভিস এরিয়া + বিজনেস ফিল্ড ম্যাচ করা সব discoverable শপ।
// Connect না হওয়া পর্যন্ত owner name/phone/whatsapp/email হাইড থাকবে —
// শুধু shop_name + address + এরিয়া দেখাবে।
// ============================================================
const getDiscoveryShops = async (req, res) => {
    try {
        const result = await query(
            `SELECT DISTINCT p.id AS person_id, p.shop_name, p.full_name, p.phone, p.whatsapp, p.email,
                    p.address, d.name_bn AS district_name, dv.name_bn AS division_name,
                    ccc.status AS connection_status, ccc.id AS connection_id
             FROM persons p
             JOIN bd_districts d  ON d.id = p.district_id
             JOIN bd_divisions dv ON dv.id = d.division_id
             JOIN entity_business_fields ebf
                    ON ebf.entity_type = 'person' AND ebf.entity_id = p.id
             JOIN tenant_service_areas tsa
                    ON tsa.district_id = p.district_id AND tsa.tenant_id = $1
             JOIN entity_business_fields tbf
                    ON tbf.entity_type = 'tenant' AND tbf.entity_id = $1
                   AND tbf.business_field_id = ebf.business_field_id
             LEFT JOIN customer_company_connections ccc
                    ON ccc.person_id = p.id AND ccc.tenant_id = $1
                   AND ccc.status IN ('pending','connected')
             WHERE p.discoverable = true
             ORDER BY p.shop_name
             LIMIT 100`,
            [req.tenantId]
        );

        // Connect (accept/qr-scan) না হওয়া পর্যন্ত contact info মাস্ক করা — application layer-এই,
        // যাতে ভুলবশত কোনো column বাদ দিতে ভুলে গেলেও একটাই জায়গায় গার্ড থাকে
        const shops = result.rows.map((r) => {
            const unlocked = r.connection_status === 'connected';
            return {
                person_id:         r.person_id,
                shop_name:         r.shop_name,
                address:           r.address,
                district_name:     r.district_name,
                division_name:     r.division_name,
                connection_status: r.connection_status || null,
                connection_id:     r.connection_id || null,
                owner_name: unlocked ? r.full_name : null,
                phone:      unlocked ? r.phone     : null,
                whatsapp:   unlocked ? r.whatsapp  : null,
                email:      unlocked ? r.email     : null,
            };
        });

        res.json({ success: true, data: shops });
    } catch (err) {
        logger.error('❌ getDiscoveryShops error:', err.message);
        res.status(500).json({ success: false, message: 'ডিসকভারি লিস্ট আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getSettings, setServiceAreas, setBusinessFields, getDiscoveryShops };
