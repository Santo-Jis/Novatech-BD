import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/auth.store'
import { FirebaseProvider } from './firebase/notifications'
import PermissionSetup, { usePermissionSetup } from './components/PermissionSetup'
import AppUpdateDialog from './components/AppUpdateDialog'

// ============================================================
// Layouts — lazy import (role-specific, দরকার হলে তখনই লোড)
// ✅ FIX: আগে static import ছিল, সব user-এর জন্যই সব Layout লোড হত।
//         এখন lazy — শুধু সেই role-এর user navigate করলেই লোড হবে।
// ============================================================
const AdminLayout    = lazy(() => import('./layouts/AdminLayout'))
const ManagerLayout  = lazy(() => import('./layouts/ManagerLayout'))
const WorkerLayout   = lazy(() => import('./layouts/WorkerLayout'))
const CustomerLayout = lazy(() => import('./layouts/CustomerLayout'))

// ============================================================
// Lazy Page Imports — শুধু route match হলে load হবে
// ============================================================

// Auth / Public
const Login           = lazy(() => import('./pages/Login'))
const LandingPage     = lazy(() => import('./pages/LandingPage'))
const SRApplicationForm = lazy(() => import('./pages/SRApplicationForm'))

// Customer
const CustomerPortal  = lazy(() => import('./pages/customer/CustomerPortal'))
const CustomerAIChat  = lazy(() => import('./pages/customer/CustomerAIChat'))

// Shared
const AIChat          = lazy(() => import('./pages/shared/AIChat'))
const NoticesView     = lazy(() => import('./pages/shared/NoticesView'))

// Admin
const AdminDashboard          = lazy(() => import('./pages/admin/Dashboard'))
const AdminEmployees          = lazy(() => import('./pages/admin/Employees'))
const EmployeeForm            = lazy(() => import('./pages/admin/EmployeeForm'))
const PendingApprovals        = lazy(() => import('./pages/admin/PendingApprovals'))
const AdminReports            = lazy(() => import('./pages/admin/Reports'))
const CommissionPayment       = lazy(() => import('./pages/admin/CommissionPayment'))
const SalaryPayment           = lazy(() => import('./pages/admin/SalaryPayment'))
const AIInsights              = lazy(() => import('./pages/admin/AIInsights'))
const AdminSettings           = lazy(() => import('./pages/admin/Settings'))
const AdminProducts           = lazy(() => import('./pages/admin/Products'))
const AdminNotices            = lazy(() => import('./pages/admin/Notices'))
const AuditLogs               = lazy(() => import('./pages/admin/AuditLogs'))
const PortalReturnRequests    = lazy(() => import('./pages/admin/PortalReturnRequests'))
const CustomerRequestsPage    = lazy(() => import('./pages/admin/CustomerRequestsPage'))
const SRRecruitmentDashboard  = lazy(() => import('./pages/admin/SRRecruitmentDashboard'))
const AdminTeams              = lazy(() => import('./pages/admin/Teams'))
const AdminCreditSettings     = lazy(() => import('./pages/admin/AdminCreditSettings'))
const PortalDeviceManager     = lazy(() => import('./pages/admin/PortalDeviceManager'))

// Manager
const ManagerDashboard        = lazy(() => import('./pages/manager/Dashboard'))
const ManagerTeam             = lazy(() => import('./pages/manager/Team'))
const VisitLog                = lazy(() => import('./pages/manager/VisitLog'))
const ManagerOrders           = lazy(() => import('./pages/manager/Orders'))
const ManagerSettlements      = lazy(() => import('./pages/manager/Settlements'))
const SRLedger                = lazy(() => import('./pages/manager/SRLedger'))
const SalesOrderLedger        = lazy(() => import('./pages/manager/SalesOrderLedger'))
const ManagerAttendance       = lazy(() => import('./pages/manager/Attendance'))
const ManagerCustomers        = lazy(() => import('./pages/manager/Customers'))
const ManagerRoutes           = lazy(() => import('./pages/manager/Routes'))
const VisitOrder              = lazy(() => import('./pages/manager/VisitOrder'))
const LiveTracking            = lazy(() => import('./pages/manager/LiveTracking'))
const TrailHistory            = lazy(() => import('./pages/manager/TrailHistory'))
const ExpenseApprovals        = lazy(() => import('./pages/manager/ExpenseApprovals'))
const ReturnApprovals         = lazy(() => import('./pages/manager/ReturnApprovals'))
const ManagerPortalDevices    = lazy(() => import('./pages/manager/PortalDevices'))
const CommissionTeam          = lazy(() => import('./pages/manager/CommissionTeam'))
const ManagerCreditApprovals  = lazy(() => import('./pages/manager/ManagerCreditApprovals'))

// Worker
const WorkerDashboard  = lazy(() => import('./pages/worker/Dashboard'))
const WorkerAttendance = lazy(() => import('./pages/worker/Attendance'))
const RouteSelect      = lazy(() => import('./pages/worker/RouteSelect'))
const OrderForm        = lazy(() => import('./pages/worker/OrderForm'))
const CustomerList     = lazy(() => import('./pages/worker/CustomerList'))
const VisitPage        = lazy(() => import('./pages/worker/VisitPage'))
const SalesForm        = lazy(() => import('./pages/worker/SalesForm'))
const OTPVerify        = lazy(() => import('./pages/worker/OTPVerify'))
const WorkerSettlement = lazy(() => import('./pages/worker/Settlement'))
const Commission       = lazy(() => import('./pages/worker/Commission'))
const SalaryHistory    = lazy(() => import('./pages/worker/SalaryHistory'))
const Profile          = lazy(() => import('./pages/worker/Profile'))
const SalesHistory     = lazy(() => import('./pages/worker/SalesHistory'))
const StockStatus      = lazy(() => import('./pages/worker/StockStatus'))
const LedgerHistory    = lazy(() => import('./pages/worker/LedgerHistory'))
const ExpenseForm      = lazy(() => import('./pages/worker/ExpenseForm'))
const ExpenseHistory   = lazy(() => import('./pages/worker/ExpenseHistory'))
const ReturnForm       = lazy(() => import('./pages/worker/ReturnForm'))
const ReturnHistory    = lazy(() => import('./pages/worker/ReturnHistory'))
const MyReturnRequests = lazy(() => import('./pages/worker/MyReturnRequests'))

// ============================================================
// Page Loading Spinner — Suspense fallback
// ============================================================

const PageLoader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #030712 0%, #0a0f1a 40%, #051a0e 100%)',
    flexDirection: 'column', gap: 16,
  }}>
    <div style={{
      width: 36, height: 36,
      border: '4px solid rgba(74,222,128,0.2)',
      borderTop: '4px solid #4ade80',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <p style={{ color: 'rgba(74,222,128,0.6)', fontSize: 13, fontFamily: 'sans-serif', margin: 0 }}>
      লোড হচ্ছে...
    </p>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
)

// ── Google OAuth Popup Callback ──────────────────────────────
const PortalOAuthCallback = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#f0f4ff', flexDirection: 'column', gap: 12,
  }}>
    <div style={{
      width: 40, height: 40,
      border: '4px solid #c7d2fe', borderTop: '4px solid #4f46e5',
      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    }} />
    <p style={{ color: '#4f46e5', fontWeight: 600, fontSize: 14 }}>লগইন সম্পন্ন হচ্ছে...</p>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
)

// ============================================================
// Protected Route Component
// ============================================================

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, token, authReady } = useAuthStore()

  if (!authReady) return <PageLoader />

  if (!token || !user) return <Navigate to="/login" replace />

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

  // ── Role-based prefetch ──────────────────────────────────────
  // ✅ FIX: Login সফল হওয়ার পর background-এ সেই role-এর chunk prefetch।
  //   Navigate হওয়ার আগেই loading শুরু → পেইজে পৌঁছালে সাথে সাথেই দেখাবে।
  //   vite.config.js-এর manualChunks-এ role chunk দিলে একটাই request-এ
  //   সেই role-এর সব পেইজ লোড হবে, পরে সব navigation instant।
  useEffect(() => {
    if (!user) return
    switch (user.role) {
      case 'admin':
        import('./layouts/AdminLayout')
        import('./pages/admin/Dashboard')
        break
      case 'manager':
      case 'supervisor':
      case 'asm':
      case 'rsm':
      case 'accountant':
        import('./layouts/ManagerLayout')
        import('./pages/manager/Dashboard')
        break
      case 'worker':
        import('./layouts/WorkerLayout')
        import('./pages/worker/Dashboard')
        import('./pages/worker/CustomerList')  // সবচেয়ে বেশি ব্যবহৃত, আগেই লোড
        break
      default:
        break
    }
  }, [user?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasPortalJWT = typeof window !== 'undefined' &&
    Object.keys(sessionStorage).some(k => k.startsWith('portal_jwt_'))
  if (hasPortalJWT && !user) return <Navigate to="/customer/dashboard" replace />

  if (!user) return <LandingPage />

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
// Customer Guard
// ============================================================

const CustomerGuard = () => {
  const hasPortalJWT = typeof window !== 'undefined' &&
    Object.keys(sessionStorage).some(k => k.startsWith('portal_jwt_'))

  if (hasPortalJWT) return <Outlet />

  const params = new URLSearchParams(window.location.search)
  const urlToken = params.get('token')
  if (urlToken) return <Outlet />

  return <Navigate to="/landing" replace />
}

// ============================================================
// Inner App
// ============================================================

function AppWithPermissions() {
  const { show: showPermissions, close: closePermissions } = usePermissionSetup()
  const { silentRefresh, user, authReady } = useAuthStore()

  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      useAuthStore.setState({ authReady: true })
    }, 8000)

    if (user) {
      silentRefresh().finally(() => clearTimeout(safetyTimer))
    } else {
      useAuthStore.setState({ authReady: true })
      clearTimeout(safetyTimer)
    }

    return () => clearTimeout(safetyTimer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!authReady) return <PageLoader />

  return (
    <>
      <AppUpdateDialog />

      {showPermissions && (
        <PermissionSetup onDone={closePermissions} />
      )}

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/"                       element={<HomeRedirect />} />
          <Route path="/landing"               element={<LandingPage />} />
          <Route path="/login"                 element={<Login />} />
          <Route path="/customer-login"        element={<CustomerPortal />} />
          <Route path="/apply/sr"              element={<SRApplicationForm />} />
          <Route path="/customer-portal"       element={<Navigate to="/customer/dashboard" replace />} />
          <Route path="/portal-oauth-callback" element={<PortalOAuthCallback />} />

          {/* ── CUSTOMER ROUTES ── */}
          <Route element={<CustomerGuard />}>
            <Route path="/customer" element={<CustomerLayout />}>
              <Route index                element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"     element={<CustomerPortal defaultTab="summary"  />} />
              <Route path="orders"        element={<CustomerPortal defaultTab="orders"   />} />
              <Route path="invoices"      element={<CustomerPortal defaultTab="invoices" />} />
              <Route path="payments"      element={<CustomerPortal defaultTab="payments" />} />
              <Route path="notifications" element={<CustomerPortal defaultTab="notifications" />} />
              <Route path="profile"       element={<CustomerPortal defaultTab="summary"  />} />
              <Route path="ai-chat"       element={<CustomerAIChat />} />
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
            <Route index                    element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"         element={<AdminDashboard />} />
            <Route path="employees"         element={<AdminEmployees />} />
            <Route path="employees/new"     element={<EmployeeForm />} />
            <Route path="employees/:id"     element={<EmployeeForm />} />
            <Route path="pending"           element={<PendingApprovals />} />
            <Route path="reports"           element={<AdminReports />} />
            <Route path="commission-pay"    element={<CommissionPayment />} />
            <Route path="salary-pay"        element={<SalaryPayment />} />
            <Route path="ai-insights"       element={<AIInsights />} />
            <Route path="ai-chat"           element={<AIChat />} />
            <Route path="notices"           element={<AdminNotices />} />
            <Route path="recruitment"       element={<SRRecruitmentDashboard />} />
            <Route path="teams"             element={<AdminTeams />} />
            <Route path="settings"          element={<AdminSettings />} />
            <Route path="products"          element={<AdminProducts />} />
            <Route path="audit-logs"        element={<AuditLogs />} />
            <Route path="portal-returns"    element={<PortalReturnRequests />} />
            <Route path="customer-requests" element={<CustomerRequestsPage />} />
            <Route path="credit-settings"   element={<AdminCreditSettings />} />
            <Route path="portal-devices"    element={<PortalDeviceManager />} />
          </Route>

          {/* ── MANAGER ROUTES ── */}
          <Route path="/manager" element={
            <ProtectedRoute allowedRoles={['manager', 'supervisor', 'asm', 'rsm', 'accountant']}>
              <ManagerLayout />
            </ProtectedRoute>
          }>
            <Route index                             element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"                 element={<ManagerDashboard />} />
            <Route path="team"                      element={<ManagerTeam />} />
            <Route path="team/:workerId/visits"     element={<VisitLog />} />
            <Route path="orders"                    element={<ManagerOrders />} />
            <Route path="settlements"               element={<ManagerSettlements />} />
            <Route path="attendance"                element={<ManagerAttendance />} />
            <Route path="customers"                 element={<ManagerCustomers />} />
            <Route path="routes"                    element={<ManagerRoutes />} />
            <Route path="visit-order"               element={<VisitOrder />} />
            <Route path="live-tracking"             element={<LiveTracking />} />
            <Route path="trail-history"             element={<TrailHistory />} />
            <Route path="sr-ledger"                 element={<SRLedger />} />
            <Route path="order-ledger"              element={<SalesOrderLedger />} />
            <Route path="expense"                   element={<ExpenseApprovals />} />
            <Route path="returns"                   element={<ReturnApprovals />} />
            <Route path="portal-devices"            element={<ManagerPortalDevices />} />
            <Route path="commission/team"           element={<CommissionTeam />} />
            <Route path="ai-chat"                   element={<AIChat />} />
            <Route path="notices"                   element={<NoticesView />} />
            <Route path="customer-requests"         element={<CustomerRequestsPage />} />
            <Route path="credit-approvals"          element={<ManagerCreditApprovals />} />
          </Route>

          {/* ── WORKER ROUTES ── */}
          <Route path="/worker" element={
            <ProtectedRoute allowedRoles={['worker']}>
              <WorkerLayout />
            </ProtectedRoute>
          }>
            <Route index                    element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"         element={<WorkerDashboard />} />
            <Route path="attendance"        element={<WorkerAttendance />} />
            <Route path="route"             element={<RouteSelect />} />
            <Route path="order"             element={<OrderForm />} />
            <Route path="customers"         element={<CustomerList />} />
            <Route path="visit/:id"         element={<VisitPage />} />
            <Route path="sales/:id"         element={<SalesForm />} />
            <Route path="otp/:id"           element={<OTPVerify />} />
            <Route path="settlement"        element={<WorkerSettlement />} />
            <Route path="commission"        element={<Commission />} />
            <Route path="salary-history"    element={<SalaryHistory />} />
            <Route path="profile"           element={<Profile />} />
            <Route path="sales-history"     element={<SalesHistory />} />
            <Route path="stock-status"      element={<StockStatus />} />
            <Route path="ledger-history"    element={<LedgerHistory />} />
            <Route path="expense"           element={<ExpenseForm />} />
            <Route path="expense-history"   element={<ExpenseHistory />} />
            <Route path="return-form"       element={<ReturnForm />} />
            <Route path="return-history"    element={<ReturnHistory />} />
            <Route path="my-return-requests" element={<MyReturnRequests />} />
            <Route path="notices"           element={<NoticesView />} />
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
      </Suspense>
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
