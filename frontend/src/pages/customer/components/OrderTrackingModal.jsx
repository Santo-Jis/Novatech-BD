// components/OrderTrackingModal.jsx
// অর্ডার ট্র্যাকিং detail modal (bottom sheet)

import { useState, useEffect } from 'react'
import { portalFetch } from '../utils/api'

export default function OrderTrackingModal({ orderId, jwt, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) return
    portalFetch(`/portal/order-requests/${orderId}/tracking`, {
      headers: { Authorization: `Bearer ${jwt}` }
    }).then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false))
  }, [orderId])

  if (!orderId) return null

  const stepIcons = { pending: '⏳', confirmed: '✅', assigned: '🚶', delivered: '📦' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', padding: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e1e1e' }}>📦 অর্ডার ট্র্যাকিং</h3>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 16, color: '#555' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ width: 32, height: 32, border: '4px solid #e0e7ff', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: '#aaa', fontSize: 13 }}>লোড হচ্ছে...</p>
          </div>
        ) : data ? (
          <div>
            {/* Progress Steps */}
            {!data.is_cancelled && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 20 }}>
                {data.steps.map((step, idx) => (
                  <div key={step.step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      {idx > 0 && (
                        <div style={{ flex: 1, height: 3, background: step.completed ? '#4f46e5' : '#e5e7eb', transition: 'background 0.3s' }} />
                      )}
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: step.active ? '#4f46e5' : step.completed ? '#6366f1' : '#f3f4f6',
                        color: step.completed || step.active ? 'white' : '#9ca3af',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, border: step.active ? '3px solid #818cf8' : 'none',
                        boxShadow: step.active ? '0 0 0 4px #e0e7ff' : 'none',
                        transition: 'all 0.3s'
                      }}>
                        {stepIcons[step.step] || '•'}
                      </div>
                      {idx < data.steps.length - 1 && (
                        <div style={{ flex: 1, height: 3, background: data.steps[idx+1]?.completed ? '#4f46e5' : '#e5e7eb' }} />
                      )}
                    </div>
                    <p style={{ fontSize: 9, color: step.active ? '#4f46e5' : step.completed ? '#6b7280' : '#9ca3af', textAlign: 'center', marginTop: 6, fontWeight: step.active ? 700 : 400, lineHeight: 1.3 }}>
                      {step.label}
                    </p>
                    {step.completed_at && (
                      <p style={{ fontSize: 8, color: '#aaa', textAlign: 'center' }}>
                        {new Date(step.completed_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short' })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.is_cancelled && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ margin: 0, color: '#be123c', fontWeight: 700 }}>❌ অর্ডার বাতিল</p>
                {data.admin_note && <p style={{ margin: '4px 0 0', color: '#9f1239', fontSize: 13 }}>{data.admin_note}</p>}
              </div>
            )}

            {/* SR Info */}
            {data.assigned_sr && (
              <div style={{ background: '#f5f3ff', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🚶</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#3b0764' }}>SR: {data.assigned_sr.name}</p>
                  {data.assigned_sr.phone && (
                    <a href={`tel:${data.assigned_sr.phone}`} style={{ color: '#7c3aed', fontSize: 12, textDecoration: 'none' }}>
                      📞 {data.assigned_sr.phone}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            {data.items?.length > 0 && (
              <div style={{ background: '#f9fafb', borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>অর্ডার করা পণ্য</p>
                {data.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', padding: '3px 0' }}>
                    <span>{item.product_name || item.name}</span>
                    <span style={{ fontWeight: 600 }}>× {item.qty}</span>
                  </div>
                ))}
              </div>
            )}

            {data.note && (
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '8px 12px', marginTop: 10 }}>
                <p style={{ margin: 0, fontSize: 12, color: '#3b82f6' }}>💬 আপনার নোট: {data.note}</p>
              </div>
            )}
          </div>
        ) : (
          <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: 20 }}>তথ্য আনতে সমস্যা হয়েছে।</p>
        )}
      </div>
    </div>
  )
}
