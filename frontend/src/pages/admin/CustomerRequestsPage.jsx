// ============================================================
// frontend/src/pages/admin/CustomerRequestsPage.jsx
// Admin & Manager — Credit Limit Requests + Complaints
// ============================================================
import { useState, useEffect } from 'react'
import api from '../../api/axios'

// ── Shared Badge ──────────────────────────────────────────────
const Badge = ({ label, bg, color }) => (
  <span style={{ background: bg, color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
    {label}
  </span>
)

const statusBadge = (status) => {
  const map = {
    pending:     { label: '⏳ অপেক্ষমাণ',    bg: '#FEF9C3', color: '#92400E' },
    approved:    { label: '✅ অনুমোদিত',     bg: '#D1FAE5', color: '#065F46' },
    rejected:    { label: '❌ নামঞ্জুর',      bg: '#FEE2E2', color: '#991B1B' },
    open:        { label: '🔴 খোলা',          bg: '#FEE2E2', color: '#991B1B' },
    in_progress: { label: '🔄 প্রক্রিয়াধীন', bg: '#DBEAFE', color: '#1E40AF' },
    resolved:    { label: '✅ সমাধান',        bg: '#D1FAE5', color: '#065F46' },
  }
  const s = map[status] || { label: status, bg: '#F3F4F6', color: '#374151' }
  return <Badge {...s} />
}

const typeBadge = (type) => {
  const map = {
    complaint:      { label: '⚠️ অভিযোগ',       bg: '#FEF3C7', color: '#92400E' },
    feedback:       { label: '💬 ফিডব্যাক',      bg: '#E0E7FF', color: '#3730A3' },
    delivery_issue: { label: '🚚 ডেলিভারি',      bg: '#FEE2E2', color: '#991B1B' },
    product_issue:  { label: '📦 পণ্য সমস্যা',   bg: '#FEF3C7', color: '#92400E' },
    payment_issue:  { label: '💳 পেমেন্ট',        bg: '#FDF2F8', color: '#9D174D' },
    other:          { label: '📌 অন্যান্য',       bg: '#F3F4F6', color: '#374151' },
  }
  const s = map[type] || { label: type, bg: '#F3F4F6', color: '#374151' }
  return <Badge {...s} />
}

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-BD')

// ══════════════════════════════════════════════════════════════
// Credit Limit Requests Tab
// ══════════════════════════════════════════════════════════════
function CreditLimitTab() {
  const [requests,  setRequests]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('pending')
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState({ status: '', admin_note: '', approved_amount: '' })
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/customer-requests/credit-limit?status=${filter}`)
      setRequests(res.data.data || [])
    } catch { showToast('❌ লোড করতে সমস্যা') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter])

  const openModal = (req) => {
    setSelected(req)
    setForm({ status: '', admin_note: '', approved_amount: String(req.requested_amount) })
  }

  const handleSave = async () => {
    if (!form.status) return showToast('সিদ্ধান্ত বেছে নিন')
    setSaving(true)
    try {
      await api.patch(`/customer-requests/credit-limit/${selected.id}`, {
        status: form.status,
        admin_note: form.admin_note,
        approved_amount: parseFloat(form.approved_amount),
      })
      showToast(form.status === 'approved' ? '✅ অনুমোদিত! ক্রেডিট লিমিট আপডেট হয়েছে।' : '✅ নামঞ্জুর করা হয়েছে।')
      setSelected(null)
      load()
    } catch (e) {
      showToast('❌ ' + (e.response?.data?.message || 'সমস্যা হয়েছে'))
    } finally { setSaving(false) }
  }

  const filters = [
    { v: 'pending',  l: '⏳ অপেক্ষমাণ' },
    { v: 'approved', l: '✅ অনুমোদিত' },
    { v: 'rejected', l: '❌ নামঞ্জুর' },
    { v: 'all',      l: '📋 সব' },
  ]

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {filters.map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: filter === f.v ? '#4F46E5' : '#F1F5F9', color: filter === f.v ? 'white' : '#475569' }}>
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ width: 36, height: 36, border: '4px solid #E0E7FF', borderTop: '4px solid #4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        </div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: 44 }}>📭</p>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>কোনো আবেদন নেই।</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map(req => (
            <div key={req.id} style={{ background: 'white', borderRadius: 16, border: req.status === 'pending' ? '2px solid #C7D2FE' : '1px solid #F1F5F9', padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 15, color: '#1e293b', margin: 0 }}>{req.shop_name}</p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>{req.owner_name} • {req.customer_code}</p>
                  {req.route_name && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>📍 {req.route_name}</p>}
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>
                    {new Date(req.created_at).toLocaleString('bn-BD', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {statusBadge(req.status)}
              </div>

              {/* Amount Info */}
              <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>বর্তমান লিমিট</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#475569', margin: '2px 0 0' }}>৳{fmt(req.current_limit)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>আবেদনকৃত</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#4F46E5', margin: '2px 0 0' }}>৳{fmt(req.requested_amount)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>বর্তমান বাকি</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#DC2626', margin: '2px 0 0' }}>৳{fmt(req.current_credit)}</p>
                </div>
              </div>

              {req.reason && (
                <p style={{ fontSize: 12, color: '#0369a1', marginBottom: 10, background: '#F0F9FF', borderRadius: 8, padding: '8px 10px' }}>
                  💬 কারণ: {req.reason}
                </p>
              )}
              {req.admin_note && (
                <p style={{ fontSize: 12, color: '#065F46', marginBottom: 10, background: '#F0FDF4', borderRadius: 8, padding: '8px 10px' }}>
                  📋 নোট: {req.admin_note}
                </p>
              )}

              {req.status === 'pending' && (
                <button onClick={() => openModal(req)}
                  style={{ width: '100%', padding: '10px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  ✏️ সিদ্ধান্ত দিন
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, color: '#1e293b', margin: 0 }}>ক্রেডিট লিমিট সিদ্ধান্ত</h3>
              <button onClick={() => setSelected(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <p style={{ color: '#4F46E5', fontWeight: 700, marginBottom: 16 }}>{selected.shop_name} • {selected.owner_name}</p>

            <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>আবেদনকৃত পরিমাণ: <strong>৳{fmt(selected.requested_amount)}</strong></p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569' }}>বর্তমান লিমিট: <strong>৳{fmt(selected.current_limit)}</strong></p>
            </div>

            {/* Approved Amount (editable) */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>অনুমোদনযোগ্য পরিমাণ ৳</label>
              <input type="number" value={form.approved_amount} onChange={e => setForm(p => ({ ...p, approved_amount: e.target.value }))}
                style={{ width: '100%', padding: '12px', border: '2px solid #E2E8F0', borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Decision */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[['approved', '✅ অনুমোদন করুন', '#D1FAE5', '#065F46', '#059669'],
                ['rejected', '❌ নামঞ্জুর করুন', '#FEE2E2', '#991B1B', '#DC2626']].map(([val, label, bg, color, border]) => (
                <button key={val} onClick={() => setForm(p => ({ ...p, status: val }))}
                  style={{ padding: '12px', borderRadius: 12, border: `2px solid ${form.status === val ? border : '#E2E8F0'}`, background: form.status === val ? bg : 'white', color: form.status === val ? color : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Note */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>কাস্টমারকে বার্তা (ঐচ্ছিক)</label>
              <textarea value={form.admin_note} onChange={e => setForm(p => ({ ...p, admin_note: e.target.value }))}
                placeholder="যেমন: পরবর্তীতে পুনরায় আবেদন করুন..."
                rows={3} style={{ width: '100%', padding: '12px', border: '2px solid #E2E8F0', borderRadius: 12, fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <button onClick={handleSave} disabled={saving || !form.status}
              style={{ width: '100%', padding: 14, background: saving || !form.status ? '#94a3b8' : '#4F46E5', color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800, cursor: saving || !form.status ? 'not-allowed' : 'pointer' }}>
              {saving ? 'সংরক্ষণ হচ্ছে...' : '✅ সিদ্ধান্ত সংরক্ষণ করুন'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Complaints Tab
// ══════════════════════════════════════════════════════════════
function ComplaintsTab() {
  const [complaints, setComplaints] = useState([])
  const [stats,      setStats]      = useState({})
  const [loading,    setLoading]    = useState(true)
  const [statusF,    setStatusF]    = useState('open')
  const [typeF,      setTypeF]      = useState('all')
  const [selected,   setSelected]   = useState(null)
  const [form,       setForm]       = useState({ status: '', admin_reply: '' })
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusF !== 'all') params.set('status', statusF)
      if (typeF   !== 'all') params.set('type',   typeF)
      const res = await api.get(`/customer-requests/complaints?${params}`)
      setComplaints(res.data.data || [])
      setStats(res.data.stats || {})
    } catch { showToast('❌ লোড করতে সমস্যা') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statusF, typeF])

  const openModal = (c) => {
    setSelected(c)
    setForm({ status: c.status === 'open' ? 'in_progress' : 'resolved', admin_reply: c.admin_reply || '' })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch(`/customer-requests/complaints/${selected.id}`, form)
      showToast('✅ আপডেট সফল হয়েছে।')
      setSelected(null)
      load()
    } catch (e) {
      showToast('❌ ' + (e.response?.data?.message || 'সমস্যা হয়েছে'))
    } finally { setSaving(false) }
  }

  const statusFilters = [
    { v: 'open',        l: `🔴 খোলা (${stats.open_count || 0})` },
    { v: 'in_progress', l: `🔄 চলমান (${stats.inprogress_count || 0})` },
    { v: 'resolved',    l: `✅ সমাধান` },
    { v: 'all',         l: '📋 সব' },
  ]

  const typeFilters = [
    { v: 'all',            l: 'সব ধরন' },
    { v: 'complaint',      l: '⚠️ অভিযোগ' },
    { v: 'feedback',       l: '💬 ফিডব্যাক' },
    { v: 'delivery_issue', l: '🚚 ডেলিভারি' },
    { v: 'product_issue',  l: '📦 পণ্য' },
    { v: 'payment_issue',  l: '💳 পেমেন্ট' },
  ]

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#1e293b', color: 'white', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Stats Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'খোলা',    value: stats.open_count || 0,        color: '#DC2626', bg: '#FEF2F2' },
          { label: 'চলমান',   value: stats.inprogress_count || 0, color: '#1D4ED8', bg: '#EFF6FF' },
          { label: 'সমাধান',  value: stats.resolved_count || 0,   color: '#065F46', bg: '#F0FDF4' },
        ].map((s, i) => (
          <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '12px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#6b7280' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {statusFilters.map(f => (
          <button key={f.v} onClick={() => setStatusF(f.v)}
            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: statusF === f.v ? '#4F46E5' : '#F1F5F9', color: statusF === f.v ? 'white' : '#475569' }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Type Filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {typeFilters.map(f => (
          <button key={f.v} onClick={() => setTypeF(f.v)}
            style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1.5px solid ${typeF === f.v ? '#4F46E5' : '#E2E8F0'}`, cursor: 'pointer', background: typeF === f.v ? '#EEF2FF' : 'white', color: typeF === f.v ? '#4F46E5' : '#6b7280' }}>
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ width: 36, height: 36, border: '4px solid #E0E7FF', borderTop: '4px solid #4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        </div>
      ) : complaints.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: 44 }}>🎉</p>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>কোনো অভিযোগ নেই।</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {complaints.map(c => (
            <div key={c.id} style={{ background: 'white', borderRadius: 16, border: c.status === 'open' ? '2px solid #FECACA' : '1px solid #F1F5F9', padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ flex: 1, paddingRight: 10 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    {typeBadge(c.type)}
                    {statusBadge(c.status)}
                  </div>
                  <p style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', margin: 0 }}>{c.subject}</p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>{c.shop_name} • {c.owner_name}</p>
                  {c.route_name && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>📍 {c.route_name}</p>}
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>
                    {new Date(c.created_at).toLocaleString('bn-BD', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {c.whatsapp && (
                  <a href={`https://wa.me/880${c.whatsapp.replace(/^0/, '')}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 20, textDecoration: 'none', flexShrink: 0 }}>📲</a>
                )}
              </div>

              {/* Description */}
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{c.description}</p>
              </div>

              {c.admin_reply && (
                <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '10px 12px', marginBottom: 10, borderLeft: '3px solid #059669' }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#065F46', marginBottom: 4 }}>আপনার উত্তর:</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#065F46' }}>{c.admin_reply}</p>
                </div>
              )}

              {c.status !== 'resolved' && (
                <button onClick={() => openModal(c)}
                  style={{ width: '100%', padding: '10px', background: c.status === 'open' ? '#DC2626' : '#4F46E5', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {c.status === 'open' ? '✏️ সাড়া দিন' : '✏️ আপডেট করুন'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, color: '#1e293b', margin: 0 }}>অভিযোগের সাড়া</h3>
              <button onClick={() => setSelected(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <p style={{ color: '#4F46E5', fontWeight: 700, marginBottom: 6 }}>{selected.subject}</p>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>{selected.shop_name} • {selected.owner_name}</p>
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{selected.description}</p>
            </div>

            {/* Status */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>স্ট্যাটাস</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[['open', '🔴 খোলা'], ['in_progress', '🔄 চলমান'], ['resolved', '✅ সমাধান']].map(([v, l]) => (
                  <button key={v} onClick={() => setForm(p => ({ ...p, status: v }))}
                    style={{ padding: '10px 6px', borderRadius: 10, border: `2px solid ${form.status === v ? '#4F46E5' : '#E2E8F0'}`, background: form.status === v ? '#EEF2FF' : 'white', color: form.status === v ? '#4F46E5' : '#6b7280', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Reply */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>কাস্টমারকে উত্তর দিন (push notification যাবে)</label>
              <textarea value={form.admin_reply} onChange={e => setForm(p => ({ ...p, admin_reply: e.target.value }))}
                placeholder="কাস্টমারকে জানান কী করা হচ্ছে..."
                rows={4} style={{ width: '100%', padding: '12px', border: '2px solid #E2E8F0', borderRadius: 12, fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', padding: 14, background: saving ? '#94a3b8' : '#4F46E5', color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'সংরক্ষণ হচ্ছে...' : '✅ উত্তর পাঠান ও আপডেট করুন'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Main Page Component
// ══════════════════════════════════════════════════════════════
export default function CustomerRequestsPage() {
  const [activeTab, setActiveTab] = useState('credit')

  return (
    <div style={{ padding: '20px', maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>
          📋 কাস্টমার রিকোয়েস্ট
        </h2>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
          ক্রেডিট লিমিট আবেদন ও অভিযোগ/ফিডব্যাক পরিচালনা করুন।
        </p>
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', gap: 0, background: '#F1F5F9', borderRadius: 14, padding: 4, marginBottom: 24 }}>
        {[
          { v: 'credit',     l: '💳 ক্রেডিট আবেদন' },
          { v: 'complaints', l: '📣 অভিযোগ/ফিডব্যাক' },
        ].map(t => (
          <button key={t.v} onClick={() => setActiveTab(t.v)}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.2s', background: activeTab === t.v ? 'white' : 'transparent', color: activeTab === t.v ? '#4F46E5' : '#64748b', boxShadow: activeTab === t.v ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
            {t.l}
          </button>
        ))}
      </div>

      {activeTab === 'credit'     && <CreditLimitTab />}
      {activeTab === 'complaints' && <ComplaintsTab />}
    </div>
  )
}
