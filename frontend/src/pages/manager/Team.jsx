import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import { FiSearch, FiUser, FiPhone, FiDollarSign, FiDownload } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function ManagerTeam() {
  const navigate         = useNavigate()
  const [workers,  setWorkers]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    api.get('/employees?role=worker&status=active')
      .then(res => setWorkers(res.data.data.employees))
      .catch(() => toast.error('তথ্য আনতে সমস্যা হয়েছে।'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = workers.filter(w =>
    w.name_bn.includes(search) ||
    w.employee_code?.includes(search) ||
    w.phone?.includes(search)
  )

  const downloadPDF = async (id, code) => {
    try {
      const res = await api.get(`/reports/employee/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `employee_${code}.pdf`
      a.click()
    } catch { toast.error('PDF ডাউনলোডে সমস্যা।') }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-40 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">আমার টিম</h1>
          <p className="text-sm text-gray-500">মোট SR: {workers.length} জন</p>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="নাম, কোড বা ফোন দিয়ে খুঁজুন"
        icon={<FiSearch />}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Worker Cards */}
      {filtered.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-8">কোনো SR পাওয়া যায়নি।</p></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(worker => (
            <div key={worker.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">

              {/* Header */}
              <div className="bg-gradient-to-r from-secondary to-secondary-light p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {worker.profile_photo
                    ? <img src={worker.profile_photo} alt="" className="w-full h-full object-cover" />
                    : <FiUser className="text-white text-xl" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">{worker.name_bn}</p>
                  <p className="text-white/70 text-xs font-mono">{worker.employee_code}</p>
                </div>
                <Badge variant="active" />
              </div>

              {/* Info */}
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FiPhone className="text-gray-400" />
                  <span>{worker.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FiDollarSign className="text-gray-400" />
                  <span>বেতন: ৳{parseInt(worker.basic_salary || 0).toLocaleString('bn-BD')}</span>
                </div>
                {parseFloat(worker.outstanding_dues || 0) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    <span>বকেয়া: ৳{parseFloat(worker.outstanding_dues).toLocaleString('bn-BD')}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 flex gap-2">
                <button
                  onClick={() => navigate(`/admin/employees/${worker.id}`)}
                  className="flex-1 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  বিস্তারিত
                </button>
                <button
                  onClick={() => downloadPDF(worker.id, worker.employee_code)}
                  className="p-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                  title="PDF"
                >
                  <FiDownload />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
