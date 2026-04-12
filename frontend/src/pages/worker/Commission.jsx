import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { FiDollarSign } from 'react-icons/fi'

export default function Commission() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/commission/my')
      .then(res => setData(res.data.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  const summary = data?.summary || {}

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-bold text-gray-800 text-lg">কমিশন</h2>
      <div className="grid grid-cols-2 gap-3">
        {[
          ['মোট বিক্রয়', '৳' + parseInt(summary.total_sales || 0).toLocaleString()],
          ['দৈনিক কমিশন', '৳' + parseInt(summary.daily_commission || 0).toLocaleString()],
          ['বোনাস', '৳' + parseInt(summary.bonus || 0).toLocaleString()],
          ['মোট কমিশন', '৳' + parseInt(summary.total_commission || 0).toLocaleString()],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="font-bold text-gray-800 mt-1">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
