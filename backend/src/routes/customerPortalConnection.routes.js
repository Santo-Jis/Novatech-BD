// ============================================================
// CUSTOMER PORTAL CONNECTION ROUTES
// Base: /api/portal/connections
// ============================================================

const express = require('express');
const router  = express.Router();
const { portalAuth } = require('../middlewares/portalAuthShared');

const {
    getMyQrCode,
    regenerateMyQrCode,
    getMyCompanies,
    getPendingForMe,
    searchCompanies,
    requestConnectionToCompany,
    acceptCompanyRequest,
    rejectCompanyRequest,
    disconnectCompany,
    blockCompanyConnection,
    unblockCompanyConnection,
    getMyBlockedCompanies,
    getAllCompanyOrders,
    getAllCompanyInvoices,
    getAllCompanyCreditSummary,
    getAllCompanySummary,
    getAllCompanyMonthlyTrend,
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

// ✅ NEW — order-request সংক্রান্ত অ্যাগ্রিগেট লজিক customerOrderRequest.
// controller.js-এই থাকে (createOrderRequest/getMyOrderRequests-এর পাশে,
// যেহেতু একই customer_order_requests টেবিল নিয়ে কাজ করে), কিন্তু URL
// namespace-এর সামঞ্জস্যের জন্য (/portal/connections/all-*) রুটটা এখানেই।
const { getAllCompanyOrderRequests } = require('../controllers/customerOrderRequest.controller');

router.get('/my-qr',              portalAuth, getMyQrCode);
router.post('/my-qr/regenerate',  portalAuth, regenerateMyQrCode); // ✅ NEW (Phase 2 — কোড অডিট)
router.get('/my-companies',       portalAuth, getMyCompanies);
router.get('/pending',            portalAuth, getPendingForMe);
router.get('/blocked',            portalAuth, getMyBlockedCompanies); // ✅ NEW (Phase 3 — কোড অডিট)
router.get('/search-companies',   portalAuth, searchCompanies);
router.post('/request',           portalAuth, requestConnectionToCompany);
router.post('/:id/accept',        portalAuth, acceptCompanyRequest);
router.post('/:id/reject',        portalAuth, rejectCompanyRequest);
router.post('/:id/disconnect',    portalAuth, disconnectCompany);
router.post('/:id/block',         portalAuth, blockCompanyConnection);   // ✅ NEW (Phase 3)
router.post('/:id/unblock',       portalAuth, unblockCompanyConnection); // ✅ NEW (Phase 3)
router.get('/all-orders',         portalAuth, getAllCompanyOrders);
router.get('/all-order-requests', portalAuth, getAllCompanyOrderRequests); // ✅ NEW (multi-company অর্ডার ফিক্সের সঙ্গী)
router.get('/all-invoices',       portalAuth, getAllCompanyInvoices);       // ✅ NEW (Session 13)
router.get('/all-credit-summary', portalAuth, getAllCompanyCreditSummary); // ✅ NEW (Session 13)
router.get('/all-summary',        portalAuth, getAllCompanySummary);       // ✅ NEW (আর্কিটেকচার ফিক্স, পার্ট ১)
router.get('/all-monthly-trend',  portalAuth, getAllCompanyMonthlyTrend);  // ✅ NEW (আর্কিটেকচার ফিক্স, পার্ট ১)
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
