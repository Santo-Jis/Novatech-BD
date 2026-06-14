const express = require('express');
const router  = express.Router();
const { auth }       = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');
const {
    getAllDeliveries, assignDelivery, getMyTasks,
    startDelivery, arriveDelivery, completeDelivery,
    failDelivery, getCustomerDeliveries,
} = require('../controllers/delivery.controller');

router.get('/',                      auth, allowRoles('manager','admin'), getAllDeliveries);
router.post('/assign',               auth, allowRoles('manager','admin'), assignDelivery);
router.get('/my-tasks',              auth, allowRoles('worker'),          getMyTasks);
router.put('/:id/start',             auth, allowRoles('worker'),          startDelivery);
router.put('/:id/arrive',            auth, allowRoles('worker'),          arriveDelivery);
router.put('/:id/complete',          auth, allowRoles('worker'),          completeDelivery);
router.put('/:id/fail',              auth, allowRoles('worker'),          failDelivery);
router.get('/customer/:customer_id', auth,                                getCustomerDeliveries);

module.exports = router;
