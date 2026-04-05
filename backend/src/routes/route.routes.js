const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const {
    allowRoles,
    canCreateRoute,
    checkTeamAccess
} = require('../middlewares/roleCheck');

const {
    getRoutes,
    createRoute,
    updateRoute,
    deleteRoute,
    assignWorkerToRoute,
    getRouteWorkers
} = require('../controllers/route.controller');

// ============================================================
// ROUTE ROUTES
// Base: /api/routes
// ============================================================

// রুট তালিকা
router.get('/',     auth, checkTeamAccess, getRoutes);

// নতুন রুট তৈরি (Admin/Manager)
router.post('/',    auth, canCreateRoute, createRoute);

// রুট এডিট
router.put('/:id',  auth, canCreateRoute, updateRoute);

// রুট মুছে দেওয়া
router.delete('/:id', auth, allowRoles('admin', 'manager'), deleteRoute);

// SR কে রুট অ্যাসাইন
router.post('/:id/assign', auth, allowRoles('admin', 'manager'), assignWorkerToRoute);

// রুটের SR তালিকা
router.get('/:id/workers', auth, checkTeamAccess, getRouteWorkers);

module.exports = router;
