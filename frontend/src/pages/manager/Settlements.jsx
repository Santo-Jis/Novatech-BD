import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiCheck, FiAlertTriangle, FiEye, FiDollarSign, FiLock } from 'react-icons/fi'

export default function ManagerSettlements() {
  const [settlements, setSettlements] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(null)
  const [detail,      setDetail]      = useState(null)
  const [shortageAmt,      setShortageAmt]      = useState('')
  const [overrideUnlocked, setOverrideUnlocked] = useState(false)
  const [overrideReason,   setOverrideReason]   = useState('')
  const [saving,           setSaving]           = useState(false)

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
      const res = await api.put(`/settlements/${id}/approve`, { note: 'Manager হিসাব বুঝে পেয়েছেন।' })
      const cashShortfall = res.data?.cashShortfall || 0
      toast.success(cashShortfall > 0
        ? `অনুমোদন সফল। ৳${Math.round(cashShortfall)} নগদ ঘাটতি SR এর বকেয়ায় গেছে।`
        : 'হিসাব অনুমোদন সফল। SR এখন চেক-আউট করতে পারবে।'
      )
      setModal(null)
      fetchSettlements()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const dispute = async (id) => {
    const systemValue  = parseFloat(detail?.shortage_qty_value || 0)
    const enteredValue = parseFloat(shortageAmt || 0)

    if (enteredValue > systemValue) {
      toast.error(`সিস্টেম গণনার চেয়ে বেশি দেওয়া যাবে না। সর্বোচ্চ: ৳${systemValue.toLocaleString()}`)
      return
    }
    if (overrideUnlocked && enteredValue !== systemValue && !overrideReason.trim()) {
      toast.error('পরিমাণ পরিবর্তনের কারণ লিখুন।')
      return
    }
    setSaving(true)
    try {
      const payload = {
        shortage_value: enteredValue,
        note: 'Manager কর্তৃক ঘাটতি চিহ্নিত।',
        ...(overrideUnlocked && enteredValue !== systemValue && {
          override_reason: overrideReason.trim()
        })
      }
      const res = await api.put(`/settlements/${id}/dispute`, payload)
      toast.success(res.data?.message || 'ঘাটতি চিহ্নিত। SR এর বকেয়ায় যোগ হয়েছে।')
      setModal(null)
      setShortageAmt('')
      setOverrideUnlocked(false)
      setOverrideReason('')
      fetchSettlements()
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  // cash_difference < 0 → SR কম দিয়েছে
  const cashShortfall = (s) => {
    const diff = parseFloat(s?.cash_difference || 0)
    return diff < 0 ? Math.abs(diff) : 0
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800">{s.worker_name}</p>
                    <span className="text-xs text-gray-400 font-mono">{s.employee_code}</span>
                    {parseFloat(s.shortage_qty_value) > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        <FiAlertTriangle /> পণ্য ঘাটতি: ৳{parseFloat(s.shortage_qty_value).toLocaleString()}
                      </span>
                    )}
                    {cashShortfall(s) > 0 && (
                      <span className="flex items-center gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                        <FiLock size={10} /> নগদ ঘাটতি: ৳{Math.round(cashShortfall(s)).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{s.settlement_date}</p>

                  {/* Summary */}
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      ['মোট বিক্রয়', `৳${parseInt(s.total_sales_amount || 0).toLocaleString()}`, 'text-secondary'],
                      ['নগদ সংগ্রহ', `৳${parseInt(s.cash_collected || 0).toLocaleString()}`, 'text-primary'],
                      ['বাকি দেওয়া', `৳${parseInt(s.credit_given || 0).toLocaleString()}`, 'text-amber-600'],
                      ['রিপ্লেসমেন্ট', `৳${parseInt(s.replacement_value || 0).toLocaleString()}`, 'text-purple-600'],
                    ].map(([label, val, cls]) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-2 text-center">
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className={`font-bold text-sm ${cls}`}>{val}</p>
                      </div>
                    ))}
                  </div>

                  {/* নগদ পার্থক্যের ব্যাখ্যা (SR দিয়েছে) */}
                  {s.mismatch_explanation && (
                    <div className="mt-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                      <p className="text-xs text-orange-600 font-semibold mb-0.5">SR এর ব্যাখ্যা:</p>
                      <p className="text-xs text-orange-800">{s.mismatch_explanation}</p>
                    </div>
                  )}
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
                  <button onClick={() => {
                      setDetail(s)
                      setShortageAmt(parseFloat(s.shortage_qty_value || 0).toString())
                      setOverrideUnlocked(false)
                      setOverrideReason('')
                      setModal('dispute')
                    }}
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
            {/* নগদ ঘাটতি সতর্কতা */}
            {cashShortfall(detail.settlement) > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2">
                <FiLock className="text-orange-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-orange-700">
                    নগদ ঘাটতি ৳{Math.round(cashShortfall(detail.settlement)).toLocaleString()}
                  </p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    অনুমোদন করলে এই টাকা SR এর বকেয়ায় স্বয়ংক্রিয়ভাবে যোগ হবে।
                  </p>
                  {detail.settlement.mismatch_explanation && (
                    <p className="text-xs text-orange-800 mt-1 italic">
                      SR এর ব্যাখ্যা: "{detail.settlement.mismatch_explanation}"
                    </p>
                  )}
                </div>
              </div>
            )}

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
      <Modal isOpen={modal === 'dispute'} onClose={() => { setModal(null); setShortageAmt(''); setOverrideUnlocked(false); setOverrideReason('') }}
        title="ঘাটতি চিহ্নিত করুন" size="sm">
        {(() => {
          const systemValue  = parseFloat(detail?.shortage_qty_value || 0)
          const enteredValue = parseFloat(shortageAmt || 0)
          const isModified   = overrideUnlocked && enteredValue !== systemValue

          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                পণ্য ঘাটতি + নগদ ঘাটতি উভয়ই SR এর বকেয়ায় যোগ হবে।
              </p>

              {cashShortfall(detail) > 0 && (
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-xs text-orange-700">
                  <p className="font-semibold mb-1">নগদ ঘাটতি (স্বয়ংক্রিয়):</p>
                  <p>৳{Math.round(cashShortfall(detail)).toLocaleString()} — এটি আলাদাভাবে বকেয়ায় যাবে।</p>
                </div>
              )}

              {/* Locked system value */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    সিস্টেম গণনা (পণ্য ঘাটতি)
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <FiLock size={10} /> স্বয়ংক্রিয়
                  </span>
                </div>
                <div className="px-3 py-3 flex items-center justify-between">
                  <span className="text-xl font-bold text-red-600">
                    ৳{systemValue.toLocaleString()}
                  </span>
                  {!overrideUnlocked ? (
                    <button
                      onClick={() => setOverrideUnlocked(true)}
                      className="text-xs text-gray-400 hover:text-amber-600 underline underline-offset-2 transition-colors"
                    >
                      পরিমাণ পরিবর্তন করবেন?
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setOverrideUnlocked(false)
                        setShortageAmt(systemValue.toString())
                        setOverrideReason('')
                      }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                    >
                      পূর্বাবস্থায় ফিরুন
                    </button>
                  )}
                </div>
              </div>

              {/* Override section */}
              {overrideUnlocked && (
                <div className="space-y-3 border border-amber-200 bg-amber-50 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <FiAlertTriangle className="text-amber-500 flex-shrink-0" size={14} />
                    <p className="text-xs text-amber-700 font-semibold">
                      পরিবর্তন করলে Admin audit log-এ রেকর্ড হবে।
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">
                      সংশোধিত পরিমাণ (৳) — সর্বোচ্চ ৳{systemValue.toLocaleString()}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={systemValue}
                      value={shortageAmt}
                      onChange={e => setShortageAmt(e.target.value)}
                      className="w-full border border-amber-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white"
                    />
                    {enteredValue > systemValue && (
                      <p className="text-xs text-red-500 mt-1">
                        সিস্টেম গণনার চেয়ে বেশি দেওয়া যাবে না।
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">
                      পরিবর্তনের কারণ <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder="কেন সিস্টেম মান থেকে কম দেওয়া হচ্ছে..."
                      className="w-full border border-amber-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white resize-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => { setModal(null); setShortageAmt(''); setOverrideUnlocked(false); setOverrideReason('') }}>
                  বাতিল
                </Button>
                <Button
                  variant="danger"
                  onClick={() => dispute(detail?.id)}
                  loading={saving}
                  icon={<FiAlertTriangle />}
                  disabled={overrideUnlocked && isModified && !overrideReason.trim()}
                >
                  ঘাটতি নিশ্চিত করুন
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
