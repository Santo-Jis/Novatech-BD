// ============================================================
// frontend/src/pages/admin/CustomerOrderRequests.jsx
// Admin ও Manager — কাস্টমারের অর্ডার রিকোয়েস্ট ম্যানেজমেন্ট
// ============================================================

import { useState, useEffect } from 'react'
import api from '../../api/axios'

// ── Status Badge ──────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    pending:   { label: '⏳ অপেক্ষমাণ',  bg: '#FEF9C3', color: '#92400E' },
    confirmed: { label: '✅ কনফার্ম',     bg: '#DBEAFE', color: '#1E40AF' },
    assigned:  { label: '🚶 SR অ্যাসাইন', bg: '#EDE9FE', color: '#5B21B6' },
    delivered: { label: '📦 সম্পন্ন',     bg: '#D1FAE5', color: '#065F46' },
    cancelled: { label: '❌ বাতিল',       bg: '#FEE2E2', color: '#991B1B' },
  }
  const s = map[status] || { label: status, bg: '#F3F4F6', color: '#374151' }
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 700
    }}>
      {s.label}
    </span>
  )
}

// ✅ NEW (ফেজ ৪ — মোবাইল ব্যাংকিং TrxID ভেরিফিকেশন)
const PaymentStatusBadge = ({ status }) => {
  const map = {
    pending_verification: { label: '⏳ যাচাই বাকি',   bg: '#FEF3C7', color: '#92400E' },
    paid:                 { label: '✅ যাচাই হয়েছে',   bg: '#D1FAE5', color: '#065F46' },
    failed:                { label: '❌ মেলেনি',        bg: '#FEE2E2', color: '#991B1B' },
    refund_pending:        { label: '💸 রিফান্ড বাকি',   bg: '#FFEDD5', color: '#9A3412' },
    refunded:              { label: '↩️ রিফান্ড হয়েছে',  bg: '#F3E8FF', color: '#6B21A8' },
  }
  const s = map[status]
  if (!s) return null
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  )
}

export default function CustomerOrderRequests() {
  const [requests, setRequests]     = useState([])
  const [workers,  setWorkers]      = useState([])
  const [loading,  setLoading]      = useState(true)
  const [filter,   setFilter]       = useState('pending')
  const [selected, setSelected]     = useState(null)   // modal
  const [updating, setUpdating]     = useState(false)
  const [form,     setForm]         = useState({ status: '', assigned_to: '', admin_note: '' })
  const [toast,    setToast]        = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // রিকোয়েস্ট লোড
  const loadRequests = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/customer-order-requests?status=${filter}`)
      setRequests(res.data.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // SR লিস্ট লোড (assign করার জন্য)
  const loadWorkers = async () => {
    try {
      const res = await api.get('/employees?role=worker&status=active')
      setWorkers(res.data.data || [])
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => { loadRequests() }, [filter])
  useEffect(() => { loadWorkers() }, [])

  // রিকোয়েস্ট আপডেট
  const handleUpdate = async () => {
    if (!selected) return
    setUpdating(true)
    try {
      const payload = {}
      if (form.status)      payload.status      = form.status
      if (form.assigned_to) payload.assigned_to = form.assigned_to
      if (form.admin_note)  payload.admin_note  = form.admin_note

      await api.patch(`/customer-order-requests/${selected.id}`, payload)
      showToast('✅ আপডেট সফল হয়েছে!')
      setSelected(null)
      loadRequests()
    } catch (e) {
      showToast('❌ আপডেট করতে সমস্যা হয়েছে।')
    } finally {
      setUpdating(false)
    }
  }

  const openModal = (req) => {
    setSelected(req)
    setForm({ status: req.status, assigned_to: req.assigned_to || '', admin_note: req.admin_note || '' })
  }

  // ✅ NEW (ফেজ ৪) — Admin নিজের bKash/Nagad অ্যাপে TrxID মিলিয়ে
  // এখান থেকে সরাসরি যাচাই করবেন, মডাল খোলা লাগবে না
  const quickVerify = async (id, payment_status) => {
    try {
      await api.patch(`/customer-order-requests/${id}`, { payment_status })
      showToast(payment_status === 'paid' ? '✅ পেমেন্ট যাচাই হয়েছে!' : '❌ পেমেন্ট বাতিল করা হয়েছে।')
      loadRequests()
    } catch {
      showToast('❌ আপডেট করতে সমস্যা হয়েছে।')
    }
  }

  const filterOptions = [
    { value: 'pending',   label: '⏳ অপেক্ষমাণ' },
    { value: 'confirmed', label: '✅ কনফার্ম' },
    { value: 'assigned',  label: '🚶 অ্যাসাইন' },
    { value: 'delivered', label: '📦 সম্পন্ন' },
    { value: 'cancelled', label: '❌ বাতিল' },
    { value: 'all',       label: '📋 সব' },
  ]

  return (
    <div style={{ padding: '20px', maxWidth: 700, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: 'white', borderRadius: 12,
          padding: '10px 20px', fontSize: 14, fontWeight: 600,
          zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
        }}>
          {toast}
        </div>
      )}

      {/* হেডার */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>
          🛒 কাস্টমার অর্ডার রিকোয়েস্ট
        </h2>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
          কাস্টমার পোর্টাল থেকে আসা অর্ডারগুলো এখানে দেখুন ও SR অ্যাসাইন করুন।
        </p>
      </div>

      {/* ফিল্টার ট্যাব */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: filter === opt.value ? '#4F46E5' : '#F1F5F9',
              color:      filter === opt.value ? 'white'   : '#475569',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* রিকোয়েস্ট লিস্ট */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{
            width: 40, height: 40, border: '4px solid #E0E7FF',
            borderTop: '4px solid #4F46E5', borderRadius: '50%',
            animation: 'spin 1s linear infinite', margin: '0 auto'
          }} />
          <p style={{ color: '#94a3b8', marginTop: 12, fontSize: 14 }}>লোড হচ্ছে...</p>
        </div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: 48 }}>📭</p>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>কোনো রিকোয়েস্ট নেই।</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map(req => {
            const items = typeof req.items === 'string' ? JSON.parse(req.items) : (req.items || [])
            return (
              <div key={req.id} style={{
                background: 'white', borderRadius: 16,
                border: req.status === 'pending' ? '2px solid #C7D2FE' : '1px solid #F1F5F9',
                padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}>
                {/* টপ রো */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 15, color: '#1e293b', margin: 0 }}>
                      {req.shop_name}
                    </p>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
                      {req.owner_name} • {req.customer_code}
                      {req.whatsapp && (
                        <a
                          href={`https://wa.me/880${req.whatsapp.replace(/^0/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginLeft: 8, color: '#16A34A', textDecoration: 'none' }}
                        >
                          📲 WhatsApp
                        </a>
                      )}
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>
                      {new Date(req.created_at).toLocaleString('bn-BD', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>

                {/* পণ্য লিস্ট */}
                <div style={{
                  background: '#F8FAFC', borderRadius: 10,
                  padding: '10px 12px', marginBottom: 12
                }}>
                  {items.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 13, color: '#374151',
                      padding: i > 0 ? '5px 0 0' : 0
                    }}>
                      <span>{item.product_name}</span>
                      <span style={{ fontWeight: 700 }}>× {item.qty}</span>
                    </div>
                  ))}
                </div>

                {/* SR অ্যাসাইন / Admin নোট */}
                {req.assigned_sr_name && (
                  <p style={{ fontSize: 12, color: '#7C3AED', marginBottom: 8 }}>
                    🚶 SR: {req.assigned_sr_name}
                  </p>
                )}
                {req.note && (
                  <p style={{ fontSize: 12, color: '#0369a1', marginBottom: 8 }}>
                    💬 কাস্টমারের নোট: {req.note}
                  </p>
                )}

                {/* ✅ NEW (ফেজ ৪ — মোবাইল ব্যাংকিং TrxID ভেরিফিকেশন) */}
                {req.fulfillment_type === 'online_payment' && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>
                        {req.payment_method === 'bkash_manual' ? '📱 bKash' : req.payment_method === 'nagad_manual' ? '📱 Nagad' : '📱 মোবাইল ব্যাংকিং'} পেমেন্ট
                      </span>
                      <PaymentStatusBadge status={req.payment_status} />
                    </div>
                    <p style={{ fontSize: 12, color: '#78350F', margin: 0 }}>
                      TrxID: <b>{req.payment_trx_id || '—'}</b>
                    </p>
                    {req.payment_sender_number && (
                      <p style={{ fontSize: 12, color: '#78350F', margin: '2px 0 0' }}>
                        প্রেরকের নম্বর: <b>{req.payment_sender_number}</b>
                      </p>
                    )}
                    {req.payment_status === 'pending_verification' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => quickVerify(req.id, 'paid')}
                          style={{ flex: 1, padding: '7px', background: '#16A34A', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          ✅ যাচাই সম্পন্ন
                        </button>
                        <button
                          onClick={() => quickVerify(req.id, 'failed')}
                          style={{ flex: 1, padding: '7px', background: '#DC2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          ❌ মেলেনি
                        </button>
                      </div>
                    )}
                    {/* ✅ NEW (ফেজ ৪ — রিফান্ড ফ্লো): অর্ডার বাতিল হয়েছে
                        কিন্তু টাকা আগেই নেওয়া হয়েছিল — নিজের bKash/Nagad
                        অ্যাপ থেকে Send Money করে ফেরত দেওয়ার পর এখানে
                        ট্যাপ করবেন */}
                    {req.payment_status === 'refund_pending' && (
                      <button
                        onClick={() => quickVerify(req.id, 'refunded')}
                        style={{ width: '100%', padding: '7px', marginTop: 8, background: '#EA580C', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        💸 রিফান্ড পাঠানো হয়েছে (কনফার্ম করুন)
                      </button>
                    )}
                  </div>
                )}

                {/* অ্যাকশন বাটন */}
                <button
                  onClick={() => openModal(req)}
                  style={{
                    width: '100%', padding: '10px',
                    background: req.status === 'pending' ? '#4F46E5' : '#F1F5F9',
                    color:      req.status === 'pending' ? 'white'   : '#475569',
                    border: 'none', borderRadius: 10, fontSize: 13,
                    fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {req.status === 'pending' ? '✏️ SR অ্যাসাইন করুন' : '✏️ আপডেট করুন'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center', zIndex: 1000
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
        >
          <div style={{
            background: 'white', borderRadius: '24px 24px 0 0',
            padding: '24px', width: '100%', maxWidth: 500,
            maxHeight: '80vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, color: '#1e293b', margin: 0 }}>
                অর্ডার আপডেট
              </h3>
              <button onClick={() => setSelected(null)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', fontSize: 16 }}>
                ✕
              </button>
            </div>

            <p style={{ fontWeight: 700, color: '#4F46E5', marginBottom: 16 }}>
              {selected.shop_name} — {selected.owner_name}
            </p>

            {/* স্ট্যাটাস */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
                স্ট্যাটাস পরিবর্তন করুন
              </label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                style={{
                  width: '100%', padding: '12px', border: '2px solid #E2E8F0',
                  borderRadius: 12, fontSize: 14, background: 'white', outline: 'none'
                }}
              >
                <option value="pending">⏳ অপেক্ষমাণ</option>
                <option value="confirmed">✅ কনফার্ম</option>
                <option value="assigned">🚶 SR অ্যাসাইন</option>
                <option value="delivered">📦 সম্পন্ন</option>
                <option value="cancelled">❌ বাতিল</option>
              </select>
            </div>

            {/* SR অ্যাসাইন */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
                SR অ্যাসাইন করুন
              </label>
              <select
                value={form.assigned_to}
                onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}
                style={{
                  width: '100%', padding: '12px', border: '2px solid #E2E8F0',
                  borderRadius: 12, fontSize: 14, background: 'white', outline: 'none'
                }}
              >
                <option value="">— SR নির্বাচন করুন —</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.name_bn}</option>
                ))}
              </select>
            </div>

            {/* Admin নোট */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
                কাস্টমারকে বার্তা (ঐচ্ছিক)
              </label>
              <textarea
                value={form.admin_note}
                onChange={e => setForm(p => ({ ...p, admin_note: e.target.value }))}
                placeholder="যেমন: কাল বিকেলে SR যাবে..."
                rows={3}
                style={{
                  width: '100%', padding: '12px', border: '2px solid #E2E8F0',
                  borderRadius: 12, fontSize: 14, resize: 'none', outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={handleUpdate}
              disabled={updating}
              style={{
                width: '100%', padding: '14px',
                background: updating ? '#94a3b8' : '#4F46E5',
                color: 'white', border: 'none', borderRadius: 14,
                fontSize: 15, fontWeight: 800, cursor: updating ? 'not-allowed' : 'pointer'
              }}
            >
              {updating ? 'আপডেট হচ্ছে...' : '✅ আপডেট করুন'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
