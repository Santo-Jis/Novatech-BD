// backend/src/routes/collection.routes.js
// Base path: /api/collections

const express = require('express');
const router  = express.Router();
const { auth }        = require('../middlewares/auth');
const { allowRoles }  = require('../middlewares/roleCheck');
const requireCheckin  = require('../middlewares/requireCheckin');

const {
    upload,
    createCollection,
    getMyCollections,
    getCustomerCollections,
    verifyCollection,
    getSettlementCollectionSummary,
} = require('../controllers/collection.controller');

// ── SR: বাকি আদায় এন্ট্রি ─────────────────────────────────────
// requireCheckin: চেক-ইন ছাড়া collection করা যাবে না
router.post(
    '/',
    auth,
    allowRoles('worker'),
    requireCheckin,
    upload.single('receipt_photo'),
    createCollection
);

// ── SR: নিজের collection list (আজ বা নির্দিষ্ট দিনের) ─────────
// ?date=YYYY-MM-DD  (না দিলে আজকের)
router.get(
    '/my',
    auth,
    allowRoles('worker'),
    getMyCollections
);

// ── SR + Admin: Settlement screen-এর collection summary ────────
router.get(
    '/settlement-summary',
    auth,
    allowRoles('worker', 'admin', 'accountant'),
    getSettlementCollectionSummary
);

// ── Admin/Accountant: একটি কাস্টমারের collection history ───────
router.get(
    '/customer/:customerId',
    auth,
    allowRoles('admin', 'manager', 'accountant', 'worker'),
    getCustomerCollections
);

// ── Admin/Accountant: Collection verify বা reject ──────────────
// PATCH /api/collections/:id/verify
// body: { action: 'verify' | 'reject', reject_reason?: string }
router.patch(
    '/:id/verify',
    auth,
    allowRoles('admin', 'accountant'),
    verifyCollection
);

module.exports = router;
