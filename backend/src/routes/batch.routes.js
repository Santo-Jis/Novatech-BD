const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getBatches,
    getBatchSummary
} = require('../controllers/batch.controller');

// ============================================================
// BATCH / EXPIRY ROUTES
// Base: /api/batches
// দেখা — admin, manager, accountant (PO/সাপ্লায়ারের মতো একই কনভেনশন)
// ============================================================
router.get('/summary', auth, allowRoles('admin', 'manager', 'accountant'), getBatchSummary);
router.get('/',        auth, allowRoles('admin', 'manager', 'accountant'), getBatches);

module.exports = router;
