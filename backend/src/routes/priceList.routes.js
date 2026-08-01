const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getPriceLists,
    getPriceList,
    createPriceList,
    updatePriceList,
    deletePriceList,
    setPriceListItems,
    removePriceListItem,
    addPriceListAreas,
    removePriceListArea,
    addPriceListCustomers,
    removePriceListCustomer,
} = require('../controllers/priceList.controller');

// ============================================================
// PRICE LIST ROUTES
// Base: /api/price-lists
// দেখা — admin, manager, accountant (PO/সাপ্লায়ারের মতো একই কনভেনশন)
// তৈরি/সম্পাদনা/অ্যাসাইনমেন্ট — pricing সিদ্ধান্ত, admin/manager শুধু
// ============================================================
router.get('/',    auth, allowRoles('admin', 'manager', 'accountant'), getPriceLists);
router.get('/:id', auth, allowRoles('admin', 'manager', 'accountant'), getPriceList);

router.post('/',    auth, allowRoles('admin', 'manager'), createPriceList);
router.put('/:id',  auth, allowRoles('admin', 'manager'), updatePriceList);
router.delete('/:id', auth, allowRoles('admin', 'manager'), deletePriceList);

router.put('/:id/items',                  auth, allowRoles('admin', 'manager'), setPriceListItems);
router.delete('/:id/items/:productId',    auth, allowRoles('admin', 'manager'), removePriceListItem);

router.post('/:id/areas',                 auth, allowRoles('admin', 'manager'), addPriceListAreas);
router.delete('/:id/areas/:routeId',      auth, allowRoles('admin', 'manager'), removePriceListArea);

router.post('/:id/customers',             auth, allowRoles('admin', 'manager'), addPriceListCustomers);
router.delete('/:id/customers/:customerId', auth, allowRoles('admin', 'manager'), removePriceListCustomer);

module.exports = router;
