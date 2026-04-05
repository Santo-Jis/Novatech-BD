import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiCheck, FiAlertTriangle, FiEye, FiDollarSign } from 'react-icons/fi'

export default function ManagerSettlements() {
  const [settlements, setSettlements] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(null)
  const [detail,      setDetail]      = useState(null)
  const [shortageAmt, setShortageAmt] = useState('')
  const [saving,      setSaving]      = useState(false)

  const fetchSettlements = async () => {
    try {
      const res = await api.get('/settlements/pending')
      setSettlements(res.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSettlements() }, [])

  const viewDetail = async (settlement) => {
    try {
      const res = await api.get(`/settlements/${settlement.id}`)
      setDetail(res.data.data)
      setModal('detail')
    } catch { toast.error('বিস্তারিত আনতে সমস্যা।') }
  }

  const approve = async (id) => {
    setSaving(true)
    try {
      await api.put(`/settlements/${id}/approve`, { note: 'Manager হিসাব বুঝে পেয়েছেন।' })
      toast.success('হিসাব অনুমোদন সফল। SR এখন চেক-আউট করতে পারবে।')
      setModal(null)
      fetchSettlements()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const dispute = async (id) => {
    if (!shortageAmt || parseFloat(shortageAmt) <= 0) {
      toast.error('ঘাটতির পরিমাণ দিন।')
      return
    }
    setSaving(true)
    try {
      await api.put(`/settlements/${id}/dispute`, {
        shortage_value: parseFloat(shortageAmt),
        note: 'Manager কর্তৃক ঘাটতি চিহ্নিত।'
      })
      toast.success('ঘাটতি চিহ্নিত। SR এর বকেয়ায় যোগ হয়েছে।')
      setModal(null)
      setShortageAmt('')
      fetchSettlements()
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">হিসাব অনুমোদন</h1>
        <p className="text-sm text-gray-500">{settlements.length}টি হিসাব অপেক্ষায়</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : settlements.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং হিসাব নেই।</p></Card>
      ) : (
        <div className="space-y-4">
          {settlements.map(s => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800">{s.worker_name}</p>
                    <span className="text-xs text-gray-400 font-mono">{s.employee_code}</span>
                    {parseFloat(s.shortage_qty_value) > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        <FiAlertTriangle /> ঘাটতি: ৳{parseFloat(s.shortage_qty_value).toLocaleString('bn-BD')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{s.settlement_date}</p>

                  {/* Summary */}
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      ['মোট বিক্রয়', `৳${parseInt(s.total_sales_amount || 0).toLocaleString('bn-BD')}`, 'text-secondary'],
                      ['নগদ সংগ্রহ', `৳${parseInt(s.cash_collected || 0).toLocaleString('bn-BD')}`, 'text-primary'],
                      ['বাকি দেওয়া', `৳${parseInt(s.credit_given || 0).toLocaleString('bn-BD')}`, 'text-amber-600'],
                      ['রিপ্লেসমেন্ট', `৳${parseInt(s.replacement_value || 0).toLocaleString('bn-BD')}`, 'text-purple-600'],
                    ].map(([label, val, cls]) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-2 text-center">
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className={`font-bold text-sm ${cls}`}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button onClick={() => viewDetail(s)}
                    className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    <FiEye /> বিস্তারিত
                  </button>
                  <button onClick={() => approve(s.id)}
                    className="flex items-center gap-1 px-3 py-2 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary-dark">
                    <FiCheck /> অনুমোদন
                  </button>
                  <button onClick={() => { setDetail(s); setModal('dispute') }}
                    className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100">
                    <FiAlertTriangle /> ঘাটতি
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={modal === 'detail'} onClose={() => setModal(null)} title="হিসাবের বিস্তারিত" size="lg">
        {detail?.settlement && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {['পণ্য', 'নেওয়া', 'বিক্রি', 'রিপ্লেস', 'ফেরত', 'ঘাটতি', 'মূল্য'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.settlement.items_taken?.map((item, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium">{item.name}</td>
                      <td className="px-3 py-2">{item.taken_qty}</td>
                      <td className="px-3 py-2 text-secondary">{item.sold_qty}</td>
                      <td className="px-3 py-2 text-purple-600">{item.replacement_qty}</td>
                      <td className="px-3 py-2">{item.returned_qty}</td>
                      <td className="px-3 py-2">
                        {item.shortage_qty > 0
                          ? <span className="text-red-600 font-bold">{item.shortage_qty}</span>
                          : <span className="text-emerald-600">✅</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-red-500">
                        {item.shortage_value > 0 ? `৳${item.shortage_value}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
              <Button variant="ghost" onClick={() => setModal(null)}>বন্ধ করুন</Button>
              <Button onClick={() => approve(detail.settlement.id)} loading={saving} icon={<FiCheck />}>
                হিসাব বুঝে পেয়েছি
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Dispute Modal */}
      <Modal isOpen={modal === 'dispute'} onClose={() => { setModal(null); setShortageAmt('') }}
        title="ঘাটতি চিহ্নিত করুন" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            ঘাটতির পরিমাণ নিশ্চিত করুন। এটি SR এর বকেয়ায় যোগ হবে।
          </p>
          <div className="bg-amber-50 rounded-xl p-3 text-sm">
            <p className="text-amber-700 font-semibold">
              সিস্টেম হিসাব: ৳{parseFloat(detail?.shortage_qty_value || 0).toLocaleString('bn-BD')}
            </p>
          </div>
          <Input
            label="চূড়ান্ত ঘাটতির পরিমাণ (৳)"
            type="number"
            value={shortageAmt}
            onChange={e => setShortageAmt(e.target.value)}
            placeholder={detail?.shortage_qty_value || '0'}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setModal(null); setShortageAmt('') }}>বাতিল</Button>
            <Button variant="danger" onClick={() => dispute(detail?.id)} loading={saving} icon={<FiAlertTriangle />}>
              ঘাটতি নিশ্চিত করুন
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
