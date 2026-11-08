const express = require('express');
const router  = express.Router();

const { auth }                        = require('../middlewares/auth');
const { canCreateRoute, isManagement, isWorker, checkTeamAccess } = require('../middlewares/roleCheck');

const {
    getRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    assignWorkerToRoute,
    getRouteWorkers,
    getRouteCustomers,
    getLiveRouteStatus,
    getPendingRoutes,
    approveRouteRequest,
    rejectRouteRequest,
    requestRoute,
    getMyRouteRequests,
    getWorkerRoutes,
} = require('../controllers/route.controller');

// ── Worker/SR routes ─────────────────────────────────────────
router.get('/worker-list',   auth, isWorker,     getWorkerRoutes);
router.get('/my-requests',   auth, isWorker,     getMyRouteRequests);
router.post('/request',      auth, isWorker,     requestRoute);

// ── Management routes ─────────────────────────────────────────
router.get('/live-status',   auth, isManagement, checkTeamAccess, getLiveRouteStatus);
router.get('/pending/list',  auth, isManagement, checkTeamAccess, getPendingRoutes);

// ✅ SR-এর রুট আবেদন — অনুমোদন (রুট তৈরি + SR অ্যাসাইন) / বাতিল
router.put('/requests/:id/approve', auth, canCreateRoute, approveRouteRequest);
router.put('/requests/:id/reject',  auth, canCreateRoute, rejectRouteRequest);

router.get('/',              auth, isManagement, checkTeamAccess, getRoutes);
router.post('/',             auth, canCreateRoute,                createRoute);
router.put('/:id',           auth, isManagement,                  updateRoute);
router.delete('/:id',        auth, isManagement,                  deleteRoute);

router.post('/:id/assign',   auth, isManagement, assignWorkerToRoute);
router.get('/:id/workers',   auth, isManagement, getRouteWorkers);
router.get('/:id/customers', auth, isManagement, checkTeamAccess, getRouteCustomers);

module.exports = router;
