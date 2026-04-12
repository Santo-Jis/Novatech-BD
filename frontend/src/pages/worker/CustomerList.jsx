import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app.store'
import api from '../../api/axios'
import { FiMapPin, FiSearch, FiPlus, FiX, FiUser, FiPhone, FiCamera, FiNavigation, FiCheck } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function CustomerList() {
  const navigate = useNavigate()
  const { selectedRoute } = useAppStore()
  const [customers, setCustomers] = useState([])
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const fileRef = useRef()
  const [newCustomer, setNewCustomer] = useState({
    shop_name: '', owner_name: '', phone: '', address: '',
    credit_limit: '5000', route_id: '', lat: null, lng: null, photo: null
  })

  const loadCustomers = async () => {
    const params = new URLSearchParams()
    if (selectedRoute) params.append('route_id', selectedRoute.id)
    try {
      const res = await api.get(`/customers?${params}`)
      setCustomers(res.data.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
    api.get('/routes').then(res => setRoutes(res.data.data || []))
  }, [selectedRoute])

  const getGPS = () => {
    setGpsLoading(true)
    if (!navigator.geolocation) {
      toast.error('GPS সাপোর্ট নেই')
      setGpsLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setNewCustomer(p => ({ ...p, lat, lng }))
        toast.success(`GPS নেওয়া হয়েছে ✅`)
        setGpsLoading(false)
      },
      () => {
        toast.error('GPS পাওয়া যায়নি')
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setNewCustomer(p => ({ ...p, photo: file }))
    toast.success('ছবি সিলেক্ট হয়েছে ✅')
  }

  const handleAddCustomer = async () => {
    if (!newCustomer.shop_name) return toast.error('দোকানের নাম দিন')
    if (!newCustomer.phone) return toast.error('ফোন নম্বর দিন')
    if (!newCustomer.lat) return toast.error('GPS লোকেশন নিন')
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('shop_name', newCustomer.shop_name)
      formData.append('owner_name', newCustomer.owner_name)
      formData.append('phone', newCustomer.phone)
      formData.append('address', newCustomer.address)
      formData.append('credit_limit', newCustomer.credit_limit || 5000)
      formData.append('lat', newCustomer.lat)
      formData.append('lng', newCustomer.lng)
      if (newCustomer.route_id) formData.append('route_id', newCustomer.route_id)
      if (newCustomer.photo) formData.append('shop_photo', newCustomer.photo)

      await api.post('/customers', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('নতুন কাস্টমার যোগ হয়েছে ✅')
      setShowAddModal(false)
      setNewCustomer({ shop_name: '', owner_name: '', phone: '', address: '', credit_limit: '5000', route_id: '', lat: null, lng: null, photo: null })
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
          <div key={c._id || c.id} onClick={() => navigate(`/worker/visit/${c._id || c.id}`)}
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
              <div>
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
          <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">নতুন কাস্টমার</h3>
              <button onClick={() => setShowAddModal(false)}><FiX className="text-xl" /></button>
            </div>

            {/* দোকানের ছবি */}
            <div>
              <label className="text-sm text-gray-600 mb-2 block">দোকানের ছবি</label>
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer">
                {newCustomer.photo ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <FiCheck /> <span className="text-sm">{newCustomer.photo.name}</span>
                  </div>
                ) : (
                  <>
                    <FiCamera className="text-2xl text-gray-400" />
                    <span className="text-sm text-gray-400">ছবি তুলুন বা গ্যালারি থেকে বেছে নিন</span>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </div>

            {/* GPS */}
            <div>
              <label className="text-sm text-gray-600 mb-2 block">GPS লোকেশন *</label>
              <button onClick={getGPS} disabled={gpsLoading}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm ${newCustomer.lat ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                {gpsLoading ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <FiNavigation />}
                {newCustomer.lat ? `✅ লোকেশন নেওয়া হয়েছে (${newCustomer.lat.toFixed(4)}, ${newCustomer.lng.toFixed(4)})` : 'GPS লোকেশন নিন'}
              </button>
              {newCustomer.lat && (
                <a href={`https://maps.google.com/?q=${newCustomer.lat},${newCustomer.lng}`} target="_blank"
                  className="text-xs text-blue-500 mt-1 block text-center">Google Maps এ দেখুন →</a>
              )}
            </div>

            {/* রুট সিলেক্ট */}
            <div>
              <label className="text-sm text-gray-600 mb-1 block">রুট সিলেক্ট করুন</label>
              <select value={newCustomer.route_id} onChange={e => setNewCustomer(p => ({ ...p, route_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none">
                <option value="">-- রুট বেছে নিন --</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
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
