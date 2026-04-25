import { useState, useEffect } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiChevronLeft, FiChevronRight, FiSearch, FiX, FiUser,
  FiCheckCircle, FiClock, FiEye, FiDollarSign, FiHash,
  FiArrowLeft, FiCalendar, FiAlertCircle, FiTrash2
} from 'react-icons/fi'

const MONTHS_BN = ['','জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
  'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর']

const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')

const METHODS = [
  { value: 'cash',    label: 'নগদ' },
  { value: 'bkash',   label: 'বিকাশ' },
  { value: 'nagad',   label: 'নগদ মোবাইল' },
  { value: 'bank',    label: 'ব্যাংক ট্রান্সফার' },
  { value: 'rocket',  label: 'রকেট' },
]

// ─── Pay Modal ──────────────────────────────────────────────
function PayModal({ worker, month, year, onClose, onSuccess }) {
  const [method, setMethod]   = useState('cash')
  const [ref, setRef]         = useState('')
  const [note, setNote]       = useState('')
  const [deductDues, setDeductDues] = useState(true)
  const [loading, setLoading] = useState(false)

  const dues    = parseFloat(worker.outstanding_dues || 0)
  const net     = parseFloat(worker.calculated_net   || worker.net_payable || 0)
  const adjusted = deductDues ? net : net + dues

  const handlePay = async () => {
    setLoading(true)
    try {
      const res = await api.post('/salary/pay', {
        worker_id:         worker.worker_id,
        month, year,
        payment_method:    method,
        payment_reference: ref.trim() || undefined,
        note:              note.trim() || undefined,
        deduct_dues:       deductDues
      })
      toast.success(res.data.message)
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.message || 'পরিশোধে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 16px 36px', width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontWeight:700, fontSize:16, color:'#1e293b', margin:0 }}>বেতন পরিশোধ</h3>
          <button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer' }}><FiX size={20} color="#64748b" /></button>
        </div>

        {/* Worker কার্ড */}
        <div style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:14, color:'#1e293b', marginBottom:8 }}>
            {worker.name_bn} <span style={{ fontSize:11, color:'#94a3b8', fontWeight:400 }}>({worker.employee_code})</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {[
              { label:'মূল বেতন',        value: taka(worker.basic_salary),          color:'#1e293b' },
              { label:'বিক্রয় কমিশন',   value:`+ ${taka(worker.sales_commission)}`, color:'#1d4ed8' },
              { label:'উপস্থিতি বোনাস',  value:`+ ${taka(worker.attendance_bonus)}`, color:'#15803d' },
              { label:'উপস্থিতি কর্তন',  value:`− ${taka(worker.attendance_deduction)}`, color:'#dc2626' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'#64748b' }}>{label}</span>
                <span style={{ fontSize:12, fontWeight:600, color }}>{value}</span>
              </div>
            ))}
            {dues > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px dashed #e2e8f0', paddingTop:5, marginTop:3 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:12, color:'#64748b' }}>বকেয়া কর্তন</span>
                  <label style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer' }}>
                    <input type="checkbox" checked={deductDues} onChange={e => setDeductDues(e.target.checked)} style={{ cursor:'pointer' }} />
                    <span style={{ fontSize:10, color:'#94a3b8' }}>কাটবে?</span>
                  </label>
                </div>
                <span style={{ fontSize:12, fontWeight:600, color: deductDues ? '#dc2626' : '#94a3b8', textDecoration: deductDues ? 'none' : 'line-through' }}>
                  − {taka(dues)}
                </span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', borderTop:'2px solid #e2e8f0', paddingTop:8, marginTop:4 }}>
              <span style={{ fontWeight:700, fontSize:14, color:'#1e293b' }}>নেট পাওনা</span>
              <span style={{ fontWeight:800, fontSize:18, color:'#1d4ed8' }}>{taka(deductDues ? net : adjusted)}</span>
            </div>
          </div>
        </div>

        {/* পেমেন্ট পদ্ধতি */}
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:6 }}>পেমেন্ট পদ্ধতি</label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {METHODS.map(m => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                style={{
                  padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:600,
                  border: method === m.value ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                  background: method === m.value ? '#eff6ff' : '#fff',
                  color: method === m.value ? '#1d4ed8' : '#64748b',
                  cursor:'pointer'
                }}
              >{m.label}</button>
            ))}
          </div>
        </div>

        {/* রেফারেন্স */}
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:6 }}>পেমেন্ট রেফারেন্স (ঐচ্ছিক)</label>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f1f5f9', borderRadius:10, padding:'10px 12px' }}>
            <FiHash size={14} color="#94a3b8" />
            <input
              value={ref} onChange={e => setRef(e.target.value)}
              placeholder={`SAL-${year}-${String(month).padStart(2,'0')}-XXXXX`}
              style={{ border:'none', background:'none', outline:'none', fontSize:13, color:'#1e293b', flex:1, fontFamily:'monospace' }}
            />
          </div>
        </div>

        {/* নোট */}
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, color:'#64748b', display:'block', marginBottom:6 }}>নোট (ঐচ্ছিক)</label>
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="বিশেষ মন্তব্য..."
            rows={2}
            style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 12px', fontSize:13, outline:'none', resize:'none', boxSizing:'border-box' }}
          />
        </div>

        <button
          onClick={handlePay}
          disabled={loading}
          style={{ width:'100%', padding:14, borderRadius:12, background: loading ? '#93c5fd' : '#1d4ed8', color:'#fff', fontWeight:700, fontSize:15, border:'none', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'পরিশোধ হচ্ছে...' : `${taka(deductDues ? net : adjusted)} বেতন পরিশোধ নিশ্চিত করুন`}
        </button>
      </div>
    </div>
  )
}

// ─── স্যালারি স্লিপ Modal ────────────────────────────────────
function SlipModal({ worker, month, year, onClose, onCancel, isAdmin }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/salary/worker/${worker.worker_id}?month=${month}&year=${year}`)
      .then(res => setDetail(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const pay = detail?.payment

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 16px 36px', width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontWeight:700, fontSize:16, color:'#1e293b', margin:0 }}>বেতন স্লিপ</h3>
          <button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer' }}><FiX size={20} color="#64748b" /></button>
        </div>

        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>লোড হচ্ছে...</div>
        ) : !detail ? (
          <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>তথ্য পাওয়া যায়নি</div>
        ) : (
          <>
            {/* হেডার */}
            <div style={{ background:'linear-gradient(135deg,#1e3a8a,#1d4ed8)', borderRadius:14, padding:'14px 16px', color:'#fff', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{detail.worker.name_bn}</div>
              <div style={{ fontSize:11, opacity:0.75 }}>{detail.worker.employee_code} · {MONTHS_BN[month]} {year}</div>
              <div style={{ marginTop:10, fontSize:20, fontWeight:800 }}>{taka(detail.salary.net_payable)}</div>
              <div style={{ fontSize:11, opacity:0.75, marginTop:2 }}>নেট পাওনা</div>
            </div>

            {/* বেতন বিস্তারিত */}
            <div style={{ background:'#f8fafc', borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize:12, color:'#64748b', marginBottom:8 }}>বেতনের হিসাব</div>
              {[
                { label:'মূল বেতন',        value: taka(detail.salary.basic_salary),          plus:true,  color:'#1e293b' },
                { label:'বিক্রয় কমিশন',   value: taka(detail.salary.sales_commission),      plus:true,  color:'#1d4ed8' },
                { label:'উপস্থিতি বোনাস',  value: taka(detail.salary.attendance_bonus),      plus:true,  color:'#15803d' },
                { label:'উপস্থিতি কর্তন',  value: taka(detail.salary.attendance_deduction),  plus:false, color:'#dc2626' },
                { label:'বকেয়া কর্তন',     value: taka(detail.salary.outstanding_dues),      plus:false, color:'#b45309' },
              ].map(({ label, value, plus, color }) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:12, color:'#64748b' }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:600, color }}>{plus ? '' : '− '}{value}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', borderTop:'2px solid #e2e8f0', paddingTop:8, marginTop:4 }}>
                <span style={{ fontWeight:700, fontSize:14 }}>নেট পাওনা</span>
                <span style={{ fontWeight:800, fontSize:16, color:'#1d4ed8' }}>{taka(detail.salary.net_payable)}</span>
              </div>
            </div>

            {/* উপস্থিতি সারাংশ */}
            <div style={{ background:'#f0fdf4', borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize:12, color:'#64748b', marginBottom:8 }}>উপস্থিতি</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {[
                  { label:'উপস্থিত', value: detail.attendance.present_days, color:'#15803d' },
                  { label:'অনুপস্থিত', value: detail.attendance.absent_days, color:'#dc2626' },
                  { label:'দেরি',    value: detail.attendance.late_days,    color:'#b45309' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign:'center' }}>
                    <div style={{ fontWeight:800, fontSize:18, color }}>{value}</div>
                    <div style={{ fontSize:11, color:'#64748b' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* পরিশোধের তথ্য */}
            {pay ? (
              <div style={{ background:'#f0fdf4', borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
                <div style={{ fontWeight:700, fontSize:12, color:'#15803d', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                  <FiCheckCircle size={13} /> পরিশোধিত
                </div>
                {[
                  { label:'তারিখ', value: new Date(pay.paid_at).toLocaleString('bn-BD') },
                  { label:'পদ্ধতি', value: METHODS.find(m => m.value === pay.payment_method)?.label || pay.payment_method },
                  { label:'রেফারেন্স', value: pay.payment_reference },
                  { label:'অনুমোদন', value: pay.approved_by_name },
                  pay.note && { label:'নোট', value: pay.note },
                ].filter(Boolean).map(({ label, value }) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:12, color:'#64748b' }}>{label}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'#1e293b', maxWidth:'60%', textAlign:'right', fontFamily: label==='রেফারেন্স' ? 'monospace' : 'inherit' }}>{value}</span>
                  </div>
                ))}
                {isAdmin && (
                  <button
                    onClick={() => onCancel(pay.id)}
                    style={{ marginTop:8, width:'100%', padding:'8px', borderRadius:8, background:'#fee2e2', color:'#dc2626', border:'none', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}
                  >
                    <FiTrash2 size={12} /> পরিশোধ বাতিল (২৪ ঘণ্টার মধ্যে)
                  </button>
                )}
              </div>
            ) : (
              <div style={{ background:'#fffbeb', borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
                <FiClock size={14} color="#b45309" />
                <span style={{ fontSize:12, color:'#92400e' }}>এখনো পরিশোধ হয়নি</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── মূল পেজ ────────────────────────────────────────────────
export default function SalaryPayment() {
  const now = new Date()
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [year, setYear]       = useState(now.getFullYear())
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [payTarget, setPayTarget]   = useState(null)
  const [slipTarget, setSlipTarget] = useState(null)

  const fetchData = () => {
    setLoading(true)
    api.get(`/salary/sheet?month=${month}&year=${year}`)
      .then(res => setData(res.data.data?.workers || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [month, year])

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (isCurrentMonth) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const handleCancel = async (paymentId) => {
    if (!window.confirm('পরিশোধ বাতিল করবেন?')) return
    try {
      const res = await api.delete(`/salary/payment/${paymentId}`)
      toast.success(res.data.message)
      setSlipTarget(null)
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.message || 'বাতিল করতে সমস্যা হয়েছে।')
    }
  }

  const filtered = data.filter(w =>
    !search ||
    w.name_bn?.includes(search) ||
    w.employee_code?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPaid   = filtered.filter(w => w.is_paid).reduce((s, w) => s + parseFloat(w.net_payable || 0), 0)
  const totalUnpaid = filtered.filter(w => !w.is_paid).reduce((s, w) => s + parseFloat(w.calculated_net || w.net_payable || 0), 0)
  const paidCount   = filtered.filter(w => w.is_paid).length
  const unpaidCount = filtered.filter(w => !w.is_paid).length

  return (
    <div style={{ padding:'16px', paddingBottom:80, background:'#f8fafc', minHeight:'100vh' }}>

      <h2 style={{ fontWeight:700, fontSize:18, color:'#1e293b', marginBottom:12 }}>বেতন পরিশোধ</h2>

      {/* মাস নেভিগেটর */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff', borderRadius:14, padding:'10px 14px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginBottom:14 }}>
        <button onClick={prevMonth} style={{ border:'none', background:'none', padding:4, cursor:'pointer', color:'#64748b' }}><FiChevronLeft size={20} /></button>
        <span style={{ fontWeight:600, color:'#1e293b', fontSize:15 }}>{MONTHS_BN[month]} {year}</span>
        <button onClick={nextMonth} disabled={isCurrentMonth} style={{ border:'none', background:'none', padding:4, cursor: isCurrentMonth ? 'default' : 'pointer', color: isCurrentMonth ? '#cbd5e1' : '#64748b' }}><FiChevronRight size={20} /></button>
      </div>

      {/* Summary */}
      {!loading && data.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:'12px 14px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <span style={{ background:'#fef3c7', color:'#b45309', padding:5, borderRadius:8, display:'flex' }}><FiClock size={14} /></span>
              <span style={{ fontSize:11, color:'#64748b' }}>বাকি বেতন</span>
            </div>
            <p style={{ fontWeight:800, fontSize:16, color:'#b45309', margin:0 }}>{taka(totalUnpaid)}</p>
            <p style={{ fontSize:11, color:'#94a3b8', margin:'2px 0 0' }}>{unpaidCount}জন SR</p>
          </div>
          <div style={{ background:'#fff', borderRadius:14, padding:'12px 14px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <span style={{ background:'#dcfce7', color:'#15803d', padding:5, borderRadius:8, display:'flex' }}><FiCheckCircle size={14} /></span>
              <span style={{ fontSize:11, color:'#64748b' }}>পরিশোধিত বেতন</span>
            </div>
            <p style={{ fontWeight:800, fontSize:16, color:'#15803d', margin:0 }}>{taka(totalPaid)}</p>
            <p style={{ fontSize:11, color:'#94a3b8', margin:'2px 0 0' }}>{paidCount}জন SR</p>
          </div>
        </div>
      )}

      {/* সার্চ */}
      <div style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', borderRadius:12, padding:'10px 14px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', marginBottom:12 }}>
        <FiSearch size={15} color="#94a3b8" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="SR নাম বা কোড..." style={{ border:'none', outline:'none', fontSize:13, color:'#1e293b', flex:1, background:'none' }} />
        {search && <button onClick={() => setSearch('')} style={{ border:'none', background:'none', cursor:'pointer' }}><FiX size={14} color="#94a3b8" /></button>}
      </div>

      {/* Worker লিস্ট */}
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[1,2,3,4,5].map(i => <div key={i} style={{ height:76, background:'#fff', borderRadius:14 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:48, color:'#94a3b8', fontSize:14 }}>
          <FiDollarSign size={32} style={{ marginBottom:8, opacity:0.4 }} />
          <p>কোনো তথ্য পাওয়া যায়নি</p>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', overflow:'hidden' }}>
          {filtered.map((worker, i) => {
            const net = parseFloat(worker.calculated_net || worker.net_payable || 0)
            return (
              <div
                key={worker.worker_id}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', background: i % 2 === 0 ? '#fff' : '#fafafa' }}
              >
                {/* বাম */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                    <span style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>{worker.name_bn}</span>
                    <span style={{ fontSize:10, color:'#94a3b8' }}>{worker.employee_code}</span>
                  </div>
                  <div style={{ fontSize:11, color:'#64748b' }}>
                    মূল: {taka(worker.basic_salary)} · কমিশন: {taka(worker.total_commission)}
                    {parseFloat(worker.attendance_deduction) > 0 && (
                      <span style={{ color:'#dc2626' }}> · কর্তন: {taka(worker.attendance_deduction)}</span>
                    )}
                  </div>
                </div>

                {/* ডান */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, marginLeft:10 }}>
                  <span style={{ fontWeight:800, fontSize:15, color: worker.is_paid ? '#15803d' : '#b45309' }}>
                    {taka(worker.is_paid ? worker.net_payable : net)}
                  </span>
                  <div style={{ display:'flex', gap:6 }}>
                    <button
                      onClick={() => setSlipTarget(worker)}
                      style={{ background:'#f1f5f9', color:'#64748b', border:'none', borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}
                    >
                      <FiEye size={11} /> স্লিপ
                    </button>
                    {!worker.is_paid && net > 0 && (
                      <button
                        onClick={() => setPayTarget(worker)}
                        style={{ background:'#1d4ed8', color:'#fff', border:'none', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:600, cursor:'pointer' }}
                      >
                        পরিশোধ
                      </button>
                    )}
                    {worker.is_paid && (
                      <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                        <FiCheckCircle size={12} color="#15803d" />
                        <span style={{ fontSize:10, color:'#15803d', fontWeight:600 }}>সম্পন্ন</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {payTarget && (
        <PayModal
          worker={payTarget} month={month} year={year}
          onClose={() => setPayTarget(null)}
          onSuccess={() => { setPayTarget(null); fetchData() }}
        />
      )}
      {slipTarget && (
        <SlipModal
          worker={slipTarget} month={month} year={year}
          onClose={() => setSlipTarget(null)}
          onCancel={handleCancel}
          isAdmin={true}
        />
      )}
    </div>
  )
}
