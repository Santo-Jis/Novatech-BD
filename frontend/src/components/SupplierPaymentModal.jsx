// SupplierPaymentModal.jsx
// সাপ্লায়ারকে পেমেন্ট রেকর্ড করার ছোট ফর্ম — Payable Ledger (Phase 4)।
// idempotency_key মোডাল খোলার সময় একবার জেনারেট হয় (crypto.randomUUID) আর একই
// সাবমিশন-অ্যাটেম্পটে (নেটওয়ার্ক রিট্রাই সহ) অপরিবর্তিত থাকে — ডাবল-পেমেন্ট ঠেকাতে।
// Usage: <SupplierPaymentModal isOpen={bool} supplierId={id} supplierName={s} currentPayable={n} onClose={fn} onPaid={fn} />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input, { Select, Textarea } from './ui/Input'
import toast from 'react-hot-toast'

const METHOD_OPTIONS = [
  { value: 'cash',          label: 'ক্যাশ' },
  { value: 'bank_transfer', label: 'ব্যাংক ট্রান্সফার' },
  { value: 'cheque',        label: 'চেক' },
  { value: 'bkash',         label: 'বিকাশ' },
  { value: 'nagad',         label: 'নগদ' },
  { value: 'other',         label: 'অন্যান্য' },
]

const REFERENCE_LABEL = {
  bank_transfer: 'ব্যাংক রেফারেন্স / ট্রানজেকশন নং',
  cheque:        'চেক নম্বর',
  bkash:         'ট্রানজেকশন আইডি',
  nagad:         'ট্রানজেকশন আইডি',
  other:         'রেফারেন্স নং',
}

const EMPTY_FORM = { amount: '', payment_method: 'cash', reference_no: '', notes: '' }

export default function SupplierPaymentModal({ isOpen, supplierId, supplierName, currentPayable, onClose, onPaid }) {
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [saving,  setSaving]  = useState(false)
  const [idemKey, setIdemKey] = useState(null)

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  // মোডাল নতুন করে খুললে ফর্ম রিসেট + নতুন idempotency key — প্রতিটা "নতুন" পেমেন্ট অ্যাটেম্পট আলাদা
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM)
      setIdemKey(crypto.randomUUID())
    }
  }, [isOpen])

  const payable = parseFloat(currentPayable || 0)

  const handleSave = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { toast.error('সঠিক পরিমাণ দিন।'); return }
    if (amount > payable + 1) { toast.error(`বকেয়া ৳${payable.toLocaleString()} এর বেশি পেমেন্ট করা যাবে না।`); return }

    setSaving(true)
    try {
      const res = await api.post(`/suppliers/${supplierId}/pay`, {
        amount,
        payment_method:  form.payment_method,
        reference_no:    form.reference_no || null,
        notes:           form.notes || null,
        idempotency_key: idemKey,
      })
      toast.success(res.data.message || 'পেমেন্ট সফল।')
      onClose()
      onPaid()
    } catch (err) {
      toast.error(err.response?.data?.message || 'পেমেন্টে সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`💰 পেমেন্ট করুন — ${supplierName || ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>বাতিল</Button>
          <Button onClick={handleSave} loading={saving}>পেমেন্ট নিশ্চিত করুন</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
          <span className="text-xs text-gray-400">বর্তমান বকেয়া</span>
          <span className="text-base font-bold text-gray-800 dark:text-gray-100">৳{payable.toLocaleString()}</span>
        </div>

        <Input
          label="পরিমাণ (৳) *"
          type="number"
          value={form.amount}
          onChange={e => setField('amount', e.target.value)}
          placeholder="যেমন: ৫০০০"
        />

        <Select label="পেমেন্ট মাধ্যম" options={METHOD_OPTIONS} value={form.payment_method} onChange={e => setField('payment_method', e.target.value)} />

        {form.payment_method !== 'cash' && (
          <Input
            label={REFERENCE_LABEL[form.payment_method] || 'রেফারেন্স নং'}
            value={form.reference_no}
            onChange={e => setField('reference_no', e.target.value)}
            maxLength={100}
          />
        )}

        <Textarea label="নোট" value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} />
      </div>
    </Modal>
  )
}
