// ============================================================
// REFERENCE CONTROLLER — বিভাগ/জেলা/বিজনেস ফিল্ড (স্ট্যাটিক লুকআপ ডেটা)
// Base: /api/reference   (auth লাগে না — non-sensitive dropdown ডেটা)
// ============================================================

const { query } = require('../config/db');
const logger    = require('../config/logger');

const getDivisions = async (req, res) => {
    try {
        const r = await query(`SELECT id, name_bn, name_en FROM bd_divisions ORDER BY id`);
        res.json({ success: true, data: r.rows });
    } catch (err) {
        logger.error('❌ getDivisions error:', err.message);
        res.status(500).json({ success: false, message: 'বিভাগ লিস্ট আনতে সমস্যা হয়েছে।' });
    }
};

const getDistricts = async (req, res) => {
    try {
        const { division_id } = req.query;
        const params = [];
        let where = '';
        if (division_id) {
            params.push(division_id);
            where = 'WHERE division_id = $1';
        }
        const r = await query(
            `SELECT id, division_id, name_bn, name_en FROM bd_districts ${where} ORDER BY id`,
            params
        );
        res.json({ success: true, data: r.rows });
    } catch (err) {
        logger.error('❌ getDistricts error:', err.message);
        res.status(500).json({ success: false, message: 'জেলা লিস্ট আনতে সমস্যা হয়েছে।' });
    }
};

const getBusinessFields = async (req, res) => {
    try {
        const r = await query(`SELECT id, name_bn, name_en, sort_order FROM business_fields ORDER BY sort_order`);
        res.json({ success: true, data: r.rows });
    } catch (err) {
        logger.error('❌ getBusinessFields error:', err.message);
        res.status(500).json({ success: false, message: 'বিজনেস ফিল্ড লিস্ট আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getDivisions, getDistricts, getBusinessFields };
