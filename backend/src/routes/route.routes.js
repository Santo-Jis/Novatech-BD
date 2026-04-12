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

// Worker রুট request করবে
router.post('/request', auth, allowRoles('worker'), async (req, res) => {
  try {
    const { route_name, description } = req.body
    if (!route_name) return res.status(400).json({ success: false, message: 'রুটের নাম দিন' })
    const { query } = require('../config/db')
    const result = await query(
      `INSERT INTO routes (name, description, status, requested_by, requested_at, is_active)
       VALUES ($1, $2, 'pending', $3, NOW(), false) RETURNING *`,
      [route_name, description || '', req.user.id]
    )
    res.json({ success: true, message: 'রুট request পাঠানো হয়েছে ✅', data: result.rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'সমস্যা হয়েছে' })
  }
})
