const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { isAdmin, allowRoles } = require('../middlewares/roleCheck');

const {
    getTeams,
    getTeam,
    createTeam,
    updateTeam,
    setTeamTarget,
    assignSRToTeam,
    getMyTeam,
    setSRTarget,
    getAvailableManagers,
    getUnassignedSRs
} = require('../controllers/team.controller');

// Manager middleware
const isManager = allowRoles('manager', 'admin');

// ============================================================
// TEAM ROUTES
// Base: /api/teams
// ============================================================

// ── Admin Routes ──────────────────────────────────────────

// সব টিম দেখা (Admin)
router.get('/',                      auth, isAdmin, getTeams);

// টিমহীন ম্যানেজার তালিকা (Admin) — /teams/:id এর আগে রাখতে হবে
router.get('/available-managers',    auth, isAdmin, getAvailableManagers);

// টিমহীন SR তালিকা (Admin)
router.get('/unassigned-srs',        auth, isAdmin, getUnassignedSRs);

// নতুন টিম তৈরি (Admin)
router.post('/',                     auth, isAdmin, createTeam);

// একটি টিমের বিস্তারিত (Admin)
router.get('/:id',                   auth, isAdmin, getTeam);

// টিম আপডেট — নাম, ম্যানেজার ইত্যাদি (Admin)
router.put('/:id',                   auth, isAdmin, updateTeam);

// শুধু টিমের টার্গেট সেট (Admin)
router.patch('/:id/target',          auth, isAdmin, setTeamTarget);

// SR-দের টিমে যোগ করা (Admin)
router.put('/:id/members',           auth, isAdmin, assignSRToTeam);

// ── Manager Routes ────────────────────────────────────────

// নিজের টিম দেখা (Manager)
router.get('/manager/my',            auth, isManager, getMyTeam);

// নিজের টিমের SR-এর টার্গেট সেট (Manager)
router.patch('/sr/:srId/target',     auth, isManager, setSRTarget);

module.exports = router;
