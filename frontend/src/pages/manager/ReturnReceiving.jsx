import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiPackage, FiCheck, FiAlertTriangle, FiX } from 'react-icons/fi'

export default function ReturnReceiving() {
  const [pending, setPending] = useState([])
  const [discrepancies, setDiscrepancies] = useState([])
  const [loading, setLoading] = useState(true)
  const [qtyInputs, setQtyInputs] = useState({})     // { [id]: qty_received string }
  const [noteInputs, setNoteInputs] = useState({})   // { [id]: note string } - receive-er jonno
  const [resolveNotes, setResolveNotes] = useState({}) // { [id]: note string } - charge/waive-er jonno
  const [savingId, setSavingId] = useState(null)

  const fetchAll = async () => {
    try {
      const [pendingRes, discrepancyRes] = await Promise.all([
        api.get('/settlement-returns/pending'),
        api.get('/settlement-returns/discrepancies'),
      ])
      setPending(pendingRes.data.data)
      setDiscrepancies(discrepancyRes.data.data)

      // ডিফল্ট হিসেবে qty_received = qty_claimed বসিয়ে রাখা — বেশিরভাগ সময়
      // যা claim করা হয়েছে ঠিক ততটাই physically আসে, manager শুধু গুনে
      // মিলিয়ে confirm করবে; না মিললে সংখ্যাটা বদলে দেবে।
      const defaults = {}
      pendingRes.data.data.forEach(r => { defaults[r.id] = String(r.qty_claimed) })
      setQtyInputs(defaults)
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const receive = async (item) => {
    const qty = parseInt(qtyInputs[item.id])
    if (isNaN(qty) || qty < 0) {
      toast.error('সঠিক পরিমাণ লিখুন।')
      return
    }
    setSavingId(item.id)
    try {
      const res = await api.post(`/settlement-returns/${item.id}/receive`, {
        qty_received: qty,
        note: noteInputs[item.id] || undefined,
      })
      toast.success(res.data.message || 'গৃহীত হয়েছে।')
      setPending(prev => prev.filter(r => r.id !== item.id))
      // qty != claim hole eita discrepancy queue-te chole jabe - reload kore ani
      if (qty !== item.qty_claimed) fetchAll()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSavingId(null)
    }
  }

  const resolve = async (item, action) => {
    setSavingId(item.id)
    try {
      const res = await api.post(`/settlement-returns/${item.id}/resolve-discrepancy`, {
        action,
        note: resolveNotes[item.id] || undefined,
      })
      toast.success(res.data.message || 'সিদ্ধান্ত সংরক্ষিত হয়েছে।')
      setDiscrepancies(prev => prev.filter(r => r.id !== item.id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">সেটেলমেন্ট ফেরত গ্রহণ</h1>
        <p className="text-sm text-gray-500">
          SR-রা যা "ফেরত" দেখিয়েছে, গুদামে গুনে মিলিয়ে এখানে confirm করলেই stock আপডেট হবে।
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
              গ্রহণের অপেক্ষায় ({pending.length})
            </h2>

            {pending.length === 0 ? (
              <Card>
                <p className="text-center text-gray-400 py-6 text-sm">
                  <FiPackage className="inline-block mb-2" size={24} /><br />
                  গ্রহণের অপেক্ষায় কোনো ফেরত নেই।
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {pending.map(item => {
                  const qty = qtyInputs[item.id] ?? ''
                  const mismatch = qty !== '' && parseInt(qty) !== item.qty_claimed
                  return (
                    <Card key={item.id}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-800">{item.worker_name}</p>
                            <span className="text-xs text-gray-400 font-mono">{item.employee_code}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{item.product_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(item.created_at).toLocaleDateString('bn-BD')}
                          </p>
                          <div className="mt-2 inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
                            claim করেছে: {item.qty_claimed} পিস
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 w-full sm:w-56">
                          <Input
                            label="physically পাওয়া গেছে"
                            type="number"
                            min="0"
                            value={qty}
                            onChange={e => setQtyInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                          />
                          {mismatch && (
                            <div className="flex items-start gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded-lg">
                              <FiAlertTriangle className="mt-0.5 flex-shrink-0" size={12} />
                              <span>claim-এর সাথে মিলছে না — discrepancy হিসেবে flag হবে।</span>
                            </div>
                          )}
                          {mismatch && (
                            <Input
                              placeholder="কারণ (ঐচ্ছিক)"
                              value={noteInputs[item.id] || ''}
                              onChange={e => setNoteInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                            />
                          )}
                          <Button
                            variant="secondary"
                            icon={<FiCheck />}
                            loading={savingId === item.id}
                            onClick={() => receive(item)}
                          >
                            গ্রহণ করুন
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
              সিদ্ধান্ত দরকার ({discrepancies.length})
            </h2>

            {discrepancies.length === 0 ? (
              <Card>
                <p className="text-center text-gray-400 py-6 text-sm">
                  কোনো discrepancy সিদ্ধান্তের অপেক্ষায় নেই।
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {discrepancies.map(item => (
                  <Card key={item.id} className="border-l-4 border-l-amber-400">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-800">{item.worker_name}</p>
                        <span className="text-xs text-gray-400 font-mono">{item.employee_code}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{item.product_name}</p>

                      <div className="mt-2 flex gap-4 text-xs text-gray-600 flex-wrap">
                        <span>claim: <b>{item.qty_claimed}</b></span>
                        <span>পাওয়া গেছে: <b>{item.qty_received}</b></span>
                        <span className="text-red-600">শর্টফল: <b>{item.shortfall_qty} পিস (৳{Number(item.shortfall_value).toFixed(0)})</b></span>
                      </div>

                      <Input
                        placeholder="নোট (ঐচ্ছিক) — কেন charge/waive করছেন"
                        className="mt-3"
                        value={resolveNotes[item.id] || ''}
                        onChange={e => setResolveNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                      />

                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<FiAlertTriangle />}
                          loading={savingId === item.id}
                          onClick={() => resolve(item, 'charge')}
                        >
                          চার্জ করুন (SR-এর দায়)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<FiX />}
                          loading={savingId === item.id}
                          onClick={() => resolve(item, 'waive')}
                        >
                          মওকুফ করুন
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
