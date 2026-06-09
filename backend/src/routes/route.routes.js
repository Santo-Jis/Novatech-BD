// ============================================================
// route.routes.js
// Delivery Route Management
// Base: /api/routes
// ============================================================

const express              = require('express');
const router               = express.Router();
const { auth }             = require('../middlewares/auth');
const { allowRoles, checkTeamAccess, isAdmin } = require('../middlewares/roleCheck');

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
    requestRoute,
    getMyRouteRequests,
    getWorkerRoutes,
} = require('../controllers/route.controller');

const canManage = allowRoles('admin', 'manager');
const isWorker  = allowRoles('worker');

// ── Worker (SR) Routes ────────────────────────────────────────
// POST /api/routes/request        — SR নতুন রুটের request পাঠাবে
// GET  /api/routes/my-requests    — SR নিজের requests দেখবে
// GET  /api/routes/worker-list    — SR নিজের assigned রুটগুলো দেখবে
//
// ⚠️ এই তিনটি route অবশ্যই /:id এর আগে থাকতে হবে,
//    না হলে Express "request" / "my-requests" কে :id মনে করবে।
router.post('/request',       auth, isWorker,  requestRoute);
router.get('/my-requests',    auth, isWorker,  getMyRouteRequests);
router.get('/worker-list',    auth, isWorker,  getWorkerRoutes);

// ── Pending Routes (Admin approval) ──────────────────────────
// GET /api/routes/pending/list
router.get('/pending/list',   auth, isAdmin,   getPendingRoutes);

// ── Live Status ───────────────────────────────────────────────
// GET /api/routes/live-status
router.get('/live-status',    auth, canManage, checkTeamAccess, getLiveRouteStatus);

// ── Route List & Create (admin/manager) ──────────────────────
router.get('/',               auth, canManage, checkTeamAccess, getRoutes);
router.post('/',              auth, canManage, createRoute);

// ── Single Route ──────────────────────────────────────────────
router.put('/:id',            auth, canManage, updateRoute);
router.delete('/:id',         auth, canManage, deleteRoute);

// ── Workers & Customers in a Route ───────────────────────────
router.get('/:id/workers',    auth, canManage, getRouteWorkers);
router.get('/:id/customers',  auth, canManage, getRouteCustomers);

// ── Assign Worker ─────────────────────────────────────────────
router.post('/:id/assign',    auth, canManage, assignWorkerToRoute);

module.exports = router;
