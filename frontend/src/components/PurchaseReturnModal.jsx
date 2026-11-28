// PurchaseReturnModal.jsx
// সাপ্লায়ারকে মাল ফেরত — পণ্যভিত্তিক ফেরতের পরিমাণ + কারণ।
// ফেরত দিলে স্টক কমে ও সাপ্লায়ারের বকেয়া (ফেরত মূল্য পরিমাণ) কমে। কাজটা উল্টানো যায় না।
// Usage: <PurchaseReturnModal isOpen poId poNumber supplierName onClose onDone />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input, { Textarea } from './ui/Input'
import toast from 'react-hot-toast'

const REASONS = ['ক্ষতিগ্রস্ত / নষ্ট মাল', 'ভুল মাল এসেছে', 'মেয়াদ কম / মেয়াদোত্তীর্ণ', 'মান খারাপ']

export default function PurchaseReturnModal({ isOpen, poId, poNumber, supplierName, onClose, onDone }) {
  const [items,   setItems]   = useState([])
  const [qty,     setQty]     = useState({})
  const [reason,  setReason]  = useState('')
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  const [busy,    setBusy]    = useState(false)

  useEffect(() => {
    if (!isOpen || !poId) return
    setQty({}); setReason(''); setNote('')
    setLoading(true)
    api.get(`/purchase-orders/${poId}/returns`)
      .then(res => setItems((res.data.data.items || []).filter(i => i.returnable > 0)))
      .catch(err => toast.error(err.response?.data?.message || 'তথ্য আনতে সমস্যা হয়েছে।'))
      .finally(() => setLoading(false))
  }, [isOpen, poId])

  const lines = items
    .map(i => ({ ...i, q: Math.min(i.returnable, Math.max(0, parseInt(qty[i.product_id], 10) || 0)) }))
    .filter(i => i.q > 0)
  const total = lines.reduce((a, i) => a + i.q * i.unit_cost, 0)

  const handleSubmit = async () => {
    if (lines.length === 0) { toast.error('কমপক্ষে একটি পণ্যের ফেরতের পরিমাণ দিন।'); return }
    if (reason.trim().length < 3) { toast.error('ফেরতের কারণ লিখুন।'); return }
    if (!window.confirm(`৳${Math.round(total).toLocaleString()} মূল্যের মাল ফেরত দেবেন? স্টক ও বকেয়া কমে যাবে, এটা উল্টানো যাবে না।`)) return
    setBusy(true)
    try {
      const res = await api.post(`/purchase-orders/${poId}/return`, {
        items: lines.map(i => ({ product_id: i.product_id, quantity: i.q })),
        reason: reason.trim(), note: note.trim() || undefined
      })
      toast.success(res.data.message || 'মাল ফেরত রেকর্ড হয়েছে।')
      onDone?.(); onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'ফেরত রেকর্ড করতে সমস্যা হয়েছে।')
    } finally { setBusy(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`↩️ মাল ফেরত — ${supplierName || ''} · ${poNumber || ''}`} size="md">
      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-6">ফেরত দেওয়ার মতো মাল নেই।</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {items.map(i => (
              <div key={i.product_id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-gray-100 dark:border-slate-700">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{i.product_name}</p>
                  <p className="text-xs text-gray-400">
                    গৃহীত {i.received}{i.returned > 0 && ` · আগে ফেরত ${i.returned}`} · ফেরতযোগ্য {i.returnable} · ৳{i.unit_cost.toLocaleString()}/পিস
                  </p>
                </div>
                <input
                  type="number" inputMode="numeric" min="0" max={i.returnable}
                  value={qty[i.product_id] ?? ''} placeholder="0"
                  onChange={e => setQty(q => ({ ...q, [i.product_id]: e.target.value }))}
                  className="w-20 text-center rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">কারণ *</p>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded-lg text-xs border ${reason === r
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-300'}`}>{r}</button>
              ))}
            </div>
            <Input placeholder="অথবা নিজে লিখুন" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} />
          </div>

          <Textarea label="নোট (ঐচ্ছিক)" placeholder="যেমন: ফেরত চালান নং, কুরিয়ার ইত্যাদি" value={note} onChange={e => setNote(e.target.value)} rows={2} />

          <div className="flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
            <span className="text-xs text-amber-700 dark:text-amber-300">সাপ্লায়ারের বকেয়া কমবে</span>
            <span className="text-base font-bold text-amber-700 dark:text-amber-300">৳{Math.round(total).toLocaleString()}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>বাতিল</Button>
            <Button onClick={handleSubmit} loading={busy} disabled={lines.length === 0}>ফেরত রেকর্ড করুন</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
