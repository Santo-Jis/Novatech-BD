import { useEffect, useState } from 'react'
import api from '../api/axios'
import { FiPackage } from 'react-icons/fi'
import { Stat, MiniList, AlertList, DetailModal } from './healthUi'

// ইনভেন্টরি ও রিটার্ন: স্টক মূল্য (গুদাম + SR-এর হাতে), মৃত/কম স্টক, মেয়াদ, রিটার্ন-রিপ্লেসমেন্ট, সতর্কতা
// ডেটা: GET /reports/inventory-health  (backend: inventoryHealth.service.js)

const fmt = (n) => `৳${Math.round(Number(n) || 0).toLocaleString('bn-BD')}`
const qtyFmt = (n) => (Number(n) || 0).toLocaleString('bn-BD')

export default function InventoryHealthCard({ from, to }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed]   = useState(false)
  const [detail, setDetail]   = useState(null)

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
                  sub={`বিক্রয়মূল্যে ${fmt(inv.stock.total.sale_value)} · মার্জিন ${inv.stock.total.margin_pct ?? 0}%`} onClick={() => setDetail('stock_all')} />
            <Stat label="গুদামে" value={fmt(inv.stock.warehouse.cost_value)} sub={`${qtyFmt(inv.stock.warehouse.qty)} পিস`} onClick={() => setDetail('stock_all')} />
            <Stat label="SR-এর হাতে" value={fmt(inv.stock.sr_hand.cost_value)}
                  sub={`${qtyFmt(inv.stock.sr_hand.qty)} পিস · ${qtyFmt(inv.stock.sr_hand.sr_count)} জন`} onClick={() => setDetail('stock_sr')} />
            <Stat label="৬০ দিন বিক্রি নেই (আটকে থাকা)" value={fmt(inv.products.dead_stock.cost_value)}
                  tone={inv.products.dead_stock.cost_value > 0 ? 'bad' : undefined}
                  sub={`${qtyFmt(inv.products.dead_stock.count)}টি পণ্য`} onClick={() => setDetail('stock_dead')} />
          </div>

          {(inv.returned_stock.qty > 0 || inv.defective_stock.qty > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="ফেরত স্টক মূল্য" value={fmt(inv.returned_stock.cost_value)} sub={`${qtyFmt(inv.returned_stock.qty)} পিস`} onClick={() => setDetail('stock_returned')} />
              <Stat label="ত্রুটিপূর্ণ স্টক মূল্য" value={fmt(inv.defective_stock.cost_value)} tone="bad" sub={`${qtyFmt(inv.defective_stock.qty)} পিস`} onClick={() => setDetail('stock_defective')} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MiniList onMore={() => setDetail('stock_out')} title={`স্টক শেষ, কিন্তু চলছে (${qtyFmt(inv.products.out_of_stock.count)}টি)`} empty="কোনোটি নেই 👍"
                      rows={inv.products.out_of_stock.items.map(p => ({ left: p.name, right: `৬০দিনে ${qtyFmt(p.sold_60d)} বিক্রি` }))} />
            <MiniList onMore={() => setDetail('stock_low')} title={`পুনঃঅর্ডার দরকার (${qtyFmt(inv.products.low_stock.count)}টি)`} empty="কোনোটি নেই 👍"
                      rows={inv.products.low_stock.items.map(p => ({ left: p.name, right: `${qtyFmt(p.stock)} / ${qtyFmt(p.reorder_point)}` }))} />
            <MiniList onMore={() => setDetail('stock_dead')} title="সবচেয়ে বেশি আটকে থাকা স্টক" empty="কোনোটি নেই 👍"
                      rows={inv.products.dead_stock.items.map(p => ({ left: p.name, right: fmt(p.value) }))} />
          </div>
        </>
      )}

      {/* রিটার্ন / রিপ্লেসমেন্ট */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="রিটার্ন মূল্য (এই সময়ে)" value={fmt(ret.total_value)}
              tone={rate !== null && rate >= 10 ? 'bad' : undefined}
              sub={rate === null ? 'বিক্রি নেই' : `বিক্রির ${rate}%`} onClick={() => setDetail('returns')} />
        <Stat label="নষ্ট/মেয়াদোত্তীর্ণ ক্ষতি" value={fmt(ret.loss_cost)} tone={ret.loss_cost > 0 ? 'bad' : undefined} sub="ক্রয়মূল্যে, ফেরত পাওয়ার নয়" onClick={() => setDetail('returns_loss')} />
        <Stat label="রিপ্লেসমেন্ট (বদলি)" value={fmt(ret.replacement.value)} sub={`${qtyFmt(ret.replacement.count)}টি বিক্রিতে`} onClick={() => setDetail('replacement')} />
        <Stat label="অপেক্ষমাণ রিটার্ন" value={fmt(ret.pending.value)} sub={`${qtyFmt(ret.pending.count)}টি অনুরোধ`} onClick={() => setDetail('returns_pending')} />
      </div>

      {(ret.by_reason.length > 0 || srRet.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MiniList onMore={() => setDetail('returns')} title="কারণ অনুযায়ী রিটার্ন" empty="এই সময়ে রিটার্ন নেই"
                    rows={ret.by_reason.map(r => ({ left: `${r.is_loss ? '🔻 ' : ''}${r.label}`, right: fmt(r.value) }))} />
          <MiniList onMore={() => setDetail('returns')} title="SR অনুযায়ী রিটার্ন (বিক্রির তুলনায়)" empty="এই সময়ে রিটার্ন নেই"
                    rows={srRet.map(s => ({ left: `${s.flagged ? '⚠️ ' : ''}${s.name || '—'}`, right: `${fmt(s.value)} · ${s.rate_pct ?? 0}%` }))} />
        </div>
      )}

      <AlertList alerts={alerts} onOpen={setDetail} />
      {detail && <DetailModal type={detail} from={from} to={to} onClose={() => setDetail(null)} />}
    </div>
  )
}
