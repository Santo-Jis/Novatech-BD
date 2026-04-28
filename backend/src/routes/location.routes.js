const express = require('express');
const router  = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const requireCheckin = require('../middlewares/requireCheckin');
const { updateLocation, updatePresence, getTeamLocations, getMapsKey } = require('../controllers/location.controller');

// ============================================================
// LOCATION ROUTES
// Base: /api/location
// ============================================================

// Worker নিজের লোকেশন পাঠাবে
// ✅ requireCheckin: চেক-ইন না করলে tracking হবে না — ব্যক্তিগত গোপনীয়তা রক্ষা
router.post('/update',   auth, allowRoles('worker'), requireCheckin, updateLocation);

// Worker অনলাইন/অফলাইন স্ট্যাটাস
router.post('/presence', auth, allowRoles('worker'), updatePresence);

// Manager টিমের সব লোকেশন দেখবে
router.get('/team',      auth, allowRoles('manager', 'supervisor', 'asm', 'rsm', 'admin'), getTeamLocations);

// Frontend-এ Google Maps Key সরবরাহ (secure — login ছাড়া পাবে না)
router.get('/maps-key',  auth, getMapsKey);

module.exports = router;
