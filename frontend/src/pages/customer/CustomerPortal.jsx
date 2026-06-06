// frontend/src/pages/customer/CustomerPortal.jsx
// ── Main Entry Point ──────────────────────────────────────────
// এই ফাইল শুধু hook ও view গুলোকে একত্রিত করে।
// সব logic আলাদা ফাইলে রাখা হয়েছে।
//
// Structure:
//   hooks/usePortalAuth.js          → সব state, auth, API calls
//   utils/api.js                    → portalFetch, BACKEND
//   utils/fingerprint.js            → device fingerprint, Google GSI
//   utils/helpers.js                → fmt, fmtDate, storage helpers
//   components/Badges.jsx           → PayBadge, StatusBadge
//   components/InvoiceCard.jsx      → invoice collapsible card
//   components/MonthlyTrendChart.jsx→ SVG trend chart
//   components/OrderTrackingModal.jsx → order tracking bottom sheet
//   components/OrderRequestTab.jsx  → order list / new / catalog
//   components/views/LoadingView.jsx
//   components/views/InvalidView.jsx
//   components/views/WelcomeView.jsx
//   components/views/LoginView.jsx
//   components/views/DashboardView.jsx

import { usePortalAuth } from './hooks/usePortalAuth'
import LoadingView   from './components/views/LoadingView'
import InvalidView   from './components/views/InvalidView'
import WelcomeView   from './components/views/WelcomeView'
import LoginView     from './components/views/LoginView'
import DashboardView from './components/views/DashboardView'

export default function CustomerPortal({ defaultTab = 'summary' }) {
  const auth = usePortalAuth(defaultTab)

  if (auth.phase === 'loading')   return <LoadingView />
  if (auth.phase === 'invalid')   return <InvalidView error={auth.error} onGoToLogin={auth.handleLogout} />
  if (auth.phase === 'welcome')   return <WelcomeView tokenInfo={auth.tokenInfo} onLogin={() => auth.googleLogin()} />
  if (auth.phase === 'login')     return (
    <LoginView
      tokenInfo={auth.tokenInfo}
      error={auth.error}
      loggingIn={auth.loggingIn}
      onLogin={auth.googleLogin}
    />
  )

  if (auth.phase === 'dashboard' && auth.dashboard) return (
    <DashboardView
      dashboard={auth.dashboard}
      portalJWT={auth.portalJWT}
      activeTab={auth.activeTab}
      onTabChange={auth.handleTabChange}
      onLogout={auth.handleLogout}
      toast={auth.toast}
      // notifications
      notifications={auth.notifications}
      unreadCount={auth.unreadCount}
      showBell={auth.showBell}
      setShowBell={auth.setShowBell}
      unreadBanner={auth.unreadBanner}
      setUnreadBanner={auth.setUnreadBanner}
      markAllAsRead={auth.markAllAsRead}
      markOneRead={auth.markOneRead}
      // invoices
      invoices={auth.invoices}
      invoiceTotal={auth.invoiceTotal}
      invoicePage={auth.invoicePage}
      invoiceTotalPages={auth.invoiceTotalPages}
      invoiceLoading={auth.invoiceLoading}
      invoiceSearch={auth.invoiceSearch}      setInvoiceSearch={auth.setInvoiceSearch}
      invoicePayMethod={auth.invoicePayMethod} setInvoicePayMethod={auth.setInvoicePayMethod}
      invoiceDateFrom={auth.invoiceDateFrom}  setInvoiceDateFrom={auth.setInvoiceDateFrom}
      invoiceDateTo={auth.invoiceDateTo}      setInvoiceDateTo={auth.setInvoiceDateTo}
      filterOpen={auth.filterOpen}            setFilterOpen={auth.setFilterOpen}
      loadInvoices={auth.loadInvoices}
      applyInvoiceFilter={auth.applyInvoiceFilter}
      clearInvoiceFilter={auth.clearInvoiceFilter}
      // credit
      creditReqOpen={auth.creditReqOpen}         setCreditReqOpen={auth.setCreditReqOpen}
      creditReqAmt={auth.creditReqAmt}           setCreditReqAmt={auth.setCreditReqAmt}
      creditReqReason={auth.creditReqReason}     setCreditReqReason={auth.setCreditReqReason}
      creditReqLoading={auth.creditReqLoading}
      myLimitReqs={auth.myLimitReqs}
      limitReqsLoaded={auth.limitReqsLoaded}
      limitReqsLoading={auth.limitReqsLoading}
      loadMyLimitReqs={auth.loadMyLimitReqs}
      submitCreditRequest={auth.submitCreditRequest}
      // complaints
      complaintOpen={auth.complaintOpen}       setComplaintOpen={auth.setComplaintOpen}
      cmpType={auth.cmpType}                   setCmpType={auth.setCmpType}
      cmpSubject={auth.cmpSubject}             setCmpSubject={auth.setCmpSubject}
      cmpDesc={auth.cmpDesc}                   setCmpDesc={auth.setCmpDesc}
      cmpLoading={auth.cmpLoading}
      myComplaints={auth.myComplaints}
      complaintsLoaded={auth.complaintsLoaded}
      complaintsLoading={auth.complaintsLoading}
      loadMyComplaints={auth.loadMyComplaints}
      submitComplaint={auth.submitComplaint}
      // statement
      stmtOpen={auth.stmtOpen}     setStmtOpen={auth.setStmtOpen}
      stmtFrom={auth.stmtFrom}     setStmtFrom={auth.setStmtFrom}
      stmtTo={auth.stmtTo}         setStmtTo={auth.setStmtTo}
      stmtLoading={auth.stmtLoading}
      downloadStatement={auth.downloadStatement}
      // payment history
      paymentHistory={auth.paymentHistory}
      paymentPage={auth.paymentPage}
      paymentTotalPages={auth.paymentTotalPages}
      paymentTotal={auth.paymentTotal}
      paymentLoading={auth.paymentLoading}
      paymentSummary={auth.paymentSummary}
      paymentTypeFilter={auth.paymentTypeFilter}  setPaymentTypeFilter={auth.setPaymentTypeFilter}
      paymentDateFrom={auth.paymentDateFrom}      setPaymentDateFrom={auth.setPaymentDateFrom}
      paymentDateTo={auth.paymentDateTo}          setPaymentDateTo={auth.setPaymentDateTo}
      paymentFilterOpen={auth.paymentFilterOpen}  setPaymentFilterOpen={auth.setPaymentFilterOpen}
      loadPaymentHistory={auth.loadPaymentHistory}
      applyPaymentFilter={auth.applyPaymentFilter}
      clearPaymentFilter={auth.clearPaymentFilter}
      // return requests
      myReturnReqs={auth.myReturnReqs}
      returnReqTotal={auth.returnReqTotal}
      returnReqPage={auth.returnReqPage}
      returnReqTotalPages={auth.returnReqTotalPages}
      returnReqLoading={auth.returnReqLoading}
      returnReqFilter={auth.returnReqFilter}       setReturnReqFilter={auth.setReturnReqFilter}
      returnFormOpen={auth.returnFormOpen}         setReturnFormOpen={auth.setReturnFormOpen}
      returnInvoice={auth.returnInvoice}           setReturnInvoice={auth.setReturnInvoice}
      returnType={auth.returnType}                 setReturnType={auth.setReturnType}
      returnItems={auth.returnItems}               setReturnItems={auth.setReturnItems}
      returnNote={auth.returnNote}                 setReturnNote={auth.setReturnNote}
      returnSubmitLoading={auth.returnSubmitLoading}
      loadMyReturnReqs={auth.loadMyReturnReqs}
      submitReturnRequest={auth.submitReturnRequest}
    />
  )

  return null
}
