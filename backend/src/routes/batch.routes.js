const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getBatches,
    getBatchSummary,
    getBatchMovements,
    updateBatchStatus,
    getBatchRecall,
    getBatchAnalytics
} = require('../controllers/batch.controller');

// ============================================================
// BATCH / EXPIRY ROUTES
// Base: /api/batches
// দেখা — admin, manager, accountant (PO/সাপ্লায়ারের মতো একই কনভেনশন)
// ============================================================
router.get('/summary',        auth, allowRoles('admin', 'manager', 'accountant'), getBatchSummary);
router.get('/analytics',      auth, allowRoles('admin', 'manager', 'accountant'), getBatchAnalytics); // ✅ Phase ৩
router.get('/:id/movements',  auth, allowRoles('admin', 'manager', 'accountant'), getBatchMovements);
router.get('/:id/recall',     auth, allowRoles('admin', 'manager', 'accountant'), getBatchRecall);     // ✅ Phase ৩
router.get('/',               auth, allowRoles('admin', 'manager', 'accountant'), getBatches);
// ✅ Phase ২: স্ট্যাটাস বদলানো (quarantine/damaged/write-off/return) — শুধু admin/accountant
router.patch('/:id/status',   auth, allowRoles('admin', 'accountant'), updateBatchStatus);

module.exports = router;
