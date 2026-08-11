// PurchaseOrderDetailModal.jsx
// একটা Purchase Order-এর বিস্তারিত + লাইফসাইকেল অ্যাকশন (place order / receive / cancel)
// Usage: <PurchaseOrderDetailModal poId={id} isOpen={open} onClose={fn} onChanged={refreshFn} />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import { Textarea } from './ui/Input'
import toast from 'react-hot-toast'
import { FiTruck, FiPackage, FiCheckCircle, FiXCircle } from 'react-icons/fi'

const STATUS_CFG = {
  draft:     { variant: 'gray',     label: 'ড্রাফট' },
  ordered:   { variant: 'info',     label: 'অর্ডার করা হয়েছে' },
  partial:   { variant: 'warning',  label: 'আংশিক গ্রহণ' },
  received:  { variant: 'approved', label: 'সম্পূর্ণ গ্রহণ' },
  cancelled: { variant: 'rejected', label: 'বাতিল' },
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function PurchaseOrderDetailModal({ poId, isOpen, onClose, onChanged }) {
  const [po,        setPo]        = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [busy,      setBusy]      = useState(false)
  // { item_id: { qty, batch_number, expiry_date } } — ব্যাচ/মেয়াদ ঐচ্ছিক (Step ৪)
  const [receiveRows, setReceiveRows] = useState({})
  const [receiveNote, setReceiveNote] = useState('')

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

  useEffect(() => {
    if (isOpen && poId) { fetchPO(); setReceiveRows({}); setReceiveNote('') }
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

  const canReceive = po && ['ordered', 'partial'].includes(po.status)
  const canPlace   = po && po.status === 'draft'
  const canCancel  = po && ['draft', 'ordered'].includes(po.status)

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
                      <td className="px-3 py-2 text-right">৳{parseFloat(item.unit_cost).toLocaleString()}</td>
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
