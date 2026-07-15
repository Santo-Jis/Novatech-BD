// ============================================================
// DISCOVERY ROUTES — Base: /api/discovery (staff/company side)
// ============================================================

const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');

const {
    getSettings,
    setServiceAreas,
    setBusinessFields,
    getDiscoveryShops,
} = require('../controllers/discovery.controller');

router.get('/settings',                    auth, getSettings);
router.put('/settings/service-areas',      auth, setServiceAreas);
router.put('/settings/business-fields',    auth, setBusinessFields);
router.get('/shops',                       auth, getDiscoveryShops);

module.exports = router;
