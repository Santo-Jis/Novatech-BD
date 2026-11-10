// components/InvoiceCard.jsx — REDESIGNED (inline styles, no Tailwind)
// একটি Invoice-এর collapsible card

import { useState } from 'react'
import { fmt, fmtDate } from '../utils/helpers'
import { PayBadge, DueStatusBadge } from './Badges'
import CompanyTag from './CompanyTag'

// Payment method → left border color
const BORDER_COLOR = {
  cash:        '#059669',
  credit:      '#DC2626',
  mixed:       '#D97706',
  replacement: '#2563EB',
}

// ✅ REDESIGNED (পার্ট ২ — কোম্পানি ভিজ্যুয়াল ট্যাগ সিস্টেম): companyTag
// আগে একটা প্লেইন স্ট্রিং ছিল (শুধু নাম) — এখন `company` অবজেক্ট
// { name, logoUrl, colorKey }, যাতে CompanyTag লোগো/রঙ দেখাতে পারে।
export default function InvoiceCard({ sale, company }) {
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
          {/* ✅ aggregate ভিউয়ে কোন কোম্পানির ইনভয়েস তা বোঝাতে CompanyTag */}
          {company && (
            <div style={{ marginBottom: 5 }}>
              <CompanyTag name={company.name} logoUrl={company.logoUrl} colorKey={company.colorKey} />
            </div>
          )}
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
          {sale.payment_status && (
            <div style={{ marginTop: 4 }}>
              <DueStatusBadge status={sale.payment_status} />
            </div>
          )}
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
                {item.is_free_gift
                  ? <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>🎁 ফ্রি</span>
                  : <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', fontFamily: 'Inter, system-ui' }}>
                      ৳{fmt(item.subtotal)}
                    </span>}
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
            {(() => {
              const credUsed = parseFloat(sale.credit_balance_used) || 0
              const promoOff = Math.max(0, (parseFloat(sale.discount_amount) || 0) - credUsed)
              return (
                <>
                  {promoOff > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#7c3aed' }}>🎟️ প্রমোশন ছাড়</span>
                      <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, fontFamily: 'Inter, system-ui' }}>
                        − ৳{fmt(promoOff)}
                      </span>
                    </div>
                  )}
                  {credUsed > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#059669' }}>ক্রেডিট ব্যালেন্স ছাড়</span>
                      <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, fontFamily: 'Inter, system-ui' }}>
                        − ৳{fmt(credUsed)}
                      </span>
                    </div>
                  )}
                </>
              )
            })()}

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

            {/* পরে আদায় হওয়া অংশ — payment_allocations থেকে (শুধু বাকি ইনভয়েসে আসে) */}
            {parseFloat(sale.paid_amount) > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                background: '#ECFDF5', borderRadius: 8, padding: '6px 10px', marginTop: 2,
              }}>
                <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>✓ পরে আদায় হয়েছে</span>
                <span style={{ fontSize: 12, color: '#059669', fontWeight: 700, fontFamily: 'Inter, system-ui' }}>
                  ৳{fmt(sale.paid_amount)}
                </span>
              </div>
            )}
            {sale.payment_status && sale.payment_status !== 'paid' && parseFloat(sale.remaining_amount) > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                background: '#FEF2F2', borderRadius: 8, padding: '6px 10px', marginTop: 2,
              }}>
                <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>এখনো বাকি</span>
                <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 700, fontFamily: 'Inter, system-ui' }}>
                  ৳{fmt(sale.remaining_amount)}
                </span>
              </div>
            )}

            {/* ── বাকির হিসাব (বিক্রির সময়ের স্ন্যাপশট; পুরনো ইনভয়েসে থাকে না) ── */}
            {sale.previous_due !== null && sale.previous_due !== undefined &&
             sale.closing_due  !== null && sale.closing_due  !== undefined &&
             (parseFloat(sale.previous_due) > 0 || parseFloat(sale.closing_due) > 0 || parseFloat(sale.due_payment) > 0) && (
              <div style={{ borderTop: '1px dashed #CBD5E1', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280' }}>📒 বাকির হিসাব</span>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#4B5563' }}>আগের বাকি</span>
                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 600, fontFamily: 'Inter, system-ui' }}>৳{fmt(sale.previous_due)}</span>
                </div>
                {parseFloat(sale.credit_used) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#4B5563' }}>+ এই ইনভয়েসের বাকি</span>
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 600, fontFamily: 'Inter, system-ui' }}>৳{fmt(sale.credit_used)}</span>
                  </div>
                )}
                {parseFloat(sale.due_payment) > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    background: '#ECFDF5', borderRadius: 8, padding: '6px 10px',
                  }}>
                    <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>💵 বাকি আদায় (আজ)</span>
                    <span style={{ fontSize: 12, color: '#059669', fontWeight: 700, fontFamily: 'Inter, system-ui' }}>-৳{fmt(sale.due_payment)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#B91C1C' }}>এখনকার মোট বাকি</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#B91C1C', fontFamily: 'Inter, system-ui' }}>৳{fmt(sale.closing_due)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
