const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    createNotification,
    getMyNotifications,
    markRead,
    markAllRead,
    getSentHistory,
    deleteNotification,
    createSchedule,
    listSchedules,
    cancelSchedule,
} = require('../controllers/notification.controller');

// নিজের bell — যেকোনো logged-in staff
router.get('/',           auth, getMyNotifications);
router.patch('/read-all', auth, markAllRead);
router.patch('/:id/read', auth, markRead);

// পাঠানো/ম্যানেজ — আপাতত শুধু Admin ও Manager (Phase 1 সিদ্ধান্ত অনুযায়ী)
router.get('/sent',    auth, allowRoles('admin', 'manager'), getSentHistory);
router.post('/',       auth, allowRoles('admin', 'manager'), createNotification);
router.delete('/:id',  auth, allowRoles('admin', 'manager'), deleteNotification);

// নির্ধারিত/পুনরাবৃত্ত (scheduled/recurring) — Admin ও Manager
router.get('/schedule',       auth, allowRoles('admin', 'manager'), listSchedules);
router.post('/schedule',      auth, allowRoles('admin', 'manager'), createSchedule);
router.delete('/schedule/:id', auth, allowRoles('admin', 'manager'), cancelSchedule);

module.exports = router;
