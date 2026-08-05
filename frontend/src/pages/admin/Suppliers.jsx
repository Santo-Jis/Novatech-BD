import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Table, { Pagination } from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Input, { Select } from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import SupplierFormModal, { SUPPLIER_TYPE_CFG } from '../../components/SupplierFormModal'
import SupplierDetailModal from '../../components/SupplierDetailModal'
import SupplierPaymentModal from '../../components/SupplierPaymentModal'
import SupplierImportModal from '../../components/SupplierImportModal'
import PurchaseOrderDetailModal from '../../components/PurchaseOrderDetailModal'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit, FiTrash2, FiTruck, FiPhone, FiMail, FiSlash, FiCheckCircle, FiSearch, FiEye, FiUploadCloud } from 'react-icons/fi'

const SORT_OPTIONS = [
  { value: 'name_asc',      label: 'নাম (A–Z)' },
  { value: 'name_desc',     label: 'নাম (Z–A)' },
  { value: 'purchase_desc', label: 'সর্বোচ্চ ক্রয় অনুযায়ী' },
  { value: 'po_count_desc', label: 'সর্বোচ্চ PO সংখ্যা অনুযায়ী' },
  { value: 'payable_desc',  label: 'সর্বোচ্চ বকেয়া অনুযায়ী' },
]

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [modal,    setModal]    = useState(null) // 'add' | 'edit'
  const [selected, setSelected] = useState(null)
  const [detailId,   setDetailId]   = useState(null) // সাপ্লায়ার ডিটেইল মোডাল
  const [poDetailId, setPoDetailId] = useState(null) // ডিটেইল থেকে ক্লিক করা PO-র মোডাল
  const [payModalSupplier, setPayModalSupplier] = useState(null) // ডিটেইল থেকে "পেমেন্ট করুন"-এ ক্লিক করা সাপ্লায়ার
  const [importOpen, setImportOpen] = useState(false)

  const [search,          setSearch]          = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort,            setSort]            = useState('name_asc')
  const [pagination,      setPagination]      = useState({ page: 1, limit: 20, total: 0 })

  // টাইপিং থামার ৪০০ms পর সার্চ প্রয়োগ হয় — প্রতি key-stroke-এ API কল এড়াতে
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400)
    return () => clearTimeout(t)
  }, [search])

  const fetchSuppliers = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ is_active: !showInactive, page, limit: pagination.limit, sort })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await api.get(`/suppliers?${params.toString()}`)
      setSuppliers(res.data.data)
      setPagination(res.data.pagination)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }, [showInactive, sort, debouncedSearch, pagination.limit])

  useEffect(() => { fetchSuppliers(1) }, [showInactive, sort, debouncedSearch])

  const openAdd  = () => { setSelected(null); setModal('add') }
  const openEdit = (s) => { setSelected(s); setModal('edit') }

  // SupplierFormModal সেভ শেষে এটা কল করে — নতুন এন্ট্রি হলে ১ম পাতায়, এডিট হলে বর্তমান পাতাতেই থাকে
  const handleSupplierChanged = (wasAdd) => fetchSuppliers(wasAdd ? 1 : pagination.page)

  const toggleActive = async (s) => {
    try {
      await api.put(`/suppliers/${s.id}`, { is_active: !s.is_active })
      toast.success(s.is_active ? 'নিষ্ক্রিয় করা হয়েছে।' : 'সক্রিয় করা হয়েছে।')
      fetchSuppliers(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const handleDelete = async (s) => {
    if (!window.confirm(`"${s.name}" ডিলিট করতে চান?`)) return
    try {
      await api.delete(`/suppliers/${s.id}`)
      toast.success('সাপ্লায়ার মুছে ফেলা হয়েছে।')
      fetchSuppliers(pagination.page)
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const columns = [
    {
      title: 'সাপ্লায়ার',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiTruck className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{row.name}</p>
            {row.contact_person && <p className="text-xs text-gray-400">{row.contact_person}</p>}
          </div>
        </div>
      )
    },
    {
      title: 'ধরন',
      render: (_, row) => {
        const cfg = SUPPLIER_TYPE_CFG[row.supplier_type] || SUPPLIER_TYPE_CFG.other
        return <Badge variant={cfg.variant} label={cfg.label} size="xs" />
      }
    },
    {
      title: 'যোগাযোগ',
      render: (_, row) => (
        <div className="space-y-0.5">
          {row.phone && <p className="text-xs flex items-center gap-1 text-gray-600 dark:text-gray-300"><FiPhone size={11} />{row.phone}</p>}
          {row.email && <p className="text-xs flex items-center gap-1 text-gray-400"><FiMail size={11} />{row.email}</p>}
          {!row.phone && !row.email && <span className="text-xs text-gray-300">—</span>}
        </div>
      )
    },
    {
      title: 'ক্রয় ইতিহাস',
      render: (_, row) => (
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{row.po_count} PO</p>
          <p className="text-xs text-secondary">৳{parseFloat(row.total_purchased || 0).toLocaleString()}</p>
        </div>
      )
    },
    {
      title: 'মোট বকেয়া',
      render: (_, row) => {
        const payable = Math.max(0, parseFloat(row.total_payable || 0))
        return payable > 0
          ? <span className="text-sm font-semibold text-red-600 dark:text-red-400">৳{payable.toLocaleString()}</span>
          : <span className="text-xs text-gray-300">—</span>
      }
    },
    {
      title: 'অবস্থা',
      render: (_, row) => <Badge variant={row.is_active ? 'active' : 'archived'} label={row.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} size="xs" />
    },
    {
      title: 'কার্যক্রম',
      render: (_, row) => (
        <div className="flex gap-1">
          <button onClick={() => setDetailId(row.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500" title="বিস্তারিত">
            <FiEye size={15} />
          </button>
          <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600" title="সম্পাদনা">
            <FiEdit size={15} />
          </button>
          <button
            onClick={() => toggleActive(row)}
            className={`p-1.5 rounded-lg ${row.is_active ? 'hover:bg-amber-50 text-amber-600' : 'hover:bg-emerald-50 text-emerald-600'}`}
            title={row.is_active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
          >
            {row.is_active ? <FiSlash size={15} /> : <FiCheckCircle size={15} />}
          </button>
          <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="ডিলিট">
            <FiTrash2 size={15} />
          </button>
        </div>
      )
    }
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">সাপ্লায়ার ব্যবস্থাপনা</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            {showInactive ? 'সক্রিয় দেখুন' : 'নিষ্ক্রিয় দেখুন'}
          </button>
          <Button icon={<FiUploadCloud />} variant="outline" onClick={() => setImportOpen(true)}>CSV ইম্পোর্ট</Button>
          <Button icon={<FiPlus />} onClick={openAdd}>নতুন সাপ্লায়ার</Button>
        </div>
      </div>

      {/* সার্চ + সর্ট */}
      <div className="flex flex-wrap gap-3">
        <Input
          icon={<FiSearch />}
          placeholder="নাম, ফোন বা যোগাযোগকারীর নাম দিয়ে খুঁজুন..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        <Select options={SORT_OPTIONS} value={sort} onChange={e => setSort(e.target.value)} className="w-56" />
      </div>

      <Table columns={columns} data={suppliers} loading={loading} emptyText="কোনো সাপ্লায়ার নেই।" />
      <Pagination
        page={pagination.page}
        totalPages={Math.max(1, Math.ceil(pagination.total / pagination.limit))}
        onChange={(p) => fetchSuppliers(p)}
      />

      <SupplierFormModal
        isOpen={modal === 'add' || modal === 'edit'}
        mode={modal}
        supplier={selected}
        onClose={() => setModal(null)}
        onChanged={handleSupplierChanged}
      />

      <SupplierDetailModal
        supplierId={detailId}
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        onEdit={(s) => { setDetailId(null); openEdit(s) }}
        onOpenPO={(poId) => { setDetailId(null); setPoDetailId(poId) }}
        onPay={(s) => { setDetailId(null); setPayModalSupplier(s) }}
      />

      <PurchaseOrderDetailModal
        poId={poDetailId}
        isOpen={!!poDetailId}
        onClose={() => setPoDetailId(null)}
        onChanged={() => fetchSuppliers(pagination.page)}
      />

      <SupplierPaymentModal
        isOpen={!!payModalSupplier}
        supplierId={payModalSupplier?.id}
        supplierName={payModalSupplier?.name}
        currentPayable={payModalSupplier?.total_payable}
        onClose={() => setPayModalSupplier(null)}
        onPaid={() => {
          const paidId = payModalSupplier?.id
          setPayModalSupplier(null)
          fetchSuppliers(pagination.page)
          if (paidId) setDetailId(paidId) // পেমেন্টের পর আপডেটেড বকেয়াসহ ডিটেইল ভিউ আবার খুলে যাবে
        }}
      />
      <SupplierImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => fetchSuppliers(1)}
      />
    </div>
  )
}
