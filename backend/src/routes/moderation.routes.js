const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    getModerationQueue,
    dismissCompanyPost, hideCompanyPost, restoreCompanyPost,
    dismissCustomerPost, hideCustomerPost, restoreCustomerPost,
} = require('../controllers/moderation.controller');

// ✅ NEW (Redesign Phase ১.৮ — মডারেশন কিউ)
router.get('/queue', auth, allowRoles('admin', 'manager'), getModerationQueue);

router.post('/company-posts/:id/dismiss', auth, allowRoles('admin', 'manager'), dismissCompanyPost);
router.post('/company-posts/:id/hide',    auth, allowRoles('admin', 'manager'), hideCompanyPost);
router.post('/company-posts/:id/restore', auth, allowRoles('admin', 'manager'), restoreCompanyPost);

router.post('/customer-posts/:id/dismiss', auth, allowRoles('admin', 'manager'), dismissCustomerPost);
router.post('/customer-posts/:id/hide',    auth, allowRoles('admin', 'manager'), hideCustomerPost);
router.post('/customer-posts/:id/restore', auth, allowRoles('admin', 'manager'), restoreCustomerPost);

module.exports = router;
