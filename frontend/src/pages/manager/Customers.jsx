// frontend/src/pages/manager/Customers.jsx
// Manager: Customer edit request দেখবে ও approve/reject করবে

import { useState, useEffect } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import { FiCheck, FiX, FiEdit, FiUser, FiRefreshCw } from 'react-icons/fi'

export default function ManagerCustomers() {
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [processing, setProcessing] = useState({}) // { [requestId]: true }

  const loadRequests = async () => {
    setLoading(true)
    try {
      const res = await api.get('/customers/edit-requests/pending')
      setRequests(res.data.data || [])
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRequests() }, [])

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
      await api.put(`/customers/edit-requests/${requestId}/reject`, {
        reason: 'ম্যানেজার কর্তৃক বাতিল'
      })
      toast.success(`❌ ${shopName} এর এডিট বাতিল। আগের তথ্য ফিরে এসেছে।`)
      setRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setProcessing(p => ({ ...p, [requestId]: false }))
    }
  }

  // Field-এর বাংলা নাম
  const fieldLabels = {
    shop_name:     'দোকানের নাম',
    owner_name:    'মালিকের নাম',
    business_type: 'ব্যবসার ধরন',
    whatsapp:      'WhatsApp',
    sms_phone:     'SMS নম্বর',
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">কাস্টমার এডিট রিকোয়েস্ট</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {requests.length} টি অপেক্ষায় আছে
          </p>
        </div>
        <button
          onClick={loadRequests}
          className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center">
          <FiEdit className="text-4xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">কোনো পেন্ডিং এডিট নেই।</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              
              {/* Customer info */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FiUser className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{req.shop_name}</p>
                  <p className="text-xs text-gray-400">{req.customer_code} • {req.owner_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    রিকোয়েস্ট করেছেন: <span className="text-gray-600 font-medium">{req.requested_by_name}</span>
                    {' '}({req.requested_by_phone})
                  </p>
                  <p className="text-xs text-gray-400">
                    সময়: {new Date(req.created_at).toLocaleString('bn-BD')}
                  </p>
                </div>
              </div>

              {/* Changes — before vs after */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 mb-1">পরিবর্তনসমূহ:</p>
                {Object.entries(req.new_data || {}).map(([field, newVal]) => (
                  <div key={field} className="grid grid-cols-3 gap-2 text-xs items-center">
                    <span className="text-gray-500 font-medium">
                      {fieldLabels[field] || field}
                    </span>
                    <span className="text-red-400 line-through truncate">
                      {req.previous_data?.[field] || '—'}
                    </span>
                    <span className="text-green-600 font-medium truncate">
                      → {String(newVal)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleReject(req.id, req.shop_name)}
                  disabled={processing[req.id]}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold disabled:opacity-50"
                >
                  {processing[req.id]
                    ? <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                    : <FiX />
                  }
                  বাতিল
                </button>
                <button
                  onClick={() => handleApprove(req.id, req.shop_name)}
                  disabled={processing[req.id]}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold disabled:opacity-50"
                >
                  {processing[req.id]
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <FiCheck />
                  }
                  অনুমোদন
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
