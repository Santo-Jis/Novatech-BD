const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const ctrl    = require('../controllers/platformSupport.controller');
const { platformAuth, requireScope } = require('../middlewares/platformAuth');
const { auditLog } = require('../services/platformAudit.service');

// ─── Ticket attachment upload (screenshot ইত্যাদি) ───────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('শুধু ছবি আপলোড করা যাবে।'));
        }
        cb(null, true);
    }
});

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

// ─── Customer (রিটেইলার) lookup/reactivate/gmail-lock/devices ─
router.get(
    '/customers/search',
    requireScope('full', 'support'),
    ctrl.lookupCustomer
);

router.post(
    '/customers/:id/reactivate',
    requireScope('full', 'support'),
    auditLog('customer.reactivate', 'customer'),
    ctrl.reactivateCustomer
);

router.post(
    '/customers/:id/clear-gmail-lock',
    requireScope('full', 'support'),
    auditLog('customer.clear_gmail_lock', 'customer'),
    ctrl.clearGmailLock
);

router.post(
    '/customers/:id/revoke-devices',
    requireScope('full', 'support'),
    auditLog('customer.revoke_devices', 'customer'),
    ctrl.revokeCustomerDevices
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
    upload.single('attachment'),
    auditLog('ticket.create', 'ticket'),
    ctrl.createTicket
);

router.post(
    '/tickets/:id/attachment',
    requireScope('full', 'support'),
    upload.single('attachment'),
    auditLog('ticket.add_attachment', 'ticket'),
    ctrl.addTicketAttachment
);

router.patch(
    '/tickets/:id',
    requireScope('full', 'support'),
    auditLog('ticket.update', 'ticket'),
    ctrl.updateTicket
);

router.get(
    '/tickets/:id/notes',
    requireScope('full', 'support'),
    ctrl.listTicketNotes
);

router.post(
    '/tickets/:id/notes',
    requireScope('full', 'support'),
    auditLog('ticket.add_note', 'ticket'),
    ctrl.addTicketNote
);

// ─── কাস্টমারের Invoice/Payment/Statement হিস্ট্রি (রিড-অনলি) ──
router.get(
    '/customers/:id/invoices',
    requireScope('full', 'support'),
    ctrl.getCustomerInvoiceHistory
);

router.get(
    '/customers/:id/payments',
    requireScope('full', 'support'),
    ctrl.getCustomerPaymentHistory
);

router.get(
    '/customers/:id/statement',
    requireScope('full', 'support'),
    ctrl.getCustomerStatementHistory
);

// ─── Audit Log (support: শুধু নিজের, full: সবার) ──────────────
router.get(
    '/audit-log',
    requireScope('full', 'support'),
    ctrl.listAuditLog
);

// ─── নোটিফিকেশন পোলিং ─────────────────────────────────────────
router.get(
    '/notifications-check',
    requireScope('full', 'support'),
    ctrl.checkNotifications
);

// ─── Canned Responses (টেমপ্লেট উত্তর) ────────────────────────
router.get(
    '/canned-responses',
    requireScope('full', 'support'),
    ctrl.listCannedResponses
);

router.post(
    '/canned-responses',
    requireScope('full', 'support'),
    auditLog('canned_response.create', 'canned_response'),
    ctrl.createCannedResponse
);

router.delete(
    '/canned-responses/:id',
    requireScope('full', 'support'),
    auditLog('canned_response.delete', 'canned_response'),
    ctrl.deleteCannedResponse
);

module.exports = router;
