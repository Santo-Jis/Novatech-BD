// components/OrderTrackingModal.jsx
// ✅ REDESIGNED — অর্ডার ট্র্যাকিং detail bottom sheet (cp- design system)
// একই props (orderId, jwt, onClose), একই API কল — শুধু UI redesign।

import { useState, useEffect } from 'react'
import { FiX, FiPhoneCall } from 'react-icons/fi'
import { portalFetch } from '../utils/api'

const STEP_ICON = { pending: '⏳', confirmed: '✅', assigned: '🚶', delivered: '📦' }

export default function OrderTrackingModal({ orderId, jwt, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    portalFetch(`/portal/order-requests/${orderId}/tracking`, {
      headers: { Authorization: `Bearer ${jwt}` }
    }).then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false))
  }, [orderId])

  if (!orderId) return null

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[200] flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-cp-bg-surface rounded-t-3xl w-full max-w-[480px] max-h-[80vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-bold font-cp-head text-cp-text-primary">📦 অর্ডার ট্র্যাকিং</h3>
          <button onClick={onClose} className="bg-cp-bg-alt rounded-lg px-2.5 py-1.5 text-cp-text-secondary">
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-4 border-cp-trust-300 border-t-cp-trust-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-cp-text-muted text-[13px]">লোড হচ্ছে...</p>
          </div>
        ) : data ? (
          <div className="flex flex-col gap-3">
            {/* Progress Steps */}
            {!data.is_cancelled && (
              <div className="flex items-start mb-2">
                {data.steps.map((step, idx) => (
                  <div key={step.step} className="flex-1 flex flex-col items-center">
                    <div className="flex items-center w-full">
                      {idx > 0 && (
                        <div className={`flex-1 h-[3px] transition-colors ${step.completed ? 'bg-cp-trust-500' : 'bg-cp-border'}`} />
                      )}
                      <div
                        className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[16px] transition-all ${
                          step.active
                            ? 'bg-cp-trust-500 text-white ring-4 ring-cp-trust-100'
                            : step.completed
                              ? 'bg-cp-trust-700 text-white'
                              : 'bg-cp-bg-alt text-cp-text-muted'
                        }`}
                      >
                        {STEP_ICON[step.step] || '•'}
                      </div>
                      {idx < data.steps.length - 1 && (
                        <div className={`flex-1 h-[3px] ${data.steps[idx + 1]?.completed ? 'bg-cp-trust-500' : 'bg-cp-border'}`} />
                      )}
                    </div>
                    <p className={`text-[9px] text-center mt-1.5 leading-tight ${step.active ? 'font-bold text-cp-trust-700' : step.completed ? 'text-cp-text-secondary' : 'text-cp-text-muted'}`}>
                      {step.label}
                    </p>
                    {step.completed_at && (
                      <p className="text-[8px] text-cp-text-muted text-center">
                        {new Date(step.completed_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short' })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.is_cancelled && (
              <div className="bg-cp-error/5 border border-cp-error/20 rounded-xl px-4 py-3">
                <p className="text-cp-error font-bold text-[13px]">❌ অর্ডার বাতিল</p>
                {data.admin_note && <p className="text-cp-error/80 text-[12px] mt-1">{data.admin_note}</p>}
              </div>
            )}

            {/* SR Info */}
            {data.assigned_sr && (
              <div className="bg-cp-trust-100 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
                <span className="text-[20px]">🚶</span>
                <div>
                  <p className="font-bold text-[13px] text-cp-trust-900">SR: {data.assigned_sr.name}</p>
                  {data.assigned_sr.phone && (
                    <a href={`tel:${data.assigned_sr.phone}`} className="text-cp-trust-700 text-[12px] flex items-center gap-1 mt-0.5">
                      <FiPhoneCall className="w-3 h-3" /> {data.assigned_sr.phone}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            {data.items?.length > 0 && (
              <div className="bg-cp-bg-alt rounded-xl px-3.5 py-3">
                <p className="text-[11px] font-bold text-cp-text-secondary uppercase tracking-wide mb-2">অর্ডার করা পণ্য</p>
                {data.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-[13px] text-cp-text-primary py-0.5">
                    <span>{item.product_name || item.name}</span>
                    <span className="font-semibold">× {item.qty}</span>
                  </div>
                ))}
              </div>
            )}

            {data.note && (
              <div className="bg-cp-info/5 rounded-lg px-3 py-2">
                <p className="text-[12px] text-cp-info">💬 আপনার নোট: {data.note}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-cp-text-muted text-[13px] py-5">তথ্য আনতে সমস্যা হয়েছে।</p>
        )}
      </div>
    </div>
  )
}
