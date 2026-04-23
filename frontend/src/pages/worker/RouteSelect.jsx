import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api, { isNetworkError } from '../../api/axios'
import { saveCache, getCache } from '../../api/offlineQueue'
import { FiMapPin, FiPlus, FiX, FiCheck, FiClock, FiUser, FiWifiOff, FiList } from 'react-icons/fi'
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

export default function RouteSelect() {
  const navigate = useNavigate()
  const { setSelectedRoute, selectedRoute } = useAppStore()
  const [routes,     setRoutes]     = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [isOffline,  setIsOffline]  = useState(!navigator.onLine)
  const [showModal,  setShowModal]  = useState(false)
  const [showMyReqs, setShowMyReqs] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [form, setForm] = useState({ route_name: '', description: '' })

  // ── Routes লোড ─────────────────────────────────────────────
  useEffect(() => {
    const loadRoutes = async () => {
      if (!navigator.onLine) {
        const cached = await getCache('routes_list')
        if (cached?.isToday) {
          setRoutes(cached.data)
        } else {
          toast.error('আজকের ডেটা নেই। WiFi বা ইন্টারনেটে গিয়ে sync করুন।', { duration: 5000 })
        }
        setIsOffline(true)
        setLoading(false)
        return
      }
      try {
        const res = await api.get('/routes')
        const data = res.data.data || []
        setRoutes(data)
        saveCache('routes_list', data)
      } catch (err) {
        if (isNetworkError(err)) {
          const cached = await getCache('routes_list')
          if (cached?.isToday) {
            setRoutes(cached.data)
            setIsOffline(true)
            toast('নেটওয়ার্ক ধীর — আজকের সংরক্ষিত রুট দেখানো হচ্ছে', { icon: '📶', duration: 3000 })
          } else {
            setIsOffline(true)
            toast.error('আজকের ডেটা নেই। WiFi বা ইন্টারনেটে গিয়ে sync করুন।', { duration: 5000 })
          }
        }
      } finally {
        setLoading(false)
      }
    }
    loadRoutes()
  }, [])

  // ── SR নিজের requests লোড ──────────────────────────────────
  useEffect(() => {
    if (isOffline) return
    api.get('/routes/my-requests')
      .then(res => setMyRequests(res.data.data || []))
      .catch(() => {})
  }, [isOffline])

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
      setMyRequests(prev => [newReq, ...prev])
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

          {/* আবেদন status বাটন */}
          {!isOffline && (
            <button
              onClick={() => setShowMyReqs(v => !v)}
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

          {/* নতুন রুট বাটন */}
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

      {/* ── অফলাইন notice ── */}
      {isOffline && routes.length > 0 && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-700">
          <FiWifiOff size={12} />
          <span>অফলাইন — সর্বশেষ সংরক্ষিত রুট দেখানো হচ্ছে</span>
        </div>
      )}

      {/* ── আমার রুট আবেদন প্যানেল ── */}
      {showMyReqs && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm">আমার রুট আবেদন</h3>
            <button onClick={() => setShowMyReqs(false)}>
              <FiX className="text-gray-400" size={16} />
            </button>
          </div>

          {myRequests.length === 0 ? (
            <p className="text-center text-gray-400 text-xs py-6">কোনো আবেদন নেই</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {myRequests.map(req => (
                <div key={req.id} className="flex items-start justify-between px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{req.name}</p>
                    {req.description && (
                      <p className="text-xs text-gray-400 truncate">{req.description}</p>
                    )}
                    <p className="text-[10px] text-gray-300 mt-0.5">
                      {new Date(req.requested_at || req.created_at).toLocaleDateString('bn-BD', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <div className="flex-shrink-0 pt-0.5">
                    <StatusBadge status={req.status} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">
              ✳️ "অপেক্ষায়" থাকা রুট Manager অনুমোদন দিলে রুট তালিকায় যোগ হবে।
            </p>
          </div>
        </div>
      )}

      {/* ── Route list ── */}
      <div className="space-y-3">
        {routes.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <FiMapPin className="text-4xl mx-auto mb-2" />
            <p>কোনো রুট নেই</p>
            <p className="text-xs mt-1">নতুন রুট request করুন</p>
          </div>
        )}
        {routes.map(route => {
          const isActive = selectedRoute?.id === route.id

          const lastVisit = route.last_visited_at
            ? new Date(route.last_visited_at).toLocaleDateString('bn-BD', {
                day: 'numeric', month: 'short', year: 'numeric'
              })
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

          return (
            <div key={route.id} onClick={() => handleSelect(route)}
              className={`rounded-2xl p-4 shadow-sm flex flex-col gap-3 cursor-pointer active:scale-95 transition-transform
                ${isActive ? 'bg-primary/10 border-2 border-primary' : 'bg-white'}`}>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                    ${isActive ? 'bg-primary' : 'bg-primary/10'}`}>
                    <FiMapPin className={isActive ? 'text-white' : 'text-primary'} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{route.name}</h3>
                    <p className="text-xs text-gray-500">{route.customer_count || 0} কাস্টমার</p>
                  </div>
                </div>
                <FiCheck className={`text-xl ${isActive ? 'text-primary' : 'text-gray-300'}`} />
              </div>

              <div className={`flex items-center gap-4 pt-2 border-t ${isActive ? 'border-primary/20' : 'border-gray-100'}`}>
                {lastVisit ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <FiClock className={`text-xs ${visitBadgeColor}`} />
                      <span className={`text-xs font-medium ${visitBadgeColor}`}>
                        {daysSince === 0 ? 'আজ' : daysSince === 1 ? 'গতকাল' : `${daysSince} দিন আগে`}
                      </span>
                      <span className="text-xs text-gray-400">({lastVisit})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FiUser className="text-xs text-gray-400" />
                      <span className="text-xs text-gray-500 truncate max-w-[120px]">
                        {route.last_visited_by_name}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <FiClock className="text-xs text-gray-300" />
                    <span className="text-xs text-gray-400">এখনো কোনো ভিজিট নেই</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── নতুন রুট Request Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">নতুন রুট Request</h3>
              <button onClick={() => setShowModal(false)}><FiX className="text-xl" /></button>
            </div>

            {/* Info banner */}
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
        </div>
      )}
    </div>
  )
}
