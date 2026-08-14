// PurchaseOrderDetailModal.jsx
// একটা Purchase Order-এর বিস্তারিত + লাইফসাইকেল অ্যাকশন (place order / receive / cancel)
// Usage: <PurchaseOrderDetailModal poId={id} isOpen={open} onClose={fn} onChanged={refreshFn} />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import { Textarea, Select } from './ui/Input'
import toast from 'react-hot-toast'
import { FiTruck, FiPackage, FiCheckCircle, FiXCircle, FiDollarSign, FiX, FiPlus, FiRefreshCw } from 'react-icons/fi'

const STATUS_CFG = {
  draft:     { variant: 'gray',     label: 'ড্রাফট' },
  ordered:   { variant: 'info',     label: 'অর্ডার করা হয়েছে' },
  partial:   { variant: 'warning',  label: 'আংশিক গ্রহণ' },
  received:  { variant: 'approved', label: 'সম্পূর্ণ গ্রহণ' },
  cancelled: { variant: 'rejected', label: 'বাতিল' },
}

const COST_TYPE_LABELS = {
  freight: 'শিপমেন্ট/ফ্রেইট', customs_duty: 'কাস্টমস ডিউটি', clearing_charge: 'ক্লিয়ারিং চার্জ',
  insurance: 'বীমা', bank_charge: 'ব্যাংক চার্জ', assembly: 'অ্যাসেম্বেল',
  testing: 'টেস্টিং', packaging: 'প্যাকেজিং', transport: 'স্থানীয় পরিবহন', other: 'অন্যান্য',
}
const COST_TYPE_OPTIONS = Object.entries(COST_TYPE_LABELS).map(([value, label]) => ({ value, label }))

const CURRENCY_OPTIONS = [
  { value: 'BDT', label: 'BDT (৳)' }, { value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' },
  { value: 'CNY', label: 'CNY (¥)' }, { value: 'INR', label: 'INR (₹)' }, { value: 'GBP', label: 'GBP (£)' },
  { value: 'OTHER', label: 'অন্যান্য' },
]

const ALLOCATION_OPTIONS = [
  { value: 'value',    label: 'মূল্য অনুযায়ী' },
  { value: 'quantity', label: 'পরিমাণ অনুযায়ী' },
  { value: 'equal',    label: 'সমান ভাগে' },
]

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function PurchaseOrderDetailModal({ poId, isOpen, onClose, onChanged }) {
  const [po,        setPo]        = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [busy,      setBusy]      = useState(false)
  // { item_id: { qty, batch_number, expiry_date } } — ব্যাচ/মেয়াদ ঐচ্ছিক (Step ৪)
  const [receiveRows, setReceiveRows] = useState({})
  const [receiveNote, setReceiveNote] = useState('')

  // ── Landed Cost ──
  const [landedCost,    setLandedCost]    = useState(null)
  const [loadingLanded, setLoadingLanded] = useState(false)
  const [newCost,       setNewCost]       = useState({ cost_type: 'freight', currency: 'BDT', amount: '', exchange_rate: '1', notes: '' })
  const [savingCost,    setSavingCost]    = useState(false)
  const [applying,      setApplying]      = useState(false)

  const setRow = (itemId, field, value) =>
    setReceiveRows(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }))

  const fetchPO = async () => {
    if (!poId) return
    setLoading(true)
    try {
      const res = await api.get(`/purchase-orders/${poId}`)
      setPo(res.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const fetchLandedCost = async () => {
    if (!poId) return
    setLoadingLanded(true)
    try {
      const res = await api.get(`/purchase-orders/${poId}/landed-cost`)
      setLandedCost(res.data.data)
    } catch { /* silent — বাকি ডিটেইল ভিউ কাজ করবে */ }
    finally { setLoadingLanded(false) }
  }

  useEffect(() => {
    if (isOpen && poId) { fetchPO(); fetchLandedCost(); setReceiveRows({}); setReceiveNote('') }
    if (!isOpen) setLandedCost(null)
  }, [isOpen, poId])

  const handlePlaceOrder = async () => {
    setBusy(true)
    try {
      await api.post(`/purchase-orders/${poId}/place-order`)
      toast.success('সাপ্লায়ারকে অর্ডার করা হয়েছে।')
      fetchPO(); onChanged?.()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setBusy(false) }
  }

  const handleCancel = async () => {
    if (!window.confirm('এই Purchase Order বাতিল করতে চান?')) return
    setBusy(true)
    try {
      await api.post(`/purchase-orders/${poId}/cancel`)
      toast.success('বাতিল করা হয়েছে।')
      fetchPO(); onChanged?.()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setBusy(false) }
  }

  const handleReceive = async () => {
    const items = Object.entries(receiveRows)
      .filter(([, row]) => parseInt(row?.qty, 10) > 0)
      .map(([item_id, row]) => ({
        item_id,
        quantity_received_now: parseInt(row.qty, 10),
        // ব্যাচ/মেয়াদ ঐচ্ছিক — খালি রাখলে ব্যাচ ছাড়াই স্টক যোগ হবে
        batch_number: row.batch_number?.trim() || undefined,
        expiry_date:  row.expiry_date || undefined,
      }))

    if (items.length === 0) { toast.error('কমপক্ষে একটি পণ্যের গ্রহণকৃত পরিমাণ দিন।'); return }

    setBusy(true)
    try {
      const res = await api.post(`/purchase-orders/${poId}/receive`, { items, note: receiveNote })
      toast.success(res.data.message)
      setReceiveRows({}); setReceiveNote('')
      fetchPO(); onChanged?.()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setBusy(false) }
  }

  const handleAddCost = async () => {
    const amount = parseFloat(newCost.amount)
    if (!amount || amount <= 0) { toast.error('সঠিক পরিমাণ দিন।'); return }
    const rate = newCost.currency === 'BDT' ? 1 : parseFloat(newCost.exchange_rate)
    if (newCost.currency !== 'BDT' && (!rate || rate <= 0)) { toast.error('সঠিক এক্সচেঞ্জ রেট দিন।'); return }

    setSavingCost(true)
    try {
      await api.post(`/purchase-orders/${poId}/costs`, { ...newCost, amount, exchange_rate: rate })
      setNewCost({ cost_type: 'freight', currency: 'BDT', amount: '', exchange_rate: '1', notes: '' })
      fetchLandedCost()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setSavingCost(false) }
  }

  const handleDeleteCost = async (costId) => {
    try {
      await api.delete(`/purchase-orders/${poId}/costs/${costId}`)
      fetchLandedCost()
    } catch { toast.error('মুছতে সমস্যা হয়েছে।') }
  }

  const handleAllocationChange = async (method) => {
    try {
      await api.put(`/purchase-orders/${poId}/allocation-method`, { method })
      fetchLandedCost()
    } catch { toast.error('আপডেট ব্যর্থ।') }
  }

  const handleApplyLandedCost = async () => {
    if (!window.confirm('এই হিসাব অনুযায়ী পণ্যের cost price আপডেট করতে চান? এটা রিসিভ করার সময়ের weighted-average মান ওভাররাইট করবে।')) return
    setApplying(true)
    try {
      const res = await api.post(`/purchase-orders/${poId}/apply-landed-cost`)
      toast.success(res.data.message)
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setApplying(false) }
  }

  const canReceive = po && ['ordered', 'partial'].includes(po.status)
  const canPlace   = po && po.status === 'draft'
  const canCancel  = po && ['draft', 'ordered'].includes(po.status)
  const canApplyLanded = po && ['partial', 'received'].includes(po.status)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={po ? `📦 ${po.po_number}` : 'Purchase Order'} size="lg">
      {loading || !po ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header info */}
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <FiTruck className="text-primary" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{po.supplier_name}</p>
                <p className="text-xs text-gray-400">
                  অর্ডার: {fmtDate(po.order_date)} {po.expected_date && `· প্রত্যাশিত: ${fmtDate(po.expected_date)}`}
                  {po.warehouse_name && ` · গুদাম: ${po.warehouse_name}`}
                  {po.currency !== 'BDT' && ` · ${po.currency} @ ৳${parseFloat(po.exchange_rate).toLocaleString()}`}
                </p>
              </div>
            </div>
            <Badge variant={STATUS_CFG[po.status]?.variant} label={STATUS_CFG[po.status]?.label} />
          </div>

          {po.notes && (
            <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl text-xs text-gray-600 dark:text-gray-300">{po.notes}</div>
          )}

          {/* Items table */}
          <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-700/50 text-xs text-gray-500 dark:text-gray-400">
                  <th className="text-left px-3 py-2">পণ্য</th>
                  <th className="text-right px-3 py-2">অর্ডার</th>
                  <th className="text-right px-3 py-2">গৃহীত</th>
                  <th className="text-right px-3 py-2">দর</th>
                  {canReceive && <th className="text-right px-3 py-2 whitespace-nowrap">এখন গ্রহণ</th>}
                  {canReceive && <th className="text-left px-3 py-2 whitespace-nowrap">ব্যাচ নং (ঐচ্ছিক)</th>}
                  {canReceive && <th className="text-left px-3 py-2 whitespace-nowrap">মেয়াদ উত্তীর্ণ (ঐচ্ছিক)</th>}
                </tr>
              </thead>
              <tbody>
                {po.items.map(item => {
                  const remaining = item.quantity_ordered - item.quantity_received
                  const row = receiveRows[item.id] || {}
                  return (
                    <tr key={item.id} className="border-t border-gray-100 dark:border-slate-700">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-700 dark:text-gray-200">{item.product_name}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{item.sku}</p>
                      </td>
                      <td className="px-3 py-2 text-right">{item.quantity_ordered} {item.unit}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={item.quantity_received >= item.quantity_ordered ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                          {item.quantity_received}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        ৳{parseFloat(item.unit_cost).toLocaleString()}
                        {item.foreign_unit_cost != null && (
                          <p className="text-[10px] text-gray-400">{po.currency} {parseFloat(item.foreign_unit_cost).toLocaleString()}</p>
                        )}
                      </td>
                      {canReceive && (
                        <td className="px-3 py-2 text-right">
                          {remaining > 0 ? (
                            <input
                              type="number" min="0" max={remaining}
                              placeholder="0"
                              value={row.qty || ''}
                              onChange={e => setRow(item.id, 'qty', e.target.value)}
                              className="w-20 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 text-right text-sm bg-white dark:bg-slate-800"
                            />
                          ) : (
                            <span className="text-xs text-emerald-600">সম্পূর্ণ</span>
                          )}
                        </td>
                      )}
                      {canReceive && (
                        <td className="px-3 py-2">
                          {remaining > 0 && (
                            <input
                              type="text"
                              placeholder="যেমন: BN-2607"
                              value={row.batch_number || ''}
                              onChange={e => setRow(item.id, 'batch_number', e.target.value)}
                              className="w-28 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-800"
                            />
                          )}
                        </td>
                      )}
                      {canReceive && (
                        <td className="px-3 py-2">
                          {remaining > 0 && (
                            <input
                              type="date"
                              value={row.expiry_date || ''}
                              onChange={e => setRow(item.id, 'expiry_date', e.target.value)}
                              className="w-36 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-800"
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {canReceive && (
            <p className="text-xs text-gray-400 -mt-2">ব্যাচ নং/মেয়াদ ফাঁকা রাখলে সাধারণভাবে স্টক যোগ হবে (FEFO ট্র্যাকিং ছাড়া)।</p>
          )}

          <div className="flex justify-end text-sm">
            <p className="text-gray-500 dark:text-gray-400">মোট মূল্য: <span className="font-bold text-secondary">৳{parseFloat(po.total_amount).toLocaleString()}</span></p>
          </div>

          {/* ── Landed Cost ── */}
          <section className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <FiDollarSign size={12} /> ল্যান্ডেড কস্ট (অতিরিক্ত খরচ)
              </p>
              {landedCost && (
                <Select
                  options={ALLOCATION_OPTIONS}
                  value={landedCost.allocation_method}
                  onChange={e => handleAllocationChange(e.target.value)}
                  className="w-40 text-xs"
                />
              )}
            </div>

            {loadingLanded ? (
              <div className="h-16 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
            ) : landedCost && (
              <>
                {landedCost.costs.length > 0 && (
                  <div className="space-y-1.5">
                    {landedCost.costs.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border border-gray-100 dark:border-slate-700">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-200">{COST_TYPE_LABELS[c.cost_type] || c.cost_type}</p>
                          <p className="text-[11px] text-gray-400">
                            {c.currency !== 'BDT' ? `${c.currency} ${parseFloat(c.amount).toLocaleString()} @ ৳${parseFloat(c.exchange_rate).toLocaleString()}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">৳{parseFloat(c.amount_bdt).toLocaleString()}</span>
                          <button onClick={() => handleDeleteCost(c.id)} className="p-1 rounded-lg hover:bg-red-50 text-red-400" title="মুছুন">
                            <FiX size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <p className="text-right text-xs text-gray-500 dark:text-gray-400">মোট অতিরিক্ত খরচ: <span className="font-bold">৳{landedCost.total_extra_bdt.toLocaleString()}</span></p>
                  </div>
                )}

                {/* নতুন খরচ যোগ */}
                <div className="flex items-end gap-2 bg-gray-50 dark:bg-slate-700/40 rounded-xl p-2.5 flex-wrap">
                  <div className="w-40">
                    <Select options={COST_TYPE_OPTIONS} value={newCost.cost_type} onChange={e => setNewCost(p => ({ ...p, cost_type: e.target.value }))} />
                  </div>
                  <div className="w-28">
                    <Select options={CURRENCY_OPTIONS} value={newCost.currency} onChange={e => setNewCost(p => ({ ...p, currency: e.target.value, exchange_rate: e.target.value === 'BDT' ? '1' : p.exchange_rate }))} />
                  </div>
                  <input
                    type="number" min="0" step="0.01" placeholder="পরিমাণ"
                    value={newCost.amount}
                    onChange={e => setNewCost(p => ({ ...p, amount: e.target.value }))}
                    className="w-24 border border-gray-200 dark:border-slate-600 rounded-xl px-2 py-2.5 text-sm bg-white dark:bg-slate-800"
                  />
                  {newCost.currency !== 'BDT' && (
                    <input
                      type="number" min="0" step="0.0001" placeholder="রেট (৳)"
                      value={newCost.exchange_rate}
                      onChange={e => setNewCost(p => ({ ...p, exchange_rate: e.target.value }))}
                      className="w-24 border border-gray-200 dark:border-slate-600 rounded-xl px-2 py-2.5 text-sm bg-white dark:bg-slate-800"
                    />
                  )}
                  <Button size="sm" icon={<FiPlus />} onClick={handleAddCost} loading={savingCost}>যোগ</Button>
                </div>

                {/* প্রতি আইটেমের landed unit cost */}
                {landedCost.costs.length > 0 && (
                  <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-slate-700/50 text-gray-500 dark:text-gray-400">
                          <th className="text-left px-3 py-1.5">পণ্য</th>
                          <th className="text-right px-3 py-1.5">মূল দর</th>
                          <th className="text-right px-3 py-1.5">+ অতিরিক্ত/ইউনিট</th>
                          <th className="text-right px-3 py-1.5">প্রকৃত দর</th>
                        </tr>
                      </thead>
                      <tbody>
                        {landedCost.items.map(it => (
                          <tr key={it.item_id} className="border-t border-gray-100 dark:border-slate-700">
                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">{it.product_name}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">৳{it.unit_cost.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right text-amber-600">+৳{it.extra_per_unit_bdt.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-gray-800 dark:text-gray-100">৳{it.landed_unit_cost.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {landedCost.costs.length > 0 && (
                  canApplyLanded ? (
                    <Button size="sm" variant="outline" icon={<FiRefreshCw />} onClick={handleApplyLandedCost} loading={applying} className="w-full">
                      প্রকৃত দর পণ্যের cost price-এ প্রয়োগ করুন
                    </Button>
                  ) : (
                    <p className="text-[11px] text-gray-400 text-center">মাল রিসিভ করার পর প্রকৃত দর cost price-এ প্রয়োগ করা যাবে</p>
                  )
                )}
              </>
            )}
          </section>

          {canReceive && (
            <Textarea
              label="গ্রহণের নোট (ঐচ্ছিক)"
              placeholder="যেমন: চালান নং, বাহক ইত্যাদি"
              value={receiveNote}
              onChange={e => setReceiveNote(e.target.value)}
              rows={2}
            />
          )}
        </div>
      )}

      {/* Footer actions */}
      {po && (
        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-slate-700 flex-wrap">
          {canCancel && (
            <Button variant="outline" icon={<FiXCircle />} onClick={handleCancel} loading={busy}>PO বাতিল করুন</Button>
          )}
          {canPlace && (
            <Button icon={<FiPackage />} onClick={handlePlaceOrder} loading={busy}>সাপ্লায়ারকে অর্ডার করুন</Button>
          )}
          {canReceive && (
            <Button icon={<FiCheckCircle />} onClick={handleReceive} loading={busy}>মাল গ্রহণ রেকর্ড করুন</Button>
          )}
        </div>
      )}
    </Modal>
  )
}
