const express  = require('express');
const router   = express.Router();
const { auth } = require('../middlewares/auth');
const {
    allowRoles,
    checkTeamAccess,
    canViewFinance
} = require('../middlewares/roleCheck');

const {
    getSalesReport,
    getAttendanceReport,
    getCommissionReport,
    getCreditReport,
    getEmployeePDFReport,
    getDashboardKPI,
    getPLStatement,
    getLedger,
    getMonthlyArchive,
    getTopProducts,
    getTopShops
} = require('../controllers/report.controller');

// ============================================================
// REPORT ROUTES
// Base: /api/reports
// ============================================================

// KPI Dashboard
router.get('/kpi',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm'),
    checkTeamAccess,
    getDashboardKPI
);

// বিক্রয় রিপোর্ট
router.get('/sales',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'),
    checkTeamAccess,
    getSalesReport
);

// হাজিরা রিপোর্ট
router.get('/attendance',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'),
    checkTeamAccess,
    getAttendanceReport
);

// কমিশন রিপোর্ট
router.get('/commission',
    auth,
    canViewFinance,
    getCommissionReport
);

// ক্রেডিট রিকভারি রিপোর্ট
router.get('/credit',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'accountant'),
    checkTeamAccess,
    getCreditReport
);

// কর্মচারী PDF
router.get('/employee/:id/pdf',
    auth,
    allowRoles('admin', 'manager'),
    getEmployeePDFReport
);

// P&L Statement
router.get('/pl',
    auth,
    canViewFinance,
    checkTeamAccess,
    getPLStatement
);

// লেজার
router.get('/ledger',
    auth,
    canViewFinance,
    checkTeamAccess,
    getLedger
);

// মাসিক Archive
router.get('/archive',
    auth,
    canViewFinance,
    checkTeamAccess,
    getMonthlyArchive
);

// শীর্ষ পণ্য
router.get('/top-products',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'),
    checkTeamAccess,
    getTopProducts
);

// শীর্ষ দোকান
router.get('/top-shops',
    auth,
    allowRoles('admin', 'manager', 'supervisor', 'asm', 'rsm', 'accountant'),
    checkTeamAccess,
    getTopShops
);

module.exports = router;
