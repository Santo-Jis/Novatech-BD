const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const { allowRoles } = require('../middlewares/roleCheck');

const {
    getSuppliers,
    getSupplier,
    createSupplier,
    updateSupplier,
    deleteSupplier
} = require('../controllers/supplier.controller');

// ============================================================
// SUPPLIER ROUTES
// Base: /api/suppliers
// ============================================================

// সাপ্লায়ার তালিকা / বিস্তারিত (admin, manager, accountant দেখতে পারবে)
router.get('/',    auth, allowRoles('admin', 'manager', 'accountant'), getSuppliers);
router.get('/:id', auth, allowRoles('admin', 'manager', 'accountant'), getSupplier);

// তৈরি / সম্পাদনা / ডিলিট (procurement সিদ্ধান্ত — admin, manager)
router.post('/',    auth, allowRoles('admin', 'manager'), createSupplier);
router.put('/:id',  auth, allowRoles('admin', 'manager'), updateSupplier);
router.delete('/:id', auth, allowRoles('admin', 'manager'), deleteSupplier);

module.exports = router;
