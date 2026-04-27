import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import { FirebaseProvider } from './firebase/notifications'

// Layouts
import AdminLayout   from './layouts/AdminLayout'
import ManagerLayout from './layouts/ManagerLayout'
import WorkerLayout  from './layouts/WorkerLayout'

// Auth
import Login from './pages/Login'

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

// Manager Pages
import ManagerDashboard   from './pages/manager/Dashboard'
import ManagerTeam        from './pages/manager/Team'
import ManagerOrders      from './pages/manager/Orders'
import ManagerSettlements from './pages/manager/Settlements'
import ManagerAttendance  from './pages/manager/Attendance'
import ManagerCustomers   from './pages/manager/Customers'
import ManagerRoutes      from './pages/manager/Routes'
import VisitOrder         from './pages/manager/VisitOrder'
import LiveTracking       from './pages/manager/LiveTracking'

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

  if (!user) return <Navigate to="/login" replace />

  switch (user.role) {
    case 'admin':
      return <Navigate to="/admin/dashboard" replace />
    case 'manager':
    case 'supervisor':
    case 'asm':
    case 'rsm':
      return <Navigate to="/manager/dashboard" replace />
    case 'accountant':
      return <Navigate to="/manager/dashboard" replace />
    case 'worker':
      return <Navigate to="/worker/dashboard" replace />
    default:
      return <Navigate to="/login" replace />
  }
}

// ============================================================
// App Routes
// ============================================================

export default function App() {
  return (
    <FirebaseProvider>
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/apply/sr" element={<SRApplicationForm />} />
      <Route path="/"      element={<HomeRedirect />} />

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
        <Route path="team"         element={<ManagerTeam />} />
        <Route path="orders"       element={<ManagerOrders />} />
        <Route path="settlements"  element={<ManagerSettlements />} />
        <Route path="attendance"   element={<ManagerAttendance />} />
        <Route path="customers"    element={<ManagerCustomers />} />
        <Route path="routes"       element={<ManagerRoutes />} />
        <Route path="visit-order"  element={<VisitOrder />} />
        <Route path="live-tracking" element={<LiveTracking />} />
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
    </FirebaseProvider>
  )
}
