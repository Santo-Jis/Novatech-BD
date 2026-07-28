// pages/admin/NetworkDiscovery.jsx
// ✅ NEW — Company/Distributor-সাইড "নেটওয়ার্ক ও ডিসকভারি" পেজ।
//
// ব্যাকএন্ড অনেক আগে থেকেই রেডি ছিল কিন্তু কোনো ফ্রন্টএন্ড ছিল না:
//   • /api/discovery/settings           (GET/PUT সার্ভিস এরিয়া + বিজনেস ফিল্ড)
//   • /api/discovery/shops              (GET এরিয়া+ফিল্ড ম্যাচ করা discoverable শপ)
//   • /api/connections/search-persons   (GET যেকোনো কাস্টমার সার্চ)
//   • /api/connections (+/:id/accept /:id/reject /:id/disconnect, POST /request)
//
// তিনটা ট্যাব:
//   ১) সেটিংস — কোন কোন জেলায় সার্ভিস দেয়, কোন কোন বিজনেস ফিল্ডে কাজ করে
//   ২) শপ ডিসকভারি — এরিয়া/ফিল্ড ম্যাচ করা discoverable শপ, রিকোয়েস্ট পাঠানো
//   ৩) সংযোগ ম্যানেজমেন্ট — যেকোনো কাস্টমার সার্চ, পেন্ডিং/কানেক্টেড লিস্ট, Accept/Reject/Disconnect
//
// কাস্টমার-পোর্টাল ConnectionsTab.jsx-এর "counterpart" — এটাই সেই ডেটার
// আসল ব্যবহারকারী পক্ষ। AdminCreditSettings.jsx-এর স্টাইল কনভেনশন অনুসরণ
// করা হয়েছে (plain Tailwind, gray/blue/emerald/orange accent, react-hot-toast)।

import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiMapPin, FiTag, FiSearch, FiCheck, FiX, FiPhone,
  FiEye, FiEyeOff, FiUserPlus, FiRefreshCw, FiLink, FiUnlock,
} from 'react-icons/fi'

const TABS = [
  { id: 'settings',    label: 'সেটিংস',           icon: FiMapPin },
  { id: 'shops',       label: 'শপ ডিসকভারি',      icon: FiEye },
  { id: 'connections', label: 'সংযোগ ম্যানেজমেন্ট', icon: FiLink },
]

export default function NetworkDiscovery() {
  const [tab, setTab] = useState('settings')

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <p className="text-lg font-bold text-gray-800">নেটওয়ার্ক ও ডিসকভারি</p>
        <p className="text-xs text-gray-400 mt-0.5">আপনার সার্ভিস এরিয়া/বিজনেস ফিল্ড সেট করুন, ম্যাচ করা শপ খুঁজুন, আর কাস্টমারের সাথে সংযোগ পরিচালনা করুন</p>
      </div>

      {/* ── Tab strip ── */}
      <div className="flex gap-2 bg-gray-100 rounded-2xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings'    && <SettingsPanel />}
      {tab === 'shops'       && <ShopsPanel />}
      {tab === 'connections' && <ConnectionsPanel />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// ট্যাব ১: সার্ভিস এরিয়া + বিজনেস ফিল্ড সেটিংস
// ════════════════════════════════════════════════════════════
function SettingsPanel() {
  const [loading, setLoading] = useState(true)
  const [savingAreas,  setSavingAreas]  = useState(false)
  const [savingFields, setSavingFields] = useState(false)

  const [divisions, setDivisions] = useState([])
  const [districts, setDistricts] = useState([])   // সব জেলা (division_id সহ)
  const [businessFields, setBusinessFields] = useState([])

  const [selectedDistrictIds, setSelectedDistrictIds] = useState(new Set())
  const [selectedFieldIds,    setSelectedFieldIds]    = useState(new Set())

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [divRes, distRes, bfRes, settingsRes] = await Promise.all([
          api.get('/reference/divisions'),
          api.get('/reference/districts'),
          api.get('/reference/business-fields'),
          api.get('/discovery/settings'),
        ])
        setDivisions(divRes.data.data || [])
        setDistricts(distRes.data.data || [])
        setBusinessFields(bfRes.data.data || [])
        setSelectedDistrictIds(new Set((settingsRes.data.data?.service_areas || []).map(a => a.id)))
        setSelectedFieldIds(new Set((settingsRes.data.data?.business_fields || []).map(f => f.id)))
      } catch {
        toast.error('সেটিংস লোড করা যায়নি।')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggleDistrict = (id) => {
    setSelectedDistrictIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleField = (id) => {
    setSelectedFieldIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const saveAreas = async () => {
    setSavingAreas(true)
    try {
      await api.put('/discovery/settings/service-areas', { district_ids: [...selectedDistrictIds] })
      toast.success('✅ সার্ভিস এরিয়া সংরক্ষিত হয়েছে।')
    } catch {
      toast.error('সংরক্ষণ করতে সমস্যা হয়েছে।')
    } finally {
      setSavingAreas(false)
    }
  }
  const saveFields = async () => {
    setSavingFields(true)
    try {
      await api.put('/discovery/settings/business-fields', { business_field_ids: [...selectedFieldIds] })
      toast.success('✅ বিজনেস ফিল্ড সংরক্ষিত হয়েছে।')
    } catch {
      toast.error('সংরক্ষণ করতে সমস্যা হয়েছে।')
    } finally {
      setSavingFields(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3" />
        <div className="h-24 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── সার্ভিস এরিয়া ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">📍</div>
          <div>
            <p className="font-bold text-sm text-gray-800">সার্ভিস এরিয়া</p>
            <p className="text-[11px] text-gray-400">কোন কোন জেলায় আপনি ডিস্ট্রিবিউশন সার্ভিস দেন — বাছাই করা জেলার discoverable শপগুলো "শপ ডিসকভারি"-তে দেখাবে</p>
          </div>
        </div>
        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
          {divisions.map(dv => {
            const distOfDiv = districts.filter(d => d.division_id === dv.id)
            if (distOfDiv.length === 0) return null
            return (
              <div key={dv.id}>
                <p className="text-xs font-semibold text-gray-500 mb-2">{dv.name_bn || dv.name_en}</p>
                <div className="flex flex-wrap gap-2">
                  {distOfDiv.map(d => {
                    const active = selectedDistrictIds.has(d.id)
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDistrict(d.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                          active ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {active && <FiCheck size={12} />}
                        {d.name_bn || d.name_en}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="px-5 pb-5">
          <button
            onClick={saveAreas}
            disabled={savingAreas}
            className="w-full py-3 bg-blue-500 text-white rounded-2xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            {savingAreas && <FiRefreshCw className="animate-spin" size={16} />}
            {savingAreas ? 'সংরক্ষণ হচ্ছে...' : `সার্ভিস এরিয়া সংরক্ষণ করুন (${selectedDistrictIds.size}টি জেলা)`}
          </button>
        </div>
      </div>

      {/* ── বিজনেস ফিল্ড ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">🏷️</div>
          <div>
            <p className="font-bold text-sm text-gray-800">বিজনেস ফিল্ড</p>
            <p className="text-[11px] text-gray-400">আপনি কোন কোন ধরনের পণ্য/ব্যবসায় ডিল করেন</p>
          </div>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {businessFields.map(bf => {
              const active = selectedFieldIds.has(bf.id)
              return (
                <button
                  key={bf.id}
                  onClick={() => toggleField(bf.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                    active ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {active && <FiCheck size={12} />}
                  {bf.name_bn || bf.name_en}
                </button>
              )
            })}
          </div>
        </div>
        <div className="px-5 pb-5">
          <button
            onClick={saveFields}
            disabled={savingFields}
            className="w-full py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            {savingFields && <FiRefreshCw className="animate-spin" size={16} />}
            {savingFields ? 'সংরক্ষণ হচ্ছে...' : `বিজনেস ফিল্ড সংরক্ষণ করুন (${selectedFieldIds.size}টি)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// ট্যাব ২: শপ ডিসকভারি (এরিয়া+ফিল্ড ম্যাচ করা discoverable শপ)
// ════════════════════════════════════════════════════════════
function ShopsPanel() {
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [requestingId, setRequestingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/discovery/shops')
      setShops(res.data.data || [])
    } catch {
      toast.error('শপ লিস্ট আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const sendRequest = async (person_id) => {
    setRequestingId(person_id)
    try {
      await api.post('/connections/request', { person_id })
      toast.success('✅ রিকোয়েস্ট পাঠানো হয়েছে — কাস্টমারের Accept-এর অপেক্ষায়।')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে।')
    } finally {
      setRequestingId(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3" />
        <div className="h-16 bg-gray-100 rounded-xl" />
        <div className="h-16 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (shops.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <p className="text-sm text-gray-600 mb-1">এখনো কোনো ম্যাচ করা শপ পাওয়া যায়নি।</p>
        <p className="text-xs text-gray-400">"সেটিংস" ট্যাবে আপনার সার্ভিস এরিয়া ও বিজনেস ফিল্ড ঠিকমতো সেট করা আছে কিনা দেখুন।</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {shops.map(s => {
        const isConnected = s.connection_status === 'connected'
        const isPending   = s.connection_status === 'pending'
        return (
          <div key={s.person_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-gray-800 truncate">{s.shop_name}</p>
                  {isConnected && <FiUnlock size={12} className="text-emerald-500 flex-shrink-0" />}
                  {!isConnected && <FiEyeOff size={12} className="text-gray-300 flex-shrink-0" />}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">{s.address}</p>
                <p className="text-[11px] text-gray-400">{s.district_name}, {s.division_name}</p>
                {isConnected && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
                    {s.owner_name && <span>👤 {s.owner_name}</span>}
                    {s.phone && <span className="flex items-center gap-1"><FiPhone size={11} /> {s.phone}</span>}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
                {isConnected && (
                  <span className="inline-block text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-3 py-1.5">সংযুক্ত</span>
                )}
                {isPending && (
                  <span className="inline-block text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-3 py-1.5">পেন্ডিং</span>
                )}
                {!isConnected && !isPending && (
                  <button
                    onClick={() => sendRequest(s.person_id)}
                    disabled={requestingId === s.person_id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-full px-3 py-2 disabled:opacity-60"
                  >
                    <FiUserPlus size={13} /> রিকোয়েস্ট
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// ট্যাব ৩: সংযোগ ম্যানেজমেন্ট (সার্চ + পেন্ডিং/কানেক্টেড/... লিস্ট)
// ════════════════════════════════════════════════════════════
const STATUS_FILTERS = [
  { id: '',             label: 'সব' },
  { id: 'pending',      label: '⏳ পেন্ডিং' },
  { id: 'connected',    label: '✅ কানেক্টেড' },
  { id: 'rejected',     label: '❌ বাতিল' },
  { id: 'disconnected', label: '🔌 বিচ্ছিন্ন' },
]

function ConnectionsPanel() {
  const [statusFilter, setStatusFilter] = useState('')
  const [connections, setConnections]   = useState([])
  const [loading, setLoading]           = useState(true)

  const [searchQ, setSearchQ]           = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]       = useState(false)
  const [actingId, setActingId]         = useState(null)

  const loadConnections = useCallback(async (status) => {
    setLoading(true)
    try {
      const res = await api.get('/connections', { params: status ? { status } : {} })
      setConnections(res.data.data || [])
    } catch {
      toast.error('লিস্ট আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConnections(statusFilter) }, [statusFilter, loadConnections])

  const runSearch = async () => {
    if (searchQ.trim().length < 3) { toast.error('কমপক্ষে ৩ অক্ষর লিখুন।'); return }
    setSearching(true)
    try {
      const res = await api.get('/connections/search-persons', { params: { q: searchQ.trim() } })
      setSearchResults(res.data.data || [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const requestPerson = async (person_id) => {
    setActingId(person_id)
    try {
      await api.post('/connections/request', { person_id })
      toast.success('✅ রিকোয়েস্ট পাঠানো হয়েছে।')
      setSearchResults(prev => prev.map(p => p.id === person_id ? { ...p, existing_status: 'pending' } : p))
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setActingId(null)
    }
  }

  const act = async (id, action) => {
    setActingId(id)
    try {
      await api.post(`/connections/${id}/${action}`)
      toast.success(action === 'accept' ? '✅ Accept হয়েছে।' : action === 'reject' ? 'বাতিল হয়েছে।' : 'বিচ্ছিন্ন হয়েছে।')
      loadConnections(statusFilter)
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* ── কাস্টমার সার্চ (নতুন সংযোগ) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">ফোন/হোয়াটসঅ্যাপ/ইমেইল/নাম/QR দিয়ে কাস্টমার খুঁজুন</p>
        <div className="flex gap-2">
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="যেমন: 017XXXXXXXX বা নাম"
            className="flex-1 h-11 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={runSearch}
            disabled={searching}
            className="w-11 h-11 rounded-xl bg-blue-500 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-60"
          >
            <FiSearch size={16} />
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {searchResults.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.full_name}</p>
                  <p className="text-[11px] text-gray-400">{p.phone || p.whatsapp || p.email}</p>
                </div>
                {p.existing_status === 'connected' && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-3 py-1.5 flex-shrink-0">সংযুক্ত</span>
                )}
                {p.existing_status === 'pending' && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-3 py-1.5 flex-shrink-0">পেন্ডিং</span>
                )}
                {!p.existing_status && (
                  <button
                    onClick={() => requestPerson(p.id)}
                    disabled={actingId === p.id}
                    className="text-xs font-semibold text-blue-600 bg-blue-50 rounded-full px-3 py-1.5 flex-shrink-0 disabled:opacity-60"
                  >
                    রিকোয়েস্ট
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ফিল্টার ট্যাব ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`flex-shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === f.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── কানেকশন লিস্ট ── */}
      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
          <div className="h-16 bg-gray-100 rounded-xl" />
        </div>
      )}
      {!loading && connections.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">এই ফিল্টারে কোনো সংযোগ নেই।</p>
        </div>
      )}
      <div className="space-y-2.5">
        {connections.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{c.shop_name || c.full_name}</p>
                <p className="text-[11px] text-gray-400">{c.phone || c.whatsapp} {c.customer_code ? `• ${c.customer_code}` : ''}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {c.status === 'pending' && (
                  <>
                    <button onClick={() => act(c.id, 'accept')} disabled={actingId === c.id}
                      className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center disabled:opacity-60">
                      <FiCheck size={14} />
                    </button>
                    <button onClick={() => act(c.id, 'reject')} disabled={actingId === c.id}
                      className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center disabled:opacity-60">
                      <FiX size={14} />
                    </button>
                  </>
                )}
                {c.status === 'connected' && (
                  <button onClick={() => act(c.id, 'disconnect')} disabled={actingId === c.id}
                    className="text-[10px] font-semibold text-red-600 bg-red-50 rounded-full px-3 py-1.5 disabled:opacity-60">
                    সংযোগ বিচ্ছিন্ন
                  </button>
                )}
                {c.status === 'rejected' && (
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-3 py-1.5">বাতিল করা হয়েছে</span>
                )}
                {c.status === 'disconnected' && (
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-3 py-1.5">বিচ্ছিন্ন</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
