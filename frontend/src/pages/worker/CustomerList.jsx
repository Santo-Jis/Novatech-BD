import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api from '../../api/axios'
import { FiMapPin, FiSearch, FiNavigation, FiPlus, FiX, FiUser, FiPhone, FiHome } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function CustomerList() {
  const navigate = useNavigate()
  const { selectedRoute } = useAppStore()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    shop_name: '', owner_name: '', phone: '', address: '', credit_limit: '5000'
  })

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    )
  }, [])

  const loadCustomers = async () => {
    const params = new URLSearchParams()
    if (selectedRoute) params.append('route_id', selectedRoute.id)
    if (location) { params.append('lat', location.lat); params.append('lng', location.lng) }
    try {
      const res = await api.get(`/customers?${params}`)
      setCustomers(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCustomers() }, [selectedRoute, location])

  const handleAddCustomer = async () => {
    if (!newCustomer.shop_name) return toast.error('দোকানের নাম দিন')
    if (!newCustomer.phone) return toast.error('ফোন নম্বর দিন')
    setSaving(true)
    try {
      await api.post('/customers', {
        ...newCustomer,
        credit_limit: parseFloat(newCustomer.credit_limit || 0),
        lat: location?.lat,
        lng: location?.lng,
        route_id: selectedRoute?.id
      })
      toast.success('নতুন কাস্টমার যোগ হয়েছে ✅')
      setShowAddModal(false)
      setNewCustomer({ shop_name: '', owner_name: '', phone: '', address: '', credit_limit: '5000' })
      loadCustomers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'কাস্টমার যোগ হয়নি')
    } finally {
      setSaving(false)
    }
  }

  const filtered = customers.filter(c =>
    c.shop_name?.includes(search) || c.owner_name?.includes(search)
  )

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">কাস্টমার তালিকা</h2>
          <p className="text-xs text-gray-500">{customers.filter(c=>c.visited_today).length}/{customers.length} ভিজিট</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <FiPlus /> নতুন
        </button>
      </div>

      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="দোকান বা মালিকের নাম..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-gray-100 text-sm focus:outline-none" />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <FiUser className="text-4xl mx-auto mb-2" />
            <p>কোনো কাস্টমার নেই</p>
          </div>
        )}
        {filtered.map(c => (
          <div key={c._id} onClick={() => navigate(`/worker/visit/${c._id}`)}
            className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${c.visited_today ? 'border-green-400' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800">{c.shop_name}</h3>
                <p className="text-sm text-gray-500">{c.owner_name}</p>
                <p className="text-xs text-gray-400 mt-1">{c.address}</p>
                {parseFloat(c.current_credit || 0) > 0 && (
                  <p className="text-xs text-red-500 mt-1">বকেয়া: ৳{parseInt(c.current_credit).toLocaleString()}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {c.visited_today
                  ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">✅ ভিজিট</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">বাকি</span>
                }
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">নতুন কাস্টমার</h3>
              <button onClick={() => setShowAddModal(false)}><FiX className="text-xl" /></button>
            </div>
            {[
              { label: 'দোকানের নাম *', key: 'shop_name', placeholder: 'যেমন: আল-আমিন স্টোর' },
              { label: 'মালিকের নাম', key: 'owner_name', placeholder: 'মালিকের নাম' },
              { label: 'ফোন *', key: 'phone', placeholder: '01XXXXXXXXX', type: 'tel' },
              { label: 'ঠিকানা', key: 'address', placeholder: 'দোকানের ঠিকানা' },
              { label: 'ক্রেডিট লিমিট (৳)', key: 'credit_limit', placeholder: '5000', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-sm text-gray-600 mb-1 block">{f.label}</label>
                <input type={f.type || 'text'} value={newCustomer[f.key]}
                  onChange={e => setNewCustomer(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none" />
              </div>
            ))}
            {location && <p className="text-xs text-green-600">📍 GPS লোকেশন নেওয়া হয়েছে ✅</p>}
            <button onClick={handleAddCustomer} disabled={saving}
              className="w-full bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
              {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiPlus />}
              যোগ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
