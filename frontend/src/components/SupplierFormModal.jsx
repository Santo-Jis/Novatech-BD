// frontend/src/components/SupplierFormModal.jsx
// সাপ্লায়ার Add/Edit ফর্ম — মৌলিক তথ্য + ব্যবসায়িক/কমপ্লায়েন্স + পেমেন্ট + ঠিকানা (বিভাগ→জেলা cascading)।
// বিভাগ→জেলা cascading লজিক customer/components/ProfileTab.jsx থেকে হুবহু নেওয়া (একই /reference/* এন্ডপয়েন্ট)।
// Usage: <SupplierFormModal isOpen={bool} mode="add"|"edit" supplier={row|null} onClose={fn} onChanged={(wasAdd) => void} />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input, { Select, Textarea } from './ui/Input'
import toast from 'react-hot-toast'

const EMPTY_FORM = {
  name: '', contact_person: '', phone: '', email: '',
  supplier_type: 'other', tin_number: '', bin_number: '', trade_license_no: '', trade_license_expiry: '',
  payment_terms: 'net_30', bank_name: '', bank_account_no: '', bank_branch: '', mfs_provider: '', mfs_number: '',
  division_id: '', district_id: '',
  address: '', notes: '',
}

// ধরন/পেমেন্ট-শর্ত/MFS — ব্যাকএন্ডের CHECK constraint-এর সাথে হুবহু মেলানো (supplier.controller.js)
export const SUPPLIER_TYPE_CFG = {
  raw_material:   { label: 'কাঁচামাল',   variant: 'secondary' },
  finished_goods: { label: 'তৈরি পণ্য',  variant: 'primary' },
  service:        { label: 'সার্ভিস',    variant: 'credit' },
  other:          { label: 'অন্যান্য',   variant: 'gray' },
}
const SUPPLIER_TYPE_OPTIONS = Object.entries(SUPPLIER_TYPE_CFG).map(([value, c]) => ({ value, label: c.label }))

const PAYMENT_TERMS_LABELS = { cod: 'ক্যাশ অন ডেলিভারি (COD)', net_15: 'নেট ১৫ দিন', net_30: 'নেট ৩০ দিন', net_45: 'নেট ৪৫ দিন', net_60: 'নেট ৬০ দিন' }
const PAYMENT_TERMS_OPTIONS = Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => ({ value, label }))

const MFS_PROVIDER_LABELS = { bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট', upay: 'উপায়', other: 'অন্যান্য' }
const MFS_PROVIDER_OPTIONS = Object.entries(MFS_PROVIDER_LABELS).map(([value, label]) => ({ value, label }))

export default function SupplierFormModal({ isOpen, mode, supplier, onClose, onChanged }) {
  const [form,   setForm]   = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [divisions, setDivisions] = useState([])
  const [districts, setDistricts] = useState([])

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  // মোডাল খোলার সময়: বিভাগ লিস্ট লোড + (এডিট হলে) ফর্ম প্রিফিল + বিদ্যমান বিভাগের জেলা লিস্ট লোড
  useEffect(() => {
    if (!isOpen) return

    api.get('/reference/divisions').then(res => setDivisions(res.data.data)).catch(() => {})

    if (mode === 'edit' && supplier) {
      setForm({
        name: supplier.name || '', contact_person: supplier.contact_person || '',
        phone: supplier.phone || '', email: supplier.email || '',
        supplier_type: supplier.supplier_type || 'other',
        tin_number: supplier.tin_number || '', bin_number: supplier.bin_number || '',
        trade_license_no: supplier.trade_license_no || '',
        trade_license_expiry: supplier.trade_license_expiry ? String(supplier.trade_license_expiry).slice(0, 10) : '',
        payment_terms: supplier.payment_terms || 'net_30',
        bank_name: supplier.bank_name || '', bank_account_no: supplier.bank_account_no || '', bank_branch: supplier.bank_branch || '',
        mfs_provider: supplier.mfs_provider || '', mfs_number: supplier.mfs_number || '',
        division_id: supplier.division_id || '', district_id: supplier.district_id || '',
        address: supplier.address || '', notes: supplier.notes || '',
      })
      if (supplier.division_id) {
        api.get(`/reference/districts?division_id=${supplier.division_id}`)
          .then(res => setDistricts(res.data.data)).catch(() => {})
      } else {
        setDistricts([])
      }
    } else {
      setForm(EMPTY_FORM)
      setDistricts([])
    }
  }, [isOpen, mode, supplier])

  // বিভাগ বদলালে জেলা রিলোড, আগের জেলা-নির্বাচন রিসেট (ProfileTab.jsx-এর মতোই)
  const onDivisionChange = async (division_id) => {
    setField('division_id', division_id)
    setField('district_id', '')
    setDistricts([])
    if (!division_id) return
    try {
      const res = await api.get(`/reference/districts?division_id=${division_id}`)
      setDistricts(res.data.data)
    } catch { /* silent — ড্রপডাউন খালি থেকে যাবে, ব্লকিং কিছু না */ }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('সাপ্লায়ারের নাম আবশ্যক।'); return }
    setSaving(true)
    try {
      if (mode === 'add') {
        await api.post('/suppliers', form)
        toast.success('সাপ্লায়ার যোগ হয়েছে।')
      } else {
        await api.put(`/suppliers/${supplier.id}`, form)
        toast.success('আপডেট সফল।')
      }
      onClose()
      onChanged(mode === 'add')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally { setSaving(false) }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'add' ? '➕ নতুন সাপ্লায়ার' : `✏️ সম্পাদনা — ${supplier?.name}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>বাতিল</Button>
          <Button onClick={handleSave} loading={saving}>সেভ করুন</Button>
        </>
      }
    >
      <div className="space-y-5">

        <section className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">মৌলিক তথ্য</p>
          <Input label="সাপ্লায়ারের নাম *" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="যেমন: ABC ট্রেডার্স" maxLength={150} />
          <Input label="যোগাযোগকারী ব্যক্তি" value={form.contact_person} onChange={e => setField('contact_person', e.target.value)} maxLength={100} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="ফোন" value={form.phone} onChange={e => setField('phone', e.target.value)} maxLength={30} />
            <Input label="ইমেইল" value={form.email} onChange={e => setField('email', e.target.value)} maxLength={150} />
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ব্যবসায়িক তথ্য</p>
          <Select label="সাপ্লায়ারের ধরন" options={SUPPLIER_TYPE_OPTIONS} value={form.supplier_type} onChange={e => setField('supplier_type', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="TIN নম্বর" value={form.tin_number} onChange={e => setField('tin_number', e.target.value)} maxLength={30} />
            <Input label="BIN নম্বর" value={form.bin_number} onChange={e => setField('bin_number', e.target.value)} maxLength={30} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="ট্রেড লাইসেন্স নং" value={form.trade_license_no} onChange={e => setField('trade_license_no', e.target.value)} maxLength={50} />
            <Input type="date" label="লাইসেন্সের মেয়াদ" value={form.trade_license_expiry} onChange={e => setField('trade_license_expiry', e.target.value)} />
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">পেমেন্ট তথ্য</p>
          <Select label="পেমেন্ট শর্ত" options={PAYMENT_TERMS_OPTIONS} value={form.payment_terms} onChange={e => setField('payment_terms', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="ব্যাংকের নাম" value={form.bank_name} onChange={e => setField('bank_name', e.target.value)} maxLength={100} />
            <Input label="শাখা" value={form.bank_branch} onChange={e => setField('bank_branch', e.target.value)} maxLength={100} />
          </div>
          <Input label="অ্যাকাউন্ট নম্বর" value={form.bank_account_no} onChange={e => setField('bank_account_no', e.target.value)} maxLength={50} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="MFS প্রোভাইডার" options={MFS_PROVIDER_OPTIONS} value={form.mfs_provider} onChange={e => setField('mfs_provider', e.target.value)} />
            <Input label="MFS নম্বর" value={form.mfs_number} onChange={e => setField('mfs_number', e.target.value)} maxLength={20} />
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ঠিকানা</p>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="বিভাগ"
              options={divisions.map(d => ({ value: d.id, label: d.name_bn || d.name_en }))}
              value={form.division_id}
              onChange={e => onDivisionChange(e.target.value)}
            />
            <Select
              label="জেলা"
              options={districts.map(d => ({ value: d.id, label: d.name_bn || d.name_en }))}
              value={form.district_id}
              onChange={e => setField('district_id', e.target.value)}
              disabled={!form.division_id}
            />
          </div>
          <Textarea label="বিস্তারিত ঠিকানা" value={form.address} onChange={e => setField('address', e.target.value)} rows={2} />
          <Textarea label="নোট" value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} />
        </section>

      </div>
    </Modal>
  )
}
