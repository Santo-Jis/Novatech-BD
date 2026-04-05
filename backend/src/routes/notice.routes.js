const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { isAdmin, allowRoles } = require('../middlewares/roleCheck');

const {
    createNotice,
    getNotices,
    getAllNotices,
    deleteNotice
} = require('../controllers/notice.controller');

// ============================================================
// NOTICE ROUTES
// Base: /api/notices
// ============================================================

// সক্রিয় নোটিশ দেখা (সবাই — role অনুযায়ী ফিল্টার)
router.get('/',     auth, getNotices);

// সব নোটিশ দেখা (Admin/Manager)
router.get('/all',  auth, allowRoles(['admin','manager','supervisor']), getAllNotices);

// নোটিশ তৈরি (Admin/Manager)
router.post('/',    auth, allowRoles(['admin','manager','supervisor']), createNotice);

// নোটিশ মুছা (নিজের তৈরি)
router.delete('/:id', auth, allowRoles(['admin','manager','supervisor']), deleteNotice);

module.exports = router;
