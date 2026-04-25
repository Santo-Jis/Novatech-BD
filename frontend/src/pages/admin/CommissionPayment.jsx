import { useState, useEffect } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiDollarSign, FiCheckCircle, FiClock, FiChevronLeft, FiChevronRight,
  FiUser, FiHash, FiAlertCircle, FiSearch, FiX
} from 'react-icons/fi'

// ─── বাংলা মাসের নাম ───────────────────────────────────────
const MONTHS_BN = ['', 'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর']

const taka = (n) => '৳' + parseInt(n || 0).toLocaleString('en-IN')

// ─── পেমেন্ট Modal ─────────────────────────────────────────
function PayModal({ worker, month, year, onClose, onSuccess }) {
  const [ref, setRef]       = useState('')
  const [note, setNote]     = useState('')
  const [loading, setLoading] = useState(false)

  const handlePay = async () => {
    setLoading(true)
    try {
      const res = await api.post('/commission/pay', {
        worker_id:         worker.worker_id,
        month,
        year,
        payment_reference: ref.trim() || undefined,
        note:              note.trim() || undefined
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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0',
          padding: '20px 16px 32px', width: '100%', maxWidth: 500
        }}
      >
        {/* হেডার */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', margin: 0 }}>
            কমিশন পরিশোধ
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer' }}>
            <FiX size={20} color="#64748b" />
          </button>
        </div>

        {/* Worker তথ্য */}
        <div style={{
          background: '#f8fafc', borderRadius: 12, padding: '12px 14px', marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <FiUser size={14} color="#64748b" />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{worker.name_bn}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>({worker.employee_code})</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              {MONTHS_BN[month]} {year} — অপরিশোধিত কমিশন
            </span>
            <span style={{ fontWeight: 800, fontSize: 18, color: '#1d4ed8' }}>
              {taka(worker.unpaid_amount)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            {worker.unpaid_entries}টি এন্ট্রি
          </div>
        </div>

        {/* Payment Reference */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
            পেমেন্ট রেফারেন্স (ঐচ্ছিক — না দিলে auto generate হবে)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', borderRadius: 10, padding: '10px 12px' }}>
            <FiHash size={14} color="#94a3b8" />
            <input
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder={`PAY-${year}-${String(month).padStart(2,'0')}-XXXXX`}
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, color: '#1e293b', flex: 1, fontFamily: 'monospace' }}
            />
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>
            নোট (ঐচ্ছিক)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="যেমন: মাসিক বেতনের সাথে পরিশোধ"
            rows={2}
            style={{
              width: '100%', border: '1px solid #e2e8f0', borderRadius: 10,
              padding: '10px 12px', fontSize: 13, color: '#1e293b',
              outline: 'none', resize: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Confirm বাটন */}
        <button
          onClick={handlePay}
          disabled={loading}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: loading ? '#93c5fd' : '#1d4ed8',
            color: '#fff', fontWeight: 700, fontSize: 15,
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'পরিশোধ হচ্ছে...' : `${taka(worker.unpaid_amount)} পরিশোধ নিশ্চিত করুন`}
        </button>
      </div>
    </div>
  )
}

// ─── মূল পেজ ────────────────────────────────────────────────
export default function CommissionPayment() {
  const now = new Date()
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [year, setYear]       = useState(now.getFullYear())
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)   // pay modal এর জন্য

  const fetchData = () => {
    setLoading(true)
    api.get(`/commission/payable?month=${month}&year=${year}`)
      .then(res => setData(res.data.data || []))
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

  // সার্চ ফিল্টার
  const filtered = data.filter(w =>
    !search ||
    w.name_bn?.includes(search) ||
    w.employee_code?.toLowerCase().includes(search.toLowerCase())
  )

  // Summary
  const totalUnpaid  = filtered.reduce((s, w) => s + parseFloat(w.unpaid_amount  || 0), 0)
  const totalPaid    = filtered.reduce((s, w) => s + (parseFloat(w.total_commission || 0) - parseFloat(w.unpaid_amount || 0)), 0)
  const unpaidCount  = filtered.filter(w => parseFloat(w.unpaid_amount) > 0).length
  const fullyPaidCount = filtered.filter(w => parseFloat(w.unpaid_amount) === 0 && parseFloat(w.total_commission) > 0).length

  return (
    <div style={{ padding: '16px', paddingBottom: 80, background: '#f8fafc', minHeight: '100vh' }}>

      {/* হেডার */}
      <h2 style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', marginBottom: 12 }}>
        কমিশন পরিশোধ
      </h2>

      {/* মাস নেভিগেটর */}
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
          disabled={isCurrentMonth}
          style={{ border: 'none', background: 'none', padding: 4, cursor: isCurrentMonth ? 'default' : 'pointer', color: isCurrentMonth ? '#cbd5e1' : '#64748b' }}
        >
          <FiChevronRight size={20} />
        </button>
      </div>

      {/* Summary কার্ড */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ background: '#fef3c7', color: '#b45309', padding: 5, borderRadius: 8, display: 'flex' }}><FiClock size={14} /></span>
              <span style={{ fontSize: 11, color: '#64748b' }}>বাকি পরিশোধ</span>
            </div>
            <p style={{ fontWeight: 800, fontSize: 16, color: '#b45309', margin: 0 }}>{taka(totalUnpaid)}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0 0' }}>{unpaidCount}জন SR</p>
          </div>
          <div style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ background: '#dcfce7', color: '#15803d', padding: 5, borderRadius: 8, display: 'flex' }}><FiCheckCircle size={14} /></span>
              <span style={{ fontSize: 11, color: '#64748b' }}>পরিশোধিত</span>
            </div>
            <p style={{ fontWeight: 800, fontSize: 16, color: '#15803d', margin: 0 }}>{taka(totalPaid)}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0 0' }}>{fullyPaidCount}জন SR</p>
          </div>
        </div>
      )}

      {/* সার্চ বার */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#fff', borderRadius: 12, padding: '10px 14px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12
      }}>
        <FiSearch size={15} color="#94a3b8" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="SR নাম বা কোড দিয়ে খুঁজুন..."
          style={{ border: 'none', outline: 'none', fontSize: 13, color: '#1e293b', flex: 1, background: 'none' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer' }}>
            <FiX size={14} color="#94a3b8" />
          </button>
        )}
      </div>

      {/* Worker লিস্ট */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: 72, background: '#fff', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>
          <FiDollarSign size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p>কোনো তথ্য পাওয়া যায়নি</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          {filtered.map((worker, i) => {
            const unpaidAmt   = parseFloat(worker.unpaid_amount || 0)
            const totalComm   = parseFloat(worker.total_commission || 0)
            const isPending   = unpaidAmt > 0
            const hasAny      = totalComm > 0

            return (
              <div
                key={worker.worker_id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
                  background: i % 2 === 0 ? '#fff' : '#fafafa',
                  opacity: hasAny ? 1 : 0.5
                }}
              >
                {/* বাম: SR তথ্য */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                      {worker.name_bn}
                    </span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                      {worker.employee_code}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    মোট কমিশন: {taka(totalComm)}
                    {worker.unpaid_entries > 0 && (
                      <span style={{ color: '#b45309', marginLeft: 6 }}>
                        · {worker.unpaid_entries}টি বাকি
                      </span>
                    )}
                  </div>
                </div>

                {/* ডান: স্ট্যাটাস + বাটন */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, marginLeft: 10 }}>
                  {isPending ? (
                    <>
                      <span style={{ fontWeight: 800, fontSize: 15, color: '#b45309' }}>
                        {taka(unpaidAmt)}
                      </span>
                      <button
                        onClick={() => setSelected(worker)}
                        style={{
                          background: '#1d4ed8', color: '#fff',
                          border: 'none', borderRadius: 8,
                          padding: '5px 12px', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                      >
                        পরিশোধ করুন
                      </button>
                    </>
                  ) : hasAny ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FiCheckCircle size={13} color="#15803d" />
                      <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>সম্পূর্ণ পরিশোধিত</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FiAlertCircle size={13} color="#94a3b8" />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>কমিশন নেই</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pay Modal */}
      {selected && (
        <PayModal
          worker={selected}
          month={month}
          year={year}
          onClose={() => setSelected(null)}
          onSuccess={() => { setSelected(null); fetchData() }}
        />
      )}
    </div>
  )
}
