const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    createNotice,
    getNotices,
    getAllNotices,
    deleteNotice
} = require('../controllers/notice.controller');

// সক্রিয় নোটিশ দেখা (সবাই)
router.get('/',       auth, getNotices);

// সব নোটিশ (Admin/Manager)
router.get('/all',    auth, allowRoles('admin','manager','supervisor'), getAllNotices);

// নোটিশ তৈরি
router.post('/',      auth, allowRoles('admin','manager','supervisor'), createNotice);

// নোটিশ মুছা
router.delete('/:id', auth, allowRoles('admin','manager','supervisor'), deleteNotice);

module.exports = router;
