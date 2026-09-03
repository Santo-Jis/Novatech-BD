// ============================================================
// CONNECTION ROUTES — Company ↔ Customer (staff/company side)
// Base: /api/connections
// যেকোনো লগইন-করা স্টাফ (SR/Worker সহ) ব্যবহার করতে পারবে — সিদ্ধান্ত অনুযায়ী
// ============================================================

const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');

const {
    searchPersons,
    sendConnectionRequest,
    connectViaQrScan,
    listConnections,
    getPersonReliabilityScore,
    acceptConnection,
    rejectConnection,
    disconnectConnection,
    blockConnection,
    unblockConnection,
} = require('../controllers/connection.controller');

router.get('/search-persons',        auth, searchPersons);
router.post('/request',              auth, sendConnectionRequest);
router.post('/qr-scan',              auth, connectViaQrScan);
router.get('/persons/:personId/reliability-score', auth, getPersonReliabilityScore); // ✅ NEW (Phase 5)
router.get('/',                      auth, listConnections);
router.post('/:id/accept',           auth, acceptConnection);
router.post('/:id/reject',           auth, rejectConnection);
router.post('/:id/disconnect',       auth, disconnectConnection);
router.post('/:id/block',            auth, blockConnection);   // ✅ NEW (Phase 3)
router.post('/:id/unblock',          auth, unblockConnection); // ✅ NEW (Phase 3)

module.exports = router;
