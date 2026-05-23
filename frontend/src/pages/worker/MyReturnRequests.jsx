// frontend/src/pages/worker/MyReturnRequests.jsx
// Worker: আমার assigned customer-দের approved return/replacement তালিকা
// API: GET /customers/my-return-requests?type=return|replacement

import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { FiRefreshCw, FiPackage, FiFilter, FiUser, FiHash, FiFileText, FiCheckCircle, FiClock, FiAlertCircle } from 'react-icons/fi'

const MONTHS_BN = ['','জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
  'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS_BN[d.getMonth() + 1]}, ${d.getFullYear()}`
}

function TypeBadge({ type }) {
  const isReturn = type === 'return'
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      background: isReturn ? '#fef3c7' : '#eff6ff',
      color: isReturn ? '#b45309' : '#1d4ed8',
    }}>
      {isReturn ? '↩ পণ্য ফেরত' : '🔄 রিপ্লেসমেন্ট'}
    </span>
  )
}

function ItemsAccordion({ items }) {
  const [open, setOpen] = useState(false)
  const parsed = (() => {
    try { return typeof items === 'string' ? JSON.parse(items) : (Array.isArray(items) ? items : []) }
    catch { return [] }
  })()

  if (!parsed.length) return null

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', padding: 0,
          fontSize: 12, color: '#6366f1', fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4
        }}
      >
        <FiPackage size={12} />
        {parsed.length}টি পণ্য দেখুন
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s', display:'inline-block' }}>▾</span>
      </button>

      {open && (
        <div style={{
          marginTop: 6, background: '#f8fafc', borderRadius: 8,
          padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5
        }}>
          {parsed.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>
                {item.product_name || item.name || `পণ্য ${i+1}`}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#6366f1',
                background: '#eef2ff', borderRadius: 6, padding: '2px 7px', marginLeft: 8
              }}>
                × {item.quantity || 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MyReturnRequests() {
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all') // 'all' | 'return' | 'replacement'
  const [search,   setSearch]   = useState('')

  const fetchData = () => {
    setLoading(true)
    const params = filter !== 'all' ? `?type=${filter}` : ''
    api.get(`/customers/my-return-requests${params}`)
      .then(res => setRequests(res.data.data || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [filter])

  const filtered = requests.filter(r =>
    !search ||
    r.shop_name?.includes(search) ||
    r.owner_name?.includes(search) ||
    r.invoice_number?.includes(search)
  )

  // Summary counts
  const returnCount      = requests.filter(r => r.type === 'return').length
  const replacementCount = requests.filter(r => r.type === 'replacement').length

  return (
    <div style={{ padding: 16, paddingBottom: 80, background: '#f8fafc', minHeight: '100vh' }}>

      {/* ── হেডার ── */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontWeight: 800, fontSize: 18, color: '#1e293b', margin: 0 }}>
          অনুমোদিত রিটার্ন
        </h2>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
          আপনার assigned কাস্টমারদের approved ফেরত ও রিপ্লেসমেন্ট
        </p>
      </div>

      {/* ── Summary chips ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {[
          { key: 'all',         label: `সব (${requests.length})`,             bg: '#f1f5f9', color: '#475569', activeBg: '#1e293b', activeColor: '#fff' },
          { key: 'return',      label: `ফেরত (${returnCount})`,               bg: '#fef9c3', color: '#b45309', activeBg: '#b45309', activeColor: '#fff' },
          { key: 'replacement', label: `রিপ্লেসমেন্ট (${replacementCount})`, bg: '#eff6ff', color: '#1d4ed8', activeBg: '#1d4ed8', activeColor: '#fff' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 12,
              background: filter === f.key ? f.activeBg : f.bg,
              color: filter === f.key ? f.activeColor : f.color,
              transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="দোকান, মালিক বা ইনভয়েস নম্বর..."
          style={{
            width: '100%', padding: '11px 16px 11px 36px', borderRadius: 12,
            border: '1px solid #e2e8f0', fontSize: 13, background: '#fff',
            outline: 'none', boxSizing: 'border-box', color: '#1e293b',
          }}
        />
        <FiHash size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 100, background: '#fff', borderRadius: 14, opacity: 0.6,
              animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 16px', color: '#94a3b8',
          background: '#fff', borderRadius: 16
        }}>
          <FiRefreshCw size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
          <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>কোনো অনুমোদিত রিটার্ন নেই</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>
            {filter !== 'all' ? 'ফিল্টার পরিবর্তন করুন' : 'আপনার কাস্টমারদের কোনো রিটার্ন অনুমোদিত হয়নি'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((req, i) => (
            <div key={req.id || i} style={{
              background: '#fff', borderRadius: 14,
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              overflow: 'hidden',
              borderLeft: `4px solid ${req.type === 'return' ? '#f59e0b' : '#3b82f6'}`,
            }}>
              {/* Card Header */}
              <div style={{ padding: '12px 14px 0 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <TypeBadge type={req.type} />
                      {req.invoice_number && (
                        <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                          #{req.invoice_number}
                        </span>
                      )}
                    </div>

                    {/* Shop Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <FiUser size={14} color="#64748b" />
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', margin: 0 }}>{req.shop_name}</p>
                        <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{req.owner_name}</p>
                      </div>
                    </div>
                  </div>

                  {/* Approved badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: '#f0fdf4', borderRadius: 8, padding: '4px 8px',
                  }}>
                    <FiCheckCircle size={12} color="#16a34a" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>অনুমোদিত</span>
                  </div>
                </div>

                {/* Route */}
                {req.route_name && (
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                    🗺 {req.route_name}
                  </p>
                )}
              </div>

              {/* Items */}
              <div style={{ padding: '0 14px 12px 14px' }}>
                <ItemsAccordion items={req.items} />

                {/* Note */}
                {req.note && (
                  <div style={{
                    marginTop: 8, background: '#fafafa', borderRadius: 8,
                    padding: '7px 10px', display: 'flex', gap: 6
                  }}>
                    <FiFileText size={12} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{req.note}</p>
                  </div>
                )}

                {/* Admin Note */}
                {req.admin_note && (
                  <div style={{
                    marginTop: 6, background: '#fef9f0', borderRadius: 8,
                    padding: '7px 10px', display: 'flex', gap: 6,
                    border: '1px solid #fed7aa'
                  }}>
                    <FiAlertCircle size={12} color="#ea580c" style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 12, color: '#ea580c', margin: 0, lineHeight: 1.5 }}>
                      {req.admin_note}
                    </p>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div style={{
                padding: '8px 14px', background: '#f8fafc',
                borderTop: '1px solid #f1f5f9',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <FiClock size={11} color="#94a3b8" />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    অনুমোদন: {formatDate(req.reviewed_at || req.created_at)}
                  </span>
                </div>
                {req.whatsapp && (
                  <a
                    href={`https://wa.me/${req.whatsapp.replace(/\D/g,'')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: '#dcfce7', color: '#16a34a',
                      borderRadius: 8, padding: '5px 10px',
                      fontSize: 11, fontWeight: 700, textDecoration: 'none'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
