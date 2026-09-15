// frontend/src/pages/worker/CustomerList.jsx
// Worker: কাস্টমার তালিকা + Leaflet Map (উপরে)
//
// ⬇️ Phase 1 অংশ ২ (Architecture Refactor) — এই ফাইল আগে ১১৮২ লাইনের একটা
// মনোলিথ ছিল (map + list + GPS + offline cache + OTP wizard, সব একসাথে)।
// এখন:
//   - Map JSX          → components/worker/CustomerMap.jsx
//   - Card JSX          → components/worker/CustomerCard.jsx
//   - fetch/cache/GPS   → hooks/useCustomers.js, hooks/useRoutes.js, hooks/useNextStop.js
//
// ⬇️ Phase 3 অংশ ২ — Add Customer Wizard পুরোপুরি pages/worker/AddCustomer.jsx-এ
// সরে গেছে (dedicated route, আগে modal ছিল)। এই ফাইলে এখন শুধু "নতুন" বাটন
// navigate করে, আর existing কাস্টমারের WhatsApp-resend-এর জন্য একটা ছোট
// BottomSheet থেকে গেছে (এটা wizard-এর অংশ না, ভিন্ন, হালকা flow)।

import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../../store/app.store'
import { useAuthStore } from '../../store/auth.store'
import { useCheckinStore } from '../../store/checkin.store'
import api from '../../api/axios'
import { useRoutes } from '../../hooks/useRoutes'
import { useCustomers } from '../../hooks/useCustomers'
import { useWatchPosition, useLiveDistances, useNextStop, formatDistance } from '../../hooks/useNextStop'
import { usePriorityScore } from '../../hooks/usePriorityScore'
import BottomSheet from '../../components/ui/BottomSheet'
import {
  FiSearch, FiPlus, FiUser, FiNavigation, FiTarget
} from 'react-icons/fi'
import toast from 'react-hot-toast'
import CustomerEditModal from '../../components/CustomerEditModal'
import CustomerMap  from '../../components/worker/CustomerMap'
import CustomerCard from '../../components/worker/CustomerCard'

// ── Main Component ────────────────────────────────────────────
export default function CustomerList() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const queryClient = useQueryClient()
  const { selectedRoute } = useAppStore()
  const currentUserId = useAuthStore(s => s.user?.id)

  // ⬇️ Phase 1: আগে এখানে loadCustomers() (৭৫ লাইন), /routes/worker-list-এর
  // ডুপ্লিকেট fetch, আর watchPosition — সব একসাথে একটা বড় useEffect-এ ছিল।
  // এখন hooks/useCustomers.js, hooks/useRoutes.js, hooks/useNextStop.js।
  const { customers, isLoading: loading, refetch: refetchCustomers } = useCustomers(selectedRoute?.id)
  const { routes } = useRoutes()
  const userLocation = useWatchPosition()
  const liveDistances = useLiveDistances(customers, userLocation)
  const nextStop = useNextStop(customers, liveDistances)
  const priorityScores = usePriorityScore(customers, liveDistances) // ⬅️ নতুন — Phase 4

  // VisitPage থেকে ফিরলে (location.key বদলালে) fresh ডেটা — আগে এটা মূল
  // useEffect-এর dependency array-তে [selectedRoute, location.key] হিসেবে
  // ছিল (কমেন্ট: "stale cache দেখাবে না")। এখন queryKey শুধু routeId-এর
  // উপর নির্ভর করে বলে location.key বদলালে আলাদাভাবে refetch ট্রিগার করা হচ্ছে।
  useEffect(() => {
    refetchCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const [search,       setSearch]       = useState('')
  const [editModal,    setEditModal]    = useState(null)
  const [sendingLink,  setSendingLink]  = useState(null)
  const [activePin,    setActivePin]    = useState(null)   // map pin tap → highlight card
  const [sortMode,     setSortMode]     = useState('order') // 'order' | 'distance' | 'priority'
  const [mapExpanded,  setMapExpanded]  = useState(false)  // ⬅️ Phase 3: map↔list split view
  const cardRefs   = useRef({})   // customer id → DOM ref (scroll করতে)

  // ⬅️ নতুন — Phase 3 অংশ ২: existing কাস্টমারের WhatsApp-resend flow।
  // আগে Add Customer wizard-এর showAddModal/step reuse করত। এখন wizard
  // AddCustomer.jsx-এ সরে যাওয়ায় এটা নিজের ছোট, independent state পেল।
  const [waSheetOpen,    setWaSheetOpen]    = useState(false)
  const [waUrl,          setWaUrl]          = useState(null)
  const [waCustomerName, setWaCustomerName] = useState('')

  // ✅ F1: কাস্টমার লিস্ট checkin ছাড়াও দেখা যায় (view সবসময় allowed) —
  // কিন্তু ভিজিট/সেল শুরু করা (যা ব্যাকএন্ডে requireCheckin দিয়ে গার্ডেড) checkin ছাড়া করা যাবে না।
  const checkedIn          = useCheckinStore(s => s.checkedIn)
  const fetchCheckinStatus = useCheckinStore(s => s.fetchStatus)
  useEffect(() => { fetchCheckinStatus() }, [])

  // ভিজিটে যাওয়ার আগে checkin যাচাই — checkin না থাকলে navigate না করে বার্তা দেখাও
  const goToVisit = (customerId) => {
    if (checkedIn === false) {
      toast.error('আগে আজকের চেক-ইন করুন — তারপর ভিজিট/বিক্রয় করা যাবে।')
      return
    }
    navigate(`/worker/visit/${customerId}`)
  }

  // ── Map pin tap → সেই card-এ scroll করো ──────────────────
  const handlePinClick = (customerId) => {
    setActivePin(customerId)
    const el = cardRefs.current[customerId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // ── Google Maps Navigate ───────────────────────────────────
  const openGoogleMaps = (e, customer) => {
    e.stopPropagation()
    if (!customer.latitude || !customer.longitude) {
      toast.error('এই কাস্টমারের GPS লোকেশন নেই')
      return
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}&travelmode=driving`
    window.open(url, '_blank')
  }

  const sendPortalLinkToCustomer = async (customer) => {
    if (!customer.whatsapp) return toast.error('এই কাস্টমারের WhatsApp নম্বর নেই।')
    setSendingLink(customer.id)
    try {
      const linkRes = await api.post(`/portal/send-link/${customer.id}`)
      const url = linkRes.data?.data?.whatsapp_url
      if (url) { setWaUrl(url); setWaCustomerName(customer.shop_name); setWaSheetOpen(true) }
    } catch (err) {
      toast.error(err.response?.data?.message || 'লিংক তৈরিতে সমস্যা হয়েছে।')
    } finally {
      setSendingLink(null)
    }
  }

  const filtered = useMemo(() => {
    const list = customers.filter(c =>
      c.shop_name?.includes(search) || c.owner_name?.includes(search)
    )
    if (sortMode === 'distance') {
      return [...list].sort((a, b) => {
        if (!!a.visited_today !== !!b.visited_today) return a.visited_today ? 1 : -1
        const da = liveDistances[a.id]
        const db = liveDistances[b.id]
        if (da == null && db == null) return 0
        if (da == null) return 1
        if (db == null) return -1
        return da - db
      })
    }
    // ⬅️ নতুন — Phase 4: distance + বাকি + staleness মিলিয়ে priority score।
    // manager-এর visit_order-কে প্রতিস্থাপন করে না, এটা বিকল্প lens।
    if (sortMode === 'priority') {
      return [...list].sort((a, b) => {
        if (!!a.visited_today !== !!b.visited_today) return a.visited_today ? 1 : -1
        const pa = priorityScores[a.id] ?? 0
        const pb = priorityScores[b.id] ?? 0
        return pb - pa // বেশি score আগে
      })
    }
    return list
  }, [customers, search, sortMode, liveDistances, priorityScores])

  const visitedCount = customers.filter(c => c.visited_today).length

  // ✅ FIX #4: selectedRoute না থাকলে loading-এর আগেই block — API call হবে না, সব customer দেখাবে না
  if (!selectedRoute) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center gap-4">
      <span className="text-5xl">🗺️</span>
      <h2 className="font-bold text-gray-800 text-lg">রুট সিলেক্ট করুন</h2>
      <p className="text-sm text-gray-500">কাস্টমার তালিকা দেখতে হলে আগে আজকের রুট বেছে নিতে হবে।</p>
      <button onClick={() => navigate('/worker/route')}
        className="px-6 py-3 bg-primary text-white rounded-2xl font-semibold text-sm shadow-md">
        রুট বেছে নিন →
      </button>
    </div>
  )

  if (loading) return (
    <div className="p-4 space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="flex flex-col h-full">

      {/* ══════════════════════════════════════════════════════
          ── উপরে: Leaflet Map ──
      ══════════════════════════════════════════════════════ */}
      <CustomerMap
        customers={customers}
        userLocation={userLocation}
        nextStop={nextStop}
        visitedCount={visitedCount}
        routeId={selectedRoute.id}
        onPinClick={handlePinClick}
        height={mapExpanded ? 480 : 280}
        onToggleHeight={() => setMapExpanded(v => !v)}
      />

      {/* ══════════════════════════════════════════════════════
          ── নিচে: Header + Search + Customer List ──
      ══════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">কাস্টমার তালিকা</h2>
            <p className="text-xs text-gray-500">
              {visitedCount}/{customers.length} ভিজিট সম্পন্ন
            </p>
          </div>
          <button
            onClick={() => navigate('/worker/customers/new')}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm active:scale-95 transition-transform"
          >
            <FiPlus /> নতুন
          </button>
        </div>

        {/* ── Checkin Required Banner ──────────────────────── */}
        {checkedIn === false && (
          <div
            onClick={() => navigate('/worker/attendance')}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2.5 cursor-pointer active:scale-[0.98] transition-transform"
          >
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <FiTarget size={15} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-amber-800 text-xs font-bold">তালিকা দেখা যাচ্ছে, কিন্তু ভিজিট/বিক্রয় করতে checkin লাগবে</p>
              <p className="text-amber-600 text-[11px]">এখনই চেক-ইন করুন 👆</p>
            </div>
          </div>
        )}

        {/* ── Next Stop Banner ─────────────────────────────── */}
        {nextStop && (
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-4 shadow-md flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => {
              goToVisit(nextStop.customer._id || nextStop.customer.id)
            }}
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <FiTarget size={20} className="text-white" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-blue-100 font-medium uppercase tracking-wide mb-0.5">
                📍 Next Stop — সবচেয়ে কাছে
              </p>
              <p className="text-white font-bold text-sm truncate">{nextStop.customer.shop_name}</p>
              <p className="text-blue-100 text-xs truncate">{nextStop.customer.owner_name}</p>
            </div>

            {/* Distance + Navigate */}
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {formatDistance(nextStop.distanceMeters)}
              </span>
              <button
                onClick={e => openGoogleMaps(e, nextStop.customer)}
                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
              >
                <FiNavigation size={11} /> Navigate
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="দোকান বা মালিকের নাম..."
            className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm focus:outline-none focus:border-primary/40"
          />
        </div>

        {/* Sort toggle */}
        <div className="inline-flex flex-wrap bg-gray-100 rounded-full p-1 gap-1">
          {[['order', 'ভিজিট অর্ডার'], ['distance', 'দূরত্ব অনুযায়ী'], ['priority', '🎯 প্রায়োরিটি']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortMode(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
                ${sortMode === key ? 'bg-primary text-white shadow-sm' : 'text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Customer Cards */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <FiUser className="text-4xl mx-auto mb-2" />
              <p>কোনো কাস্টমার নেই</p>
            </div>
          )}
          {filtered.map(c => {
            const isNextStop = nextStop?.customer?.id === c.id
            return (
              <CustomerCard
                key={c._id || c.id}
                customer={c}
                isNextStop={isNextStop}
                nextStopDistanceMeters={isNextStop ? nextStop.distanceMeters : undefined}
                distanceMeters={liveDistances[c.id]}
                isActive={activePin === c.id}
                currentUserId={currentUserId}
                sendingWhatsApp={sendingLink === c.id}
                onVisit={() => goToVisit(c._id || c.id)}
                onNavigate={e => openGoogleMaps(e, c)}
                onSendWhatsApp={() => sendPortalLinkToCustomer(c)}
                onEdit={() => setEditModal(c)}
                innerRef={el => { cardRefs.current[c.id] = el }}
              />
            )
          })}
        </div>
      </div>

      {/* Edit Modal */}
      {editModal && (
        <CustomerEditModal
          customer={editModal}
          onClose={() => setEditModal(null)}
          onUpdate={updated => {
            // ⬇️ আগে setCustomers(prev => prev.map(...)) ছিল — এখন React Query
            // cache সরাসরি প্যাচ করা হচ্ছে, একই instant আচরণ, রিফেচ ছাড়াই।
            const key = ['customers', selectedRoute?.id ?? 'all']
            queryClient.setQueryData(key, old =>
              old ? { ...old, customers: old.customers.map(c => c.id === updated.id ? updated : c) } : old
            )
            setEditModal(null)
          }}
        />
      )}

      {/* ⬇️ নতুন — Phase 3 অংশ ২: existing কাস্টমারের WhatsApp-resend।
          Add Customer wizard এখন pages/worker/AddCustomer.jsx-এ পুরোপুরি
          দেওয়া। এটা সম্পূর্ণ আলাদা, ছোট flow — শুধু আগে-তৈরি একটা customer-এর
          portal link আবার WhatsApp-এ পাঠানো। */}
      <BottomSheet
        isOpen={waSheetOpen}
        onClose={() => setWaSheetOpen(false)}
        title="WhatsApp-এ পাঠান"
      >
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ width: 64, height: 64, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <span style={{ fontSize: 30 }}>✅</span>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            <strong>{waCustomerName}</strong>-এর জন্য লিংক তৈরি হয়েছে। নিচের বাটনে চাপুন — WhatsApp খুলবে, শুধু <strong>Send</strong> করুন।
          </p>
          <a href={waUrl} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#25d366', color: '#fff', borderRadius: 14, padding: '14px 24px', fontWeight: 700, fontSize: 16, textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp-এ পাঠান
          </a>
        </div>
      </BottomSheet>
    </div>
  )
}
