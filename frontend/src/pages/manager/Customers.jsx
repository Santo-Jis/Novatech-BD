// frontend/src/pages/manager/Customers.jsx
// Manager: Customer এডিট রিকোয়েস্ট অনুমোদন + Credit Management (Collect & Limit)

import { useState, useEffect } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiCheck, FiX, FiEdit, FiUser, FiRefreshCw,
  FiDollarSign, FiSliders, FiSearch,
  FiAlertCircle, FiCreditCard
} from 'react-icons/fi'

// ── Tab constants ────────────────────────────────────────────
const TABS = [
  { id: 'edits',  label: 'এডিট রিকোয়েস্ট', icon: FiEdit },
  { id: 'credit', label: 'ক্রেডিট ম্যানেজমেন্ট', icon: FiCreditCard },
]

// ── Credit Collect Modal ─────────────────────────────────────
function CollectCreditModal({ customer, onClose, onSuccess }) {
  const [amount, setAmount]   = useState('')
  const [notes,  setNotes]    = useState('')
  const [loading, setLoading] = useState(false)

  const maxAmount = parseFloat(customer.current_credit || 0)

  const handleSubmit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return toast.error('সঠিক পরিমাণ দিন।')
    if (amt > maxAmount) return toast.error(`সর্বোচ্চ ৳${maxAmount.toLocaleString('bn-BD')} দেওয়া যাবে।`)

    setLoading(true)
    try {
      await api.post(`/customers/${customer.id}/collect-credit`, { amount: amt, notes })
      toast.success(`✅ ৳${amt.toLocaleString('bn-BD')} বাকি আদায় সফল।`)
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">বাকি আদায়</h2>
            <p className="text-sm text-gray-500">{customer.shop_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 text-gray-500">
            <FiX />
          </button>
        </div>

        <div className="bg-red-50 rounded-xl p-3 flex items-center gap-3">
          <FiAlertCircle className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-red-400">বর্তমান বাকি</p>
            <p className="text-lg font-bold text-red-600">৳{maxAmount.toLocaleString('bn-BD')}</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">আদায়ের পরিমাণ (৳)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="যেমন: 500"
            max={maxAmount}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2 mt-2">
            {[500, 1000, 2000].filter(v => v <= maxAmount).concat(maxAmount > 0 ? [maxAmount] : [])
              .filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).map(v => (
              <button key={v} onClick={() => setAmount(String(v))}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-primary/10 hover:text-primary">
                ৳{v.toLocaleString('bn-BD')}{v === maxAmount ? ' (সম্পূর্ণ)' : ''}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">নোট (ঐচ্ছিক)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="যেমন: নগদে পরিশোধ"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !amount}
          className="w-full py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <FiCheck />}
          বাকি আদায় নিশ্চিত করুন
        </button>
      </div>
    </div>
  )
}

// ── Credit Limit Modal ───────────────────────────────────────
function CreditLimitModal({ customer, onClose, onSuccess }) {
  const [limit,   setLimit]   = useState(String(customer.credit_limit || 5000))
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const lim = parseFloat(limit)
    if (isNaN(lim) || lim < 0) return toast.error('সঠিক লিমিট দিন।')

    setLoading(true)
    try {
      await api.put(`/customers/${customer.id}/credit-limit`, { credit_limit: lim })
      toast.success(`✅ ${customer.shop_name} এর লিমিট ৳${lim.toLocaleString('bn-BD')} সেট হয়েছে।`)
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">ক্রেডিট লিমিট পরিবর্তন</h2>
            <p className="text-sm text-gray-500">{customer.shop_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 text-gray-500">
            <FiX />
          </button>
        </div>

        <div className="bg-blue-50 rounded-xl p-3 flex items-center gap-3">
          <FiSliders className="text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-blue-400">বর্তমান লিমিট</p>
            <p className="text-lg font-bold text-blue-600">৳{parseFloat(customer.credit_limit || 0).toLocaleString('bn-BD')}</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">নতুন ক্রেডিট লিমিট (৳)</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min={0}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2 mt-2 flex-wrap">
            {[2000, 5000, 10000, 20000, 50000].map(v => (
              <button key={v} onClick={() => setLimit(String(v))}
                className="py-1.5 px-3 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-primary/10 hover:text-primary">
                ৳{v.toLocaleString('bn-BD')}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !limit}
          className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <FiCheck />}
          লিমিট সেভ করুন
        </button>
      </div>
    </div>
  )
}

// ── Customer Credit Card ─────────────────────────────────────
function CustomerCreditCard({ customer, onCollect, onSetLimit }) {
  const credit      = parseFloat(customer.current_credit || 0)
  const limit       = parseFloat(customer.credit_limit   || 0)
  const balance     = parseFloat(customer.credit_balance || 0)
  const usedPercent = limit > 0 ? Math.min((credit / limit) * 100, 100) : 0
  const barColor    = usedPercent >= 90 ? 'bg-red-500' : usedPercent >= 60 ? 'bg-orange-400' : 'bg-green-500'

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FiUser className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 truncate">{customer.shop_name}</p>
          <p className="text-xs text-gray-400">{customer.customer_code} • {customer.owner_name}</p>
          {customer.route_name && <p className="text-xs text-gray-400">{customer.route_name}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-red-50 rounded-xl p-2">
          <p className="text-xs text-red-400">বর্তমান বাকি</p>
          <p className="text-sm font-bold text-red-600">৳{credit.toLocaleString('bn-BD')}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2">
          <p className="text-xs text-gray-400">লিমিট</p>
          <p className="text-sm font-bold text-gray-700">৳{limit.toLocaleString('bn-BD')}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-2">
          <p className="text-xs text-green-400">অবশিষ্ট</p>
          <p className="text-sm font-bold text-green-600">৳{balance.toLocaleString('bn-BD')}</p>
        </div>
      </div>

      {limit > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>ব্যবহার</span>
            <span>{usedPercent.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${usedPercent}%` }} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => onSetLimit(customer)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-semibold">
          <FiSliders size={14} />
          লিমিট পরিবর্তন
        </button>
        <button onClick={() => onCollect(customer)} disabled={credit <= 0}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold disabled:opacity-40 disabled:bg-gray-100 disabled:text-gray-400">
          <FiDollarSign size={14} />
          বাকি আদায়
        </button>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────
export default function ManagerCustomers() {
  const [activeTab,    setActiveTab]    = useState('edits')
  const [requests,     setRequests]     = useState([])
  const [loadingEdits, setLoadingEdits] = useState(true)
  const [processing,   setProcessing]   = useState({})
  const [customers,    setCustomers]    = useState([])
  const [loadingCust,  setLoadingCust]  = useState(false)
  const [search,       setSearch]       = useState('')
  const [collectModal, setCollectModal] = useState(null)
  const [limitModal,   setLimitModal]   = useState(null)

  const loadRequests = async () => {
    setLoadingEdits(true)
    try {
      const res = await api.get('/customers/edit-requests/pending')
      setRequests(res.data.data || [])
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoadingEdits(false)
    }
  }

  const loadCustomers = async () => {
    setLoadingCust(true)
    try {
      const res = await api.get('/customers', { params: { limit: 200 } })
      setCustomers(res.data.data || [])
    } catch {
      toast.error('কাস্টমার তালিকা আনতে সমস্যা হয়েছে।')
    } finally {
      setLoadingCust(false)
    }
  }

  useEffect(() => { loadRequests() }, [])
  useEffect(() => {
    if (activeTab === 'credit' && customers.length === 0) loadCustomers()
  }, [activeTab])

  const handleApprove = async (requestId, shopName) => {
    setProcessing(p => ({ ...p, [requestId]: true }))
    try {
      await api.put(`/customers/edit-requests/${requestId}/approve`)
      toast.success(`✅ ${shopName} এর এডিট অনুমোদন হয়েছে।`)
      setRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setProcessing(p => ({ ...p, [requestId]: false }))
    }
  }

  const handleReject = async (requestId, shopName) => {
    setProcessing(p => ({ ...p, [requestId]: true }))
    try {
      await api.put(`/customers/edit-requests/${requestId}/reject`, { reason: 'ম্যানেজার কর্তৃক বাতিল' })
      toast.success(`❌ ${shopName} এর এডিট বাতিল।`)
      setRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setProcessing(p => ({ ...p, [requestId]: false }))
    }
  }

  const fieldLabels = {
    shop_name: 'দোকানের নাম', owner_name: 'মালিকের নাম',
    business_type: 'ব্যবসার ধরন', whatsapp: 'WhatsApp', sms_phone: 'SMS নম্বর',
  }

  const filteredCustomers = customers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.shop_name?.toLowerCase().includes(q) || c.owner_name?.toLowerCase().includes(q) || c.customer_code?.toLowerCase().includes(q)
  })

  const totalCredit   = customers.reduce((s, c) => s + parseFloat(c.current_credit || 0), 0)
  const totalWithDebt = customers.filter(c => parseFloat(c.current_credit || 0) > 0).length

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">কাস্টমার</h1>
        <button
          onClick={activeTab === 'edits' ? loadRequests : loadCustomers}
          className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600"
        >
          <FiRefreshCw className={(loadingEdits || loadingCust) ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all
                ${activeTab === tab.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={14} />
              {tab.label}
              {tab.id === 'edits' && requests.length > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {requests.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── TAB: Edit Requests ─────────────────────────────── */}
      {activeTab === 'edits' && (
        <>
          <p className="text-sm text-gray-500 -mt-2">{requests.length} টি অপেক্ষায় আছে</p>

          {loadingEdits ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}</div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center">
              <FiEdit className="text-4xl text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">কোনো পেন্ডিং এডিট নেই।</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FiUser className="text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{req.shop_name}</p>
                      <p className="text-xs text-gray-400">{req.customer_code} • {req.owner_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        রিকোয়েস্ট: <span className="text-gray-600 font-medium">{req.requested_by_name}</span>
                        {' '}({req.requested_by_phone})
                      </p>
                      <p className="text-xs text-gray-400">{new Date(req.created_at).toLocaleString('bn-BD')}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 mb-1">পরিবর্তনসমূহ:</p>
                    {Object.entries(req.new_data || {}).map(([field, newVal]) => (
                      <div key={field} className="grid grid-cols-3 gap-2 text-xs items-center">
                        <span className="text-gray-500 font-medium">{fieldLabels[field] || field}</span>
                        <span className="text-red-400 line-through truncate">{req.previous_data?.[field] || '—'}</span>
                        <span className="text-green-600 font-medium truncate">→ {String(newVal)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => handleReject(req.id, req.shop_name)} disabled={processing[req.id]}
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold disabled:opacity-50">
                      {processing[req.id]
                        ? <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                        : <FiX />}
                      বাতিল
                    </button>
                    <button onClick={() => handleApprove(req.id, req.shop_name)} disabled={processing[req.id]}
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold disabled:opacity-50">
                      {processing[req.id]
                        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <FiCheck />}
                      অনুমোদন
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TAB: Credit Management ─────────────────────────── */}
      {activeTab === 'credit' && (
        <>
          {!loadingCust && customers.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-50 rounded-2xl p-3 text-center">
                <p className="text-xs text-red-400">মোট বাকি</p>
                <p className="text-base font-bold text-red-600">৳{totalCredit.toLocaleString('bn-BD')}</p>
              </div>
              <div className="bg-orange-50 rounded-2xl p-3 text-center">
                <p className="text-xs text-orange-400">বাকি আছে এমন</p>
                <p className="text-base font-bold text-orange-600">{totalWithDebt} জন</p>
              </div>
            </div>
          )}

          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="নাম, কোড বা মালিক খুঁজুন..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {loadingCust ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-40 bg-white rounded-2xl animate-pulse" />)}</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center">
              <FiCreditCard className="text-4xl text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">কোনো কাস্টমার পাওয়া যায়নি।</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCustomers.map(customer => (
                <CustomerCreditCard
                  key={customer.id}
                  customer={customer}
                  onCollect={(c) => setCollectModal(c)}
                  onSetLimit={(c) => setLimitModal(c)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {collectModal && (
        <CollectCreditModal customer={collectModal} onClose={() => setCollectModal(null)} onSuccess={loadCustomers} />
      )}
      {limitModal && (
        <CreditLimitModal customer={limitModal} onClose={() => setLimitModal(null)} onSuccess={loadCustomers} />
      )}
    </div>
  )
}
