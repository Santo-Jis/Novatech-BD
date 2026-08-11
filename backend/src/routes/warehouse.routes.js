const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getWarehouses,
    getWarehouse,
    getWarehouseStock,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse
} = require('../controllers/warehouse.controller');

// ============================================================
// WAREHOUSE ROUTES (মাল্টি-ওয়্যারহাউজ ধাপ ২)
// Base: /api/warehouses
// ============================================================

// দেখা — admin, manager, accountant (PO/সাপ্লায়ারের মতো একই কনভেনশন)
router.get('/',           auth, allowRoles('admin', 'manager', 'accountant'), getWarehouses);
router.get('/:id',        auth, allowRoles('admin', 'manager', 'accountant'), getWarehouse);
router.get('/:id/stock',  auth, allowRoles('admin', 'manager', 'accountant'), getWarehouseStock); // ✅ ধাপ ৫

// তৈরি/সম্পাদনা/ডিলিট — শুধু admin (গুদাম সেটআপ একটা স্ট্রাকচারাল সিদ্ধান্ত)
router.post('/',      auth, allowRoles('admin'), createWarehouse);
router.patch('/:id',  auth, allowRoles('admin'), updateWarehouse);
router.delete('/:id', auth, allowRoles('admin'), deleteWarehouse);

module.exports = router;
