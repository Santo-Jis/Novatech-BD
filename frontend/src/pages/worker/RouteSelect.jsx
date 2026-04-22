import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api, { isNetworkError } from '../../api/axios'
import { saveCache, getCache } from '../../api/offlineQueue'
import { FiMapPin, FiPlus, FiX, FiCheck, FiClock, FiUser, FiWifiOff } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function RouteSelect() {
  const navigate = useNavigate()
  const { setSelectedRoute, selectedRoute } = useAppStore()
  const [routes,    setRoutes]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [showModal, setShowModal] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form, setForm] = useState({ route_name: '', description: '' })

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
            toast('নেটওয়ার্ক ধীর — আজকের সংরক্ষিত রুট দেখানো হচ্ছে', {
              icon: '📶', duration: 3000
            })
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

  const handleSelect = (route) => {
    setSelectedRoute(route)
    toast.success(`${route.name} রুট সিলেক্ট হয়েছে`)
    navigate('/worker/customers')
  }

  const handleRequest = async () => {
    if (!form.route_name) return toast.error('রুটের নাম দিন')
    setSaving(true)
    try {
      await api.post('/routes/request', form)
      toast.success('রুট request পাঠানো হয়েছে! Manager অনুমোদন করলে দেখা যাবে ✅')
      setShowModal(false)
      setForm({ route_name: '', description: '' })
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">রুট সিলেক্ট করুন</h2>
          {selectedRoute
            ? <p className="text-xs text-green-600 font-medium">✅ আজকের রুট: {selectedRoute.name}</p>
            : <p className="text-xs text-gray-500">আজকের রুট বেছে নিন</p>
          }
        </div>
        <button onClick={() => {
            if (isOffline) { toast.error('অফলাইনে নতুন রুট request করা যাবে না'); return }
            setShowModal(true)
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
            ${isOffline ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-primary text-white'}`}>
          <FiPlus /> নতুন রুট
        </button>
      </div>

      {/* অফলাইন notice */}
      {isOffline && routes.length > 0 && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-700">
          <FiWifiOff size={12} />
          <span>অফলাইন — সর্বশেষ সংরক্ষিত রুট দেখানো হচ্ছে</span>
        </div>
      )}

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

          // last visit তারিখ format
          const lastVisit = route.last_visited_at
            ? new Date(route.last_visited_at).toLocaleDateString('bn-BD', {
                day: 'numeric', month: 'short', year: 'numeric'
              })
            : null

          // কতদিন আগে
          const daysSince = route.last_visited_at
            ? Math.floor((Date.now() - new Date(route.last_visited_at)) / 86400000)
            : null

          const visitBadgeColor = daysSince === null
            ? 'text-gray-400'
            : daysSince === 0
              ? 'text-green-600'
              : daysSince <= 3
                ? 'text-blue-500'
                : daysSince <= 7
                  ? 'text-yellow-600'
                  : 'text-red-500'

          return (
          <div key={route.id} onClick={() => handleSelect(route)}
            className={`rounded-2xl p-4 shadow-sm flex flex-col gap-3 cursor-pointer active:scale-95 transition-transform
              ${isActive ? 'bg-primary/10 border-2 border-primary' : 'bg-white'}`}>

            {/* উপরের অংশ — নাম ও চেক */}
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

            {/* নিচের অংশ — last visit তথ্য */}
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">নতুন রুট Request</h3>
              <button onClick={() => setShowModal(false)}><FiX className="text-xl" /></button>
            </div>
            <p className="text-xs text-gray-500">Manager অনুমোদন করলে রুটটি active হবে</p>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">রুটের নাম *</label>
              <input value={form.route_name}
                onChange={e => setForm(p => ({ ...p, route_name: e.target.value }))}
                placeholder="যেমন: ঢাকা-উত্তর রুট"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">বিবরণ (ঐচ্ছিক)</label>
              <input value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="রুট সম্পর্কে বিস্তারিত"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <button onClick={handleRequest} disabled={saving}
              className="w-full bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
              {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiPlus />}
              Request পাঠান
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
