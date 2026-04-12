// frontend/src/components/CustomerEditModal.jsx
// Worker যখন কাস্টমার এডিট করবে — Optimistic UI with Rollback

import { useState } from 'react'
import { FiX, FiSave, FiLoader, FiAlertCircle } from 'react-icons/fi'
import api from '../api/axios'
import toast from 'react-hot-toast'

export default function CustomerEditModal({ customer, onClose, onUpdate }) {
  const [form, setForm] = useState({
    shop_name:     customer.shop_name     || '',
    owner_name:    customer.owner_name    || '',
    business_type: customer.business_type || '',
    whatsapp:      customer.whatsapp      || '',
    sms_phone:     customer.sms_phone     || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    // কোনো পরিবর্তন আছে কি না চেক
    const hasChange = Object.keys(form).some(
      key => form[key] !== (customer[key] || '')
    )
    if (!hasChange) {
      toast('কোনো পরিবর্তন নেই।', { icon: 'ℹ️' })
      return
    }

    setSaving(true)

    // ★ OPTIMISTIC UPDATE: আগেই UI-তে নতুন data দেখাও
    onUpdate({ ...customer, ...form, has_pending_edit: true })
    onClose()
    toast.loading('রিকোয়েস্ট পাঠানো হচ্ছে...', { id: 'edit-req' })

    try {
      await api.post(`/customers/${customer.id}/edit-request`, form)
      toast.success('এডিট রিকোয়েস্ট পাঠানো হয়েছে! ম্যানেজার অনুমোদন দিলে চূড়ান্ত হবে।', {
        id: 'edit-req',
        duration: 4000
      })
    } catch (err) {
      // ★ ROLLBACK: Error হলে আগের data ফিরিয়ে দাও
      onUpdate(customer)
      toast.error(err.response?.data?.message || 'রিকোয়েস্ট পাঠানো যায়নি। পরিবর্তন বাতিল হয়েছে।', {
        id: 'edit-req'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">কাস্টমার এডিট</h3>
            <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
              <FiAlertCircle size={12} />
              ম্যানেজার অনুমোদন লাগবে
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-100">
            <FiX />
          </button>
        </div>

        {/* Fields */}
        {[
          { label: 'দোকানের নাম',   key: 'shop_name',     placeholder: 'দোকানের নাম' },
          { label: 'মালিকের নাম',    key: 'owner_name',    placeholder: 'মালিকের নাম' },
          { label: 'ব্যবসার ধরন',   key: 'business_type', placeholder: 'যেমন: মুদি, ফার্মেসি' },
          { label: 'WhatsApp নম্বর', key: 'whatsapp',      placeholder: '01XXXXXXXXX', type: 'tel' },
          { label: 'SMS নম্বর',      key: 'sms_phone',     placeholder: '01XXXXXXXXX', type: 'tel' },
        ].map(f => (
          <div key={f.key}>
            <label className="text-sm text-gray-600 mb-1 block">{f.label}</label>
            <input
              type={f.type || 'text'}
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        ))}

        {/* Info box */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 space-y-1">
          <p className="font-semibold">⚠️ জানা দরকার:</p>
          <p>• এডিট করলে সাথে সাথে আপনার স্ক্রিনে দেখাবে</p>
          <p>• ম্যানেজার reject করলে আগের তথ্য ফিরে আসবে</p>
          <p>• একটি pending রিকোয়েস্ট থাকলে আবার এডিট করা যাবে না</p>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving
            ? <><FiLoader className="animate-spin" /> পাঠানো হচ্ছে...</>
            : <><FiSave /> রিকোয়েস্ট পাঠান</>
          }
        </button>
      </div>
    </div>
  )
        }
