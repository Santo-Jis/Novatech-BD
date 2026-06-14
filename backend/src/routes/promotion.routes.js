const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    getAllPromotions, createPromotion, updatePromotion,
    deletePromotion, getActivePromotions, calculatePromotions, getPromotionReport,
} = require('../controllers/promotion.controller');

// Worker
router.get('/active',        auth, allowRoles('worker','manager','admin'), getActivePromotions);
router.post('/calculate',    auth, allowRoles('worker'),                   calculatePromotions);

// Admin/Manager
router.get('/',              auth, allowRoles('admin','manager'),          getAllPromotions);
router.post('/',             auth, allowRoles('admin'),                    createPromotion);
router.put('/:id',           auth, allowRoles('admin'),                    updatePromotion);
router.delete('/:id',        auth, allowRoles('admin'),                    deletePromotion);
router.get('/:id/report',    auth, allowRoles('admin','manager'),          getPromotionReport);

module.exports = router;
