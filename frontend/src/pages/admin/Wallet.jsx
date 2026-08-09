import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import { FiDollarSign, FiAlertTriangle, FiChevronLeft, FiChevronRight, FiRefreshCw } from 'react-icons/fi'

const TXN_LABELS = {
  recharge:     { label: 'রিচার্জ',        color: 'text-pf-success' },
  refund:       { label: 'রিফান্ড',        color: 'text-pf-success' },
  adjustment:   { label: 'সংশোধন',        color: 'text-pf-text-secondary' },
  sms_charge:   { label: 'SMS চার্জ',      color: 'text-pf-error' },
  email_charge: { label: 'Email চার্জ',    color: 'text-pf-error' },
  ai_charge:    { label: 'AI চার্জ',       color: 'text-pf-error' },
}

const fmtTaka = (paisa) =>
  (Math.abs(paisa || 0) / 100).toLocaleString('bn-BD', { minimumFractionDigits: 2 })

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('bn-BD', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Wallet() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [page, setPage]       = useState(1)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/admin/wallet', { params: { page: p, limit: 20 } })
      setData(res.data.data)
      setPage(p)
    } catch (err) {
      setError(err.response?.data?.message || 'ওয়ালেট তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(1) }, [load])

  if (loading && !data) {
    return <div className="p-6 text-sm text-pf-text-muted">লোড হচ্ছে...</div>
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <Card>
          <p className="text-sm text-pf-error">{error}</p>
          <button onClick={() => load(1)} className="mt-2 text-sm font-medium text-pf-primary-700 hover:underline">
            আবার চেষ্টা করুন
          </button>
        </Card>
      </div>
    )
  }

  const { balance_paisa, low_balance, pricing, transactions, pagination, updated_at } = data

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-pf-text-primary">ওয়ালেট / SMS-Email ব্যালেন্স</h1>
        <button onClick={() => load(page)} className="text-pf-text-muted hover:text-pf-primary-700" title="রিফ্রেশ">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <Card title="বর্তমান ব্যালেন্স">
        <div className="flex items-center gap-2">
          <FiDollarSign className="text-pf-primary-700" />
          <span className="text-2xl font-pf-mono font-semibold text-pf-primary-700">৳{fmtTaka(balance_paisa)}</span>
        </div>
        {updated_at && (
          <p className="text-xs text-pf-text-muted mt-1">সর্বশেষ পরিবর্তন: {fmtDate(updated_at)}</p>
        )}

        {low_balance && (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 dark:bg-amber-900/20 dark:border-amber-800">
            <FiAlertTriangle className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              ব্যালেন্স কম — শীঘ্রই SMS/Email পাঠানো বন্ধ হয়ে যেতে পারে। রিচার্জের জন্য সাপোর্টের সাথে যোগাযোগ করুন।
            </p>
          </div>
        )}

        {pricing && (
          <p className="text-xs text-pf-text-muted mt-3">
            প্রতি SMS ৳{(pricing.smsPricePaisa / 100).toFixed(2)} · প্রতি Email ৳{(pricing.emailPricePaisa / 100).toFixed(2)}
          </p>
        )}
      </Card>

      <Card title="লেনদেনের হিস্টরি">
        {transactions.length === 0 ? (
          <p className="text-sm text-pf-text-muted">এখনো কোনো লেনদেন হয়নি।</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => {
              const meta = TXN_LABELS[t.type] || { label: t.type, color: 'text-pf-text-primary' }
              return (
                <div key={t.id} className="flex items-center justify-between text-sm border-b border-pf-border/60 pb-2 last:border-0">
                  <div>
                    <span className={`font-medium ${meta.color}`}>{meta.label}</span>
                    {t.description && <span className="text-pf-text-muted ml-2 text-xs">{t.description}</span>}
                    <div className="text-[11px] text-pf-text-muted">{fmtDate(t.created_at)}</div>
                  </div>
                  <span className={`font-pf-mono font-semibold ${t.amount_paisa >= 0 ? 'text-pf-success' : 'text-pf-error'}`}>
                    {t.amount_paisa >= 0 ? '+' : '−'}৳{fmtTaka(t.amount_paisa)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-pf-border">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="flex items-center gap-1 text-sm text-pf-text-secondary disabled:opacity-40"
            >
              <FiChevronLeft /> আগের
            </button>
            <span className="text-xs text-pf-text-muted">পৃষ্ঠা {pagination.page} / {pagination.totalPages}</span>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => load(page + 1)}
              className="flex items-center gap-1 text-sm text-pf-text-secondary disabled:opacity-40"
            >
              পরের <FiChevronRight />
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
