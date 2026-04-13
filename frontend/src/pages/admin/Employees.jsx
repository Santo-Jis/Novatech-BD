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
      const res  = await api.get(`/employees/${id}`)
      const emp  = res.data.data

      const parseJ = (val, fallback) => {
        if (!val) return fallback
        if (typeof val === 'string') { try { return JSON.parse(val) } catch { return fallback } }
        return val
      }
      const education         = parseJ(emp.education, [])
      const experience        = parseJ(emp.experience, [])
      const emergency_contact = parseJ(emp.emergency_contact, {})

      const fmtDate = (d) => {
        if (!d) return 'N/A'
        try { return new Date(d).toLocaleDateString('bn-BD') } catch { return d }
      }
      const fmtSalary = (v) => v ? `৳${Number(v).toLocaleString('bn-BD')}` : 'N/A'

      const eduRows = education.map(e =>
        `<tr><td>${e.exam||''}</td><td>${e.board||''}</td><td>${e.year||''}</td><td>${e.gpa||''}</td></tr>`
      ).join('')

      const expRows = experience.map(e =>
        `<tr><td>${e.company||''}</td><td>${e.position||''}</td><td>${e.duration||''}</td></tr>`
      ).join('')

      const html = `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8"/>
<title>Employee_${emp.employee_code||emp.id}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Hind Siliguri',sans-serif; color:#1a1a1a; background:#fff; padding:30px; font-size:13px; }
  .header { text-align:center; border-bottom:2px solid #1e3a8a; padding-bottom:12px; margin-bottom:18px; }
  .header h1 { font-size:20px; font-weight:700; color:#1e3a8a; }
  .header p  { font-size:11px; color:#555; margin-top:3px; }
  .title { text-align:center; font-size:15px; font-weight:700; color:#1e3a8a; margin-bottom:18px; letter-spacing:1px; }
  .section { margin-bottom:16px; }
  .section-title { font-size:13px; font-weight:700; color:#1e3a8a; border-bottom:1px solid #dde3f0; padding-bottom:4px; margin-bottom:8px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; }
  .row { display:flex; gap:6px; }
  .label { font-weight:600; color:#444; min-width:130px; flex-shrink:0; }
  .value { color:#222; }
  table { width:100%; border-collapse:collapse; margin-top:6px; font-size:12px; }
  th { background:#1e3a8a; color:#fff; padding:5px 8px; text-align:left; }
  td { padding:4px 8px; border-bottom:1px solid #eee; }
  tr:nth-child(even) td { background:#f6f8ff; }
  .footer { margin-top:24px; border-top:1px solid #dde3f0; padding-top:8px; text-align:center; font-size:10px; color:#888; }
  @media print { body { padding:15px; } }
</style>
</head>
<body>
<div class="header">
  <h1>NovaTech BD (Ltd.)</h1>
  <p>জানকি সিংহ রোড, বরিশাল সদর, বরিশাল – ১২০০</p>
  <p>inf.novatechbd@gmail.com | +880 1309 540 282</p>
</div>
<div class="title">কর্মচারী প্রোফাইল</div>

<div class="section">
  <div class="section-title">ব্যক্তিগত তথ্য</div>
  <div class="grid">
    <div class="row"><span class="label">কর্মচারী কোড:</span><span class="value">${emp.employee_code||'N/A'}</span></div>
    <div class="row"><span class="label">নাম (বাংলা):</span><span class="value">${emp.name_bn||'N/A'}</span></div>
    <div class="row"><span class="label">নাম (ইংরেজি):</span><span class="value">${emp.name_en||'N/A'}</span></div>
    <div class="row"><span class="label">পদবী:</span><span class="value">${(emp.role||'').toUpperCase()}</span></div>
    <div class="row"><span class="label">পিতার নাম:</span><span class="value">${emp.father_name||'N/A'}</span></div>
    <div class="row"><span class="label">মাতার নাম:</span><span class="value">${emp.mother_name||'N/A'}</span></div>
    <div class="row"><span class="label">জন্ম তারিখ:</span><span class="value">${fmtDate(emp.dob)}</span></div>
    <div class="row"><span class="label">লিঙ্গ:</span><span class="value">${emp.gender||'N/A'}</span></div>
    <div class="row"><span class="label">বৈবাহিক অবস্থা:</span><span class="value">${emp.marital_status||'N/A'}</span></div>
    <div class="row"><span class="label">NID:</span><span class="value">${emp.nid||'N/A'}</span></div>
    <div class="row"><span class="label">ফোন:</span><span class="value">${emp.phone||'N/A'}</span></div>
    <div class="row"><span class="label">ফোন ২:</span><span class="value">${emp.phone2||'N/A'}</span></div>
    <div class="row"><span class="label">ইমেইল:</span><span class="value">${emp.email||'N/A'}</span></div>
    <div class="row"><span class="label">যোগদানের তারিখ:</span><span class="value">${fmtDate(emp.join_date)}</span></div>
    <div class="row"><span class="label">মূল বেতন:</span><span class="value">${fmtSalary(emp.basic_salary)}</span></div>
  </div>
</div>

<div class="section">
  <div class="section-title">ঠিকানা</div>
  <div class="grid">
    <div class="row"><span class="label">স্থায়ী ঠিকানা:</span><span class="value">${emp.permanent_address||'N/A'}</span></div>
    <div class="row"><span class="label">বর্তমান ঠিকানা:</span><span class="value">${emp.current_address||'N/A'}</span></div>
    <div class="row"><span class="label">জেলা:</span><span class="value">${emp.district||'N/A'}</span></div>
    <div class="row"><span class="label">থানা:</span><span class="value">${emp.thana||'N/A'}</span></div>
  </div>
</div>

${education.length > 0 ? `
<div class="section">
  <div class="section-title">শিক্ষাগত যোগ্যতা</div>
  <table>
    <thead><tr><th>পরীক্ষা</th><th>বোর্ড</th><th>সাল</th><th>GPA</th></tr></thead>
    <tbody>${eduRows}</tbody>
  </table>
</div>` : ''}

${experience.length > 0 ? `
<div class="section">
  <div class="section-title">কর্মঅভিজ্ঞতা</div>
  <table>
    <thead><tr><th>প্রতিষ্ঠান</th><th>পদবী</th><th>সময়কাল</th></tr></thead>
    <tbody>${expRows}</tbody>
  </table>
</div>` : ''}

${emergency_contact?.name ? `
<div class="section">
  <div class="section-title">জরুরি যোগাযোগ</div>
  <div class="grid">
    <div class="row"><span class="label">নাম:</span><span class="value">${emergency_contact.name||'N/A'}</span></div>
    <div class="row"><span class="label">সম্পর্ক:</span><span class="value">${emergency_contact.relation||'N/A'}</span></div>
    <div class="row"><span class="label">ফোন:</span><span class="value">${emergency_contact.phone||'N/A'}</span></div>
    <div class="row"><span class="label">ঠিকানা:</span><span class="value">${emergency_contact.address||'N/A'}</span></div>
  </div>
</div>` : ''}

<div class="footer">
  Generated: ${new Date().toLocaleString('bn-BD')} | NovaTech BD (Ltd.)
</div>
</body>
</html>`

      const win = window.open('', '_blank', 'width=800,height=900')
      win.document.write(html)
      win.document.close()
      win.onload = () => { win.focus(); win.print() }

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
