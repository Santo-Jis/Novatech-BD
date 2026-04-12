import { FiShare2, FiDownload, FiCheckCircle, FiXCircle } from 'react-icons/fi'

export default function InvoiceCard({ sale, customer, worker, onShare, onDownload }) {
  if (!sale) return null

  const paymentLabels = { cash: 'নগদ', credit: 'বাকি', replacement: 'রিপ্লেসমেন্ট' }
  const paymentMeta = {
    cash:        { color: '#059669', bg: '#ecfdf5', label: '💵 নগদ' },
    credit:      { color: '#2563eb', bg: '#eff6ff', label: '📋 বাকি' },
    replacement: { color: '#d97706', bg: '#fffbeb', label: '↩️ রিপ্লেসমেন্ট' },
  }
  const pm = paymentMeta[sale.payment_method] || { color: '#6b7280', bg: '#f9fafb', label: sale.payment_method }

  const date = new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{
      background: '#fff',
      borderRadius: 20,
      overflow: 'hidden',
      maxWidth: 400,
      margin: '0 auto',
      boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
      fontFamily: "'Segoe UI', sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)',
        padding: '20px 22px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* decorative circles */}
        <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }}/>
        <div style={{ position:'absolute', bottom:-40, left:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
          <div>
            <p style={{ color:'#fff', fontWeight:800, fontSize:'1.15rem', letterSpacing:'-0.3px' }}>NovaTech BD</p>
            <p style={{ color:'rgba(255,255,255,0.55)', fontSize:'0.72rem', marginTop:2 }}>জানকি সিংহ রোড, বরিশাল</p>
          </div>
          <div style={{ textAlign:'right' }}>
            <span style={{
              background: 'rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: 20,
              display: 'block',
              marginBottom: 5,
            }}>INVOICE</span>
            <p style={{ color:'#93c5fd', fontWeight:700, fontSize:'0.75rem', fontFamily:'monospace' }}>
              {sale.invoice_number}
            </p>
          </div>
        </div>

        {/* date strip */}
        <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.1)', display:'flex', justifyContent:'space-between' }}>
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.7rem' }}>তারিখ</p>
          <p style={{ color:'rgba(255,255,255,0.85)', fontSize:'0.72rem', fontWeight:600 }}>{date}</p>
        </div>
      </div>

      {/* ── Customer + Worker ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 0,
        borderBottom: '1.5px dashed #e5e7eb',
      }}>
        <div style={{ padding:'14px 18px', borderRight:'1.5px dashed #e5e7eb' }}>
          <p style={{ fontSize:'0.65rem', fontWeight:700, color:'#9ca3af', letterSpacing:'1px', textTransform:'uppercase', marginBottom:5 }}>দোকান</p>
          <p style={{ fontWeight:700, color:'#111827', fontSize:'0.88rem', lineHeight:1.3 }}>{customer?.shop_name}</p>
          <p style={{ color:'#6b7280', fontSize:'0.72rem', marginTop:3 }}>{customer?.owner_name}</p>
        </div>
        <div style={{ padding:'14px 18px' }}>
          <p style={{ fontSize:'0.65rem', fontWeight:700, color:'#9ca3af', letterSpacing:'1px', textTransform:'uppercase', marginBottom:5 }}>SR</p>
          <p style={{ fontWeight:700, color:'#111827', fontSize:'0.88rem', lineHeight:1.3 }}>{worker?.name_bn}</p>
          <p style={{ color:'#6b7280', fontSize:'0.72rem', marginTop:3 }}>{worker?.employee_code}</p>
        </div>
      </div>

      {/* ── Items ── */}
      <div style={{ padding:'14px 18px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <p style={{ fontSize:'0.65rem', fontWeight:700, color:'#9ca3af', letterSpacing:'1px', textTransform:'uppercase' }}>পণ্য</p>
          <p style={{ fontSize:'0.65rem', fontWeight:700, color:'#9ca3af', letterSpacing:'1px', textTransform:'uppercase' }}>মূল্য</p>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {sale.items?.map((item, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <p style={{ fontWeight:600, color:'#1f2937', fontSize:'0.88rem' }}>{item.product_name}</p>
                <p style={{ color:'#9ca3af', fontSize:'0.72rem', marginTop:1 }}>{item.qty} × ৳{parseFloat(item.price).toLocaleString()}</p>
              </div>
              <p style={{ fontWeight:700, color:'#1f2937', fontSize:'0.9rem' }}>৳{parseFloat(item.subtotal || item.qty * item.price).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Replacement items */}
        {sale.replacement_items?.length > 0 && (
          <div style={{ marginTop:12, paddingTop:12, borderTop:'1.5px dashed #fed7aa' }}>
            <p style={{ fontSize:'0.65rem', fontWeight:700, color:'#d97706', letterSpacing:'1px', textTransform:'uppercase', marginBottom:8 }}>↩️ রিপ্লেসমেন্ট (ফেরত)</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {sale.replacement_items.map((item, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <p style={{ fontWeight:600, color:'#92400e', fontSize:'0.85rem' }}>{item.product_name}</p>
                    <p style={{ color:'#d97706', fontSize:'0.72rem', marginTop:1 }}>{item.qty} পিস × ৳{parseFloat(item.unit_price || item.total / item.qty).toLocaleString()}</p>
                  </div>
                  <p style={{ fontWeight:700, color:'#dc2626', fontSize:'0.88rem' }}>-৳{parseFloat(item.total).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Totals ── */}
      <div style={{ margin:'0 18px', borderRadius:12, background:'#f8fafc', border:'1px solid #e2e8f0', padding:'12px 14px', marginBottom:14 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>

          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.83rem', color:'#4b5563' }}>
            <span>পণ্যের মোট</span>
            <span style={{ fontWeight:600 }}>৳{parseFloat(sale.total_amount || 0).toLocaleString()}</span>
          </div>

          {sale.discount_amount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.83rem', color:'#059669' }}>
              <span>ব্যালেন্স ছাড়</span>
              <span style={{ fontWeight:600 }}>-৳{parseFloat(sale.discount_amount).toLocaleString()}</span>
            </div>
          )}

          {sale.replacement_value > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.83rem', color:'#d97706' }}>
              <span>রিপ্লেসমেন্ট বিয়োগ</span>
              <span style={{ fontWeight:600 }}>-৳{parseFloat(sale.replacement_value).toLocaleString()}</span>
            </div>
          )}

          {sale.credit_balance_added > 0 && (
            <div style={{
              display:'flex', justifyContent:'space-between', fontSize:'0.83rem',
              color:'#059669', background:'#ecfdf5', borderRadius:8,
              padding:'6px 10px', margin:'2px -4px'
            }}>
              <span style={{ fontWeight:600 }}>✅ ব্যালেন্সে জমা হয়েছে</span>
              <span style={{ fontWeight:700 }}>+৳{parseFloat(sale.credit_balance_added).toLocaleString()}</span>
            </div>
          )}

          <div style={{ height:1, background:'#e2e8f0', margin:'2px 0' }}/>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, color:'#0f172a', fontSize:'0.95rem' }}>পরিশোধযোগ্য</span>
            <span style={{ fontWeight:800, color:'#1e3a8a', fontSize:'1.15rem' }}>৳{parseFloat(sale.net_amount || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ── Payment & OTP ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 18px 14px' }}>
        <div style={{
          display:'inline-flex', alignItems:'center', gap:5,
          background: pm.bg, color: pm.color,
          fontSize:'0.78rem', fontWeight:700,
          padding:'5px 12px', borderRadius:20,
          border:`1px solid ${pm.color}30`
        }}>
          {pm.label}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.75rem', fontWeight:600 }}>
          {sale.otp_verified
            ? <><FiCheckCircle style={{ color:'#059669' }}/> <span style={{ color:'#059669' }}>OTP যাচাই ✓</span></>
            : <><FiXCircle    style={{ color:'#ef4444' }}/> <span style={{ color:'#9ca3af' }}>OTP অযাচাই</span></>
          }
        </div>
      </div>

      {/* ── Action Buttons ── */}
      {(onShare || onDownload) && (
        <div style={{ display:'flex', gap:10, padding:'0 18px 18px' }}>
          {onShare && (
            <button
              onClick={onShare}
              style={{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                padding:'12px', borderRadius:12, border:'none', cursor:'pointer',
                background:'linear-gradient(135deg, #25d366, #128c7e)',
                color:'#fff', fontWeight:700, fontSize:'0.88rem',
                boxShadow:'0 3px 12px rgba(37,211,102,0.35)'
              }}
            >
              <FiShare2 size={15}/> WhatsApp
            </button>
          )}
          {onDownload && (
            <button
              onClick={onDownload}
              style={{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                padding:'12px', borderRadius:12, cursor:'pointer',
                background:'#fff', color:'#1e3a8a',
                border:'1.5px solid #1e3a8a20',
                fontWeight:700, fontSize:'0.88rem',
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)'
              }}
            >
              <FiDownload size={15}/> PDF
            </button>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        background:'linear-gradient(135deg, #0f172a, #1e3a8a)',
        padding:'12px 18px',
        textAlign:'center',
      }}>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.7rem', letterSpacing:'0.5px' }}>
          আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ 🙏
        </p>
        <p style={{ color:'rgba(255,255,255,0.25)', fontSize:'0.62rem', marginTop:3 }}>
          NovaTech BD (Ltd.) • বরিশাল
        </p>
      </div>
    </div>
  )
}
