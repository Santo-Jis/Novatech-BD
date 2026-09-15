// frontend/src/pages/worker/RouteSelect.jsx
//
// ⬇️ Phase 2 (UX রিডিজাইন) — এই দফায় ভিজ্যুয়াল/UX বদলাচ্ছে (Phase 1 ছিল শুধু
// architecture)। নতুন যা যোগ হলো:
//   - "আজকের অগ্রগতি" সারসংক্ষেপ — মোট কাস্টমার/আজকের ভিজিট/বকেয়া, একনজরে
//   - প্রতিটা route card-এ progress bar (visited/total)
//   - "আবেদন" প্যানেল ও "নতুন রুট" মডাল — দুটোই এখন shared BottomSheet কম্পোনেন্টে
//     (আগে দুটো জায়গায় প্রায় ডুপ্লিকেট hand-written bottom-sheet ছিল)
// রঙ/টাইপোগ্রাফি ইচ্ছাকৃতভাবে অপরিবর্তিত — বিদ্যমান navy primary + Phase 0-এর
// success/info টোকেন। অ্যাপের বাকি ৪০+ স্ক্রিনের সাথে সামঞ্জস্য বজায় রাখতে
// নতুন কোনো ব্র্যান্ড কালার এখানে চালু করা হয়নি।

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../../store/app.store'
import { useAuthStore } from '../../store/auth.store'
import api from '../../api/axios'
import { useRoutes, useMyRouteRequests } from '../../hooks/useRoutes'
import ProgressBar from '../../components/ui/ProgressBar'
import BottomSheet from '../../components/ui/BottomSheet'
import EmptyState from '../../components/ui/EmptyState'
import { FiMapPin, FiPlus, FiCheck, FiClock, FiUser, FiWifiOff, FiList } from 'react-icons/fi'
import toast from 'react-hot-toast'

// ── status badge helper ──────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending:  { label: 'অপেক্ষায়',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    approved: { label: 'অনুমোদিত',  cls: 'bg-green-100  text-green-700  border-green-200'  },
    rejected: { label: 'বাতিল',      cls: 'bg-red-100    text-red-700    border-red-200'    },
  }
  const { label, cls } = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  )
}

// ── context-aware empty state ───────────────────────────────
function EmptyRouteState({ isOffline, hasPendingRequests, onRequestClick }) {
  if (isOffline) {
    return (
      <EmptyState
        icon={<FiWifiOff />}
        iconBg="bg-yellow-50 dark:bg-yellow-900/20"
        iconColor="text-yellow-400"
        title="অফলাইনে কোনো রুট নেই"
        description={<>আজকের কোনো cached ডেটা পাওয়া যায়নি।<br />ইন্টারনেট চালু করে আবার চেষ্টা করুন।</>}
      />
    )
  }

  if (hasPendingRequests) {
    return (
      <EmptyState
        icon={<FiClock />}
        iconBg="bg-yellow-50 dark:bg-yellow-900/20"
        iconColor="text-yellow-400"
        title="রুট অনুমোদনের অপেক্ষায়"
        description={<>আপনার রুট request Manager-এর কাছে পাঠানো হয়েছে।<br />অনুমোদন পেলে এখানে দেখা যাবে।</>}
        action={
          <button onClick={onRequestClick} className="text-xs text-primary font-semibold px-4 py-2 rounded-xl bg-primary/10">
            আবেদনের status দেখুন
          </button>
        }
      />
    )
  }

  return (
    <EmptyState
      icon={<FiMapPin />}
      title="কোনো রুট নেই"
      description={<>Manager এখনো কোনো রুট তৈরি করেননি।<br />নতুন রুটের জন্য request পাঠান।</>}
      action={
        <button onClick={onRequestClick} className="text-xs text-white font-semibold px-4 py-2 rounded-xl bg-primary flex items-center gap-1.5">
          <FiPlus size={12} /> নতুন রুট request করুন
        </button>
      }
    />
  )
}

// ── একটা route card ──────────────────────────────────────────
function RouteCard({ route, isActive, isMine, onSelect }) {
  const lastVisit = route.last_visited_at
    ? new Date(route.last_visited_at).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  const daysSince = route.last_visited_at
    ? Math.floor((Date.now() - new Date(route.last_visited_at)) / 86400000)
    : null

  const visitBadgeColor = daysSince === null
    ? 'text-gray-400'
    : daysSince === 0 ? 'text-green-600'
    : daysSince <= 3  ? 'text-blue-500'
    : daysSince <= 7  ? 'text-yellow-600'
    : 'text-red-500'

  const totalDue  = parseFloat(route.total_due || 0)
  const visited   = route.visited_today_count || 0
  const total     = route.customer_count || 0

  return (
    <div onClick={onSelect}
      className={`rounded-2xl p-4 shadow-sm flex flex-col gap-3 cursor-pointer active:scale-95 transition-transform
        ${isActive ? 'bg-primary/10 border-2 border-primary' : 'bg-white'}`}>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
            ${isActive ? 'bg-primary' : 'bg-primary/10'}`}>
            <FiMapPin className={isActive ? 'text-white' : 'text-primary'} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {isMine ? (
                <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">আপনার</span>
              ) : (
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded truncate max-w-[160px]">
                  প্রাইমারি: {route.primary_worker_name || 'কেউ না'}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-gray-800 truncate">{route.name}</h3>
            <p className="text-xs text-gray-500">{total} কাস্টমার</p>
          </div>
        </div>
        <FiCheck className={`text-xl flex-shrink-0 ${isActive ? 'text-primary' : 'text-gray-300'}`} />
      </div>

      {/* ⬇️ নতুন — Phase 2: প্রতিটা কার্ডে আজকের অগ্রগতি এক নজরে */}
      {total > 0 && (
        <ProgressBar
          value={visited}
          max={total}
          size="sm"
          color={isActive ? 'bg-primary' : 'bg-success'}
          label={`আজ ${visited}/${total} ভিজিট`}
        />
      )}

      <div className={`flex items-center justify-between gap-2 pt-2 border-t ${isActive ? 'border-primary/20' : 'border-gray-100'}`}>
        {lastVisit ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <FiClock className={`text-xs ${visitBadgeColor}`} />
              <span className={`text-xs font-medium ${visitBadgeColor}`}>
                {daysSince === 0 ? 'আজ' : daysSince === 1 ? 'গতকাল' : `${daysSince} দিন আগে`}
              </span>
              <span className="text-xs text-gray-400">({lastVisit})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FiUser className="text-xs text-gray-400" />
              <span className="text-xs text-gray-500 truncate max-w-[120px]">{route.last_visited_by_name}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <FiClock className="text-xs text-gray-300" />
            <span className="text-xs text-gray-400">এখনো কোনো ভিজিট নেই</span>
          </div>
        )}
        {totalDue > 0 && (
          <span className="text-xs font-semibold text-red-600 flex-shrink-0">
            ৳{totalDue.toLocaleString('en-US')} বকেয়া
          </span>
        )}
      </div>
    </div>
  )
}

export default function RouteSelect() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setSelectedRoute, selectedRoute } = useAppStore()
  const currentUserId = useAuthStore(s => s.user?.id)

  const { routes, isOffline, isLoading: loading } = useRoutes()
  const { data: myRequests = [] } = useMyRouteRequests()

  const [showModal,  setShowModal]  = useState(false)
  const [showMyReqs, setShowMyReqs] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [form, setForm] = useState({ route_name: '', description: '' })

  // ⬇️ Phase 2: আগে এই ভাগটা route-list render করার সময় একটা IIFE-এর ভেতরে
  // হতো, শুধু list-এর জন্য। এখন উপরে তোলা হলো, যাতে সারসংক্ষেপ strip-ও একই
  // হিসাব পুনর্ব্যবহার করতে পারে (ডুপ্লিকেট ফিল্টার না করে)।
  const { mine, others } = useMemo(() => ({
    mine:   routes.filter(r => r.primary_worker_id === currentUserId),
    others: routes.filter(r => r.primary_worker_id !== currentUserId),
  }), [routes, currentUserId])

  const todaySummary = useMemo(() => {
    const totalCustomers = mine.reduce((sum, r) => sum + (r.customer_count || 0), 0)
    const visitedToday   = mine.reduce((sum, r) => sum + (r.visited_today_count || 0), 0)
    const totalDue        = mine.reduce((sum, r) => sum + parseFloat(r.total_due || 0), 0)
    return { totalCustomers, visitedToday, totalDue }
  }, [mine])

  const handleSelect = (route) => {
    setSelectedRoute(route)
    toast.success(`${route.name} রুট সিলেক্ট হয়েছে`)
    navigate('/worker/customers')
  }

  const handleRequest = async () => {
    if (!form.route_name.trim()) return toast.error('রুটের নাম দিন')
    setSaving(true)
    try {
      const res = await api.post('/routes/request', form)
      const newReq = res.data.data
      queryClient.setQueryData(['my-route-requests'], (prev = []) => [newReq, ...prev])
      toast.success('রুট request পাঠানো হয়েছে! Manager অনুমোদন করলে দেখা যাবে ✅')
      setShowModal(false)
      setForm({ route_name: '', description: '' })
      setShowMyReqs(true) // status panel খুলে দাও
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally {
      setSaving(false)
    }
  }

  const pendingCount = myRequests.filter(r => r.status === 'pending').length

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="p-4 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">রুট সিলেক্ট করুন</h2>
          {selectedRoute
            ? <p className="text-xs text-green-600 font-medium">✅ আজকের রুট: {selectedRoute.name}</p>
            : <p className="text-xs text-gray-500">আজকের রুট বেছে নিন</p>
          }
        </div>
        <div className="flex items-center gap-2">
          {!isOffline && (
            <button
              onClick={() => setShowMyReqs(true)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700"
            >
              <FiList size={14} />
              আবেদন
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-yellow-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (isOffline) { toast.error('অফলাইনে নতুন রুট request করা যাবে না'); return }
              setShowModal(true)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
              ${isOffline ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-primary text-white'}`}
          >
            <FiPlus /> নতুন রুট
          </button>
        </div>
      </div>

      {/* ⬇️ নতুন — Phase 2: আজকের অগ্রগতি সারসংক্ষেপ (শুধু নিজের রুট থাকলে) */}
      {todaySummary.totalCustomers > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <ProgressBar
            value={todaySummary.visitedToday}
            max={todaySummary.totalCustomers}
            color="bg-success"
            label="আজকের অগ্রগতি"
          />
          {todaySummary.totalDue > 0 && (
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
              মোট <span className="font-semibold text-red-600">৳{todaySummary.totalDue.toLocaleString('en-US')}</span> বকেয়া আদায়ের বাকি
            </p>
          )}
        </div>
      )}

      {/* ── অফলাইন notice ── */}
      {isOffline && routes.length > 0 && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-700">
          <FiWifiOff size={12} />
          <span>অফলাইন — সর্বশেষ সংরক্ষিত রুট দেখানো হচ্ছে</span>
        </div>
      )}

      {/* ── Route list ── */}
      <div className="space-y-5">
        {routes.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm">
            <EmptyRouteState
              isOffline={isOffline}
              hasPendingRequests={pendingCount > 0}
              onRequestClick={() => {
                if (isOffline) { toast.error('অফলাইনে নতুন রুট request করা যাবে না'); return }
                pendingCount > 0 ? setShowMyReqs(true) : setShowModal(true)
              }}
            />
          </div>
        )}

        {mine.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-400 px-1">আপনার রুট</h4>
            {mine.map(route => (
              <RouteCard key={route.id} route={route} isActive={selectedRoute?.id === route.id} isMine
                onSelect={() => handleSelect(route)} />
            ))}
          </div>
        )}
        {others.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-400 px-1">অন্যান্য SR-দের রুট</h4>
            {others.map(route => (
              <RouteCard key={route.id} route={route} isActive={selectedRoute?.id === route.id} isMine={false}
                onSelect={() => handleSelect(route)} />
            ))}
          </div>
        )}
      </div>

      {/* ── আমার রুট আবেদন — BottomSheet ── */}
      <BottomSheet
        isOpen={showMyReqs}
        onClose={() => setShowMyReqs(false)}
        title="আমার রুট আবেদন"
        footer={
          <p className="text-[10px] text-gray-400">
            ✳️ "অপেক্ষায়" থাকা রুট Manager অনুমোদন দিলে রুট তালিকায় যোগ হবে।
          </p>
        }
      >
        {myRequests.length === 0 ? (
          <EmptyState icon={<FiList />} title="কোনো আবেদন নেই" />
        ) : (
          <div className="divide-y divide-gray-50">
            {myRequests.map(req => (
              <div key={req.id} className="flex items-start justify-between py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{req.name}</p>
                  {req.description && <p className="text-xs text-gray-400 truncate">{req.description}</p>}
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    {new Date(req.requested_at || req.created_at).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex-shrink-0 pt-0.5"><StatusBadge status={req.status} /></div>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* ── নতুন রুট Request — BottomSheet ── */}
      <BottomSheet
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="নতুন রুট Request"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
            <span className="text-blue-500 text-sm mt-0.5">ℹ️</span>
            <p className="text-xs text-blue-700 leading-relaxed">
              আবেদন পাঠানোর পর <strong>Manager অনুমোদন না দেওয়া পর্যন্ত</strong> রুটটি রুট তালিকায় দেখা যাবে না।
              "আবেদন" বাটনে আপনার request-এর status দেখতে পাবেন।
            </p>
          </div>

          <div>
            <label className="text-sm text-gray-600 mb-1 block">রুটের নাম *</label>
            <input
              value={form.route_name}
              onChange={e => setForm(p => ({ ...p, route_name: e.target.value }))}
              placeholder="যেমন: ঢাকা-উত্তর রুট"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1 block">বিবরণ (ঐচ্ছিক)</label>
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="রুট সম্পর্কে বিস্তারিত"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <button
            onClick={handleRequest}
            disabled={saving}
            className="w-full bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <FiPlus />}
            Request পাঠান
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
