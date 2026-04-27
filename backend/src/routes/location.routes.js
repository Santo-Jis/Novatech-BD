const express = require('express');
const router  = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const { updateLocation, updatePresence, getTeamLocations } = require('../controllers/location.controller');

// ============================================================
// LOCATION ROUTES
// Base: /api/location
// ============================================================

// Worker নিজের লোকেশন পাঠাবে
router.post('/update',   auth, allowRoles('worker'), updateLocation);

// Worker অনলাইন/অফলাইন স্ট্যাটাস
router.post('/presence', auth, allowRoles('worker'), updatePresence);

// Manager টিমের সব লোকেশন দেখবে
router.get('/team',      auth, allowRoles('manager', 'supervisor', 'asm', 'rsm', 'admin'), getTeamLocations);

module.exports = router;
