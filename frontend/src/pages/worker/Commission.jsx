import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { FiTrendingUp, FiGift, FiDollarSign, FiCalendar, FiChevronLeft, FiChevronRight, FiCheckCircle, FiClock, FiUser, FiHash, FiInfo } from 'react-icons/fi'

// ─── বাংলা মাসের নাম ───────────────────────────────
const MONTHS_BN = ['', 'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']

// ─── সংখ্যাকে বাংলা টাকা ফরম্যাট ──────────────────
const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')

// ─── তারিখ ফরম্যাট ──────────────────────────────────
const formatDate = (dateStr) => {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS_BN[d.getMonth() + 1]}`
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const date = `${d.getDate()} ${MONTHS_BN[d.getMonth() + 1]} ${d.getFullYear()}`
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${date}, ${h}:${m}`
}

// ─── Row Type ব্যাজ ──────────────────────────────────
function TypeBadge({ type }) {
  const map = {
    daily: { label: 'বিক্রয়', bg: '#eff6ff', color: '#1d4ed8' },
    attendance_bonus: { label: 'বোনাস', bg: '#f0fdf4', color: '#15803d' },
  }
  const s = map[type] || { label: type, bg: '#f3f4f6', color: '#374151' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
      background: s.bg, color: s.color
    }}>{s.label}</span>
  )
}

export default function Commission() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)

  const fetchData = () => {
    setLoading(true)
    api.get(`/commission/my?month=${month}&year=${year}`)
      .then(res => setData(res.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [month, year])

  // মাস নেভিগেশন
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()
    if (isCurrentMonth) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  const summary  = data?.summary  || {}
  const daily    = data?.daily    || []
  const preview  = data?.salary_preview || {}

  return (
    <div style={{ padding: '16px', paddingBottom: 80, background: '#f8fafc', minHeight: '100vh' }}>

      {/* ─── হেডার ─── */}
      <h2 style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', marginBottom: 12 }}>
        কমিশন বিবরণী
      </h2>

      {/* ─── মাস নেভিগেটর ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderRadius: 14, padding: '10px 14px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 14
      }}>
        <button onClick={prevMonth} style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: '#64748b' }}>
          <FiChevronLeft size={20} />
        </button>
        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
          {MONTHS_BN[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: isCurrentMonth ? '#cbd5e1' : '#64748b' }}
          disabled={isCurrentMonth}
        >
          <FiChevronRight size={20} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: 60, background: '#fff', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
          তথ্য পাওয়া যায়নি
        </div>
      ) : (
        <>
          {/* ─── সারসংক্ষেপ কার্ড ৪টি ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'মোট বিক্রয়', value: taka(summary.total_sales), icon: <FiTrendingUp size={16} />, accent: '#1d4ed8', bg: '#eff6ff' },
              { label: 'বিক্রয় কমিশন', value: taka(summary.daily_commission), icon: <FiDollarSign size={16} />, accent: '#7c3aed', bg: '#f5f3ff' },
              { label: 'উপস্থিতি বোনাস', value: taka(summary.bonus), icon: <FiGift size={16} />, accent: '#15803d', bg: '#f0fdf4' },
              { label: 'মোট কমিশন', value: taka(summary.total_commission), icon: <FiCalendar size={16} />, accent: '#b45309', bg: '#fffbeb' },
            ].map(({ label, value, icon, accent, bg }) => (
              <div key={label} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ background: bg, color: accent, padding: 5, borderRadius: 8, display: 'flex' }}>{icon}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
                </div>
                <p style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* ─── বেতন প্রিভিউ ─── */}
          {preview.net_payable > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
              borderRadius: 16, padding: '14px 16px', marginBottom: 14, color: '#fff'
            }}>
              <p style={{ fontSize: 12, opacity: 0.8, margin: '0 0 8px 0' }}>এই মাসের অনুমানিত পাওনা</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>মূল বেতন</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{taka(preview.basic_salary)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.85 }}>মোট কমিশন</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd' }}>+ {taka(preview.total_commission)}</span>
              </div>
              {preview.outstanding_dues > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, opacity: 0.85 }}>বকেয়া কর্তন</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fca5a5' }}>− {taka(preview.outstanding_dues)}</span>
                </div>
                {preview.product_dues > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 10 }}>
                    <span style={{ fontSize: 11, opacity: 0.65 }}>↳ পণ্য ঘাটতি</span>
                    <span style={{ fontSize: 11, color: '#fca5a5', opacity: 0.85 }}>৳{parseInt(preview.product_dues).toLocaleString()}</span>
                  </div>
                )}
                {preview.cash_dues > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 10, marginTop: 2 }}>
                    <span style={{ fontSize: 11, opacity: 0.65 }}>↳ নগদ ঘাটতি</span>
                    <span style={{ fontSize: 11, color: '#fca5a5', opacity: 0.85 }}>৳{parseInt(preview.cash_dues).toLocaleString()}</span>
                  </div>
                )}
              )}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>নেট পাওনা</span>
                <span style={{ fontWeight: 800, fontSize: 18 }}>{taka(preview.net_payable)}</span>
              </div>
            </div>
          )}

          {/* ─── দৈনিক ইতিহাস ─── */}
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', margin: 0 }}>
                দিনভিত্তিক বিবরণ
                <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>
                  ({daily.length}টি এন্ট্রি)
                </span>
              </h3>
            </div>

            {daily.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                এই মাসে কোনো কমিশন তথ্য নেই
              </div>
            ) : (
              <div>
                {daily.map((row, i) => {
                  const isExpanded = expandedRow === i
                  const isPaid = row.paid

                  return (
                    <div key={i} style={{ borderBottom: i < daily.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      {/* ─── মূল রো ─── */}
                      <div
                        onClick={() => setExpandedRow(isExpanded ? null : i)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '11px 16px',
                          background: isExpanded ? '#f0f9ff' : (i % 2 === 0 ? '#fff' : '#fafafa'),
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                      >
                        {/* বাম: তারিখ + ধরন */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                              {formatDate(row.date)}
                            </span>
                            <TypeBadge type={row.type} />
                          </div>
                          {row.sales_amount > 0 && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                              বিক্রয়: {taka(row.sales_amount)}
                              {row.commission_rate > 0 && ` · ${row.commission_rate}%`}
                            </span>
                          )}
                        </div>

                        {/* ডান: কমিশন + পেমেন্ট স্ট্যাটাস */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                            {taka(row.commission_amount)}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: isPaid ? '#15803d' : '#b45309' }}>
                              {isPaid
                                ? <><FiCheckCircle size={10} /> পরিশোধিত</>
                                : <><FiClock size={10} /> বাকি</>
                              }
                            </span>
                            {isPaid && (
                              <FiInfo size={11} color={isExpanded ? '#1d4ed8' : '#94a3b8'} />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ─── পেমেন্ট বিস্তারিত (expanded) ─── */}
                      {isExpanded && (
                        <div style={{
                          background: '#f0f9ff',
                          borderTop: '1px dashed #bae6fd',
                          padding: '10px 16px 12px 16px',
                        }}>
                          {isPaid ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                              {/* পরিশোধের তারিখ */}
                              {row.paid_at && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  <span style={{
                                    background: '#dbeafe', color: '#1d4ed8',
                                    borderRadius: 6, padding: '3px 5px', display: 'flex', flexShrink: 0
                                  }}>
                                    <FiCalendar size={11} />
                                  </span>
                                  <div>
                                    <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 1px 0' }}>পরিশোধের তারিখ ও সময়</p>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', margin: 0 }}>
                                      {formatDateTime(row.paid_at)}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* অনুমোদনকারী */}
                              {row.approved_by_name && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  <span style={{
                                    background: '#dcfce7', color: '#15803d',
                                    borderRadius: 6, padding: '3px 5px', display: 'flex', flexShrink: 0
                                  }}>
                                    <FiUser size={11} />
                                  </span>
                                  <div>
                                    <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 1px 0' }}>অনুমোদন করেছেন</p>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', margin: 0 }}>
                                      {row.approved_by_name}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* পেমেন্ট রেফারেন্স */}
                              {row.payment_reference && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  <span style={{
                                    background: '#fef3c7', color: '#b45309',
                                    borderRadius: 6, padding: '3px 5px', display: 'flex', flexShrink: 0
                                  }}>
                                    <FiHash size={11} />
                                  </span>
                                  <div>
                                    <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 1px 0' }}>পেমেন্ট রেফারেন্স</p>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', margin: 0, fontFamily: 'monospace' }}>
                                      {row.payment_reference}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* কোনো তথ্য না থাকলে */}
                              {!row.paid_at && !row.approved_by_name && !row.payment_reference && (
                                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, textAlign: 'center' }}>
                                  পেমেন্টের বিস্তারিত তথ্য পাওয়া যায়নি
                                </p>
                              )}
                            </div>
                          ) : (
                            /* বাকি থাকলে */
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <FiClock size={13} color='#b45309' />
                              <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>
                                এখনো পরিশোধ হয়নি — পেমেন্টের পর বিস্তারিত দেখা যাবে
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ─── মোট footer ─── */}
          {daily.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#fff', borderRadius: 12, padding: '12px 16px',
              marginTop: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
            }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                {daily.length}টি দিনের মোট কমিশন
              </span>
              <span style={{ fontWeight: 800, fontSize: 16, color: '#1e293b' }}>
                {taka(summary.total_commission)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
