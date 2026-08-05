// SupplierDetailModal.jsx
// একটা সাপ্লায়ারের বিস্তারিত — প্রোফাইল + payable ledger + কুইক স্ট্যাটস + সাম্প্রতিক ক্রয় আদেশ (drill-down)।
// গঠনগতভাবে PurchaseOrderDetailModal.jsx-এর প্যাটার্ন অনুসরণ করে (একই fmtDate/STATUS_CFG,
// একই loading skeleton, একই size="lg" + বর্ডার-টপ footer কনভেনশন)।
// Usage: <SupplierDetailModal supplierId={id} isOpen={open} onClose={fn} onEdit={(s)=>{}} onOpenPO={(poId)=>{}} onPay={(s)=>{}} />
//
// নোট: PO বা পেমেন্ট অ্যাকশনে ক্লিক করলে এই মোডাল বন্ধ করে পরেরটা খোলা হয় (একসাথে দুটো
// মোডাল স্ট্যাক না করে) — এই অ্যাপে এক সময়ে একটাই মোডাল খোলা থাকার কনভেনশন মেনে।

import { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import { Select } from './ui/Input'
import { SUPPLIER_TYPE_CFG } from './SupplierFormModal'
import { FiEdit, FiPhone, FiMail, FiMapPin, FiTruck, FiDollarSign, FiX, FiPlus } from 'react-icons/fi'

const PO_STATUS_CFG = {
  draft:     { variant: 'gray',     label: 'ড্রাফট' },
  ordered:   { variant: 'info',     label: 'অর্ডার করা হয়েছে' },
  partial:   { variant: 'warning',  label: 'আংশিক গ্রহণ' },
  received:  { variant: 'approved', label: 'সম্পূর্ণ গ্রহণ' },
  cancelled: { variant: 'rejected', label: 'বাতিল' },
}

const PAYMENT_TERMS_LABELS = { cod: 'ক্যাশ অন ডেলিভারি (COD)', net_15: 'নেট ১৫ দিন', net_30: 'নেট ৩০ দিন', net_45: 'নেট ৪৫ দিন', net_60: 'নেট ৬০ দিন' }
const MFS_PROVIDER_LABELS  = { bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট', upay: 'উপায়', other: 'অন্যান্য' }
const PAYMENT_METHOD_LABELS = { cash: 'ক্যাশ', bank_transfer: 'ব্যাংক ট্রান্সফার', cheque: 'চেক', bkash: 'বিকাশ', nagad: 'নগদ', other: 'অন্যান্য' }

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMoney = (v) => `৳${parseFloat(v || 0).toLocaleString()}`

const StatChip = ({ label, value }) => (
  <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl px-3 py-2.5">
    <p className="text-[11px] text-gray-400">{label}</p>
    <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-0.5 truncate">{value}</p>
  </div>
)

const InfoRow = ({ label, value }) => !value ? null : (
  <div className="flex justify-between gap-3 text-sm py-1">
    <span className="text-gray-400 flex-shrink-0">{label}</span>
    <span className="text-gray-700 dark:text-gray-200 font-medium text-right">{value}</span>
  </div>
)

export default function SupplierDetailModal({ supplierId, isOpen, onClose, onEdit, onOpenPO, onPay }) {
  const [supplier, setSupplier] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [payments, setPayments] = useState([])

  const [products,         setProducts]         = useState([])   // ড্রপডাউনের জন্য সব সক্রিয় পণ্য
  const [supplierProducts, setSupplierProducts] = useState([])   // এই সাপ্লায়ারের বিদ্যমান দাম-ম্যাপিং
  const [newMapping,       setNewMapping]       = useState({ product_id: '', unit_price: '', lead_time_days: '' })
  const [savingMapping,    setSavingMapping]    = useState(false)
  const [performance,      setPerformance]      = useState(null)

  const fetchSupplier = async () => {
    if (!supplierId) return
    setLoading(true)
    try {
      const res = await api.get(`/suppliers/${supplierId}`)
      setSupplier(res.data.data)
    } catch { /* Modal-এর ভিতরে toast দেখানোর বদলে খালি স্টেট রেখে দিলাম, নিচে fallback আছে */ }
    finally { setLoading(false) }
  }

  const fetchPayments = async () => {
    if (!supplierId) return
    try {
      const res = await api.get(`/suppliers/${supplierId}/payments?limit=10`)
      setPayments(res.data.data)
    } catch { /* পেমেন্ট হিস্ট্রি না এলেও বাকি ডিটেইল ভিউ কাজ করবে — silent fail */ }
  }

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products?is_active=true')
      setProducts(res.data.data)
    } catch { /* প্রোডাক্ট ম্যাপিং সেকশন কাজ করবে না, বাকি ডিটেইল ভিউ ঠিক থাকবে */ }
  }

  const fetchSupplierProducts = async () => {
    if (!supplierId) return
    try {
      const res = await api.get(`/suppliers/${supplierId}/products`)
      setSupplierProducts(res.data.data)
    } catch { /* silent fail — বাকি ডিটেইল ভিউ কাজ করবে */ }
  }

  const fetchPerformance = async () => {
    if (!supplierId) return
    try {
      const res = await api.get(`/suppliers/${supplierId}/performance`)
      setPerformance(res.data.data)
    } catch { /* silent fail — বাকি ডিটেইল ভিউ কাজ করবে */ }
  }

  useEffect(() => {
    if (isOpen && supplierId) { fetchSupplier(); fetchPayments(); fetchProducts(); fetchSupplierProducts(); fetchPerformance() }
    if (!isOpen) { // মোডাল বন্ধ হলে পুরনো ডেটা মুছে দেওয়া — পরের সাপ্লায়ারের জন্য পুরনো তথ্য ঝলকে উঠবে না
      setSupplier(null); setPayments([]); setSupplierProducts([]); setPerformance(null)
      setNewMapping({ product_id: '', unit_price: '', lead_time_days: '' })
    }
  }, [isOpen, supplierId])

  // ড্রপডাউনে ইতিমধ্যে ম্যাপ করা পণ্য বাছাই করলে তার বর্তমান দাম/লিড টাইম প্রি-ফিল হবে — এডিট সহজ হবে
  const onMappingProductChange = (product_id) => {
    const existing = supplierProducts.find(sp => sp.product_id === product_id)
    setNewMapping({
      product_id,
      unit_price: existing ? String(existing.unit_price) : '',
      lead_time_days: existing ? String(existing.lead_time_days ?? '') : '',
    })
  }

  const handleAddMapping = async () => {
    if (!newMapping.product_id) { return }
    const price = parseFloat(newMapping.unit_price)
    if (!newMapping.unit_price || isNaN(price) || price < 0) { return }

    setSavingMapping(true)
    try {
      await api.post(`/suppliers/${supplierId}/products`, {
        product_id: newMapping.product_id,
        unit_price: price,
        lead_time_days: newMapping.lead_time_days || null,
      })
      setNewMapping({ product_id: '', unit_price: '', lead_time_days: '' })
      fetchSupplierProducts()
    } catch { /* সংক্ষিপ্ত ইনলাইন ফর্ম, ব্যর্থ হলে চুপচাপ — পরের অ্যাটেম্পটে আবার চেষ্টা করা যাবে */ }
    finally { setSavingMapping(false) }
  }

  const handleDeleteMapping = async (productId) => {
    try {
      await api.delete(`/suppliers/${supplierId}/products/${productId}`)
      setSupplierProducts(prev => prev.filter(sp => sp.product_id !== productId))
    } catch { /* silent fail */ }
  }

  const typeCfg = supplier ? (SUPPLIER_TYPE_CFG[supplier.supplier_type] || SUPPLIER_TYPE_CFG.other) : null

  const completedCount = parseInt(supplier?.completed_po_count || 0, 10)
  const totalPurchased = parseFloat(supplier?.total_purchased || 0)
  const avgOrderValue  = completedCount > 0 ? totalPurchased / completedCount : 0
  const totalPayable   = Math.max(0, parseFloat(supplier?.total_payable || 0))

  // ট্রেড লাইসেন্স মেয়াদ — উত্তীর্ণ/শীঘ্রই-উত্তীর্ণ হলে সতর্কতা চিহ্ন
  let licenseBadge = null
  if (supplier?.trade_license_expiry) {
    const days = Math.ceil((new Date(supplier.trade_license_expiry) - new Date()) / 86400000)
    if (days < 0)       licenseBadge = <Badge variant="critical" label="মেয়াদ উত্তীর্ণ" size="xs" />
    else if (days <= 30) licenseBadge = <Badge variant="warning" label={`${days} দিনে মেয়াদ শেষ`} size="xs" />
  }

  const hasBusinessInfo = supplier && (supplier.tin_number || supplier.bin_number || supplier.trade_license_no)
  const hasPaymentInfo  = supplier && (supplier.bank_name || supplier.bank_account_no || supplier.mfs_provider || supplier.payment_terms !== 'net_30')
  const locationLabel   = supplier && [supplier.district_name, supplier.division_name].filter(Boolean).join(', ')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={supplier ? supplier.name : 'সাপ্লায়ার বিস্তারিত'} size="lg">
      {loading || !supplier ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-5">

          {/* হেডার */}
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <FiTruck className="text-primary" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{supplier.name}</p>
                {supplier.contact_person && <p className="text-xs text-gray-400">{supplier.contact_person}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant={typeCfg.variant} label={typeCfg.label} size="xs" />
              <Badge variant={supplier.is_active ? 'active' : 'archived'} label={supplier.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} size="xs" />
            </div>
          </div>

          {/* বকেয়া — Payable Ledger-এর মূল হাইলাইট */}
          <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${totalPayable > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
            <div>
              <p className={`text-xs ${totalPayable > 0 ? 'text-red-500' : 'text-green-600'}`}>মোট বকেয়া</p>
              <p className={`text-xl font-bold ${totalPayable > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                {totalPayable > 0 ? fmtMoney(totalPayable) : 'কোনো বকেয়া নেই'}
              </p>
            </div>
            {totalPayable > 0 && (
              <Button icon={<FiDollarSign />} onClick={() => onPay(supplier)}>পেমেন্ট করুন</Button>
            )}
          </div>

          {/* কুইক স্ট্যাটস */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatChip label="মোট PO" value={supplier.po_count} />
            <StatChip label="মোট ক্রয়" value={fmtMoney(totalPurchased)} />
            <StatChip label="গড় অর্ডার" value={fmtMoney(avgOrderValue)} />
            <StatChip label="সবশেষ অর্ডার" value={fmtDate(supplier.last_order_date)} />
          </div>

          {/* যোগাযোগ ও ঠিকানা */}
          <section className="space-y-1 pt-1">
            {supplier.phone && <p className="text-sm flex items-center gap-2 text-gray-600 dark:text-gray-300"><FiPhone size={13} className="text-gray-400" />{supplier.phone}</p>}
            {supplier.email && <p className="text-sm flex items-center gap-2 text-gray-600 dark:text-gray-300"><FiMail size={13} className="text-gray-400" />{supplier.email}</p>}
            {(locationLabel || supplier.address) && (
              <p className="text-sm flex items-start gap-2 text-gray-600 dark:text-gray-300">
                <FiMapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <span>{[supplier.address, locationLabel].filter(Boolean).join(' — ')}</span>
              </p>
            )}
          </section>

          {/* ব্যবসায়িক তথ্য */}
          {hasBusinessInfo && (
            <section className="pt-3 border-t border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">ব্যবসায়িক তথ্য</p>
              <InfoRow label="TIN" value={supplier.tin_number} />
              <InfoRow label="BIN" value={supplier.bin_number} />
              <InfoRow
                label="ট্রেড লাইসেন্স"
                value={supplier.trade_license_no && (
                  <span className="inline-flex items-center gap-1.5">
                    {supplier.trade_license_no}
                    {supplier.trade_license_expiry && <span className="text-xs text-gray-400">({fmtDate(supplier.trade_license_expiry)})</span>}
                    {licenseBadge}
                  </span>
                )}
              />
            </section>
          )}

          {/* পেমেন্ট তথ্য */}
          {hasPaymentInfo && (
            <section className="pt-3 border-t border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">পেমেন্ট তথ্য</p>
              <InfoRow label="শর্ত" value={PAYMENT_TERMS_LABELS[supplier.payment_terms]} />
              <InfoRow label="ব্যাংক" value={[supplier.bank_name, supplier.bank_branch].filter(Boolean).join(' — ')} />
              <InfoRow label="অ্যাকাউন্ট নম্বর" value={supplier.bank_account_no} />
              <InfoRow label="MFS" value={supplier.mfs_provider && `${MFS_PROVIDER_LABELS[supplier.mfs_provider]}${supplier.mfs_number ? ' — ' + supplier.mfs_number : ''}`} />
            </section>
          )}

          {supplier.notes && (
            <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl text-xs text-gray-600 dark:text-gray-300">{supplier.notes}</div>
          )}

          {/* সরবরাহকৃত পণ্য ও দাম — PO ফর্মে অটো-সাজেস্ট হয় এই দাম থেকে */}
          <section className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">সরবরাহকৃত পণ্য ও দাম</p>

            {supplierProducts.length > 0 && (
              <div className="space-y-1.5">
                {supplierProducts.map(sp => (
                  <div key={sp.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-100 dark:border-slate-700">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{sp.product_name}</p>
                      <p className="text-xs text-gray-400">
                        {sp.product_sku}
                        {sp.lead_time_days != null && ` · লিড টাইম ${sp.lead_time_days} দিন`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-secondary">{fmtMoney(sp.unit_price)}</span>
                      <button onClick={() => handleDeleteMapping(sp.product_id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="মুছুন">
                        <FiX size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 bg-gray-50 dark:bg-slate-700/40 rounded-xl p-2.5">
              <div className="flex-1">
                <Select
                  options={products.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` }))}
                  value={newMapping.product_id}
                  onChange={e => onMappingProductChange(e.target.value)}
                />
              </div>
              <input
                type="number" min="0" step="0.01" placeholder="দাম (৳)"
                value={newMapping.unit_price}
                onChange={e => setNewMapping(prev => ({ ...prev, unit_price: e.target.value }))}
                className="w-24 border border-gray-200 dark:border-slate-600 rounded-xl px-2 py-2.5 text-sm bg-white dark:bg-slate-800"
              />
              <input
                type="number" min="0" placeholder="লিড টাইম (দিন)"
                value={newMapping.lead_time_days}
                onChange={e => setNewMapping(prev => ({ ...prev, lead_time_days: e.target.value }))}
                className="w-28 border border-gray-200 dark:border-slate-600 rounded-xl px-2 py-2.5 text-sm bg-white dark:bg-slate-800"
              />
              <Button size="sm" icon={<FiPlus />} onClick={handleAddMapping} loading={savingMapping}>যোগ</Button>
            </div>
          </section>

          {/* পেমেন্ট হিস্ট্রি */}
          {payments.length > 0 && (
            <section className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">পেমেন্ট হিস্ট্রি</p>
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-100 dark:border-slate-700">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                      {p.reference_no && <span className="text-gray-400 font-normal"> — {p.reference_no}</span>}
                    </p>
                    <p className="text-xs text-gray-400">{fmtDate(p.created_at)}{p.recorded_by_name ? ` · ${p.recorded_by_name}` : ''}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400 flex-shrink-0">{fmtMoney(p.amount)}</span>
                </div>
              ))}
            </section>
          )}

          {/* পারফরম্যান্স — অন-টাইম ডেলিভারি % ও গড় লিড টাইম, রিসিভ করা PO থেকে গণনা */}
          {performance && performance.total_received > 0 && (
            <section className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">পারফরম্যান্স</p>
              <div className="grid grid-cols-2 gap-2">
                <StatChip
                  label="অন-টাইম ডেলিভারি"
                  value={performance.on_time_pct !== null ? `${performance.on_time_pct}%` : 'তথ্য নেই'}
                />
                <StatChip
                  label="গড় লিড টাইম"
                  value={performance.avg_lead_time_days !== null ? `${performance.avg_lead_time_days} দিন` : 'তথ্য নেই'}
                />
              </div>
              {performance.with_expected > 0 && (
                <p className="text-[11px] text-gray-400">{performance.on_time_count}/{performance.with_expected}টা প্রত্যাশিত-তারিখসহ PO সময়মতো এসেছে</p>
              )}
            </section>
          )}

          {/* সাম্প্রতিক ক্রয় আদেশ */}
          {supplier.recent_purchase_orders?.length > 0 && (
            <section className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">সাম্প্রতিক ক্রয় আদেশ</p>
              {supplier.recent_purchase_orders.map(po => (
                <button
                  key={po.id}
                  onClick={() => onOpenPO(po.id)}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 text-left transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{po.po_number}</p>
                    <p className="text-xs text-gray-400">{fmtDate(po.order_date)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-secondary">{fmtMoney(po.total_amount)}</span>
                    <Badge variant={PO_STATUS_CFG[po.status]?.variant} label={PO_STATUS_CFG[po.status]?.label} size="xs" />
                  </div>
                </button>
              ))}
            </section>
          )}
        </div>
      )}

      {supplier && (
        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
          <Button icon={<FiEdit />} onClick={() => onEdit(supplier)}>সম্পাদনা করুন</Button>
        </div>
      )}
    </Modal>
  )
}
