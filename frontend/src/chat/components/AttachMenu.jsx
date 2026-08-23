// chat/components/AttachMenu.jsx
//
// "+" বাটন — শুধু staff-side ConversationPane এ রেন্ডার হয় (customerId prop
// দিলেই দেখা যায়)। কার্ডের লাইভ ডেটা fetch করে onAttach(cardType, payload,
// previewText) কল করে — বাকিটা useChatEngine.sendCard() সামলায়।

import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { FiPlus, FiCreditCard, FiTruck } from 'react-icons/fi'

export default function AttachMenu({ chatApi, customerId, onAttach, accent }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const attach = async (type) => {
    setError('')
    setLoading(type)
    try {
      if (type === 'due') {
        const data = await chatApi.getDueCard(customerId)
        onAttach('due', data, `বাকির তথ্য শেয়ার করা হয়েছে · ৳${Number(data.current_credit || 0).toLocaleString('bn-BD')}`)
      } else if (type === 'delivery') {
        const list = await chatApi.getDeliveries(customerId)
        if (!list.length) {
          setError('এই কাস্টমারের কোনো ডেলিভারি রেকর্ড নেই')
          setLoading(null)
          return
        }
        onAttach('delivery', list[0], 'ডেলিভারি স্ট্যাটাস শেয়ার করা হয়েছে')
      }
      setOpen(false)
    } catch (e) {
      setError('তথ্য আনতে সমস্যা হয়েছে, আবার চেষ্টা করুন')
      console.error('[chat] attach card error:', e.message)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative flex-shrink-0" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label="কার্ড যোগ করুন"
        className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90',
          open ? (accent === 'warmth' ? 'bg-cp-warmth-600 text-white' : 'bg-cp-trust-500 text-white') : 'bg-cp-bg-sunken text-cp-text-secondary'
        )}
      >
        <FiPlus size={17} className={clsx('transition-transform', open && 'rotate-45')} />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 w-52 bg-white rounded-2xl border border-cp-border shadow-lg overflow-hidden z-20">
          <button
            onClick={() => attach('due')}
            disabled={loading !== null}
            type="button"
            className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-cp-bg-alt disabled:opacity-50"
          >
            <span className="w-7 h-7 rounded-lg bg-cp-trust-100 text-cp-trust-700 flex items-center justify-center flex-shrink-0">
              <FiCreditCard size={13} />
            </span>
            <span className="text-[13px] font-medium text-cp-text-primary">বাকির তথ্য পাঠান</span>
            {loading === 'due' && <span className="ml-auto w-3.5 h-3.5 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />}
          </button>
          <button
            onClick={() => attach('delivery')}
            disabled={loading !== null}
            type="button"
            className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-cp-bg-alt disabled:opacity-50 border-t border-cp-border"
          >
            <span className="w-7 h-7 rounded-lg bg-cp-warmth-100 text-cp-warmth-700 flex items-center justify-center flex-shrink-0">
              <FiTruck size={13} />
            </span>
            <span className="text-[13px] font-medium text-cp-text-primary">ডেলিভারি স্ট্যাটাস পাঠান</span>
            {loading === 'delivery' && <span className="ml-auto w-3.5 h-3.5 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />}
          </button>
          {error && <p className="px-3.5 pb-2.5 text-[11px] text-cp-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
