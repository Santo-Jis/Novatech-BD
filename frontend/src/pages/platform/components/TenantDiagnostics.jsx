import { useEffect, useState } from 'react'
import { FiAlertTriangle, FiSearch } from 'react-icons/fi'
import platformApi from '../api/platformApi'

// ============================================================
// TenantDiagnostics — "কেন করা যাচ্ছে না" প্রশ্নের উত্তর এক জায়গায়।
// tenants/tenant_seats/tenant_wallets/customers/sms_logs/email_logs —
// এই ৬টা আলাদা জায়গার ডেটা backend-এর tenantDiagnostics.service.js
// এক রেসপন্সে জোড়া লাগিয়ে দেয়, এখানে শুধু রেন্ডার করা হচ্ছে।
//
// wallet/ai_tokens শুধু scope==='full'-এ আসে (backend থেকেই null আসে
// support scope-এ) — TenantDetail.jsx-এর বাকি billing ফিল্ডের মতোই।
// ============================================================

const STATUS_WARN = ['suspended', 'cancelled']

export default function TenantDiagnostics({ tenantId, isFull }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  const load = async (filters = {}) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filters.phone) params.phone = filters.phone
      if (filters.email) params.email = filters.email
      const res = await platformApi.get(`/tenants/${tenantId}/diagnostics`, { params })
      setData(res.data.data)
    } catch (err) {
      if (!err._toastShown) setError('ডায়াগনস্টিকস লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  // ফোন আর ইমেইল সার্চ বক্স দুটো আলাদা কার্ডে, কিন্তু একটায় সার্চ করলে
  // অন্যটার বর্তমান ফিল্টার হারিয়ে যায় না — দুটোই একসাথে পাঠানো হয়।
  const handleFilterSearch = (e) => {
    e.preventDefault()
    load({ phone, email })
  }

  if (loading && !data) {
    return (
      <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-6 text-sm text-pf-text-muted">
        ডায়াগনস্টিকস লোড হচ্ছে...
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="bg-pf-error-bg border border-pf-border rounded-xl p-4 text-sm text-pf-error flex items-center justify-between gap-3">
        <span>{error}</span>
        <button onClick={() => load()} className="text-xs font-semibold underline flex-shrink-0">
          আবার চেষ্টা করুন
        </button>
      </div>
    )
  }

  if (!data) return null

  const tenantWarn = STATUS_WARN.includes((data.tenant.status || '').toLowerCase())

  return (
    <div className="space-y-4">
      <h2 className="font-pf-head font-semibold text-pf-primary-700 text-sm">ডায়াগনস্টিকস</h2>

      {tenantWarn && (
        <div className="bg-pf-error-bg border border-pf-error rounded-xl p-4 flex items-start gap-3">
          <FiAlertTriangle className="text-pf-error text-lg flex-shrink-0 mt-0.5" />
          <p className="text-sm text-pf-error font-medium">
            এই tenant বর্তমানে <strong>{data.tenant.status}</strong> — এই অবস্থায় সব ইউজারের লগইন/কার্যক্রম প্রভাবিত হতে পারে। "লগইন করা যাচ্ছে না" জাতীয় অভিযোগে এটাই প্রথম চেক করুন।
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <LimitCard
          title="কাস্টমার লিমিট"
          used={data.customers.used}
          limit={data.customers.limit}
          unlimited={data.customers.unlimited}
          percent={data.customers.percent}
        />
        <SeatCard seats={data.seats} />
      </div>

      {isFull ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <WalletCard wallet={data.wallet} />
          <AiTokenCard aiTokens={data.ai_tokens} />
        </div>
      ) : (
        <p className="text-xs text-pf-warning bg-pf-warning-bg inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg">
          <FiAlertTriangle className="flex-shrink-0" />
          ওয়ালেট ব্যালেন্স ও AI টোকেন ব্যবহার শুধু Full scope-এ দেখা যায়
        </p>
      )}

      <ActivityLogCard
        title="সাম্প্রতিক SMS কার্যকলাপ"
        logs={data.sms_recent}
        searchValue={phone}
        onSearchChange={setPhone}
        onSearch={handleFilterSearch}
        placeholder="ফোন নম্বর দিয়ে খুঁজুন..."
        renderIdentifier={(log) => <p className="font-pf-mono text-pf-text-primary truncate">{log.phone}</p>}
        renderMeta={(log) => `${log.message_type} · ${log.provider || '—'} · ${new Date(log.sent_at).toLocaleString('bn-BD')}`}
      />

      <ActivityLogCard
        title="সাম্প্রতিক Email কার্যকলাপ"
        logs={data.email_recent}
        searchValue={email}
        onSearchChange={setEmail}
        onSearch={handleFilterSearch}
        placeholder="Email দিয়ে খুঁজুন..."
        renderIdentifier={(log) => (
          <>
            <p className="font-pf-mono text-pf-text-primary truncate">{log.email}</p>
            {log.subject && <p className="text-xs text-pf-text-secondary truncate">{log.subject}</p>}
          </>
        )}
        renderMeta={(log) => `${log.message_type} · ${new Date(log.sent_at).toLocaleString('bn-BD')}`}
      />
    </div>
  )
}

function ProgressBar({ percent }) {
  const p = Math.max(0, Math.min(percent ?? 0, 100))
  const color = p >= 90 ? 'bg-pf-error' : p >= 70 ? 'bg-pf-warning' : 'bg-pf-success'
  return (
    <div className="w-full h-2 rounded-full bg-pf-bg-sunken overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
    </div>
  )
}

function LimitCard({ title, used, limit, unlimited, percent }) {
  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4 space-y-2">
      <p className="text-xs text-pf-text-muted font-medium">{title}</p>
      <p className="font-pf-mono text-lg font-semibold text-pf-primary-700">
        {used}
        {!unlimited && ` / ${limit}`}
        {unlimited && <span className="text-xs text-pf-text-muted font-normal ml-1.5">(সীমাহীন)</span>}
      </p>
      {!unlimited && (
        <>
          <ProgressBar percent={percent} />
          <p className="text-xs text-pf-text-muted">
            {percent}% ব্যবহৃত{percent >= 90 ? ' — প্রায় পূর্ণ, নতুন যোগ করা আটকে যেতে পারে' : ''}
          </p>
        </>
      )}
    </div>
  )
}

function SeatCard({ seats }) {
  const liveSeats = (seats || []).filter((s) => s.live)
  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4 space-y-2.5">
      <p className="text-xs text-pf-text-muted font-medium">কর্মচারী সিট (role অনুযায়ী)</p>
      <div className="space-y-1.5">
        {liveSeats.map((s) => (
          <div key={s.role} className="flex items-center justify-between text-sm">
            <span className="text-pf-text-secondary">{s.label}</span>
            {s.unlimited ? (
              <span className="text-xs text-pf-text-muted">সীমাহীন</span>
            ) : (
              <span className={`font-pf-mono text-xs font-semibold ${s.remaining === 0 ? 'text-pf-error' : 'text-pf-text-primary'}`}>
                {s.used} / {s.limit}
                {s.remaining === 0 && ' (পূর্ণ)'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function WalletCard({ wallet }) {
  if (!wallet) return null
  const taka = (wallet.balance_paisa / 100).toLocaleString('bn-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (
    <div className={`bg-pf-bg-surface border rounded-xl p-4 space-y-1 ${wallet.low_balance ? 'border-pf-error' : 'border-pf-border'}`}>
      <p className="text-xs text-pf-text-muted font-medium">ওয়ালেট ব্যালেন্স</p>
      <p className={`font-pf-mono text-lg font-semibold ${wallet.low_balance ? 'text-pf-error' : 'text-pf-primary-700'}`}>
        ৳{taka}
      </p>
      {wallet.low_balance && (
        <p className="text-xs text-pf-error">ব্যালেন্স কম — SMS/Email পাঠানো ব্লক হয়ে যেতে পারে/হয়েছে</p>
      )}
    </div>
  )
}

function AiTokenCard({ aiTokens }) {
  if (!aiTokens) return null
  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4 space-y-2">
      <p className="text-xs text-pf-text-muted font-medium">AI টোকেন (এই মাসে)</p>
      <p className="font-pf-mono text-lg font-semibold text-pf-primary-700">
        {aiTokens.used.toLocaleString('bn-BD')}
        {!aiTokens.unlimited && ` / ${Number(aiTokens.limit).toLocaleString('bn-BD')}`}
        {aiTokens.unlimited && <span className="text-xs text-pf-text-muted font-normal ml-1.5">(সীমাহীন)</span>}
      </p>
      {!aiTokens.unlimited && <ProgressBar percent={aiTokens.percent} />}
    </div>
  )
}

// SMS/Email দুই status vocabulary-ই এক (sms.service.js/email.service.js
// দেখো): sent/failed/blocked/disabled/dev। 'blocked' আলাদা রঙে রাখা
// হলো (amber, error না) — কারণ এটা "ভাঙা" না, ব্যালেন্স রিচার্জ করলেই
// ঠিক হয়ে যাবে, ঠিক এইজন্যই এই কার্ডটা বানানো হয়েছে।
const STATUS_META = {
  sent:     { label: 'পাঠানো হয়েছে',      cls: 'bg-pf-success-bg text-pf-success' },
  failed:   { label: 'ব্যর্থ',              cls: 'bg-pf-error-bg text-pf-error' },
  blocked:  { label: 'ব্লকড (ব্যালেন্স কম)', cls: 'bg-pf-warning-bg text-pf-warning' },
  disabled: { label: 'গেটওয়ে বন্ধ',        cls: 'bg-pf-bg-sunken text-pf-text-muted' },
  dev:      { label: 'ডেভ মোড',            cls: 'bg-pf-bg-sunken text-pf-text-muted' },
}
const DEFAULT_STATUS_META = { label: '—', cls: 'bg-pf-bg-sunken text-pf-text-muted' }

function StatusPill({ status }) {
  const meta = STATUS_META[status] || DEFAULT_STATUS_META
  return (
    <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

// SMS আর Email কার্ড — গঠন হুবহু এক, শুধু identifier/meta রেন্ডার আলাদা,
// তাই একটা shared কম্পোনেন্ট (কোড ডুপ্লিকেশন এড়াতে)।
function ActivityLogCard({ title, logs, searchValue, onSearchChange, onSearch, placeholder, renderIdentifier, renderMeta }) {
  const items = logs || []
  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-pf-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="font-pf-head font-semibold text-pf-primary-700 text-sm">{title}</h3>
        <form onSubmit={onSearch} className="flex items-center gap-2">
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="text-xs px-3 py-1.5 rounded-lg border border-pf-border bg-pf-bg-base focus:outline-none focus:border-pf-border-focus w-40"
          />
          <button
            type="submit"
            className="p-1.5 rounded-lg border border-pf-border text-pf-text-secondary hover:text-pf-primary-700 hover:border-pf-border-strong flex-shrink-0"
          >
            <FiSearch className="text-sm" />
          </button>
        </form>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-pf-text-muted text-center">কোনো লগ পাওয়া যায়নি।</p>
      ) : (
        <div className="divide-y divide-pf-border max-h-80 overflow-y-auto">
          {items.map((log) => (
            <div key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                {renderIdentifier(log)}
                <p className="text-xs text-pf-text-muted">{renderMeta(log)}</p>
                {(log.status === 'failed' || log.status === 'blocked') && log.error_message && (
                  <p className="text-xs text-pf-error mt-0.5 break-words">{log.error_message}</p>
                )}
              </div>
              <StatusPill status={log.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
