import { useEffect, useState } from 'react'
import { FiCheck, FiX, FiClock, FiCopy, FiAlertTriangle } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'

// ============================================================
// PlanBookings — কাস্টমার-facing "প্ল্যান বুক করুন" পেজ থেকে জমা হওয়া
// রিকোয়েস্ট এখানে দেখা যায়। TrxID bKash/Nagad-এ নিজে চেক করে নিয়ে
// approve করলে backend-ই নতুন tenant তৈরি/existing tenant upgrade করে।
// ============================================================

const STATUS_TABS = [
  { key: 'pending', label: 'পেন্ডিং' },
  { key: 'approved', label: 'অনুমোদিত' },
  { key: 'rejected', label: 'বাতিল' },
]

const ROLE_LABELS_BN = { worker: 'SR', manager: 'ম্যানেজার', stock_keeper: 'স্টক কিপার', shop_keeper: 'শপ কিপার' }

function formatTaka(paisa) {
  if (paisa === null || paisa === undefined) return '—'
  return `৳${(paisa / 100).toLocaleString('bn-BD')}`
}

export default function PlanBookings() {
  const [status, setStatus] = useState('pending')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [noteDrafts, setNoteDrafts] = useState({})
  const [result, setResult] = useState(null) // approve করার পর temp password দেখানোর জন্য

  const load = async () => {
    setLoading(true)
    try {
      const res = await superAdminApi.get('/plan-bookings', { params: { status } })
      setBookings(res.data.data || [])
    } catch {
      // toast ইতিমধ্যে interceptor দেখিয়ে দিয়েছে
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (id) => {
    if (!window.confirm('TrxID যাচাই করেছেন? Approve করলে সাথে সাথে tenant তৈরি/আপগ্রেড হয়ে যাবে।')) return
    setBusyId(id)
    try {
      const res = await superAdminApi.post(`/plan-bookings/${id}/approve`, { admin_note: noteDrafts[id] || null })
      setResult(res.data.data)
      load()
    } catch {
      // toast ইতিমধ্যে দেখানো হয়েছে
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (id) => {
    const reason = noteDrafts[id]
    if (!reason || !reason.trim()) {
      window.alert('বাতিল করার আগে একটা কারণ লিখুন (নোট বক্সে)।')
      return
    }
    if (!window.confirm('রিকোয়েস্টটা বাতিল করতে চান?')) return
    setBusyId(id)
    try {
      await superAdminApi.post(`/plan-bookings/${id}/reject`, { admin_note: reason })
      load()
    } catch {
      // toast ইতিমধ্যে দেখানো হয়েছে
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">প্ল্যান বুকিং</h1>
        <p className="text-pf-text-secondary text-sm mt-1">"প্ল্যান বুক করুন" পেজ থেকে জমা হওয়া রিকোয়েস্ট — TrxID যাচাই করে approve/reject করুন</p>
      </div>

      {result && (
        <div className="bg-pf-success-bg border border-pf-success rounded-xl p-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-pf-success">
              {result.is_new_tenant ? `নতুন Tenant "${result.tenant.company_name}" তৈরি হয়েছে` : `Tenant "${result.tenant.company_name}" আপগ্রেড হয়েছে`}
            </p>
            {result.temp_password && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-pf-text-secondary">সাময়িক পাসওয়ার্ড (কাস্টমারকে জানান):</p>
                <code className="font-pf-mono text-sm bg-pf-bg-surface px-2 py-1 rounded border border-pf-border">{result.temp_password}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(result.temp_password); }}
                  className="text-pf-text-muted hover:text-pf-primary-700"
                  title="কপি করুন"
                >
                  <FiCopy className="text-sm" />
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setResult(null)} className="text-pf-text-muted hover:text-pf-text-primary flex-shrink-0">
            <FiX />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold ${
              status === t.key ? 'bg-pf-primary-700 text-white' : 'bg-pf-bg-surface border border-pf-border text-pf-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-pf-text-muted">লোড হচ্ছে...</p>
      ) : bookings.length === 0 ? (
        <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-8 text-center text-sm text-pf-text-muted">
          কোনো রিকোয়েস্ট নেই।
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const seatSummary = Object.entries(b.seat_counts || {})
              .map(([role, count]) => `${ROLE_LABELS_BN[role] || role} ×${count}`)
              .join(', ')
            const isExisting = !!b.tenant_id
            const displayName = isExisting ? (b.existing_company_name || 'বিদ্যমান Tenant') : b.company_name

            return (
              <div key={b.id} className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-pf-text-primary text-sm">{displayName}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-pf-accent-100 text-pf-accent-600 font-semibold">
                        {b.requested_plan}
                      </span>
                      {isExisting ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-pf-info-bg text-pf-info">Upgrade</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-pf-warning-bg text-pf-warning">নতুন কাস্টমার</span>
                      )}
                    </div>
                    <p className="text-xs text-pf-text-muted mt-1">
                      {b.contact_name} · {b.contact_phone}{b.contact_email ? ` · ${b.contact_email}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-pf-mono text-sm font-semibold text-pf-primary-700">{formatTaka(b.estimated_total_paisa)}/মাস (আনুমানিক)</p>
                    <p className="text-xs text-pf-text-muted">{b.billing_cycle === 'monthly' ? 'মাসিক' : b.billing_cycle}</p>
                  </div>
                </div>

                <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-pf-text-muted mb-1">সিট</p>
                    <p className="text-pf-text-primary">{seatSummary || '—'}</p>
                  </div>
                  <div>
                    <p className="text-pf-text-muted mb-1">পেমেন্ট</p>
                    <p className="text-pf-text-primary font-pf-mono">{b.payment_method} · {b.trx_id}</p>
                  </div>
                  {(b.company_address || b.company_phone || b.company_email) && (
                    <div>
                      <p className="text-pf-text-muted mb-1">কোম্পানি যোগাযোগ</p>
                      <p className="text-pf-text-primary">{[b.company_address, b.company_phone, b.company_email].filter(Boolean).join(' · ')}</p>
                    </div>
                  )}
                  {(b.billing_name || b.billing_email) && (
                    <div>
                      <p className="text-pf-text-muted mb-1">Billing</p>
                      <p className="text-pf-text-primary">{[b.billing_name, b.billing_email].filter(Boolean).join(' · ')}</p>
                    </div>
                  )}
                </div>

                {b.status === 'pending' ? (
                  <div className="mt-3 pt-3 border-t border-pf-border">
                    <input
                      type="text"
                      placeholder="নোট (approve-এ ঐচ্ছিক, reject-এ আবশ্যক)"
                      value={noteDrafts[b.id] || ''}
                      onChange={(e) => setNoteDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-pf-border bg-pf-bg-base focus:outline-none mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === b.id}
                        onClick={() => handleApprove(b.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-pf-success text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <FiCheck /> Approve
                      </button>
                      <button
                        disabled={busyId === b.id}
                        onClick={() => handleReject(b.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-pf-error text-pf-error text-xs font-semibold disabled:opacity-50"
                      >
                        <FiX /> Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-pf-border flex items-center gap-2 text-xs text-pf-text-muted">
                    <FiClock />
                    {b.status === 'approved' ? 'Approved' : 'Rejected'} — {b.reviewed_at ? new Date(b.reviewed_at).toLocaleString('bn-BD') : ''}
                    {b.admin_note && <span>· {b.admin_note}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
