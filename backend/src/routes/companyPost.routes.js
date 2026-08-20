const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    getCompanyPosts, createCompanyPost, updateCompanyPost, deleteCompanyPost,
} = require('../controllers/companyPost.controller');

// Admin/Manager
router.get('/',        auth, allowRoles('admin', 'manager'), getCompanyPosts);
router.post('/',       auth, allowRoles('admin'),             createCompanyPost);
router.put('/:id',     auth, allowRoles('admin'),             updateCompanyPost);
router.delete('/:id',  auth, allowRoles('admin'),             deleteCompanyPost);

module.exports = router;
