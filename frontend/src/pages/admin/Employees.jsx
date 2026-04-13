import ResetPasswordModal from '../../components/ResetPasswordModal';
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import Table, { Pagination } from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input, { Select } from '../../components/ui/Input'
import { ConfirmModal } from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import {
  FiPlus, FiSearch, FiDownload,
  FiUserX, FiUserCheck, FiEye
} from 'react-icons/fi'

export default function AdminEmployees() {
  const navigate = useNavigate()
  const [resetEmp, setResetEmp] = useState(null)
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [page,      setPage]      = useState(1)
  const [total,     setTotal]     = useState(0)
  const [confirmModal, setConfirmModal] = useState(null)

  const LIMIT = 20

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page, limit: LIMIT,
        ...(search && { search }),
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { status: statusFilter })
      })
      const res = await api.get(`/employees?${params}`)
      setEmployees(res.data.data.employees)
      setTotal(res.data.data.total)
    } catch (err) {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEmployees() }, [page, roleFilter, statusFilter])

  useEffect(() => {
    const t = setTimeout(fetchEmployees, 500)
    return () => clearTimeout(t)
  }, [search])

  const handleSuspend = async (id, name) => {
    setConfirmModal({ id, name })
  }

  const confirmSuspend = async () => {
    try {
      await api.put(`/employees/${confirmModal.id}/suspend`, { reason: 'Admin কর্তৃক বরখাস্ত' })
      toast.success('কর্মচারী বরখাস্ত করা হয়েছে।')
      fetchEmployees()
    } catch {
      toast.error('সমস্যা হয়েছে।')
    } finally {
      setConfirmModal(null)
    }
  }

  const downloadPDF = async (id, code) => {
    try {
      const res = await api.get(`/reports/employee/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `employee_${code}.pdf`
      a.click()
    } catch {
      toast.error('PDF ডাউনলোডে সমস্যা হয়েছে।')
    }
  }

  const columns = [
    {
      title: 'কর্মচারী',
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {row.profile_photo
              ? <img src={row.profile_photo} alt="" className="w-full h-full object-cover" />
              : <span className="text-primary font-bold text-sm">{row.name_bn?.[0]}</span>
            }
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">{row.name_bn}</p>
            <p className="text-xs text-gray-400">{row.employee_code || 'কোড নেই'}</p>
          </div>
        </div>
      )
    },
    { title: 'পদবী', dataIndex: 'role', render: v => <Badge variant={v}>{v}</Badge> },
    { title: 'ফোন', dataIndex: 'phone', render: v => <span className="text-sm font-mono">{v}</span> },
    { title: 'যোগদান', dataIndex: 'join_date', render: v => new Date(v).toLocaleDateString('bn-BD') },
    { title: 'স্ট্যাটাস', dataIndex: 'status', render: v => <Badge variant={v} /> },
    {
      title: 'কার্যক্রম',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/admin/employees/${row.id}`)}
            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
            title="বিস্তারিত"
          >
            <FiEye />
          </button>
          <button
            onClick={() => downloadPDF(row.id, row.employee_code)}
            className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            title="PDF"
          >
            <FiDownload />
          </button>
          {row.status === 'active' && (
            <button
              onClick={() => handleSuspend(row.id, row.name_bn)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
              title="বরখাস্ত"
            >
              <FiUserX />
            </button>
          )}
        </div>
      )
    }
  ]

  const roleOptions = [
    { value: 'worker',     label: 'SR (Worker)' },
    { value: 'manager',    label: 'Manager' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'asm',        label: 'ASM' },
    { value: 'rsm',        label: 'RSM' },
    { value: 'accountant', label: 'Accountant' },
  ]

  const statusOptions = [
    { value: 'active',    label: 'সক্রিয়' },
    { value: 'pending',   label: 'পেন্ডিং' },
    { value: 'suspended', label: 'বরখাস্ত' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">কর্মচারী</h1>
          <p className="text-sm text-gray-500">মোট: {total} জন</p>
        </div>
        <Button icon={<FiPlus />} onClick={() => navigate('/admin/employees/new')}>
          নতুন কর্মচারী
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="নাম, কোড বা ফোন দিয়ে খুঁজুন"
              icon={<FiSearch />}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select
            options={roleOptions}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="w-40"
          />
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-36"
          />
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={employees}
        loading={loading}
        emptyText="কোনো কর্মচারী পাওয়া যায়নি।"
      />

      <Pagination
        page={page}
        totalPages={Math.ceil(total / LIMIT)}
        onChange={setPage}
      />

      {/* Confirm suspend */}
      <ConfirmModal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        onConfirm={confirmSuspend}
        title="কর্মচারী বরখাস্ত"
        message={`${confirmModal?.name} কে বরখাস্ত করবেন?`}
        confirmLabel="বরখাস্ত করুন"
        danger
      />
    </div>
  )
}
