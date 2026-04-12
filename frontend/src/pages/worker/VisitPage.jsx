import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { FiUser, FiPhone, FiMapPin, FiShoppingCart, FiDollarSign } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function VisitPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/customers/${id}`)
      .then(res => setCustomer(res.data.data))
      .finally(() => setLoading(false))
  }, [id])

  const handleVisit = async () => {
    try {
      await api.post(`/sales/visit`, { customer_id: id })
      toast.success('ভিজিট রেকর্ড হয়েছে ✅')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    }
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>
  if (!customer) return <div className="p-4 text-center text-gray-500">কাস্টমার পাওয়া যায়নি</div>

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h2 className="font-bold text-lg text-gray-800">{customer.shop_name}</h2>
        <p className="text-sm text-gray-500">{customer.owner_name}</p>
        <div className="mt-3 space-y-2">
          {customer.phone && <p className="text-sm flex items-center gap-2"><FiPhone className="text-gray-400" />{customer.phone}</p>}
          {customer.address && <p className="text-sm flex items-center gap-2"><FiMapPin className="text-gray-400" />{customer.address}</p>}
        </div>
        {parseFloat(customer.current_credit || 0) > 0 && (
          <div className="mt-3 bg-red-50 rounded-xl p-3">
            <p className="text-sm text-red-600">বকেয়া: ৳{parseInt(customer.current_credit).toLocaleString()}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate(`/worker/sales/${id}`)}
          className="bg-primary text-white rounded-2xl p-4 flex flex-col items-center gap-2">
          <FiShoppingCart className="text-2xl" />
          <span className="text-sm font-semibold">বিক্রয় করুন</span>
        </button>
        <button onClick={handleVisit}
          className="bg-white border border-gray-200 text-gray-700 rounded-2xl p-4 flex flex-col items-center gap-2">
          <FiUser className="text-2xl" />
          <span className="text-sm font-semibold">ভিজিট</span>
        </button>
      </div>
    </div>
  )
}
