import { useEffect, useState } from 'react'
import api from '../api/axios'

// ─── helpers ───────────────────────────────────────────────
const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')

// API/DB-র date (ISO স্ট্রিং বা YYYY-MM-DD) → YYYY-MM-DD (ডিভাইসের লোকাল তারিখ,
// Commission/SalesHistory পেজের বাকি তারিখ-দেখানোর সাথে একই নিয়মে)
export const toYMD = (v) => {
  if (!v) return ''
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const KIND_LABEL = {
  cash:        'নগদ বিক্রি',
  replacement: 'রিপ্লেসমেন্ট বিক্রি',
  partial:     'আংশিক বাকি বিক্রি',
  due:         'বাকি বিক্রি',
  collected:   'বাকি আদায়',
}

const timeBn = (at) => {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
}

// ============================================================
// একটা দিনের কমিশন ব্রেকডাউন — কোন বিক্রি/আদায় থেকে কত কমিশন
// GET /commission/my/day/:date
// ============================================================
export default function CommissionDayBreakdown({ date }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    api.get(`/commission/my/day/${date}`)
      .then(res => { if (alive) setData(res.data.data) })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [date])

  if (loading) {
    return (
      <div className="space-y-1.5">
        {[0, 1].map(i => <div key={i} className="h-10 bg-white/70 rounded-lg animate-pulse" />)}
      </div>
    )
  }
  if (error || !data) {
    return <p className="text-xs text-slate-400 m-0 text-center">ব্রেকডাউন আনা যায়নি — একটু পরে আবার চেষ্টা করুন।</p>
  }
  if (data.entries.length === 0) {
    return <p className="text-xs text-slate-400 m-0 text-center">এই দিনে কোনো বিক্রি বা আদায়ের তথ্য নেই।</p>
  }

  const isProduct = data.rate_mode === 'product'
  const isCustom  = data.rate_mode === 'custom' || isProduct

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-600 m-0 mb-1.5">
        কোন বিক্রি থেকে কত কমিশন
      </p>

      <div className="rounded-lg bg-white border border-sky-100 overflow-hidden">
        {data.entries.map((e, i) => {
          const waitingCollection = e.status === 'due'
          return (
            <div key={`${e.kind}-${e.id}`}
              className={`flex items-center justify-between gap-2 px-2.5 py-2 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 m-0 truncate">
                  {e.customer || '—'}
                </p>
                <p className="text-[10px] text-slate-400 m-0 truncate">
                  {KIND_LABEL[e.status] || 'বিক্রি'}
                  {e.ref ? ` · ${e.ref}` : ''}
                  {timeBn(e.at) ? ` · ${timeBn(e.at)}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                {waitingCollection ? (
                  <>
                    <p className="text-[11px] font-semibold text-amber-600 m-0">আদায়ে যোগ হবে</p>
                    <p className="text-[10px] text-slate-400 m-0">বিক্রি {taka(e.amount)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-bold text-emerald-700 m-0">{taka(e.commission)}</p>
                    <p className="text-[10px] text-slate-400 m-0">
                      {taka(e.commissionable)} এর
                      {e.status === 'partial' ? ' (নগদ অংশ)' : ''}
                      {data.rate_mode === 'product' && e.rate != null ? ` · ${e.rate}%` : ''}
                    </p>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {/* মোট */}
        <div className="flex items-center justify-between px-2.5 py-2 bg-emerald-50 border-t border-emerald-100">
          <span className="text-[11px] text-slate-600">
            {taka(data.total_sales)} × {data.rate}% {isProduct ? '(প্রডাক্ট অনুযায়ী গড়)' : isCustom ? '(নির্দিষ্ট রেট)' : '(স্ল্যাব)'}
          </span>
          <span className="text-[13px] font-extrabold text-emerald-800">{taka(data.total_commission)}</span>
        </div>
      </div>

      {!isCustom && !data.paid && (
        <p className="text-[10px] text-slate-400 m-0 mt-1.5 leading-relaxed">
          স্ল্যাব দিনের মোট বিক্রয়ে ঠিক হয়। তাই দিন শেষ না হওয়া পর্যন্ত রেট বাড়লে প্রতিটি বিক্রির কমিশনও বাড়বে।
        </p>
      )}
      {data.mismatch && (
        <p className="text-[10px] text-amber-600 m-0 mt-1.5 leading-relaxed">
          কিছু বিক্রি/আদায় কমিশন পরিশোধের পরে হয়েছে, তাই এই যোগফল পরিশোধিত অংকের সাথে না-ও মিলতে পারে।
        </p>
      )}
    </div>
  )
}
