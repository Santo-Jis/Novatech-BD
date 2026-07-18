// ============================================================
// CUSTOMER PORTAL CONNECTION ROUTES
// Base: /api/portal/connections
// ============================================================

const express = require('express');
const router  = express.Router();
const { portalAuth } = require('../middlewares/portalAuthShared');

const {
    getMyQrCode,
    getMyCompanies,
    getPendingForMe,
    searchCompanies,
    requestConnectionToCompany,
    acceptCompanyRequest,
    rejectCompanyRequest,
    disconnectCompany,
    getAllCompanyOrders,
    switchCompany,
} = require('../controllers/customerPortalConnection.controller');

router.get('/my-qr',              portalAuth, getMyQrCode);
router.get('/my-companies',       portalAuth, getMyCompanies);
router.get('/pending',            portalAuth, getPendingForMe);
router.get('/search-companies',   portalAuth, searchCompanies);
router.post('/request',           portalAuth, requestConnectionToCompany);
router.post('/:id/accept',        portalAuth, acceptCompanyRequest);
router.post('/:id/reject',        portalAuth, rejectCompanyRequest);
router.post('/:id/disconnect',    portalAuth, disconnectCompany);
router.get('/all-orders',         portalAuth, getAllCompanyOrders);
router.post('/switch',            portalAuth, switchCompany); // ✅ NEW (Session 11)

module.exports = router;
