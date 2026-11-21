import { useEffect, useState } from 'react'
import api from '../api/axios'
import { FiAlertTriangle, FiAlertCircle, FiInfo, FiPackage } from 'react-icons/fi'

// ইনভেন্টরি ও রিটার্ন: স্টক মূল্য (গুদাম + SR-এর হাতে), মৃত/কম স্টক, মেয়াদ, রিটার্ন-রিপ্লেসমেন্ট, সতর্কতা
// ডেটা: GET /reports/inventory-health  (backend: inventoryHealth.service.js)

const fmt = (n) => `৳${Math.round(Number(n) || 0).toLocaleString('bn-BD')}`
const qtyFmt = (n) => (Number(n) || 0).toLocaleString('bn-BD')

const SEV = {
  danger:  { cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',         Icon: FiAlertCircle },
  warning: { cls: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800', Icon: FiAlertTriangle },
  info:    { cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',   Icon: FiInfo },
}

function Stat({ label, value, sub, tone }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-600' : 'text-gray-800 dark:text-white'
  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function MiniList({ title, rows, empty }) {
  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-gray-400">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-gray-700 dark:text-gray-200">{r.left}</span>
              <span className="flex-shrink-0 font-semibold text-gray-500 dark:text-gray-400">{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function InventoryHealthCard({ from, to }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed]   = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setFailed(false)
    api.get('/reports/inventory-health', { params: { from, to } })
      .then(r => { if (alive) setData(r.data?.data || null) })
      .catch(() => { if (alive) setFailed(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [from, to])

  if (loading) return <div className="h-48 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
  if (failed || !data) return null   // ড্যাশবোর্ডের বাকি অংশ আটকাবে না

  const { inventory: inv, returns: ret, sr_returns: srRet = [], alerts = [] } = data
  const rate = ret.return_rate_pct

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 space-y-4">
      <div className="flex items-center gap-2">
        <FiPackage className="text-primary" />
        <h2 className="font-bold text-gray-800 dark:text-white text-sm">ইনভেন্টরি ও রিটার্ন</h2>
      </div>

      {inv && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="মোট স্টক মূল্য (ক্রয়মূল্যে)" value={fmt(inv.stock.total.cost_value)}
                  sub={`বিক্রয়মূল্যে ${fmt(inv.stock.total.sale_value)} · মার্জিন ${inv.stock.total.margin_pct ?? 0}%`} />
            <Stat label="গুদামে" value={fmt(inv.stock.warehouse.cost_value)} sub={`${qtyFmt(inv.stock.warehouse.qty)} পিস`} />
            <Stat label="SR-এর হাতে" value={fmt(inv.stock.sr_hand.cost_value)}
                  sub={`${qtyFmt(inv.stock.sr_hand.qty)} পিস · ${qtyFmt(inv.stock.sr_hand.sr_count)} জন`} />
            <Stat label="৬০ দিন বিক্রি নেই (আটকে থাকা)" value={fmt(inv.products.dead_stock.cost_value)}
                  tone={inv.products.dead_stock.cost_value > 0 ? 'bad' : undefined}
                  sub={`${qtyFmt(inv.products.dead_stock.count)}টি পণ্য`} />
          </div>

          {(inv.returned_stock.qty > 0 || inv.defective_stock.qty > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="ফেরত স্টক মূল্য" value={fmt(inv.returned_stock.cost_value)} sub={`${qtyFmt(inv.returned_stock.qty)} পিস`} />
              <Stat label="ত্রুটিপূর্ণ স্টক মূল্য" value={fmt(inv.defective_stock.cost_value)} tone="bad" sub={`${qtyFmt(inv.defective_stock.qty)} পিস`} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MiniList title={`স্টক শেষ, কিন্তু চলছে (${qtyFmt(inv.products.out_of_stock.count)}টি)`} empty="কোনোটি নেই 👍"
                      rows={inv.products.out_of_stock.items.map(p => ({ left: p.name, right: `৬০দিনে ${qtyFmt(p.sold_60d)} বিক্রি` }))} />
            <MiniList title={`পুনঃঅর্ডার দরকার (${qtyFmt(inv.products.low_stock.count)}টি)`} empty="কোনোটি নেই 👍"
                      rows={inv.products.low_stock.items.map(p => ({ left: p.name, right: `${qtyFmt(p.stock)} / ${qtyFmt(p.reorder_point)}` }))} />
            <MiniList title="সবচেয়ে বেশি আটকে থাকা স্টক" empty="কোনোটি নেই 👍"
                      rows={inv.products.dead_stock.items.map(p => ({ left: p.name, right: fmt(p.value) }))} />
          </div>
        </>
      )}

      {/* রিটার্ন / রিপ্লেসমেন্ট */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="রিটার্ন মূল্য (এই সময়ে)" value={fmt(ret.total_value)}
              tone={rate !== null && rate >= 10 ? 'bad' : undefined}
              sub={rate === null ? 'বিক্রি নেই' : `বিক্রির ${rate}%`} />
        <Stat label="নষ্ট/মেয়াদোত্তীর্ণ ক্ষতি" value={fmt(ret.loss_cost)} tone={ret.loss_cost > 0 ? 'bad' : undefined} sub="ক্রয়মূল্যে, ফেরত পাওয়ার নয়" />
        <Stat label="রিপ্লেসমেন্ট (বদলি)" value={fmt(ret.replacement.value)} sub={`${qtyFmt(ret.replacement.count)}টি বিক্রিতে`} />
        <Stat label="অপেক্ষমাণ রিটার্ন" value={fmt(ret.pending.value)} sub={`${qtyFmt(ret.pending.count)}টি অনুরোধ`} />
      </div>

      {(ret.by_reason.length > 0 || srRet.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MiniList title="কারণ অনুযায়ী রিটার্ন" empty="এই সময়ে রিটার্ন নেই"
                    rows={ret.by_reason.map(r => ({ left: `${r.is_loss ? '🔻 ' : ''}${r.label}`, right: fmt(r.value) }))} />
          <MiniList title="SR অনুযায়ী রিটার্ন (বিক্রির তুলনায়)" empty="এই সময়ে রিটার্ন নেই"
                    rows={srRet.map(s => ({ left: `${s.flagged ? '⚠️ ' : ''}${s.name || '—'}`, right: `${fmt(s.value)} · ${s.rate_pct ?? 0}%` }))} />
        </div>
      )}

      {alerts.length > 0 && (
        <ul className="space-y-2">
          {alerts.map((a, i) => {
            const { cls, Icon } = SEV[a.severity] || SEV.info
            return (
              <li key={i} className={`flex items-start gap-2 text-xs border rounded-xl p-2.5 ${cls}`}>
                <Icon className="flex-shrink-0 mt-0.5" />
                <span>{a.message}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
