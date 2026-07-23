import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiSearch, FiX, FiLoader, FiBriefcase, FiLifeBuoy, FiUser, FiArrowRight } from 'react-icons/fi'
import platformApi from '../api/platformApi'

// ============================================================
// Global Search — Tenant/Ticket সরাসরি এখান থেকেই সার্চ হয়;
// Staff/Customer-এর জন্য User Lookup পেজেই পাঠানো হয় (?q= দিয়ে
// ডিপ-লিংক, ওখানে ইতিমধ্যে staff+customer দুটোই সার্চ হয় — লজিক
// ডুপ্লিকেট করা হয়নি)।
// ============================================================

export default function GlobalSearch({ onClose }) {
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [tenants, setTenants] = useState(null)
  const [tickets, setTickets] = useState(null)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    if (!q.trim()) return
    setSearching(true)
    setTenants(null)
    setTickets(null)

    const [tenantRes, ticketRes] = await Promise.allSettled([
      platformApi.get('/tenants', { params: { search: q.trim(), limit: 5 } }),
      platformApi.get('/support/tickets', { params: { search: q.trim() } }),
    ])

    setTenants(tenantRes.status === 'fulfilled' ? tenantRes.value.data.data : [])
    setTickets(ticketRes.status === 'fulfilled' ? ticketRes.value.data.data.slice(0, 5) : [])
    setSearching(false)
  }

  const goToUserLookup = () => {
    navigate(`/platform/users?q=${encodeURIComponent(q.trim())}`)
    onClose()
  }

  const hasResults = (tenants && tenants.length > 0) || (tickets && tickets.length > 0)
  const searched = tenants !== null || tickets !== null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-20" onClick={onClose}>
      <div
        className="bg-pf-bg-surface w-full max-w-lg rounded-xl shadow-xl max-h-[75vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="flex items-center gap-2 px-4 py-3 border-b border-pf-border">
          <FiSearch className="text-pf-text-muted flex-shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="টেন্যান্ট, টিকেট, স্টাফ বা কাস্টমার খুঁজুন..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          {searching && <FiLoader className="animate-spin text-pf-text-muted flex-shrink-0" />}
          <button type="button" onClick={onClose} className="text-pf-text-muted hover:text-pf-text-primary p-1 flex-shrink-0">
            <FiX />
          </button>
        </form>

        <div className="p-2">
          {!searched && (
            <p className="text-xs text-pf-text-muted text-center py-6">
              লিখে Enter চাপুন — টেন্যান্ট ও টিকেট এখানেই খুঁজে দেখাবে
            </p>
          )}

          {searched && q.trim() && (
            <button
              onClick={goToUserLookup}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-pf-bg-alt text-left mb-1"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-pf-primary-700">
                <FiUser /> "{q}" দিয়ে স্টাফ/কাস্টমার খুঁজুন
              </span>
              <FiArrowRight className="text-pf-text-muted" />
            </button>
          )}

          {tenants && tenants.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1 text-[11px] font-semibold text-pf-text-muted uppercase tracking-wide flex items-center gap-1.5">
                <FiBriefcase /> টেন্যান্ট
              </p>
              {tenants.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { navigate(`/platform/tenants/${t.id}`); onClose() }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-pf-bg-alt text-left"
                >
                  <span className="text-sm text-pf-text-primary truncate">{t.company_name}</span>
                  <span className="text-xs text-pf-text-muted flex-shrink-0">{t.slug}</span>
                </button>
              ))}
            </div>
          )}

          {tickets && tickets.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[11px] font-semibold text-pf-text-muted uppercase tracking-wide flex items-center gap-1.5">
                <FiLifeBuoy /> টিকেট
              </p>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { navigate(`/platform/tickets?ticket=${t.id}`); onClose() }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-pf-bg-alt text-left"
                >
                  <span className="text-sm text-pf-text-primary truncate">{t.subject}</span>
                </button>
              ))}
            </div>
          )}

          {searched && !hasResults && (
            <p className="text-xs text-pf-text-muted text-center py-6">টেন্যান্ট/টিকেটে কিছু পাওয়া যায়নি — উপরের স্টাফ/কাস্টমার অপশন ট্রাই করুন।</p>
          )}
        </div>
      </div>
    </div>
  )
}
