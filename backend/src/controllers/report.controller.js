// ============================================================
// REPORT CONTROLLER — INDEX
//
// এই ফাইলটি আগে ৪৩KB একটাই ফাইল ছিল।
// এখন ৪টি focused ফাইলে ভাগ করা হয়েছে:
//
//   report.analytics.js         → KPI, top-products, top-shops, archive, employee PDF
//   report.sales.js             → Sales report, Attendance report
//   report.commission-credit.js → Commission report, Credit recovery report
//   report.financial.js         → P&L Statement, Ledger
//   report.exports.js           → Excel ও PDF export helpers (internal)
//
// router (report.routes.js) এ কোনো পরিবর্তন দরকার নেই —
// module.exports একই রেখে দেওয়া হয়েছে।
// ============================================================

const { getDashboardKPI, getTopProducts, getTopShops, getMonthlyArchive, getEmployeePDFReport } =
    require('./report.analytics');

const { getSalesReport, getAttendanceReport } =
    require('./report.sales');

const { getCommissionReport, getCreditReport } =
    require('./report.commission-credit');

const { getPLStatement, getLedger } =
    require('./report.financial');

module.exports = {
    getDashboardKPI,
    getSalesReport,
    getAttendanceReport,
    getCommissionReport,
    getCreditReport,
    getEmployeePDFReport,
    getPLStatement,
    getLedger,
    getMonthlyArchive,
    getTopProducts,
    getTopShops,
};
