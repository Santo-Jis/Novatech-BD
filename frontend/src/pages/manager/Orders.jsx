import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { FiCheck, FiX, FiPackage, FiEdit, FiAlertCircle } from 'react-icons/fi'

const REJECT_REASONS = [
  'স্টক অপ্রতুল',
  'অর্ডার পরিমাণ অতিরিক্ত',
  'পণ্যের দাম পরিবর্তিত',
  'ডুপ্লিকেট অর্ডার',
  'অন্যান্য',
]

export default function ManagerOrders() {
  const [orders,      setOrders]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(null)
  const [editItems,   setEditItems]   = useState([])
  const [approving,   setApproving]   = useState(false)
  const [rejectModal, setRejectModal] = useState(null)   // { id, orderId }
  const [rejectReason, setRejectReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [rejecting,   setRejecting]   = useState(false)

  const fetchOrders = async () => {
    try {
      const res = await api.get('/orders/pending')
      setOrders(res.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchOrders() }, [])

  const openApprove = (order) => {
    setEditItems(order.items.map(item => ({ ...item, approved_qty: item.approved_qty || item.requested_qty })))
    setModal(order)
  }

  const approve = async () => {
    setApproving(true)
    try {
      await api.put(`/orders/${modal.id}/approve`, { items: editItems })
      toast.success('অর্ডার অনুমোদন সফল।')
      setModal(null)
      fetchOrders()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setApproving(false) }
  }

  const openReject = (order) => {
    setRejectModal(order)
    setRejectReason('')
    setCustomReason('')
  }

  const confirmReject = async () => {
    const finalReason = rejectReason === 'অন্যান্য'
      ? customReason.trim()
      : rejectReason
    if (!finalReason) {
      toast.error('বাতিলের কারণ দিন।')
      return
    }
    setRejecting(true)
    try {
      await api.put(`/orders/${rejectModal.id}/reject`, { reason: finalReason })
      toast.success('অর্ডার বাতিল করা হয়েছে।')
      setRejectModal(null)
      fetchOrders()
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setRejecting(false) }
  }

  const totalApproved = editItems.reduce((sum, i) => sum + (i.price * i.approved_qty), 0)

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">পেন্ডিং অর্ডার</h1>
        <p className="text-sm text-gray-500">{orders.length}টি অর্ডার অনুমোদনের অপেক্ষায়</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-white rounded-2xl animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং অর্ডার নেই।</p></Card>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <Card key={order.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FiPackage className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-800">{order.worker_name}</p>
                      <span className="text-xs text-gray-400 font-mono">{order.employee_code}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(order.requested_at).toLocaleString()}
                    </p>

                    {/* Items preview */}
                    <div className="mt-2 space-y-1">
                      {order.items?.slice(0, 3).map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">{item.product_name}</span>
                          <span className="text-gray-400">×</span>
                          <span className="font-semibold text-primary">{item.requested_qty}</span>
                          <span className="text-gray-400">= ৳{(item.price * item.requested_qty).toLocaleString()}</span>
                        </div>
                      ))}
                      {order.items?.length > 3 && (
                        <p className="text-xs text-gray-400">+{order.items.length - 3} টি আরো...</p>
                      )}
                    </div>

                    <p className="mt-2 font-bold text-secondary">
                      মোট: ৳{parseInt(order.total_amount).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => openApprove(order)}
                    className="flex items-center gap-1 px-4 py-2 bg-secondary text-white rounded-xl text-sm font-semibold hover:bg-secondary-dark">
                    <FiEdit className="text-xs" /> পর্যালোচনা
                  </button>
                  <button onClick={() => openReject(order)}
                    className="flex items-center gap-1 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100">
                    <FiX className="text-xs" /> বাতিল
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Approval Modal */}
      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title="অর্ডার পর্যালোচনা ও অনুমোদন"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>বাতিল</Button>
            <Button onClick={approve} loading={approving} icon={<FiCheck />}>অনুমোদন দিন</Button>
          </>
        }
      >
        {modal && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p className="font-semibold">{modal.worker_name}</p>
              <p className="text-gray-500 text-xs">{new Date(modal.requested_at).toLocaleString()}</p>
            </div>

            <p className="text-sm text-gray-600">পরিমাণ পরিবর্তন করতে পারবেন:</p>

            <div className="space-y-3">
              {editItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{item.product_name}</p>
                    <p className="text-xs text-gray-400">৳{item.price} প্রতি পিস</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">চাহিদা: {item.requested_qty}</span>
                    <span className="text-gray-300">|</span>
                    <span className="text-xs text-gray-500">অনুমোদন:</span>
                    <input
                      type="number"
                      min="0"
                      max={item.requested_qty}
                      value={item.approved_qty}
                      onChange={e => {
                        const arr = [...editItems]
                        arr[i].approved_qty = parseInt(e.target.value) || 0
                        setEditItems(arr)
                      }}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
              <span>অনুমোদিত মোট:</span>
              <span className="text-secondary">৳{totalApproved.toLocaleString()}</span>
            </div>
          </div>
        )}
      </Modal>
      {/* Reject Reason Modal */}
      <Modal
        isOpen={!!rejectModal}
        onClose={() => setRejectModal(null)}
        title="অর্ডার বাতিলের কারণ"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectModal(null)}>বাতিল</Button>
            <Button
              onClick={confirmReject}
              loading={rejecting}
              icon={<FiX />}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              নিশ্চিত করুন
            </Button>
          </>
        }
      >
        {rejectModal && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-red-50 rounded-xl p-3">
              <FiAlertCircle className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                <span className="font-bold">{rejectModal.worker_name}</span>-এর অর্ডার বাতিল করছেন।
                SR-কে কারণ জানানো হবে।
              </p>
            </div>

            <div className="space-y-2">
              {REJECT_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => setRejectReason(reason)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    rejectReason === reason
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {rejectReason === reason ? '● ' : '○ '}{reason}
                </button>
              ))}
            </div>

            {rejectReason === 'অন্যান্য' && (
              <textarea
                autoFocus
                rows={3}
                placeholder="কারণ লিখুন..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none"
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
