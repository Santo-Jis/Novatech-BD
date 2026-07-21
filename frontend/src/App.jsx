import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/auth.store'
import { usePlatformAuthStore } from './pages/platform/store/platformAuth.store'
import { FirebaseProvider } from './firebase/notifications'
import PermissionSetup, { usePermissionSetup } from './components/PermissionSetup'
import AppUpdateDialog from './components/AppUpdateDialog'

// ============================================================
// 🔑 Build-time mode flag
// ============================================================
// Customer APK workflow-এ .env-এ VITE_APP_MODE=customer সেট করা হয়।
// Vite এই constant কে compile-time-এ true/false-এ replace করে,
// ফলে IS_CUSTOMER_APP=true হলে Admin/Manager/Worker সব branch
// dead code হিসেবে tree-shake হয়ে bundle-এ ঢোকেই না।
// ➜ Main APK: VITE_APP_MODE not set → IS_CUSTOMER_APP = false (আগের মতো)
// ➜ Customer APK: VITE_APP_MODE=customer → IS_CUSTOMER_APP = true
const IS_CUSTOMER_APP = import.meta.env.VITE_APP_MODE === 'customer'

// ============================================================
// Layouts
// ============================================================
const CustomerLayout = lazy(() => import('./layouts/CustomerLayout'))

// Staff layouts — Customer APK-এ import হবে না (Vite tree-shakes করবে)
const AdminLayout   = IS_CUSTOMER_APP ? null : lazy(() => import('./layouts/AdminLayout'))
const ManagerLayout = IS_CUSTOMER_APP ? null : lazy(() => import('./layouts/ManagerLayout'))
const WorkerLayout  = IS_CUSTOMER_APP ? null : lazy(() => import('./layouts/WorkerLayout'))

// ============================================================
// Lazy Page Imports
// ============================================================

// Customer (সবসময় থাকবে — দুই APK-এই)
const CustomerPortal = lazy(() => import('./pages/customer/CustomerPortal'))
const CustomerAIChat = lazy(() => import('./pages/customer/CustomerAIChat'))
const CustomerSelfRegister = lazy(() => import('./pages/customer/CustomerSelfRegister'))

// Auth / Public
const Login     = lazy(() => import('./pages/Login'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const AboutUs   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/AboutUs'))
const ContactUs = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/ContactUs'))
const PrivacyPolicy = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/PrivacyPolicy'))
const TermsConditions = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/TermsConditions'))

// SR Application — Customer APK-এ নেই
const SRApplicationForm = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/SRApplicationForm'))

// ── Platform Support & Admin Panel — Customer APK-এ নেই ──────
// (platform_staff login, tenant-user auth থেকে সম্পূর্ণ আলাদা সিস্টেম)
const PlatformLayout   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/platform/layouts/PlatformLayout'))
const PlatformLogin    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/platform/Login'))
const PlatformDashboard = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/platform/Dashboard'))
const PlatformTenantList   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/platform/TenantList'))
const PlatformTenantDetail = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/platform/TenantDetail'))
const PlatformUserLookup   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/platform/UserLookup'))
const PlatformTickets      = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/platform/Tickets'))

// Shared — Customer APK-এ নেই
const AIChat      = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/shared/AIChat'))
const NoticesView = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/shared/NoticesView'))

// ── Admin pages — Customer APK-এ bundle হবে না ──────────────
const AdminDashboard         = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/Dashboard'))
const AdminEmployees         = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/Employees'))
const EmployeeForm           = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/EmployeeForm'))
const PendingApprovals       = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/PendingApprovals'))
const AdminReports           = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/Reports'))
const CommissionPayment      = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/CommissionPayment'))
const SalaryPayment          = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/SalaryPayment'))
const AIInsights             = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/AIInsights'))
const AdminSettings          = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/Settings'))
const AdminProducts          = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/Products'))
const AdminNotices           = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/Notices'))
const AuditLogs              = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/AuditLogs'))
const PortalReturnRequests   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/PortalReturnRequests'))
const CustomerRequestsPage   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/CustomerRequestsPage'))
const SRRecruitmentDashboard = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/SRRecruitmentDashboard'))
const AdminTeams             = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/Teams'))
const AdminCreditSettings    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/AdminCreditSettings'))
const PortalDeviceManager    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/PortalDeviceManager'))
const AdminRoutes            = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/AdminRoutes'))
const AdminCustomerOrderRequests = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/CustomerOrderRequests'))
const AdminLeaveManagement   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/AdminLeaveManagement'))
const AdminPromotions        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/admin/Promotions'))

// ── Manager pages — Customer APK-এ bundle হবে না ─────────────
const ManagerDashboard    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Dashboard'))
const ManagerTeam         = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Team'))
const VisitLog            = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/VisitLog'))
const ManagerOrders       = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Orders'))
const ManagerSettlements  = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Settlements'))
const SRLedger            = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/SRLedger'))
const SalesOrderLedger    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/SalesOrderLedger'))
const ManagerAttendance   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Attendance'))
const ManagerCustomers    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Customers'))
const ManagerRoutes       = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Routes'))
const VisitOrder          = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/VisitOrder'))
const LiveTracking        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/LiveTracking'))
const TrailHistory        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/TrailHistory'))
const ExpenseApprovals    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/ExpenseApprovals'))
const ReturnApprovals        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/ReturnApprovals'))
const ManagerPortalDevices   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/PortalDevices'))
const CommissionTeam         = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/CommissionTeam'))
const ManagerCreditApprovals = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/ManagerCreditApprovals'))
const ManagerReports         = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Reports'))
const ManagerSalarySheet     = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/SalarySheet'))
const ManagerPortalReturns   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/PortalReturnRequests'))
const ManagerCoverage        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/manager/Coverage'))

// ── Worker pages — Customer APK-এ bundle হবে না ──────────────
const WorkerDashboard  = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/Dashboard'))
const WorkerAttendance = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/Attendance'))
const RouteSelect      = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/RouteSelect'))
const OrderForm        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/OrderForm'))
const CustomerList     = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/CustomerList'))
const VisitPage        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/VisitPage'))
const SalesForm        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/SalesForm'))
const OTPVerify        = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/OTPVerify'))
const WorkerSettlement = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/Settlement'))
const Commission       = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/Commission'))
const SalaryHistory    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/SalaryHistory'))
const Profile          = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/Profile'))
const SalesHistory     = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/SalesHistory'))
const StockStatus      = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/StockStatus'))
const LedgerHistory    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/LedgerHistory'))
const MonthlyLedger    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/MonthlyLedger'))
const ExpenseForm      = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/ExpenseForm'))
const ExpenseHistory   = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/ExpenseHistory'))
const ReturnForm       = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/ReturnForm'))
const ReturnHistory    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/ReturnHistory'))
const MyReturnRequests = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/MyReturnRequests'))
const MyStatement      = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/MyStatement'))
const ActiveOffers     = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/ActiveOffers'))
const DeliveryTasks    = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/DeliveryTasks'))
const Leaderboard      = IS_CUSTOMER_APP ? null : lazy(() => import('./pages/worker/Leaderboard'))

// ============================================================
// Page Loading Spinner — Suspense fallback
// ============================================================

const PageLoader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh',
    background: IS_CUSTOMER_APP
      ? 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f2744 100%)'
      : 'linear-gradient(135deg, #030712 0%, #0a0f1a 40%, #051a0e 100%)',
    flexDirection: 'column', gap: 16,
  }}>
    <div style={{
      width: 36, height: 36,
      border: IS_CUSTOMER_APP ? '4px solid rgba(96,165,250,0.2)' : '4px solid rgba(74,222,128,0.2)',
      borderTop: IS_CUSTOMER_APP ? '4px solid #60a5fa' : '4px solid #4ade80',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <p style={{
      color: IS_CUSTOMER_APP ? 'rgba(96,165,250,0.7)' : 'rgba(74,222,128,0.6)',
      fontSize: 13, fontFamily: 'sans-serif', margin: 0,
    }}>
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
// Protected Route — Staff only (Customer APK-এ লাগবে না)
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
// Platform Protected Route — platform_staff (full/support scope)
// ============================================================
// ⚠️ tenant-user ProtectedRoute (useAuthStore) থেকে ইচ্ছাকৃতভাবে
// আলাদা — platform_staff একদম আলাদা JWT/টেবিলের ওপর ভিত্তি করে।

const PlatformProtectedRoute = ({ children }) => {
  const isAuthed = usePlatformAuthStore((s) => s.isAuthenticated())

  if (!isAuthed) {
    return <Navigate to="/platform/login" replace />
  }
  return children
}

// ============================================================
// Role-based Home redirect
// ============================================================

const HomeRedirect = () => {
  const { user } = useAuthStore()

  // ─── Customer APK: সরাসরি Customer flow-এ নিয়ে যাও ──────────
  if (IS_CUSTOMER_APP) {
    const hasPortalJWT = typeof window !== 'undefined' &&
      Object.keys(localStorage).some(k => k.startsWith('portal_jwt_'))
    if (hasPortalJWT) return <Navigate to="/customer/dashboard" replace />
    return <Navigate to="/customer-login" replace />
  }

  // ─── Staff APK: আগের মতোই role-based prefetch + redirect ────
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
        import('./pages/worker/CustomerList')
        import('./services/batteryMonitor').then(({ BatteryMonitor }) => BatteryMonitor.start())
        break
      default:
        break
    }
  }, [user?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasPortalJWT = typeof window !== 'undefined' &&
    Object.keys(localStorage).some(k => k.startsWith('portal_jwt_'))
  if (hasPortalJWT && !user) return <Navigate to="/customer/dashboard" replace />

  if (!user) return <LandingPage />

  switch (user.role) {
    case 'admin':    return <Navigate to="/admin/dashboard" replace={false} />
    case 'manager':
    case 'supervisor':
    case 'asm':
    case 'rsm':
    case 'accountant': return <Navigate to="/manager/dashboard" replace={false} />
    case 'worker':   return <Navigate to="/worker/dashboard" replace={false} />
    default:         return <Navigate to="/login" replace />
  }
}

// ============================================================
// Customer Guard
// ============================================================

const CustomerGuard = () => {
  const hasPortalJWT = typeof window !== 'undefined' &&
    Object.keys(localStorage).some(k => k.startsWith('portal_jwt_'))

  if (hasPortalJWT) return <Outlet />

  const params = new URLSearchParams(window.location.search)
  const urlToken = params.get('token')
  if (urlToken) return <Outlet />

  return <Navigate to={IS_CUSTOMER_APP ? '/customer-login' : '/landing'} replace />
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

          {/* ── Public ── */}
          <Route path="/"                       element={<HomeRedirect />} />
          <Route path="/customer-login"         element={<CustomerPortal />} />
          <Route path="/customer-register"      element={<CustomerSelfRegister />} />
          <Route path="/customer-portal"        element={<Navigate to="/customer/dashboard" replace />} />
          <Route path="/portal-oauth-callback"  element={<PortalOAuthCallback />} />

          {/* Customer APK-এ /landing ও /login → customer-login-এ redirect */}
          <Route path="/landing" element={IS_CUSTOMER_APP
            ? <Navigate to="/customer-login" replace />
            : <LandingPage />}
          />
          <Route path="/login" element={IS_CUSTOMER_APP
            ? <Navigate to="/customer-login" replace />
            : <Login />}
          />

          {/* SR Application — Customer APK-এ নেই */}
          {!IS_CUSTOMER_APP && (
            <Route path="/apply/sr" element={<SRApplicationForm />} />
          )}

          {/* About Us / Contact Us — Customer APK-এ নেই, শুধু মূল ল্যান্ডিং সাইটে */}
          {!IS_CUSTOMER_APP && (
            <>
              <Route path="/about"   element={<AboutUs />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-conditions" element={<TermsConditions />} />
            </>
          )}

          {/* ── CUSTOMER ROUTES (দুই APK-এই থাকবে) ── */}
          <Route element={<CustomerGuard />}>
            <Route path="/customer" element={<CustomerLayout />}>
              <Route index                element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"     element={<CustomerPortal defaultTab="summary"       />} />
              <Route path="orders"        element={<CustomerPortal defaultTab="orders"        />} />
              <Route path="invoices"      element={<CustomerPortal defaultTab="invoices"      />} />
              <Route path="payments"      element={<CustomerPortal defaultTab="payments"      />} />
              <Route path="notifications" element={<CustomerPortal defaultTab="notifications" />} />
              <Route path="profile"       element={<CustomerPortal defaultTab="summary"       />} />
              <Route path="ai-chat"       element={<CustomerAIChat />} />
            </Route>
          </Route>

          {/* ── STAFF ROUTES — Customer APK-এ সম্পূর্ণ বাদ ── */}
          {/* IS_CUSTOMER_APP=true হলে Vite এই পুরো block tree-shake করে */}
          {!IS_CUSTOMER_APP && (
            <>
              {/* ── PLATFORM PANEL — platform_staff, tenant-user auth থেকে সম্পূর্ণ আলাদা ── */}
              <Route path="/platform/login" element={<PlatformLogin />} />
              <Route path="/platform" element={
                <PlatformProtectedRoute>
                  <PlatformLayout />
                </PlatformProtectedRoute>
              }>
                <Route index               element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard"    element={<PlatformDashboard />} />
                <Route path="tenants"      element={<PlatformTenantList />} />
                <Route path="tenants/:tenantId" element={<PlatformTenantDetail />} />
                <Route path="users"        element={<PlatformUserLookup />} />
                <Route path="tickets"      element={<PlatformTickets />} />
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
                <Route path="routes"            element={<AdminRoutes />} />
                <Route path="customer-order-requests" element={<AdminCustomerOrderRequests />} />
                <Route path="leave-management"  element={<AdminLeaveManagement />} />
                <Route path="promotions"        element={<AdminPromotions />} />
              </Route>

              {/* ── MANAGER ROUTES ── */}
              <Route path="/manager" element={
                <ProtectedRoute allowedRoles={['manager', 'supervisor', 'asm', 'rsm', 'accountant']}>
                  <ManagerLayout />
                </ProtectedRoute>
              }>
                <Route index                              element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard"                  element={<ManagerDashboard />} />
                <Route path="team"                       element={<ManagerTeam />} />
                <Route path="team/:workerId/visits"      element={<VisitLog />} />
                <Route path="orders"                     element={<ManagerOrders />} />
                <Route path="settlements"                element={<ManagerSettlements />} />
                <Route path="attendance"                 element={<ManagerAttendance />} />
                <Route path="customers"                  element={<ManagerCustomers />} />
                <Route path="routes"                     element={<ManagerRoutes />} />
                <Route path="visit-order"                element={<VisitOrder />} />
                <Route path="live-tracking"              element={<LiveTracking />} />
                <Route path="trail-history"              element={<TrailHistory />} />
                <Route path="sr-ledger"                  element={<SRLedger />} />
                <Route path="order-ledger"               element={<SalesOrderLedger />} />
                <Route path="expense"                    element={<ExpenseApprovals />} />
                <Route path="returns"                    element={<ReturnApprovals />} />
                <Route path="portal-devices"             element={<ManagerPortalDevices />} />
                <Route path="commission/team"            element={<CommissionTeam />} />
                <Route path="ai-chat"                    element={<AIChat />} />
                <Route path="notices"                    element={<NoticesView />} />
                <Route path="customer-requests"          element={<CustomerRequestsPage />} />
                <Route path="credit-approvals"           element={<ManagerCreditApprovals />} />
                <Route path="reports"                    element={<ManagerReports />} />
                <Route path="salary-sheet"               element={<ManagerSalarySheet />} />
                <Route path="portal-returns"             element={<ManagerPortalReturns />} />
                <Route path="coverage"                   element={<ManagerCoverage />} />
              </Route>

              {/* ── WORKER ROUTES ── */}
              <Route path="/worker" element={
                <ProtectedRoute allowedRoles={['worker']}>
                  <WorkerLayout />
                </ProtectedRoute>
              }>
                <Route index                     element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard"          element={<WorkerDashboard />} />
                <Route path="attendance"         element={<WorkerAttendance />} />
                <Route path="route"              element={<RouteSelect />} />
                <Route path="order"              element={<OrderForm />} />
                <Route path="customers"          element={<CustomerList />} />
                <Route path="visit/:id"          element={<VisitPage />} />
                <Route path="sales/:id"          element={<SalesForm />} />
                <Route path="otp/:id"            element={<OTPVerify />} />
                <Route path="settlement"         element={<WorkerSettlement />} />
                <Route path="commission"         element={<Commission />} />
                <Route path="salary-history"     element={<SalaryHistory />} />
                <Route path="profile"            element={<Profile />} />
                <Route path="sales-history"      element={<SalesHistory />} />
                <Route path="stock-status"       element={<StockStatus />} />
                <Route path="ledger-history"     element={<LedgerHistory />} />
                <Route path="monthly-ledger"     element={<MonthlyLedger />} />
                <Route path="expense"            element={<ExpenseForm />} />
                <Route path="expense-history"    element={<ExpenseHistory />} />
                <Route path="return-form"        element={<ReturnForm />} />
                <Route path="return-history"     element={<ReturnHistory />} />
                <Route path="my-return-requests" element={<MyReturnRequests />} />
                <Route path="notices"            element={<NoticesView />} />
                <Route path="statement"          element={<MyStatement />} />
                <Route path="offers"             element={<ActiveOffers />} />
                <Route path="deliveries"         element={<DeliveryTasks />} />
                <Route path="leaderboard"        element={<Leaderboard />} />
              </Route>
            </>
          )}

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
