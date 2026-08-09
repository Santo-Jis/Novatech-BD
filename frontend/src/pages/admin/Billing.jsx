import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import { PLANS, formatTaka } from '../../constants/planPricing'
import {
  FiRefreshCw, FiClock, FiCheckCircle, FiAlertTriangle,
  FiArrowUpRight, FiLock, FiUsers, FiZap, FiDownload, FiFileText,
} from 'react-icons/fi'

// ============================================================
// BILLING — Section 1+2+3+4+5: টপ সামারি + কাস্টমার কানেকশন + ওয়ালেট
// (সামারি) + AI ব্যবহার (সামারি) + ইনভয়েস হিস্ট্রি
// ------------------------------------------------------------
// সব কয়টা সেকশন এখন এই পেজে আছে।
//
// ⚠️ ওয়ালেট সেকশনে ইচ্ছাকৃতভাবে নেই: রিচার্জ বাটন (admin.routes.js-এর
// কমেন্ট অনুযায়ী রিচার্জ শুধু Super Admin করতে পারবে), আর "এই মাসের
// ফ্রি কোটা ব্যবহার" বার — কারণ aiPricing.service.js-এর
// calculateChargePaisa() কোনো মাসিক ফ্রি এলাউয়েন্স চেক করে না
// (platform key দিয়ে প্রতিটা টোকেনই charge হয়), তাই planPricing.js-এর
// freeCreditTk/freeAiCreditM আসলে backend-এ enforce হয় না — দেখালে
// মিথ্যা প্রতিশ্রুতি দেখানো হতো।
//
// AI সেটিংস (BYOK key_source টগল, provider/key ফর্ম) ইতিমধ্যে পুরোপুরি
// বানানো আছে pages/admin/AIInsights.jsx-এ (Super Admin approval flow-সহ)
// — এখানে সেটা ডুপ্লিকেট না করে শুধু status + এই মাসের source-ভিত্তিক
// ব্যবহার + পুরো পেজে লিংক।
//
// ইনভয়েস হিস্ট্রি (Section ৫) — tenant_invoices টেবিল +
// jobs/tenantInvoice.job.js (প্রতি মাসের ১ তারিখ) থেকে। ⚠️ নতুন
// ডেপ্লয়মেন্টে পরের ১ তারিখের আগে (বা সার্ভার রিস্টার্ট-এর
// catch-up রান না হওয়া পর্যন্ত) এই লিস্ট খালি থাকবে — এটাই প্রথমবার
// invoice জেনারেট হওয়ার স্বাভাবিক আচরণ, বাগ না।
//
// GET /admin/billing/summary → backend/src/services/billing.service.js
//
// ⚠️ tenant_seats/employee সিস্টেমের role-key (worker, shop_keeper,
// stock_keeper...) আর constants/planPricing.js-এর role-key (sr, shop,
// stock...) আলাদা কনভেনশনে বানানো — দুটো এক না। নিচের ম্যাপ দিয়ে
// মেলানো হচ্ছে। 'asm' এখনো tenant_seats-এ ট্র্যাক হয় না (এখনো ফিচার
// হিসেবে লাইভ না, employee.controller.js-এর ROLE_LABELS-এ নেই), তাই
// এই ম্যাপেও নেই — Max/ERP-এ ASM-এর দাম থাকলেও বিলিং-এ এখনো ধরা যাচ্ছে না।
//
// ⚠️ সংশোধন (v3): admin-এর জন্য tenant_seats-এ row নেই ধরে নিয়েছিলাম —
// ভুল ছিল। onboarding.controller.js আসলে ট্রায়াল সাইনআপেই admin-এর
// row বসায় (seat_count=1, rate_locked=SEAT_RATES.admin=৳১৬৯৯, plan
// যাই হোক না কেন — এটা trial-এর ফিক্সড রেট)। কিন্তু upgrade flow-এর
// upsertSeats() BOOKABLE_ROLES-এ admin নেই বলে upgrade-এ এই row কখনো
// রিফ্রেশ হয় না — তাই ERP-তে upgrade করলেও admin-এর rate_locked ৳১৬৯৯-ই
// থেকে যায়, "owner ERP-তে ফ্রি" policy কখনো enforce হয় না ডেটাতে।
// এইটা তাদের upgrade flow-এর একটা আলাদা, প্রি-এক্সিস্টিং গ্যাপ — আমরা
// কৃত্রিমভাবে "ERP owner ফ্রি" ধরে নিয়ে কম দেখানোর বদলে, tenant_seats-এ
// যা আছে সেটাই দেখাচ্ছি (সত্যিকারের চার্জ, কম করে দেখানো ঠিক না)।
// তাই এখন admin স্বাভাবিক role-এর মতোই এই ম্যাপে আছে, আলাদা কোনো
// "implicit owner" ব্লক নেই (নিচে দেখো — সেই ব্লক সরিয়ে দেওয়া হয়েছে)।
// ============================================================
const SEAT_ROLE_TO_PRICING_KEY = {
  worker:       'sr',
  manager:      'manager',
  shop_keeper:  'shop',
  stock_keeper: 'stock',
  admin:        'admin',
}

const INVOICE_STATUS_LABEL = {
  pending: { label: 'বাকি',      color: 'text-amber-700 dark:text-amber-400' },
  paid:    { label: 'পরিশোধিত',  color: 'text-pf-success' },
  overdue: { label: 'ওভারডিউ',   color: 'text-pf-error' },
  void:    { label: 'বাতিল',     color: 'text-pf-text-muted' },
}

// AIInsights.jsx-এর KEY_SOURCE_INFO-র সাথে ভাব মিলিয়ে, কিন্তু ছোট/সামারি ভার্সন
const AI_KEY_SOURCE_LABEL = {
  own:      { label: 'নিজের Key সক্রিয়',        color: 'text-pf-success' },
  platform: { label: 'Platform Key (চার্জযোগ্য)', color: 'text-amber-700 dark:text-amber-400' },
  blocked:  { label: 'বন্ধ করা আছে',              color: 'text-pf-error' },
}

const AI_SOURCE_LABEL = {
  admin_chat:    'Admin চ্যাট',
  customer_chat: 'কাস্টমার চ্যাট',
  insight_job:   'ইনসাইটস (ব্যাকগ্রাউন্ড)',
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' })
}

const daysLeft = (iso) => {
  if (!iso) return null
  return Math.max(Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000), 0)
}

// Wallet.jsx-এর fmtTaka-র সাথে হুবহু মেলানো — একই ব্যালেন্স দুই জায়গায়
// দুইরকম দেখানো ঠিক হবে না।
const fmtTaka = (paisa) =>
  (Math.abs(paisa || 0) / 100).toLocaleString('bn-BD', { minimumFractionDigits: 2 })

export default function Billing() {
  const navigate = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // ওয়ালেট — আলাদা, ছোট fetch (existing /admin/wallet এন্ডপয়েন্ট রি-ইউজ,
  // limit=1 কারণ শুধু balance/low_balance দরকার, ফুল হিস্ট্রি না — সেটা
  // এখনো /admin/wallet পেজেই থাকছে, ওখানেই লিংক করে দেওয়া হবে)।
  // ⚠️ চুপচাপ fail করানো ইচ্ছাকৃত — এই ছোট কার্ডের এরর মূল বিলিং পেজ
  // ব্লক করা উচিত না।
  const [wallet, setWallet]               = useState(null)
  const [walletLoading, setWalletLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/admin/billing/summary')
      setData(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'বিলিং তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/admin/wallet', { params: { limit: 1 } })
      .then((res) => setWallet(res.data.data))
      .catch(() => {})
      .finally(() => setWalletLoading(false))
  }, [])

  // AI key status — existing /ai/own-key রি-ইউজ (AIInsights.jsx-ও এটাই ব্যবহার করে)
  const [aiKey, setAiKey]               = useState(null)
  const [aiKeyLoading, setAiKeyLoading] = useState(true)

  useEffect(() => {
    api.get('/ai/own-key')
      .then((res) => setAiKey(res.data.data))
      .catch(() => {})
      .finally(() => setAiKeyLoading(false))
  }, [])

  // ইনভয়েস হিস্ট্রি — আলাদা, ছোট fetch
  const [invoices, setInvoices]               = useState([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [downloadingId, setDownloadingId]     = useState(null)

  useEffect(() => {
    api.get('/admin/billing/invoices', { params: { limit: 12 } })
      .then((res) => setInvoices(res.data.data.invoices))
      .catch(() => {})
      .finally(() => setInvoicesLoading(false))
  }, [])

  // ⚠️ auth token in-memory-তে থাকে (api/axios.js), plain <a href> বা
  // window.open()-এ Authorization হেডার যাবে না — তাই axios দিয়ে blob
  // হিসেবে আনতে হচ্ছে, তারপর ম্যানুয়ালি download ট্রিগার করা।
  const handleDownload = async (invoiceId, invoiceNumber) => {
    setDownloadingId(invoiceId)
    try {
      const res = await api.get(`/admin/billing/invoices/${invoiceId}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      // চুপচাপ — নিচে ছোট state দিয়ে দেখানো যেতে পারে, আপাতত console যথেষ্ট
      console.error('Invoice PDF download failed', err)
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading && !data) {
    return <div className="p-6 text-sm text-pf-text-muted">লোড হচ্ছে...</div>
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <Card>
          <p className="text-sm text-pf-error">{error}</p>
          <button onClick={load} className="mt-2 text-sm font-medium text-pf-primary-700 hover:underline">
            আবার চেষ্টা করুন
          </button>
        </Card>
      </div>
    )
  }

  const { plan, status, trial_ends_at, subscription_ends_at, seats, max_customers, customers_used, ai_usage } = data
  const planInfo  = PLANS[plan] || null   // 'basic' (trial placeholder) বা পুরনো legacy plan হলে null হবে
  const isTrial   = status === 'trial'
  const trialDays = isTrial ? daysLeft(trial_ends_at) : null

  // কাস্টমার কানেকশন ব্যবহার — max_customers null মানে সীমাহীন।
  // trial/paid নির্বিশেষে সবসময় প্রাসঙ্গিক, তাই isTrial দিয়ে গেট করা হয়নি।
  const usedCustomers = customers_used ?? 0
  const custPct       = max_customers ? Math.min(Math.round((usedCustomers / max_customers) * 100), 100) : 0
  const custFull       = max_customers != null && usedCustomers >= max_customers
  const custNear        = max_customers != null && custPct >= 80
  const custBarColor  = custFull ? 'bg-red-500' : custNear ? 'bg-amber-500' : 'bg-emerald-500'

  // সিট-ভিত্তিক খরচ — admin-সহ, tenant_seats-এ যা যা row আছে তার সবগুলো
  // (admin-এর row onboarding.controller.js-এই বসে, উপরের কমেন্ট দেখো)
  let rows = []
  let monthlyTotal = 0

  if (!isTrial && planInfo) {
    rows = (seats || []).map((s) => {
      const roleInfo    = planInfo.roles.find((r) => r.key === SEAT_ROLE_TO_PRICING_KEY[s.role])
      const listedPrice = roleInfo?.price ?? null
      const rate         = s.rate_locked ?? listedPrice
      const subtotal      = rate != null ? rate * s.seat_count : null
      if (subtotal != null) monthlyTotal += subtotal
      return {
        role: s.role,
        label: roleInfo?.label || s.role,
        count: s.seat_count,
        rate,
        subtotal,
        rateProtected: s.rate_locked != null && listedPrice != null && s.rate_locked < listedPrice,
      }
    })
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-pf-text-primary">বিলিং ও সাবস্ক্রিপশন</h1>
        <button onClick={load} className="text-pf-text-muted hover:text-pf-primary-700" title="রিফ্রেশ">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── প্ল্যান স্ট্যাটাস ── */}
      <Card>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-pf-accent-100 text-pf-accent-600">
                {planInfo ? planInfo.name : (plan || 'অজানা প্ল্যান')}
              </span>
              {isTrial ? (
                <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                  <FiClock size={12} /> ট্রায়াল
                </span>
              ) : status === 'active' ? (
                <span className="flex items-center gap-1 text-xs text-pf-success">
                  <FiCheckCircle size={12} /> সক্রিয়
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-pf-error">
                  <FiAlertTriangle size={12} /> {status === 'suspended' ? 'সাসপেন্ড' : status}
                </span>
              )}
            </div>

            {isTrial ? (
              <p className="text-sm text-pf-text-secondary mt-1">
                {trialDays != null ? `আর ${trialDays.toLocaleString('bn-BD')} দিন বাকি` : 'ট্রায়াল চলছে'} — শেষ হওয়ার আগে একটা প্ল্যান বেছে নিন
              </p>
            ) : subscription_ends_at ? (
              <p className="text-sm text-pf-text-secondary mt-1">পরবর্তী নবায়ন: {fmtDate(subscription_ends_at)}</p>
            ) : null}
          </div>

          <button
            onClick={() => navigate('/book-plan')}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-pf-primary-700 hover:bg-pf-primary-900 px-4 py-2 rounded-lg transition-colors"
          >
            {isTrial ? 'প্ল্যান বেছে নিন' : 'প্ল্যান পরিবর্তন করুন'} <FiArrowUpRight size={14} />
          </button>
        </div>
      </Card>

      {/* ── কাস্টমার কানেকশন ব্যবহার ── */}
      <Card title="কাস্টমার কানেকশন">
        {max_customers == null ? (
          <p className="text-sm text-pf-text-secondary">
            {usedCustomers.toLocaleString('bn-BD')} জন কাস্টমার — সীমাহীন
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-pf-mono text-pf-text-primary">
                {usedCustomers.toLocaleString('bn-BD')} / {max_customers.toLocaleString('bn-BD')}
              </span>
              <span className="text-xs text-pf-text-muted">{custPct.toLocaleString('bn-BD')}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
              <div className={`h-full rounded-full ${custBarColor}`} style={{ width: `${custPct}%` }} />
            </div>
            {custNear && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <FiAlertTriangle size={12} />
                {custFull
                  ? 'লিমিট শেষ — নতুন কাস্টমার যোগ করতে প্ল্যান আপগ্রেড করুন'
                  : 'লিমিটের কাছাকাছি চলে এসেছেন'}
              </p>
            )}
          </>
        )}
      </Card>

      {/* ── এই মাসের আনুমানিক বিল + সিট ব্রেকডাউন ── */}
      {!isTrial && planInfo && (
        <Card title="সিট ও খরচ">
          <p className="text-xs text-pf-text-muted">এই মাসের আনুমানিক বিল</p>
          <p className="text-3xl font-pf-mono font-semibold text-pf-primary-700 mt-0.5">
            {formatTaka(monthlyTotal)}
          </p>

          <div className="mt-4 space-y-2">
            {rows.map((r) => (
              <div key={r.role} className="flex items-center justify-between text-sm border-b border-pf-border/60 pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-pf-text-primary">{r.label}</span>
                  {r.rateProtected && (
                    <span
                      className="flex items-center gap-0.5 text-[11px] text-pf-success"
                      title="বর্তমান লিস্টেড রেট থেকে কম — আপনার রেট সুরক্ষিত"
                    >
                      <FiLock size={10} /> রেট সুরক্ষিত
                    </span>
                  )}
                </div>
                <span className="font-pf-mono text-pf-text-secondary">
                  {r.count.toLocaleString('bn-BD')} × {r.rate != null ? formatTaka(r.rate) : '—'}
                  {r.subtotal != null && <span className="text-pf-text-primary font-medium"> = {formatTaka(r.subtotal)}</span>}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-pf-text-muted mt-3 flex items-start gap-1.5">
            <FiUsers size={12} className="mt-0.5 shrink-0" />
            কোনো ইউজার সংখ্যার লিমিট নেই — প্রয়োজনমতো যোগ করুন, শুধু ওই রোলের রেট অনুযায়ী বিল হবে।
          </p>
        </Card>
      )}

      {/* ── ওয়ালেট (সামারি — পূর্ণ লেনদেন হিস্ট্রি /admin/wallet পেজে) ── */}
      <Card title="ওয়ালেট">
        {walletLoading ? (
          <p className="text-sm text-pf-text-muted">লোড হচ্ছে...</p>
        ) : wallet ? (
          <>
            <p className="text-2xl font-pf-mono font-semibold text-pf-primary-700">
              ৳{fmtTaka(wallet.balance_paisa)}
            </p>
            {wallet.low_balance && (
              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <FiAlertTriangle size={12} /> ব্যালেন্স কম — SMS/Email পাঠানো শীঘ্রই বন্ধ হতে পারে
              </p>
            )}
            <button
              onClick={() => navigate('/admin/wallet')}
              className="mt-3 flex items-center gap-1 text-sm font-medium text-pf-primary-700 hover:underline"
            >
              বিস্তারিত লেনদেন দেখুন <FiArrowUpRight size={13} />
            </button>
          </>
        ) : (
          <p className="text-sm text-pf-text-muted">ওয়ালেট তথ্য পাওয়া যায়নি।</p>
        )}
      </Card>

      {/* ── AI ব্যবহার (সামারি — কনফিগারেশন /admin/ai-insights পেজে) ── */}
      <Card title="AI ব্যবহার">
        {aiKeyLoading ? (
          <p className="text-sm text-pf-text-muted">লোড হচ্ছে...</p>
        ) : (
          <>
            {aiKey && (
              <p className={`text-sm font-medium flex items-center gap-1.5 ${(AI_KEY_SOURCE_LABEL[aiKey.key_source] || AI_KEY_SOURCE_LABEL.platform).color}`}>
                <FiZap size={14} />
                {(AI_KEY_SOURCE_LABEL[aiKey.key_source] || AI_KEY_SOURCE_LABEL.platform).label}
              </p>
            )}

            {ai_usage && ai_usage.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-pf-text-muted">এই মাসের ব্যবহার (উৎস অনুযায়ী)</p>
                {ai_usage.map((u) => (
                  <div key={u.source} className="flex items-center justify-between text-sm border-b border-pf-border/60 pb-2 last:border-0">
                    <span className="text-pf-text-primary">{AI_SOURCE_LABEL[u.source] || u.source}</span>
                    <span className="font-pf-mono text-pf-text-secondary">
                      {u.total_tokens.toLocaleString('bn-BD')} টোকেন
                      {u.charge_paisa > 0 && <span className="text-pf-text-primary font-medium"> · ৳{fmtTaka(u.charge_paisa)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-pf-text-secondary">এই মাসে এখনো কোনো AI ব্যবহার নেই।</p>
            )}

            <button
              onClick={() => navigate('/admin/ai-insights')}
              className="mt-3 flex items-center gap-1 text-sm font-medium text-pf-primary-700 hover:underline"
            >
              AI সেটিংস ও ইনসাইটস দেখুন <FiArrowUpRight size={13} />
            </button>
          </>
        )}
      </Card>

      {/* ── legacy/অচেনা plan value — ভুল রেট দেখানোর বদলে নিরাপদ fallback ── */}
      {!isTrial && !planInfo && (
        <Card>
          <p className="text-sm text-pf-text-secondary">
            এই অ্যাকাউন্টের প্ল্যান তথ্য নতুন সিস্টেমে এখনো ম্যাপ করা নেই। সঠিক বিল জানতে সাপোর্টের সাথে যোগাযোগ করুন।
          </p>
        </Card>
      )}

      {/* ── ইনভয়েস হিস্ট্রি ── */}
      <Card title="ইনভয়েস হিস্ট্রি">
        {invoicesLoading ? (
          <p className="text-sm text-pf-text-muted">লোড হচ্ছে...</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-pf-text-secondary flex items-start gap-1.5">
            <FiFileText size={14} className="mt-0.5 shrink-0" />
            এখনো কোনো ইনভয়েস তৈরি হয়নি — প্রতি মাসের ১ তারিখে নতুন ইনভয়েস তৈরি হয়।
          </p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const st = INVOICE_STATUS_LABEL[inv.status] || INVOICE_STATUS_LABEL.pending
              return (
                <div key={inv.id} className="flex items-center justify-between text-sm border-b border-pf-border/60 pb-2 last:border-0">
                  <div>
                    <p className="text-pf-text-primary font-medium">{fmtDate(inv.period_start)}</p>
                    <p className={`text-xs ${st.color}`}>{st.label} · {inv.invoice_number}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-pf-mono text-pf-text-primary">{formatTaka(inv.total_amount)}</span>
                    <button
                      onClick={() => handleDownload(inv.id, inv.invoice_number)}
                      disabled={downloadingId === inv.id}
                      className="text-pf-text-muted hover:text-pf-primary-700 disabled:opacity-40"
                      title="PDF ডাউনলোড"
                    >
                      <FiDownload className={downloadingId === inv.id ? 'animate-pulse' : ''} size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
