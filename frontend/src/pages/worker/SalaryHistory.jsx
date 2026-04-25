import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { FiCheckCircle, FiClock, FiChevronDown, FiChevronUp, FiCalendar, FiUser, FiHash, FiCreditCard } from 'react-icons/fi'

const MONTHS_BN = ['','জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
  'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']

const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')

const METHODS = { cash:'নগদ', bkash:'বিকাশ', nagad:'নগদ মোবাইল', bank:'ব্যাংক', rocket:'রকেট' }

const formatDateTime = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getDate()} ${MONTHS_BN[dt.getMonth()+1]} ${dt.getFullYear()}, ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`
}

export default function SalaryHistory() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api.get('/salary/my')
      .then(res => setRecords(res.data.data || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id) => setExpanded(expanded === id ? null : id)

  return (
    <div style={{ padding:'16px', paddingBottom:80, background:'#f8fafc', minHeight:'100vh' }}>

      <h2 style={{ fontWeight:700, fontSize:18, color:'#1e293b', marginBottom:4 }}>বেতন ইতিহাস</h2>
      <p style={{ fontSize:12, color:'#94a3b8', marginBottom:16 }}>আপনার সকল মাসিক বেতন পরিশোধের রেকর্ড</p>

      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[1,2,3].map(i => <div key={i} style={{ height:72, background:'#fff', borderRadius:14 }} />)}
        </div>
      ) : records.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
          <FiClock size={36} style={{ marginBottom:10, opacity:0.4 }} />
          <p style={{ fontSize:14 }}>এখনো কোনো বেতন পরিশোধ হয়নি</p>
        </div>
      ) : (
        <>
          {/* মোট পরিশোধিত */}
          <div style={{ background:'linear-gradient(135deg,#1e3a8a,#1d4ed8)', borderRadius:16, padding:'14px 16px', color:'#fff', marginBottom:16 }}>
            <p style={{ fontSize:12, opacity:0.75, margin:'0 0 4px' }}>মোট পরিশোধিত বেতন</p>
            <p style={{ fontWeight:800, fontSize:22, margin:0 }}>
              {taka(records.reduce((s, r) => s + parseFloat(r.net_payable || 0), 0))}
            </p>
            <p style={{ fontSize:11, opacity:0.65, margin:'4px 0 0' }}>{records.length} মাস</p>
          </div>

          {/* রেকর্ড লিস্ট */}
          <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', overflow:'hidden' }}>
            {records.map((rec, i) => {
              const isOpen = expanded === rec.id
              return (
                <div key={rec.id} style={{ borderBottom: i < records.length-1 ? '1px solid #f1f5f9' : 'none' }}>
                  {/* রো হেডার */}
                  <div
                    onClick={() => toggle(rec.id)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', cursor:'pointer', background: isOpen ? '#f0f9ff' : 'transparent' }}
                  >
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <FiCheckCircle size={13} color="#15803d" />
                        <span style={{ fontWeight:700, fontSize:14, color:'#1e293b' }}>
                          {MONTHS_BN[rec.month]} {rec.year}
                        </span>
                      </div>
                      <div style={{ fontSize:11, color:'#64748b' }}>
                        মূল: {taka(rec.basic_salary)} · কমিশন: {taka(rec.total_commission)}
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                      <span style={{ fontWeight:800, fontSize:16, color:'#1d4ed8' }}>{taka(rec.net_payable)}</span>
                      {isOpen ? <FiChevronUp size={14} color="#94a3b8" /> : <FiChevronDown size={14} color="#94a3b8" />}
                    </div>
                  </div>

                  {/* বিস্তারিত */}
                  {isOpen && (
                    <div style={{ background:'#f0f9ff', borderTop:'1px dashed #bae6fd', padding:'12px 16px' }}>

                      {/* বেতনের হিসাব */}
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>বেতনের হিসাব</div>
                        {[
                          { label:'মূল বেতন',        v: taka(rec.basic_salary),            c:'#1e293b' },
                          { label:'বিক্রয় কমিশন',   v:`+ ${taka(rec.sales_commission)}`,   c:'#1d4ed8' },
                          { label:'উপস্থিতি বোনাস',  v:`+ ${taka(rec.attendance_bonus)}`,   c:'#15803d' },
                          { label:'উপস্থিতি কর্তন',  v:`− ${taka(rec.attendance_deduction)}`, c:'#dc2626' },
                          { label:'বকেয়া কর্তন',     v:`− ${taka(rec.outstanding_dues_deducted)}`, c:'#b45309' },
                        ].map(({ label, v, c }) => (
                          <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                            <span style={{ fontSize:12, color:'#64748b' }}>{label}</span>
                            <span style={{ fontSize:12, fontWeight:600, color:c }}>{v}</span>
                          </div>
                        ))}
                        <div style={{ display:'flex', justifyContent:'space-between', borderTop:'2px solid #bae6fd', paddingTop:6, marginTop:4 }}>
                          <span style={{ fontWeight:700, fontSize:13 }}>নেট পাওনা</span>
                          <span style={{ fontWeight:800, fontSize:15, color:'#1d4ed8' }}>{taka(rec.net_payable)}</span>
                        </div>
                      </div>

                      {/* পেমেন্ট তথ্য */}
                      <div style={{ background:'#fff', borderRadius:10, padding:'10px 12px' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:6 }}>পেমেন্টের তথ্য</div>
                        {[
                          { icon:<FiCalendar size={11}/>, label:'তারিখ',      value: formatDateTime(rec.paid_at) },
                          { icon:<FiCreditCard size={11}/>, label:'পদ্ধতি',   value: METHODS[rec.payment_method] || rec.payment_method },
                          { icon:<FiHash size={11}/>,       label:'রেফারেন্স', value: rec.payment_reference, mono:true },
                          { icon:<FiUser size={11}/>,       label:'অনুমোদন',   value: rec.approved_by_name },
                          rec.note && { icon:<FiCalendar size={11}/>, label:'নোট', value: rec.note },
                        ].filter(Boolean).map(({ icon, label, value, mono }) => (
                          <div key={label} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6 }}>
                            <span style={{ background:'#dbeafe', color:'#1d4ed8', borderRadius:6, padding:'3px 5px', display:'flex', flexShrink:0 }}>{icon}</span>
                            <div>
                              <p style={{ fontSize:10, color:'#64748b', margin:'0 0 1px' }}>{label}</p>
                              <p style={{ fontSize:12, fontWeight:600, color:'#1e293b', margin:0, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
