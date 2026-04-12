import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api from '../../api/axios'
import { FiMapPin, FiPlus, FiX, FiCheck } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function RouteSelect() {
  const navigate = useNavigate()
  const { setSelectedRoute } = useAppStore()
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ route_name: '', description: '' })

  useEffect(() => {
    api.get('/routes')
      .then(res => setRoutes(res.data.data || []))
      .finally(() => setLoading(false))
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
          <p className="text-xs text-gray-500">আজকের রুট বেছে নিন</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <FiPlus /> নতুন রুট
        </button>
      </div>

      <div className="space-y-3">
        {routes.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <FiMapPin className="text-4xl mx-auto mb-2" />
            <p>কোনো রুট নেই</p>
            <p className="text-xs mt-1">নতুন রুট request করুন</p>
          </div>
        )}
        {routes.map(route => (
          <div key={route.id} onClick={() => handleSelect(route)}
            className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between cursor-pointer active:scale-95 transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <FiMapPin className="text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{route.name}</h3>
                <p className="text-xs text-gray-500">{route.customer_count || 0} কাস্টমার</p>
              </div>
            </div>
            <FiCheck className="text-gray-300 text-xl" />
          </div>
        ))}
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
