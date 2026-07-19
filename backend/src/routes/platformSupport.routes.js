const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/platformSupport.controller');
const { platformAuth, requireScope } = require('../middlewares/platformAuth');
const { auditLog } = require('../services/platformAudit.service');

// সব রুট platform_staff login বাধ্যতামূলক
router.use(platformAuth);

// ─── User lookup/unblock/reset — full ও support দুজনেই পারবে ───
router.get(
    '/users/search',
    requireScope('full', 'support'),
    ctrl.lookupUser
);

router.post(
    '/users/:id/unblock',
    requireScope('full', 'support'),
    auditLog('user.unblock', 'user'),
    ctrl.unblockUserAccount
);

router.post(
    '/users/:id/reset-password-link',
    requireScope('full', 'support'),
    auditLog('user.reset_password_link', 'user'),
    ctrl.triggerPasswordReset
);

// ─── Tickets ─────────────────────────────────────────────────
router.get(
    '/tickets',
    requireScope('full', 'support'),
    ctrl.listTickets
);

router.post(
    '/tickets',
    requireScope('full', 'support'),
    auditLog('ticket.create', 'ticket'),
    ctrl.createTicket
);

router.patch(
    '/tickets/:id',
    requireScope('full', 'support'),
    auditLog('ticket.update', 'ticket'),
    ctrl.updateTicket
);

module.exports = router;
