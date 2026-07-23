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
    getAllCompanyInvoices,
    getAllCompanyCreditSummary,
    getAllCompanyPaymentHistory,
    getAllCompanyLimitRequests,
    submitCompanyLimitRequest,
    getAllCompanyComplaints,
    submitCompanyComplaint,
    getAllCompanyReturnRequests,
    submitCompanyReturnRequest,
    getAllCompanySrReturnRecords,
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
router.get('/all-invoices',       portalAuth, getAllCompanyInvoices);       // ✅ NEW (Session 13)
router.get('/all-credit-summary', portalAuth, getAllCompanyCreditSummary); // ✅ NEW (Session 13)
router.get('/all-payment-history', portalAuth, getAllCompanyPaymentHistory); // ✅ NEW (Session 15)
router.get('/all-limit-requests', portalAuth, getAllCompanyLimitRequests); // ✅ NEW (Session 16)
router.post('/limit-request',     portalAuth, submitCompanyLimitRequest); // ✅ NEW (Session 16)
router.get('/all-complaints',     portalAuth, getAllCompanyComplaints); // ✅ NEW (Session 18)
router.post('/complaint',         portalAuth, submitCompanyComplaint); // ✅ NEW (Session 18)
router.get('/all-return-requests', portalAuth, getAllCompanyReturnRequests); // ✅ NEW (Session 19)
router.post('/return-request',    portalAuth, submitCompanyReturnRequest); // ✅ NEW (Session 19)
router.get('/all-sr-returns',     portalAuth, getAllCompanySrReturnRecords); // ✅ NEW (Session 19)
router.post('/switch',            portalAuth, switchCompany); // ✅ NEW (Session 11)

module.exports = router;
