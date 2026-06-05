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
} = require('../controllers/route.controller');

const canManage = allowRoles('admin', 'manager');

// ── Pending Routes (Admin approval) ──────────────────────────
// GET /api/routes/pending/list
router.get('/pending/list',     auth, isAdmin, getPendingRoutes);

// ── Live Status ───────────────────────────────────────────────
// GET /api/routes/live-status
router.get('/live-status',      auth, canManage, checkTeamAccess, getLiveRouteStatus);

// ── Route List & Create ───────────────────────────────────────
router.get('/',                 auth, canManage, checkTeamAccess, getRoutes);
router.post('/',                auth, canManage, createRoute);

// ── Single Route ──────────────────────────────────────────────
router.put('/:id',              auth, canManage, updateRoute);
router.delete('/:id',           auth, isAdmin,   deleteRoute);

// ── Workers & Customers in a Route ───────────────────────────
router.get('/:id/workers',      auth, canManage, getRouteWorkers);
router.get('/:id/customers',    auth, canManage, getRouteCustomers);

// ── Assign Worker ─────────────────────────────────────────────
router.post('/:id/assign',      auth, canManage, assignWorkerToRoute);

module.exports = router;
