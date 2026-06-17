// components/InvoiceCard.jsx — REDESIGNED (inline styles, no Tailwind)
// একটি Invoice-এর collapsible card

import { useState } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { PayBadge } from './Badges'

// Payment method → left border color
const BORDER_COLOR = {
  cash:        '#059669',
  credit:      '#DC2626',
  mixed:       '#D97706',
  replacement: '#2563EB',
}

export default function InvoiceCard({ sale }) {
  const [open, setOpen] = useState(false)
  const items = typeof sale.items === 'string'
    ? JSON.parse(sale.items)
    : (sale.items || [])

  const accentColor = BORDER_COLOR[sale.payment_method] || '#9CA3AF'

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 18,
      border: '1.5px solid #E8ECF2',
      overflow: 'hidden',
      boxShadow: open ? '0 4px 20px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
      transition: 'box-shadow 0.2s',
      borderLeft: `4px solid ${accentColor}`,
    }}>

      {/* ── Header Row ─────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          padding: '13px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          textAlign: 'left',
        }}
      >
        {/* Left: date, invoice no, SR */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 3px', fontSize: 10, color: '#9CA3AF', fontFamily: 'Inter, system-ui' }}>
            {fmtDate(sale.created_at)}
          </p>
          <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: '#111827', fontFamily: 'Inter, system-ui' }}>
            {sale.invoice_number}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: '#9CA3AF' }}>
            SR: {sale.sr_name}
          </p>
        </div>

        {/* Right: amount, badge, toggle */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ margin: '0 0 5px', fontSize: 16, fontWeight: 800, color: '#111827', fontFamily: 'Inter, system-ui' }}>
            ৳{fmt(sale.net_amount)}
          </p>
          <PayBadge method={sale.payment_method} />
          <p style={{ margin: '5px 0 0', fontSize: 10, color: '#2563EB', fontWeight: 600 }}>
            {open ? '▲ বন্ধ করুন' : '▼ বিস্তারিত'}
          </p>
        </div>
      </button>

      {/* ── Expanded Details ───────────────────────────── */}
      {open && (
        <div style={{ borderTop: '1px solid #F1F5F9', background: '#F8FAFC', padding: '12px 16px' }}>

          {/* Item list */}
          <div style={{ marginBottom: 10 }}>
            {items.map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '5px 0',
                borderBottom: i < items.length - 1 ? '1px solid #F1F5F9' : 'none',
              }}>
                <span style={{ fontSize: 12, color: '#374151' }}>
                  {item.product_name} × {item.qty}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', fontFamily: 'Inter, system-ui' }}>
                  ৳{fmt(item.subtotal)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ borderTop: '1.5px solid #E8ECF2', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>

            {/* মোট */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>মোট</span>
              <span style={{ fontSize: 12, color: '#374151', fontFamily: 'Inter, system-ui' }}>৳{fmt(sale.total_amount)}</span>
            </div>

            {/* ছাড় */}
            {parseFloat(sale.discount_amount) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#059669' }}>ছাড়</span>
                <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, fontFamily: 'Inter, system-ui' }}>
                  − ৳{fmt(sale.discount_amount)}
                </span>
              </div>
            )}

            {/* রিপ্লেসমেন্ট */}
            {parseFloat(sale.replacement_value) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#2563EB' }}>রিপ্লেসমেন্ট</span>
                <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600, fontFamily: 'Inter, system-ui' }}>
                  − ৳{fmt(sale.replacement_value)}
                </span>
              </div>
            )}

            {/* পরিশোধযোগ্য */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderTop: '1px solid #E8ECF2', paddingTop: 7, marginTop: 2,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>পরিশোধযোগ্য</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', fontFamily: 'Inter, system-ui' }}>
                ৳{fmt(sale.net_amount)}
              </span>
            </div>

            {/* নগদ পেয়েছি */}
            {parseFloat(sale.cash_received) > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                background: '#ECFDF5', borderRadius: 8, padding: '6px 10px', marginTop: 2,
              }}>
                <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>✓ নগদ পেয়েছি</span>
                <span style={{ fontSize: 12, color: '#059669', fontWeight: 700, fontFamily: 'Inter, system-ui' }}>
                  ৳{fmt(sale.cash_received)}
                </span>
              </div>
            )}

            {/* বাকি রাখা হয়েছে */}
            {parseFloat(sale.credit_used) > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                background: '#FEF2F2', borderRadius: 8, padding: '6px 10px', marginTop: 2,
              }}>
                <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>⚠ বাকি রাখা হয়েছে</span>
                <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 700, fontFamily: 'Inter, system-ui' }}>
                  ৳{fmt(sale.credit_used)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
