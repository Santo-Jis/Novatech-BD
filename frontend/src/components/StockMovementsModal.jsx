// StockMovementsModal.jsx
// Products/:id/movements — স্টক মুভমেন্ট ইতিহাস modal
// Usage: <StockMovementsModal productId={id} productName={name} isOpen={open} onClose={fn} />

import { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Badge from './ui/Badge'
import { FiTrendingUp, FiTrendingDown, FiMinus, FiPackage } from 'react-icons/fi'

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('bn-BD', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const MOVEMENT_CONFIG = {
  in:  { label: 'যোগ',  icon: <FiTrendingUp  size={13} />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', badge: 'approved' },
  out: { label: 'বাদ',  icon: <FiTrendingDown size={13} />, color: 'text-red-500',     bg: 'bg-red-50    dark:bg-red-900/20',    badge: 'rejected' },
  adj: { label: 'এডজাস্ট', icon: <FiMinus size={13} />,   color: 'text-amber-600',   bg: 'bg-amber-50  dark:bg-amber-900/20', badge: 'pending'  },
}

const REF_TYPE_LABELS = {
  sale:         'বিক্রয়',
  return:       'রিটার্ন',
  manual:       'ম্যানুয়াল',
  purchase:     'ক্রয়',
  initial:      'প্রারম্ভিক',
  transfer:     'ট্রান্সফার',
  damage:       'ক্ষতিগ্রস্ত',
  adjustment:   'সমন্বয়',
}

export default function StockMovementsModal({ productId, productName, isOpen, onClose }) {
  const [movements, setMovements] = useState([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!isOpen || !productId) return
    setLoading(true)
    api.get(`/products/${productId}/movements`)
      .then(res => setMovements(res.data.data || []))
      .catch(() => setMovements([]))
      .finally(() => setLoading(false))
  }, [isOpen, productId])

  // Summary
  const totalIn  = movements.filter(m => m.movement_type === 'in' ).reduce((s, m) => s + parseInt(m.quantity || 0), 0)
  const totalOut = movements.filter(m => m.movement_type === 'out').reduce((s, m) => s + parseInt(m.quantity || 0), 0)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`স্টক মুভমেন্ট — ${productName || ''}`} size="lg">
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : movements.length === 0 ? (
        <div className="py-16 text-center">
          <FiPackage className="mx-auto text-4xl text-gray-300 dark:text-slate-600 mb-3" />
          <p className="text-gray-400 dark:text-gray-500 text-sm">কোনো মুভমেন্ট রেকর্ড নেই।</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400 mb-0.5">মোট যোগ</p>
              <p className="text-lg font-bold text-emerald-600">+{totalIn}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400 mb-0.5">মোট বাদ</p>
              <p className="text-lg font-bold text-red-500">−{totalOut}</p>
            </div>
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400 mb-0.5">রেকর্ড</p>
              <p className="text-lg font-bold text-gray-700 dark:text-gray-200">{movements.length}</p>
            </div>
          </div>

          {/* Movements List */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {movements.map((m, i) => {
              const cfg = MOVEMENT_CONFIG[m.movement_type] || MOVEMENT_CONFIG.adj
              const refLabel = REF_TYPE_LABELS[m.reference_type] || m.reference_type || '—'
              return (
                <div
                  key={m.id || i}
                  className="flex items-center gap-3 bg-gray-50 dark:bg-slate-700/40 rounded-xl px-4 py-3 hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                    {cfg.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={cfg.badge} label={cfg.label} size="xs" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-slate-600 px-2 py-0.5 rounded-full">
                        {refLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                      {m.note || '—'} &nbsp;·&nbsp; {m.created_by_name || 'সিস্টেম'}
                    </p>
                  </div>

                  {/* Quantity + Date */}
                  <div className="text-right flex-shrink-0">
                    <p className={`text-base font-bold ${cfg.color}`}>
                      {m.movement_type === 'out' ? '−' : '+'}{m.quantity}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{fmtDate(m.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
