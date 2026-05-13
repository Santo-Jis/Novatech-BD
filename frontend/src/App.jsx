import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './store/auth.store'
import { FirebaseProvider } from './firebase/notifications'
import PermissionSetup, { usePermissionSetup } from './components/PermissionSetup'
import AppUpdateDialog from './components/AppUpdateDialog'   // ← নতুন

// Layouts
import AdminLayout    from './layouts/AdminLayout'
import ManagerLayout  from './layouts/ManagerLayout'
import WorkerLayout   from './layouts/WorkerLayout'
import CustomerLayout from './layouts/CustomerLayout'

// Customer Pages
import CustomerDashboard from './pages/customer/CustomerDashboard'

// Auth
import Login from './pages/Login'
import LandingPage from './pages/LandingPage'

// Admin Pages
import AdminDashboard   from './pages/admin/Dashboard'
import AdminEmployees   from './pages/admin/Employees'
import EmployeeForm     from './pages/admin/EmployeeForm'
import PendingApprovals from './pages/admin/PendingApprovals'
import AdminReports     from './pages/admin/Reports'
import CommissionPayment from './pages/admin/CommissionPayment'
import SalaryPayment    from './pages/admin/SalaryPayment'
import AIInsights       from './pages/admin/AIInsights'
import AdminSettings    from './pages/admin/Settings'
import AdminProducts    from './pages/admin/Products'
import AdminNotices     from './pages/admin/Notices'
import SRRecruitmentDashboard from './pages/admin/SRRecruitmentDashboard'
import AdminTeams from './pages/admin/Teams'

// Shared Pages
import AIChat        from './pages/shared/AIChat'
import NoticesView   from './pages/shared/NoticesView'
import SRApplicationForm from './pages/SRApplicationForm'
import CustomerPortal from './pages/customer/CustomerPortal'

// ── Google OAuth Popup Callback ──────────────────────────────
// Web login-এ popup redirect হয়ে এখানে আসবে
// token URL hash-এ থাকবে, opener window polling করে নেবে
const PortalOAuthCallback = () => {
  // এই page-এ কিছু render করার দরকার নেই
  // webGoogleLogin() এর polling এই page-এর URL থেকে token নেবে
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#f0f4ff', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'4px solid #c7d2fe',
        borderTop:'4px solid #4f46e5', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'#4f46e5', fontWeight:600, fontSize:14 }}>লগইন সম্পন্ন হচ্ছে...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// Manager Pages
import ManagerDashboard   from './pages/manager/Dashboard'
import ManagerTeam        from './pages/manager/Team'
import VisitLog           from './pages/manager/VisitLog'
import ManagerOrders      from './pages/manager/Orders'
import ManagerSettlements from './pages/manager/Settlements'
import SRLedger           from './pages/manager/SRLedger'
import SalesOrderLedger   from './pages/manager/SalesOrderLedger'
import ManagerAttendance  from './pages/manager/Attendance'
import ManagerCustomers   from './pages/manager/Customers'
import ManagerRoutes      from './pages/manager/Routes'
import VisitOrder         from './pages/manager/VisitOrder'
import LiveTracking       from './pages/manager/LiveTracking'
import TrailHistory      from './pages/manager/TrailHistory'
import ExpenseApprovals  from './pages/manager/ExpenseApprovals'
import ReturnApprovals  from './pages/manager/ReturnApprovals'

// Worker Pages
import WorkerDashboard  from './pages/worker/Dashboard'
import WorkerAttendance from './pages/worker/Attendance'
import RouteSelect      from './pages/worker/RouteSelect'
import OrderForm        from './pages/worker/OrderForm'
import CustomerList     from './pages/worker/CustomerList'
import VisitPage        from './pages/worker/VisitPage'
import SalesForm        from './pages/worker/SalesForm'
import OTPVerify        from './pages/worker/OTPVerify'
import WorkerSettlement from './pages/worker/Settlement'
import Commission       from './pages/worker/Commission'
import SalaryHistory    from './pages/worker/SalaryHistory'
import Profile          from './pages/worker/Profile'
import SalesHistory     from './pages/worker/SalesHistory'
import StockStatus      from './pages/worker/StockStatus'
import LedgerHistory    from './pages/worker/LedgerHistory'
import ExpenseForm      from './pages/worker/ExpenseForm'
import ExpenseHistory   from './pages/worker/ExpenseHistory'
import ReturnForm       from './pages/worker/ReturnForm'
import ReturnHistory    from './pages/worker/ReturnHistory'

// ============================================================
// Protected Route Component
// ============================================================

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, token } = useAuthStore()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}

// ============================================================
// Role-based Home redirect
// ============================================================

const HomeRedirect = () => {
  const { user } = useAuthStore()

  // portal_jwt থাকলে → customer dashboard
  const hasPortalJWT = typeof window !== 'undefined' &&
    Object.keys(localStorage).some(k => k.startsWith('portal_jwt_'))
  if (hasPortalJWT && !user) return <Navigate to="/customer/dashboard" replace />

  // login নেই → LandingPage দেখাও
  if (!user) return <LandingPage />

  // logged-in → dashboard-এ পাঠাও, কিন্তু history তে /landing রেখে যাও
  // যাতে back বাটনে LandingPage দেখা যায়
  switch (user.role) {
    case 'admin':
      return <Navigate to="/admin/dashboard" replace={false} />
    case 'manager':
    case 'supervisor':
    case 'asm':
    case 'rsm':
    case 'accountant':
      return <Navigate to="/manager/dashboard" replace={false} />
    case 'worker':
      return <Navigate to="/worker/dashboard" replace={false} />
    default:
      return <Navigate to="/login" replace />
  }
}

// ============================================================
// Customer Guard — portal_jwt চেক করে
// ============================================================

import { Outlet } from 'react-router-dom'

const CustomerGuard = () => {
  const hasPortalJWT = typeof window !== 'undefined' &&
    Object.keys(localStorage).some(k => k.startsWith('portal_jwt_'))

  // portal_jwt আছে → ভেতরে যাও
  if (hasPortalJWT) return <Outlet />

  // URL-এ ?token= আছে (WhatsApp লিংক) → CustomerPortal নিজেই handle করবে
  const params = new URLSearchParams(window.location.search)
  const urlToken = params.get('token')
  if (urlToken) return <Outlet />

  // কোনো token নেই → LandingPage এ পাঠাও
  return <Navigate to="/landing" replace />
}

// ============================================================
// Inner App
// ============================================================

function AppWithPermissions() {
  const { show: showPermissions, close: closePermissions } = usePermissionSetup()
  const { silentRefresh, user } = useAuthStore()

  // ✅ Page refresh হলে accessToken memory থেকে হারায়।
  // App mount-এ একবার /auth/refresh call করে HttpOnly cookie থেকে
  // নতুন accessToken নেওয়া হয় — user logged-in থাকে।
  // refreshing শেষ না হওয়া পর্যন্ত ProtectedRoute render হবে না (flicker বন্ধ)।
  const [authReady, setAuthReady] = useState(false)
  useEffect(() => {
    if (user) {
      // localStorage-এ user আছে — silentRefresh চেষ্টা করো
      silentRefresh().finally(() => setAuthReady(true))
    } else {
      setAuthReady(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!authReady) {
    // token refresh চলছে — blank screen বা spinner দেখাও
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <div style={{ width:36, height:36, border:'4px solid #e0e7ff',
          borderTop:'4px solid #4f46e5', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <>
      {/* Auto Update Dialog — Android App এ নতুন version থাকলে দেখাবে */}
      <AppUpdateDialog />

      {/* Permission Setup Modal */}
      {showPermissions && (
        <PermissionSetup onDone={closePermissions} />
      )}

      <Routes>
      {/* Public */}
      <Route path="/"                      element={<HomeRedirect />} />
      <Route path="/landing"              element={<LandingPage />} />
      <Route path="/login"                element={<Login />} />
      <Route path="/apply/sr"             element={<SRApplicationForm />} />
      <Route path="/customer-portal"      element={<Navigate to="/customer/dashboard" replace />} />
      <Route path="/portal-oauth-callback" element={<PortalOAuthCallback />} />

      {/* ── CUSTOMER ROUTES ── */}
      <Route element={<CustomerGuard />}>
        <Route path="/customer" element={<CustomerLayout />}>
          <Route index                  element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"       element={<CustomerPortal defaultTab="summary"  />} />
          <Route path="orders"          element={<CustomerPortal defaultTab="orders"   />} />
          <Route path="invoices"        element={<CustomerPortal defaultTab="invoices" />} />
          <Route path="payments"        element={<CustomerPortal defaultTab="payments" />} />
          <Route path="notifications"   element={<CustomerPortal defaultTab="summary"  />} />
        </Route>
      </Route>

      {/* Unauthorized */}
      <Route path="/unauthorized" element={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600">অ্যাক্সেস নেই</h1>
            <p className="text-gray-600 mt-2">আপনার এই পৃষ্ঠা দেখার অনুমতি নেই।</p>
          </div>
        </div>
      } />

      {/* ── ADMIN ROUTES ── */}
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index                  element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"       element={<AdminDashboard />} />
        <Route path="employees"       element={<AdminEmployees />} />
        <Route path="employees/new"   element={<EmployeeForm />} />
        <Route path="employees/:id"   element={<EmployeeForm />} />
        <Route path="pending"         element={<PendingApprovals />} />
        <Route path="reports"         element={<AdminReports />} />
        <Route path="commission-pay"  element={<CommissionPayment />} />
        <Route path="salary-pay"      element={<SalaryPayment />} />
        <Route path="ai-insights"     element={<AIInsights />} />
        <Route path="ai-chat"         element={<AIChat />} />
        <Route path="notices"         element={<AdminNotices />} />
        <Route path="recruitment"     element={<SRRecruitmentDashboard />} />
        <Route path="teams"           element={<AdminTeams />} />
        <Route path="settings"        element={<AdminSettings />} />
        <Route path="products"        element={<AdminProducts />} />
      </Route>

      {/* ── MANAGER ROUTES ── */}
      <Route path="/manager" element={
        <ProtectedRoute allowedRoles={['manager', 'supervisor', 'asm', 'rsm', 'accountant']}>
          <ManagerLayout />
        </ProtectedRoute>
      }>
        <Route index               element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"    element={<ManagerDashboard />} />
        <Route path="team"                        element={<ManagerTeam />} />
        <Route path="team/:workerId/visits"       element={<VisitLog />} />
        <Route path="orders"       element={<ManagerOrders />} />
        <Route path="settlements"  element={<ManagerSettlements />} />
        <Route path="attendance"   element={<ManagerAttendance />} />
        <Route path="customers"    element={<ManagerCustomers />} />
        <Route path="routes"       element={<ManagerRoutes />} />
        <Route path="visit-order"  element={<VisitOrder />} />
        <Route path="live-tracking" element={<LiveTracking />} />
        <Route path="trail-history" element={<TrailHistory />} />
        <Route path="sr-ledger"    element={<SRLedger />} />
        <Route path="order-ledger"  element={<SalesOrderLedger />} />
        <Route path="expense"      element={<ExpenseApprovals />} />
        <Route path="returns"      element={<ReturnApprovals />} />
        <Route path="ai-chat"      element={<AIChat />} />
        <Route path="notices"      element={<NoticesView />} />
      </Route>

      {/* ── WORKER ROUTES ── */}
      <Route path="/worker" element={
        <ProtectedRoute allowedRoles={['worker']}>
          <WorkerLayout />
        </ProtectedRoute>
      }>
        <Route index               element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"    element={<WorkerDashboard />} />
        <Route path="attendance"   element={<WorkerAttendance />} />
        <Route path="route"        element={<RouteSelect />} />
        <Route path="order"        element={<OrderForm />} />
        <Route path="customers"    element={<CustomerList />} />
        <Route path="visit/:id"    element={<VisitPage />} />
        <Route path="sales/:id"    element={<SalesForm />} />
        <Route path="otp/:id"      element={<OTPVerify />} />
        <Route path="settlement"   element={<WorkerSettlement />} />
        <Route path="commission"   element={<Commission />} />
        <Route path="salary-history" element={<SalaryHistory />} />
        <Route path="profile"      element={<Profile />} />
        <Route path="sales-history" element={<SalesHistory />} />
        <Route path="stock-status"  element={<StockStatus />} />
        <Route path="ledger-history" element={<LedgerHistory />} />
        <Route path="expense"          element={<ExpenseForm />} />
        <Route path="expense-history"  element={<ExpenseHistory />} />
        <Route path="return-form"      element={<ReturnForm />} />
        <Route path="return-history"   element={<ReturnHistory />} />
        <Route path="notices"      element={<NoticesView />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-gray-300">404</h1>
            <p className="text-gray-500 mt-2">পৃষ্ঠা পাওয়া যায়নি।</p>
          </div>
        </div>
      } />
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <FirebaseProvider>
      <AppWithPermissions />
    </FirebaseProvider>
  )
}
