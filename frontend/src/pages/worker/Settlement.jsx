import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { FiDollarSign, FiSend } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function Settlement() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [cashAmount, setCashAmount] = useState('')

  useEffect(() => {
    api.get('/settlements/my')
      .then(res => setData(res.data.data))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async () => {
    if (!cashAmount) return toast.error('নগদ পরিমাণ দিন')
    setSubmitting(true)
    try {
      await api.post('/settlements', { cash_collected: parseFloat(cashAmount) })
      toast.success('হিসাব জমা দেওয়া হয়েছে ✅')
      setCashAmount('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে')
    } finally {
      setSubmitting(false) }
  }

  if (loading) return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-bold text-gray-800 text-lg">হিসাব জমা</h2>
      {data && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          {[
            ['মোট বিক্রয়', '৳' + parseInt(data.total_sales || 0).toLocaleString()],
            ['নগদ সংগ্রহ', '৳' + parseInt(data.cash_collected || 0).toLocaleString()],
            ['বাকি দেওয়া', '৳' + parseInt(data.credit_given || 0).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm font-bold">{value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="text-sm text-gray-600 mb-2 block">নগদ জমার পরিমাণ (৳)</label>
        <input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)}
          placeholder="0" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none mb-3" />
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
          {submitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSend />}
          জমা দিন
        </button>
      </div>
    </div>
  )
}
