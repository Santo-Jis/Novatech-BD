import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

// কাস্টমারের WhatsApp/Email লিংক: https://<app>/#/verify/<token>
// Public পেজ — লগইন লাগে না, তাই shared `api` (auth interceptor) ব্যবহার না করে plain axios।
const API_BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api')
  : '/api'

const PAYMENT = { cash: 'নগদ', credit: 'বাকি', replacement: 'রিপ্লেসমেন্ট' }

const VIEW = {
  success: { icon: '✅', color: '#059669', title: 'অর্ডার নিশ্চিত হয়েছে!', sub: 'আপনার ক্রয় সফলভাবে যাচাই হয়েছে।' },
  already: { icon: '✅', color: '#2563eb', title: 'আগেই যাচাই হয়েছে', sub: 'এই অর্ডারটি আগেই নিশ্চিত করা হয়েছে।' },
  expired: { icon: '⏰', color: '#d97706', title: 'মেয়াদ শেষ', sub: 'যাচাইয়ের সময় পেরিয়ে গেছে। SR-কে জানান।' },
  invalid: { icon: '❌', color: '#dc2626', title: 'লিংকটি বৈধ নয়', sub: 'লিংকটি ভুল বা পুরনো।' },
  error:   { icon: '❌', color: '#dc2626', title: 'সমস্যা হয়েছে', sub: 'আবার চেষ্টা করুন।' },
}

export default function OrderVerify() {
  const { token } = useParams()
  const [status, setStatus] = useState('loading') // loading | pending | success | already | expired | invalid | error
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    axios.get(`${API_BASE}/sales/verify/${token}`, { timeout: 15000 })
      .then(r => { if (alive) { setData(r.data.data); setStatus(r.data.status) } })
      .catch(e => { if (alive) setStatus(e.response?.data?.status || 'error') })
    return () => { alive = false }
  }, [token])

  const confirm = async () => {
    setBusy(true)
    try {
      const r = await axios.post(`${API_BASE}/sales/verify/${token}`, {}, { timeout: 15000 })
      setStatus(r.data.status)
    } catch (e) {
      setStatus(e.response?.data?.status || 'error')
    } finally { setBusy(false) }
  }

  const v = VIEW[status]
  // আংশিক পেমেন্ট: payment_method 'credit' কিন্তু কিছু নগদ নেওয়া হয়েছে
  const isPartial = data?.payment_method === 'credit' && parseFloat(data?.cash_received) > 0

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                  background: 'linear-gradient(135deg,#0f172a,#1e3a8a)' }}>
      <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 380, overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', padding: '22px 20px 18px', textAlign: 'center' }}>
          <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 800, margin: 0 }}>ZovoriX</h3>
        </div>
        <div style={{ padding: '28px 22px', textAlign: 'center' }}>
          {status === 'loading' && <p style={{ color: '#6b7280' }}>লোড হচ্ছে…</p>}

          {status === 'pending' && data && (
            <>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#1e3a8a', marginBottom: 4 }}>অর্ডার নিশ্চিত করুন</p>
              <p style={{ fontSize: 13.5, color: '#6b7280' }}>নিচের তথ্য ঠিক থাকলে বাটনে চাপ দিন।</p>
              <div style={{ margin: '18px 0', background: '#f8fafc', borderRadius: 14, padding: 14, textAlign: 'left', fontSize: 13 }}>
                <Row l="Invoice" r={data.invoice_number} mono />
                <Row l="দোকান" r={data.shop_name} />
                <Row l="পেমেন্ট" r={isPartial ? 'আংশিক (নগদ + বাকি)' : (PAYMENT[data.payment_method] || data.payment_method)} />
                {isPartial && <Row l="নগদ প্রাপ্ত" r={`৳${parseFloat(data.cash_received).toLocaleString()}`} />}
                {isPartial && <Row l="বাকি" r={`৳${parseFloat(data.credit_used || 0).toLocaleString()}`} />}
              </div>
              <p style={{ fontSize: 30, fontWeight: 800, color: '#1e3a8a', margin: '0 0 16px' }}>
                ৳{parseFloat(data.net_amount || 0).toLocaleString()}
              </p>
              <button onClick={confirm} disabled={busy}
                style={{ width: '100%', padding: '14px 0', border: 0, borderRadius: 14, background: '#1e3a8a',
                         color: '#fff', fontWeight: 700, fontSize: 16, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'অপেক্ষা করুন…' : '✓ অর্ডার নিশ্চিত করুন'}
              </button>
            </>
          )}

          {v && status !== 'pending' && (
            <>
              <div style={{ fontSize: 44, marginBottom: 10 }}>{v.icon}</div>
              <p style={{ fontSize: 21, fontWeight: 800, color: v.color, marginBottom: 6 }}>{v.title}</p>
              <p style={{ fontSize: 13.5, color: '#6b7280' }}>{v.sub}</p>
              {data && (status === 'success' || status === 'already') && (
                <p style={{ fontSize: 28, fontWeight: 800, color: '#1e3a8a', marginTop: 16 }}>
                  ৳{parseFloat(data.net_amount || 0).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const Row = ({ l, r, mono }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
    <span style={{ color: '#9ca3af' }}>{l}</span>
    <span style={{ fontWeight: 700, color: '#1f2937', fontFamily: mono ? 'monospace' : undefined }}>{r}</span>
  </div>
)
