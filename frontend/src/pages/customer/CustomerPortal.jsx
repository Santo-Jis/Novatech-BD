// frontend/src/pages/customer/CustomerPortal.jsx
// কাস্টমার পোর্টাল — WhatsApp লিংক → Google Login → Dashboard

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'

// ── Google Identity Services (GSI) — redirect URI লাগে না ──
// Google এর নতুন recommended approach
const loadGSI = () => new Promise((resolve, reject) => {
  if (window.google?.accounts) { resolve(window.google.accounts); return }
  const script = document.createElement('script')
  script.src   = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.defer = true
  script.onload = () => resolve(window.google.accounts)
  script.onerror = () => reject(new Error('Google login library load হয়নি।'))
  document.head.appendChild(script)
})

const webGoogleLogin = (clientId) => new Promise(async (resolve, reject) => {
  try {
    const accounts = await loadGSI()
    accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope:     'openid email profile',
      callback:  (response) => {
        if (response.error) {
          reject(new Error(response.error === 'access_denied'
            ? 'লগইন বাতিল করা হয়েছে।'
            : `Google error: ${response.error}`))
        } else {
          resolve(response.access_token)
        }
      },
    }).requestAccessToken()
  } catch (err) {
    reject(err)
  }
})

// ── Backend URL ───────────────────────────────────────────────
const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// ── Device Fingerprint — persistent + hardware-based strong ID ──
//
// দুই স্তরে তৈরি:
//   ১. Persistent ID  — IndexedDB-তে random UUID store করা হয়।
//      একবার তৈরি হলে browser clear না করা পর্যন্ত একই থাকে।
//      localStorage ব্যবহার করা হয়নি — private mode-এ wipe হয়।
//
//   ২. Hardware signals — canvas fingerprint + audio context + fonts।
//      এগুলো device-specific এবং JS দিয়ে সহজে override করা যায় না।
//
//   দুটো মিলিয়ে final ID তৈরি হয় → server-side তার সাথে
//   User-Agent ও IP মিশিয়ে SHA-256 hash করে।
//   শুধু device_id চুরি করলেই হবে না — UA ও IP-ও মিলতে হবে।

// IndexedDB থেকে persistent device UUID পড়া/তৈরি করা
const getPersistentDeviceId = () => new Promise((resolve) => {
  try {
    const DB_NAME    = 'portal_device'
    const STORE_NAME = 'ids'
    const KEY        = 'device_uuid'

    const req = indexedDB.open(DB_NAME, 1)

    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME)
    }

    req.onsuccess = (e) => {
      const db  = e.target.result
      const tx  = db.transaction(STORE_NAME, 'readwrite')
      const st  = tx.objectStore(STORE_NAME)
      const get = st.get(KEY)

      get.onsuccess = () => {
        if (get.result) {
          resolve(get.result)
        } else {
          // প্রথমবার — random UUID তৈরি করে store করো
          const uuid = crypto.randomUUID
            ? crypto.randomUUID()
            : Array.from(crypto.getRandomValues(new Uint8Array(16)))
                .map(b => b.toString(16).padStart(2, '0')).join('-')
          st.put(uuid, KEY)
          resolve(uuid)
        }
      }
      get.onerror = () => resolve('idb-error')
    }

    req.onerror = () => resolve('idb-open-error')
  } catch {
    resolve('idb-unavailable')
  }
})

// Canvas fingerprint — GPU rendering থেকে hardware-specific signal
const getCanvasFingerprint = () => {
  try {
    const canvas  = document.createElement('canvas')
    canvas.width  = 200
    canvas.height = 50
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'no-canvas'

    ctx.textBaseline = 'top'
    ctx.font         = '14px Arial'
    ctx.fillStyle    = '#f60'
    ctx.fillRect(0, 0, 200, 50)
    ctx.fillStyle    = '#069'
    ctx.fillText('NovaTech Portal 🔐', 2, 15)
    ctx.fillStyle    = 'rgba(102,204,0,0.8)'
    ctx.fillText('NovaTech Portal 🔐', 4, 25)

    return canvas.toDataURL().slice(-80)   // শেষ ৮০ char — pixel hash
  } catch {
    return 'canvas-blocked'
  }
}

// Audio context fingerprint — audio hardware থেকে signal
const getAudioFingerprint = () => {
  try {
    const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
    if (!AudioCtx) return Promise.resolve('no-audio')

    return new Promise((resolve) => {
      const ctx  = new AudioCtx(1, 44100, 44100)
      const osc  = ctx.createOscillator()
      const comp = ctx.createDynamicsCompressor()

      osc.type = 'triangle'
      osc.frequency.value = 10000
      osc.connect(comp)
      comp.connect(ctx.destination)
      osc.start(0)

      ctx.startRendering()
      ctx.oncomplete = (e) => {
        const data = e.renderedBuffer.getChannelData(0)
        let sum = 0
        for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i])
        resolve(sum.toString().slice(0, 12))
      }

      // timeout — কিছু browser-এ oncomplete না আসলে fallback
      setTimeout(() => resolve('audio-timeout'), 500)
    })
  } catch {
    return Promise.resolve('audio-error')
  }
}

// Main: সব signal একত্রিত করে persistent fingerprint তৈরি
const getDeviceFingerprint = async () => {
  try {
    const [persistentId, audioFp] = await Promise.all([
      getPersistentDeviceId(),
      getAudioFingerprint(),
    ])

    const canvasFp = getCanvasFingerprint()

    const parts = [
      persistentId,                              // IndexedDB UUID (persistent)
      canvasFp,                                  // GPU-based canvas hash
      audioFp,                                   // Audio hardware signal
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}`,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || '',
      navigator.platform || '',
    ]

    // SubtleCrypto দিয়ে SHA-256 hash — btoa থেকে অনেক বেশি collision-resistant
    const encoded = new TextEncoder().encode(parts.join('||'))
    const hashBuf = await crypto.subtle.digest('SHA-256', encoded)
    const hashArr = Array.from(new Uint8Array(hashBuf))
    return hashArr.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 64)
  } catch {
    // Fallback: sync version (old behavior) — SubtleCrypto না থাকলে
    try {
      const parts = [
        navigator.userAgent, navigator.language,
        `${screen.width}x${screen.height}`,
        screen.colorDepth, new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || '', navigator.platform || '',
      ]
      return btoa(parts.join('|')).replace(/[/+=]/g, '').slice(0, 64)
    } catch {
      // সম্পূর্ণ ব্যর্থ হলে — random UUID দিয়ে unique id তৈরি করো
      // এটা session-এ সাময়িক, কিন্তু 'unknown-device' এর মতো সবার একই হবে না
      try {
        return crypto.randomUUID().replace(/-/g, '')
      } catch {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
      }
    }
  }
}

// ── portalFetch — timeout (15s) + retry (1 বার) সহ ──────────
const portalFetch = async (path, options = {}, retries = 1) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

  try {
    const res = await fetch(`${BACKEND}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timeout)
    const data = await res.json()
    if (!res.ok) throw { status: res.status, message: data.message || 'Error' }
    return data
  } catch (err) {
    clearTimeout(timeout)
    // Network error বা timeout হলে একবার retry করো (401/403 retry করবে না)
    if (retries > 0 && err.name !== 'AbortError' && !err.status) {
      await new Promise(r => setTimeout(r, 1000)) // 1s পরে retry
      return portalFetch(path, options, retries - 1)
    }
    throw err
  }
}

// ── Helpers ───────────────────────────────────────────────────
const fmt     = (n) => parseFloat(n || 0).toLocaleString('bn-BD', { minimumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Monthly Trend Chart (SVG-based, no deps) ─────────────────
function MonthlyTrendChart({ portalJWT }) {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [metric,  setMetric]  = useState('total_purchase') // or 'total_invoices'

  useEffect(() => {
    portalFetch('/portal/monthly-summary?months=6', {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
    .then(res => {
      // oldest first for chart
      setData([...(res.data || [])].reverse())
    })
    .catch(console.error)
    .finally(() => setLoading(false))
  }, [portalJWT])

  if (loading) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, border: '3px solid #e0e7ff', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  if (!data.length) return (
    <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '16px 0' }}>এখনও তথ্য নেই।</p>
  )

  const values   = data.map(d => parseFloat(d[metric] || 0))
  const maxVal   = Math.max(...values, 1)
  const W = 300, H = 120, PAD = { t: 12, r: 12, b: 32, l: 48 }
  const chartW   = W - PAD.l - PAD.r
  const chartH   = H - PAD.t - PAD.b
  const stepX    = values.length > 1 ? chartW / (values.length - 1) : chartW

  const pts = values.map((v, i) => ({
    x: PAD.l + i * stepX,
    y: PAD.t + chartH - (v / maxVal) * chartH,
    v,
  }))

  // smooth bezier path
  const pathD = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x},${pt.y}`
    const prev = pts[i - 1]
    const cx   = (prev.x + pt.x) / 2
    return acc + ` C${cx},${prev.y} ${cx},${pt.y} ${pt.x},${pt.y}`
  }, '')

  const areaD = pathD + ` L${pts[pts.length-1].x},${PAD.t+chartH} L${pts[0].x},${PAD.t+chartH} Z`

  const fmtBn = (n) => {
    if (metric === 'total_invoices') return String(Math.round(n))
    if (n >= 100000)  return `${(n/100000).toFixed(1)}L`
    if (n >= 1000)    return `${(n/1000).toFixed(0)}K`
    return String(Math.round(n))
  }

  const monthLabel = (ml) => {
    if (!ml) return ''
    const [y, m] = ml.split('-')
    const names = ['', 'জান', 'ফেব', 'মার', 'এপ্র', 'মে', 'জুন', 'জুল', 'আগ', 'সেপ', 'অক্ট', 'নভ', 'ডিস']
    return names[parseInt(m)] || m
  }

  return (
    <div>
      {/* Metric Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { key: 'total_purchase', label: '৳ কেনাকাটা' },
          { key: 'total_invoices', label: '# ইনভয়েস' },
          { key: 'total_cash',     label: '৳ নগদ' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setMetric(key)}
            style={{
              padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              background: metric === key ? '#4f46e5' : '#f3f4f6',
              color: metric === key ? 'white' : '#6b7280',
              transition: 'all 0.2s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* SVG Chart */}
      <div style={{ background: 'linear-gradient(135deg,#f0f4ff,#faf5ff)', borderRadius: 16, padding: '12px 8px 4px', overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02"/>
            </linearGradient>
          </defs>

          {/* Y-axis grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = PAD.t + chartH - pct * chartH
            return (
              <g key={pct}>
                <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                  stroke="#e0e7ff" strokeWidth="0.7" strokeDasharray="3,3"/>
                <text x={PAD.l - 4} y={y + 3.5} textAnchor="end"
                  fontSize="8" fill="#a5b4fc">
                  {fmtBn(maxVal * pct)}
                </text>
              </g>
            )
          })}

          {/* Area fill */}
          <path d={areaD} fill="url(#chartGrad)"/>

          {/* Line */}
          <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>

          {/* Data points + labels */}
          {pts.map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r="4" fill="#fff" stroke="#6366f1" strokeWidth="2"/>
              <text x={pt.x} y={pt.y - 7} textAnchor="middle" fontSize="8" fill="#4f46e5" fontWeight="600">
                {fmtBn(pt.v)}
              </text>
              {/* X-axis label */}
              <text x={pt.x} y={H - 6} textAnchor="middle" fontSize="8.5" fill="#7c3aed">
                {monthLabel(data[i]?.month_label)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Legend row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 9, color: '#7c3aed', fontWeight: 700 }}>
              {monthLabel(d.month_label)}
            </p>
            <p style={{ margin: 0, fontSize: 9, color: '#6b7280' }}>
              {d.total_invoices || 0}টি
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Payment Badge ─────────────────────────────────────────────
const PayBadge = ({ method }) => {
  const map = {
    cash:        { label: 'নগদ',          color: 'bg-green-100 text-green-700' },
    credit:      { label: 'বাকি',          color: 'bg-red-100 text-red-700' },
    replacement: { label: 'রিপ্লেসমেন্ট', color: 'bg-blue-100 text-blue-700' },
  }
  const m = map[method] || { label: method, color: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.color}`}>{m.label}</span>
}

// ── Order Status Badge ────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    pending:   { label: '⏳ অপেক্ষমাণ',  color: 'bg-yellow-100 text-yellow-700' },
    confirmed: { label: '✅ কনফার্ম',     color: 'bg-blue-100 text-blue-700' },
    assigned:  { label: '🚶 SR আসছে',    color: 'bg-purple-100 text-purple-700' },
    delivered: { label: '📦 সম্পন্ন',     color: 'bg-green-100 text-green-700' },
    cancelled: { label: '❌ বাতিল',       color: 'bg-red-100 text-red-700' },
  }
  const s = map[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
}

// ── Invoice Card ──────────────────────────────────────────────
function InvoiceCard({ sale }) {
  const [open, setOpen] = useState(false)
  const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || [])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button className="w-full px-4 py-3 flex items-center justify-between" onClick={() => setOpen(v => !v)}>
        <div className="text-left">
          <p className="text-xs text-gray-400">{fmtDate(sale.created_at)}</p>
          <p className="font-semibold text-gray-800 text-sm">{sale.invoice_number}</p>
          <p className="text-xs text-gray-400">SR: {sale.sr_name}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-900">৳{fmt(sale.net_amount)}</p>
          <PayBadge method={sale.payment_method} />
          <p className="text-xs mt-1 text-gray-400">{open ? '▲ বন্ধ করুন' : '▼ বিস্তারিত'}</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.product_name} × {item.qty}</span>
                <span className="font-medium text-gray-900">৳{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 pt-2 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>মোট</span><span>৳{fmt(sale.total_amount)}</span>
            </div>
            {parseFloat(sale.discount_amount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>ছাড়</span><span>- ৳{fmt(sale.discount_amount)}</span>
              </div>
            )}
            {parseFloat(sale.replacement_value) > 0 && (
              <div className="flex justify-between text-blue-600">
                <span>রিপ্লেসমেন্ট</span><span>- ৳{fmt(sale.replacement_value)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
              <span>পরিশোধযোগ্য</span><span>৳{fmt(sale.net_amount)}</span>
            </div>
            {parseFloat(sale.cash_received) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>নগদ পেয়েছি</span><span>৳{fmt(sale.cash_received)}</span>
              </div>
            )}
            {parseFloat(sale.credit_used) > 0 && (
              <div className="flex justify-between text-red-500">
                <span>বাকি রাখা হয়েছে</span><span>৳{fmt(sale.credit_used)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Order Tracking Detail Modal ──────────────────────────────
function OrderTrackingModal({ orderId, jwt, onClose }) {
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', padding: 20 }}
        onClick={e => e.stopPropagation()}>
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

// ── Order Request Tab ─────────────────────────────────────────
function OrderRequestTab({ portalJWT }) {
  const [phase,        setPhase]        = useState('list')
  const [products,     setProducts]     = useState([])
  const [requests,     setRequests]     = useState([])
  const [cart,         setCart]         = useState({})
  const [note,         setNote]         = useState('')
  const [loading,      setLoading]      = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [successMsg,   setSuccessMsg]   = useState('')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [trackingId,   setTrackingId]   = useState(null)
  const [deliveredToast, setDeliveredToast] = useState(null)

  const loadRequests = async () => {
    setLoading(true)
    try {
      const data = await portalFetch('/portal/order-requests', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setRequests(data.data || [])
    } catch { setErrorMsg('অর্ডার লিস্ট আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  const [catalogSearch,   setCatalogSearch]   = useState('')
  const [catalogHasNext,  setCatalogHasNext]  = useState(false)
  const [catalogPage,     setCatalogPage]     = useState(1)
  const [catalogTotal,    setCatalogTotal]    = useState(0)
  const [selectedProduct, setSelectedProduct] = useState(null)

  const loadProducts = async (search = '', page = 1, append = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 12 })
      if (search) params.set('search', search)
      const data = await portalFetch(`/portal/products?${params}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      const prods = data.data || []
      if (append) setProducts(prev => [...prev, ...prods])
      else setProducts(prods)
      setCatalogPage(data.pagination?.page || page)
      setCatalogTotal(data.pagination?.total || 0)
      setCatalogHasNext(data.pagination?.has_next || false)
    } catch { setErrorMsg('পণ্য তালিকা আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadRequests() }, [])
  useEffect(() => { if ((phase === 'new' || phase === 'catalog') && products.length === 0) loadProducts() }, [phase])

  // ── Delivered Notification Polling ────────────────────────
  // প্রতি ৩০ সেকেন্ডে অর্ডার refresh করো — status পরিবর্তন detect করো
  useEffect(() => {
    if (phase !== 'list') return
    const prevStatuses = {}
    requests.forEach(r => { prevStatuses[r.id] = r.status })

    const interval = setInterval(async () => {
      try {
        const data = await portalFetch('/portal/order-requests', {
          headers: { Authorization: `Bearer ${portalJWT}` }
        })
        const updated = data.data || []
        // Delivered transition detect করো
        const newlyDelivered = updated.find(r =>
          r.status === 'delivered' && prevStatuses[r.id] && prevStatuses[r.id] !== 'delivered'
        )
        if (newlyDelivered) {
          setDeliveredToast(newlyDelivered)
          setTimeout(() => setDeliveredToast(null), 6000)
        }
        setRequests(updated)
      } catch { /* silent */ }
    }, 30000)

    return () => clearInterval(interval)
  }, [phase, requests, portalJWT])

  const cartCount = Object.values(cart).filter(q => q > 0).length

  const setQty = (productId, qty) => {
    setCart(prev => ({ ...prev, [productId]: Math.max(0, parseInt(qty) || 0) }))
  }

  const handleSubmit = async () => {
    const items = Object.entries(cart)
      .filter(([, qty]) => parseInt(qty) > 0)
      .map(([product_id, qty]) => ({ product_id, qty: parseInt(qty) }))

    if (items.length === 0) { setErrorMsg('কমপক্ষে একটি পণ্য সিলেক্ট করুন।'); return }

    setErrorMsg('')

    setSubmitting(true)
    try {
      const res = await portalFetch('/portal/order-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}` },
        body: JSON.stringify({ items, note })
      })
      setCart({})
      setNote('')
      setSuccessMsg(
        res.has_pending_order
          ? '✅ অর্ডার পাঠানো হয়েছে। তবে আগের একটি অর্ডার এখনো pending আছে — SR শীঘ্রই আসবে। 🎉'
          : 'অর্ডার রিকোয়েস্ট পাঠানো হয়েছে! শীঘ্রই SR আসবে। 🎉'
      )
      setPhase('list')
      loadRequests()
    } catch (e) {
      setErrorMsg(e.message || 'অর্ডার পাঠাতে সমস্যা হয়েছে।')
    } finally { setSubmitting(false) }
  }

  // ── CATALOG VIEW ──────────────────────────────────────────
  if (phase === 'catalog') return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => { setPhase('list'); setProducts([]); setCatalogSearch(''); setSelectedProduct(null) }}
          className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 font-bold transition-colors">
          ←
        </button>
        <div>
          <h3 className="font-bold text-gray-800">পণ্য ক্যাটালগ</h3>
          <p className="text-xs text-gray-400">{catalogTotal > 0 ? `${catalogTotal}টি পণ্য` : 'সব পণ্য দেখুন'} — কার্টে যোগ করুন</p>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setSelectedProduct(null)}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', padding: 0 }}
            onClick={e => e.stopPropagation()}>
            {selectedProduct.image_url && (
              <div style={{ height: 220, background: '#f3f4f6', borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
                <img src={selectedProduct.image_url} alt={selectedProduct.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ padding: '20px 20px 32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1e1e1e', flex: 1, paddingRight: 8 }}>{selectedProduct.name}</h3>
                <button onClick={() => setSelectedProduct(null)}
                  style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 16, color: '#555', flexShrink: 0 }}>✕</button>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#4f46e5' }}>
                ৳{parseFloat(selectedProduct.final_price || selectedProduct.base_price || 0).toFixed(2)}
                <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>/ {selectedProduct.unit || 'পিস'}</span>
              </p>
              {selectedProduct.has_extra && (
                <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6b7280' }}>
                  বেস মূল্য ৳{parseFloat(selectedProduct.base_price).toFixed(2)}
                  {selectedProduct.vat_amount > 0 && ` + VAT ৳${selectedProduct.vat_amount.toFixed(2)}`}
                  {selectedProduct.tax_amount > 0 && ` + Tax ৳${selectedProduct.tax_amount.toFixed(2)}`}
                </p>
              )}
              <p style={{ margin: '0 0 12px', fontSize: 12, color: selectedProduct.available_stock > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {selectedProduct.available_stock > 0 ? `✅ স্টক: ${selectedProduct.available_stock} ${selectedProduct.unit || 'পিস'}` : '❌ স্টক নেই'}
              </p>
              {selectedProduct.description && (
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#555', lineHeight: 1.6 }}>{selectedProduct.description}</p>
              )}
              {/* কার্ট কন্ট্রোল */}
              {selectedProduct.available_stock > 0 && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #e0e7ff', borderRadius: 12, overflow: 'hidden', background: '#f5f7ff' }}>
                    <button onClick={() => setCart(prev => { const q = Math.max(0, (prev[selectedProduct.id] || 0) - 1); if (q === 0) { const n = { ...prev }; delete n[selectedProduct.id]; return n } return { ...prev, [selectedProduct.id]: q } })}
                      style={{ width: 40, height: 44, border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#4f46e5', fontWeight: 700 }}>−</button>
                    <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#1e1e1e' }}>
                      {cart[selectedProduct.id] || 0}
                    </span>
                    <button onClick={() => setCart(prev => ({ ...prev, [selectedProduct.id]: (prev[selectedProduct.id] || 0) + 1 }))}
                      style={{ width: 40, height: 44, border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#4f46e5', fontWeight: 700 }}>+</button>
                  </div>
                  <button onClick={() => { setCart(prev => ({ ...prev, [selectedProduct.id]: Math.max(1, prev[selectedProduct.id] || 1) })); setSelectedProduct(null) }}
                    style={{ flex: 1, height: 44, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    🛒 কার্টে যোগ করুন
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <input type="text" value={catalogSearch}
          onChange={e => setCatalogSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setProducts([]); loadProducts(catalogSearch, 1) } }}
          placeholder="পণ্য খুঁজুন..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
        <button onClick={() => { setProducts([]); loadProducts(catalogSearch, 1) }}
          className="px-4 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">
          খুঁজুন
        </button>
      </div>

      {/* Cart Badge */}
      {Object.keys(cart).length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#065f46,#047857)', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 13 }}>
              🛒 {Object.keys(cart).length}টি পণ্য — {Object.values(cart).reduce((a,b)=>a+b,0)}টি আইটেম
            </p>
            <p style={{ margin: '2px 0 0', color: '#a7f3d0', fontSize: 11 }}>অর্ডার করতে নিচে যান</p>
          </div>
          <button onClick={() => setPhase('new')}
            style={{ background: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', color: '#065f46', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            অর্ডার করুন →
          </button>
        </div>
      )}

      {/* Product Grid */}
      {loading && products.length === 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400 text-sm">কোনো পণ্য পাওয়া যায়নি।</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {products.map(prod => (
              <div key={prod.id}
                onClick={() => setSelectedProduct(prod)}
                style={{ background: 'white', borderRadius: 16, overflow: 'hidden', border: '1.5px solid #f0f0f0', cursor: 'pointer', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', transition: 'transform 0.15s', position: 'relative' }}>
                {/* Image */}
                <div style={{ height: 110, background: 'linear-gradient(135deg,#f5f3ff,#eff6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {prod.image_url
                    ? <img src={prod.image_url} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 36 }}>📦</span>
                  }
                </div>
                {/* Cart count badge */}
                {cart[prod.id] > 0 && (
                  <div style={{ position: 'absolute', top: 8, right: 8, background: '#4f46e5', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                    {cart[prod.id]}
                  </div>
                )}
                <div style={{ padding: '10px 10px 12px' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1e1e1e', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {prod.name}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 800, color: '#4f46e5' }}>
                    ৳{parseFloat(prod.final_price || prod.base_price || 0).toFixed(0)}
                    <span style={{ fontSize: 9, fontWeight: 400, color: '#9ca3af' }}>/{prod.unit || 'পিস'}</span>
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 10, color: prod.available_stock > 0 ? '#16a34a' : '#dc2626' }}>
                    {prod.available_stock > 0 ? `✅ ${prod.available_stock} ${prod.unit}` : '❌ স্টক নেই'}
                  </p>
                  {/* Quick add */}
                  <button onClick={e => { e.stopPropagation(); setCart(prev => ({ ...prev, [prod.id]: (prev[prod.id] || 0) + 1 })) }}
                    disabled={prod.available_stock === 0}
                    style={{ marginTop: 8, width: '100%', background: cart[prod.id] > 0 ? '#e0e7ff' : '#4f46e5', color: cart[prod.id] > 0 ? '#4f46e5' : 'white', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 11, fontWeight: 700, cursor: prod.available_stock === 0 ? 'not-allowed' : 'pointer', opacity: prod.available_stock === 0 ? 0.5 : 1 }}>
                    {cart[prod.id] > 0 ? `✓ ${cart[prod.id]}টি — আরো যোগ` : '+ কার্টে যোগ'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {catalogHasNext && (
            <button onClick={() => loadProducts(catalogSearch, catalogPage + 1, true)}
              disabled={loading}
              className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-sm text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-50">
              {loading ? '⏳ লোড হচ্ছে...' : `আরো পণ্য দেখুন (${products.length}/${catalogTotal})`}
            </button>
          )}
        </>
      )}
    </div>
  )

  // ── LIST VIEW ──────────────────────────────────────────────
  if (phase === 'list') return (
    <div className="space-y-4">
      {/* Delivered Toast Notification */}
      {deliveredToast && (
        <div style={{ background: 'linear-gradient(135deg, #065f46, #047857)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 4px 20px rgba(4,120,87,0.4)', animation: 'slideIn 0.3s ease' }}>
          <span style={{ fontSize: 28 }}>📦</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 14 }}>অর্ডার ডেলিভারি সম্পন্ন!</p>
            <p style={{ margin: '3px 0 0', color: '#a7f3d0', fontSize: 12 }}>
              আপনার অর্ডার ({(deliveredToast.items || []).length}টি পণ্য) সফলভাবে পৌঁছে গেছে।
            </p>
          </div>
          <button onClick={() => setDeliveredToast(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 8px', color: 'white', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Tracking Modal */}
      <OrderTrackingModal orderId={trackingId} jwt={portalJWT} onClose={() => setTrackingId(null)} />

      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <p className="flex-1 text-green-800 font-semibold text-sm">{successMsg}</p>
          <button onClick={() => setSuccessMsg('')} className="text-green-400 text-lg font-bold">✕</button>
        </div>
      )}

      <button
        onClick={() => { setPhase('new'); setErrorMsg('') }}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold
          py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg
          transition-all active:scale-95"
      >
        <span className="text-xl">🛒</span>
        নতুন অর্ডার রিকোয়েস্ট
      </button>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400 text-sm">এখনও কোনো অর্ডার রিকোয়েস্ট নেই।</p>
          <p className="text-gray-300 text-xs mt-1">উপরের বাটনে ক্লিক করে প্রথম অর্ডার দিন।</p>
        </div>
      ) : (
        requests.map(req => {
          const items = typeof req.items === 'string' ? JSON.parse(req.items) : (req.items || [])
          return (
            <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs text-gray-400">
                    {new Date(req.created_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-sm font-semibold text-gray-700 mt-0.5">{items.length}টি পণ্য</p>
                </div>
                <StatusBadge status={req.status} />
              </div>
              <div className="space-y-1 mb-3">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-600">
                    <span>{item.product_name}</span>
                    <span className="font-medium">× {item.qty}</span>
                  </div>
                ))}
              </div>
              {req.assigned_sr_name && (
                <div className="bg-purple-50 rounded-xl px-3 py-2 text-xs text-purple-700">
                  🚶 SR: {req.assigned_sr_name}
                </div>
              )}
              {req.admin_note && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-500 mt-2">
                  📝 {req.admin_note}
                </div>
              )}
              {req.note && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-600 mt-2">
                  💬 আপনার নোট: {req.note}
                </div>
              )}
              {/* Tracking Button */}
              {['confirmed','assigned','delivered'].includes(req.status) && (
                <button
                  onClick={() => setTrackingId(req.id)}
                  className="mt-3 w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  📍 ট্র্যাকিং দেখুন
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )

  // ── NEW ORDER VIEW ─────────────────────────────────────────
  const pendingOrders = requests.filter(r => r.status === 'pending')
  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0)
  const cartProductCount = Object.keys(cart).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setPhase('list'); setCart({}); setNote(''); setErrorMsg('') }}
          className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-600 font-bold transition-colors"
        >
          ←
        </button>
        <div>
          <h3 className="font-bold text-gray-800">নতুন অর্ডার রিকোয়েস্ট</h3>
          <p className="text-xs text-gray-400">
            {cartProductCount > 0
              ? `${cartProductCount}টি পণ্য — ${cartItemCount}টি আইটেম বেছেছেন`
              : 'পণ্য বেছে পরিমাণ দিন'}
          </p>
        </div>
        {/* ক্যাটালগ শর্টকাট */}
        <button onClick={() => { setPhase('catalog'); loadProducts('', 1) }}
          style={{ marginLeft: 'auto', background: '#ede9fe', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#5b21b6', cursor: 'pointer' }}>
          🗂️ ক্যাটালগ
        </button>
      </div>

      {/* Multiple Pending Warning */}
      {pendingOrders.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#fefce8,#fef9c3)', border: '1.5px solid #fde047', borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#854d0e' }}>
              {pendingOrders.length}টি pending অর্ডার আছে
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
              আপনি আরো অর্ডার দিতে পারবেন — একসাথে একাধিক অর্ডার রাখা যায়। SR আসলে সব একসাথে ডেলিভারি পাবেন।
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 text-center">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(prod => {
            const qty = cart[prod.id] || 0
            return (
              <div key={prod.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all
                  ${qty > 0 ? 'border-indigo-300' : 'border-gray-100'}`}>

                {/* পণ্যের ছবি */}
                <div className={`relative w-full bg-gray-50 flex items-center justify-center
                  border-b ${qty > 0 ? 'border-indigo-100' : 'border-gray-100'}`}
                  style={{ height: '160px' }}>
                  {prod.image_url ? (
                    <img
                      src={prod.image_url}
                      alt={prod.name}
                      className="w-full h-full object-contain p-2"
                      style={{ maxHeight: '160px' }}
                      onError={e => {
                        e.target.style.display = 'none'
                        e.target.parentNode.querySelector('.img-fallback').style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div className={`img-fallback w-full h-full items-center justify-center text-5xl
                    ${prod.image_url ? 'hidden' : 'flex'}`}>
                    📦
                  </div>
                  {qty > 0 && (
                    <div className="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2.5 py-1 rounded-full font-bold shadow-md">
                      × {qty}
                    </div>
                  )}
                </div>

                <div className={`p-3 ${qty > 0 ? 'bg-indigo-50' : ''}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-2">
                      <p className="font-semibold text-gray-800 text-sm leading-tight">{prod.name}</p>
                      {/* চূড়ান্ত মূল্য (VAT + Tax সহ) */}
                      <p className="text-sm font-bold text-indigo-700 mt-0.5">
                        ৳{parseFloat(prod.final_price ?? prod.price).toLocaleString('bn-BD')}
                        <span className="text-xs font-normal text-gray-400 ml-1">/ {prod.unit || 'পিস'}</span>
                      </p>
                      {prod.has_extra && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prod.vat_amount > 0 && (
                            <span className="text-xs bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded-full">
                              VAT ৳{parseFloat(prod.vat_amount).toLocaleString('bn-BD')}
                            </span>
                          )}
                          {prod.tax_amount > 0 && (
                            <span className="text-xs bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">
                              Tax ৳{parseFloat(prod.tax_amount).toLocaleString('bn-BD')}
                            </span>
                          )}
                        </div>
                      )}

                      {prod.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{prod.description}</p>
                      )}
                    </div>
                  </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty(prod.id, qty - 1)}
                    disabled={qty === 0}
                    className="w-9 h-9 bg-gray-100 hover:bg-gray-200 disabled:opacity-30
                      rounded-xl font-bold text-gray-700 text-lg flex items-center justify-center transition-colors"
                  >−</button>
                  <input
                    type="number"
                    value={qty || ''}
                    onChange={e => setQty(prod.id, e.target.value)}
                    placeholder="০"
                    min="0"
                    className="flex-1 text-center border border-gray-200 rounded-xl py-2 text-sm font-semibold focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={() => setQty(prod.id, qty + 1)}
                    className="w-9 h-9 bg-indigo-100 hover:bg-indigo-200 rounded-xl
                      font-bold text-indigo-700 text-lg flex items-center justify-center transition-colors"
                  >+</button>
                </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {cartCount > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">
            অতিরিক্ত নির্দেশনা (ঐচ্ছিক)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="যেমন: দ্রুত দরকার, বিকেলে আসুন..."
            rows={2}
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={cartCount === 0 || submitting}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
          text-white font-bold py-4 rounded-2xl flex items-center justify-center
          gap-2 shadow-lg transition-all active:scale-95"
      >
        {submitting ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            পাঠানো হচ্ছে...
          </>
        ) : (
          <>
            🛒 অর্ডার রিকোয়েস্ট পাঠান
            {cartCount > 0 && (
              <span className="bg-white text-indigo-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {cartCount}টি পণ্য
              </span>
            )}
          </>
        )}
      </button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function CustomerPortal({ defaultTab = 'summary' }) {
  const [searchParams] = useSearchParams()
  const portalToken    = searchParams.get('token')

  const [phase,       setPhase]       = useState('loading')
  const [tokenInfo,   setTokenInfo]   = useState(null)
  const [portalJWT,   setPortalJWT]   = useState(null)
  const [dashboard,   setDashboard]   = useState(null)
  const [activeTab,   setActiveTab]   = useState(defaultTab)
  const [error,       setError]       = useState('')
  const [loggingIn,   setLoggingIn]   = useState(false)
  const [notifications,  setNotifications]  = useState([])
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [showBell,       setShowBell]       = useState(false)
  const [unreadBanner,   setUnreadBanner]   = useState(null)

  // ── Invoice Pagination State ───────────────────────────────
  const [invoices,        setInvoices]        = useState([])
  const [invoicePage,     setInvoicePage]     = useState(1)
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1)
  const [invoiceTotal,    setInvoiceTotal]    = useState(0)
  const [invoiceLoading,  setInvoiceLoading]  = useState(false)

  // ── Credit Limit Request State ──────────────────────────
  const [creditReqOpen,   setCreditReqOpen]   = useState(false)
  const [creditReqAmt,    setCreditReqAmt]     = useState('')
  const [creditReqReason, setCreditReqReason] = useState('')
  const [creditReqLoading,setCreditReqLoading]= useState(false)
  const [myLimitReqs,     setMyLimitReqs]     = useState([])
  const [limitReqsLoaded, setLimitReqsLoaded] = useState(false)
  // ── Complaint State ───────────────────────────────────────
  const [complaintOpen,   setComplaintOpen]   = useState(false)
  const [cmpType,         setCmpType]         = useState('complaint')
  const [cmpSubject,      setCmpSubject]       = useState('')
  const [cmpDesc,         setCmpDesc]          = useState('')
  const [cmpLoading,      setCmpLoading]       = useState(false)
  const [myComplaints,    setMyComplaints]     = useState([])
  const [complaintsLoaded,setComplaintsLoaded] = useState(false)
  // ── Invoice Filter State ──────────────────────────────────
  const [invoiceSearch,   setInvoiceSearch]   = useState('')
  const [invoicePayMethod, setInvoicePayMethod] = useState('')
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('')
  const [invoiceDateTo,   setInvoiceDateTo]   = useState('')
  const [filterOpen,      setFilterOpen]      = useState(false)
  // Statement download state
  const [stmtLoading,     setStmtLoading]     = useState(false)
  const [stmtFrom,        setStmtFrom]        = useState('')
  const [stmtTo,          setStmtTo]          = useState('')
  const [stmtOpen,        setStmtOpen]        = useState(false)

  // ── সমস্যা ২ FIX: localStorage → sessionStorage (XSS ঝুঁকি কমানো) ──
  // sessionStorage ব্রাউজার ট্যাব বন্ধ হলে মুছে যায়, অন্য ট্যাবে শেয়ার হয় না
  const getStorageKey = (cid) => `portal_jwt_${cid}`
  const storageGet = (key) => sessionStorage.getItem(key)
  const storageSet = (key, val) => sessionStorage.setItem(key, val)
  const storageRemove = (key) => sessionStorage.removeItem(key)
  const storageKeys = () => Object.keys(sessionStorage).filter(k => k.startsWith('portal_jwt_'))

  const loadDashboard = async (jwt) => {
    try {
      const data = await portalFetch('/portal/dashboard', {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      setDashboard(data.data)
      // সমস্যা ৩ FIX: dashboard-এর sales count দিয়েই invoiceTotal initialize করো
      const totalFromDashboard = data.data?.total_summary?.total_invoices
      if (totalFromDashboard) setInvoiceTotal(parseInt(totalFromDashboard))
      setPhase('dashboard')
      loadNotifications(jwt)
      requestPushPermission(jwt)
    } catch (err) {
      console.error('Dashboard error:', err)
      setError('Session শেষ হয়েছে। আবার লগইন করুন।')
      setPhase('login')
    }
  }

  // ── Paginated invoice loader (filter support) ────────────
  const loadInvoices = async (jwt, page = 1, filters = {}) => {
    setInvoiceLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 15 })
      if (filters.search)      params.set('search',         filters.search)
      if (filters.payMethod)   params.set('payment_method', filters.payMethod)
      if (filters.dateFrom)    params.set('date_from',      filters.dateFrom)
      if (filters.dateTo)      params.set('date_to',        filters.dateTo)
      const data = await portalFetch(`/portal/invoices?${params}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      if (page === 1) {
        setInvoices(data.data || [])
      } else {
        setInvoices(prev => [...prev, ...(data.data || [])])
      }
      setInvoicePage(data.pagination?.page || page)
      setInvoiceTotalPages(data.pagination?.totalPages || 1)
      setInvoiceTotal(data.pagination?.total || 0)
    } catch (err) {
      console.error('Invoice load error:', err)
    } finally {
      setInvoiceLoading(false)
    }
  }

  // ── Credit Limit Request submit ──────────────────────────
  const submitCreditRequest = async () => {
    if (!creditReqAmt || isNaN(creditReqAmt) || parseFloat(creditReqAmt) <= 0) {
      return alert('সঠিক পরিমাণ দিন।')
    }
    setCreditReqLoading(true)
    try {
      await portalFetch('/portal/credit-limit-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requested_amount: parseFloat(creditReqAmt), reason: creditReqReason }),
      })
      setCreditReqOpen(false)
      setCreditReqAmt('')
      setCreditReqReason('')
      setLimitReqsLoaded(false)
      alert('✅ আবেদন সফলভাবে জমা হয়েছে। Manager অনুমোদন দিলে আপনাকে জানানো হবে।')
    } catch (e) {
      alert('❌ ' + (e.message || 'সমস্যা হয়েছে'))
    } finally { setCreditReqLoading(false) }
  }

  const loadMyLimitReqs = async () => {
    if (limitReqsLoaded) return
    try {
      const data = await portalFetch('/portal/credit-limit-request', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setMyLimitReqs(data.data || [])
      setLimitReqsLoaded(true)
    } catch {}
  }

  // ── Complaint submit ──────────────────────────────────────
  const submitComplaint = async () => {
    if (!cmpSubject.trim() || !cmpDesc.trim()) {
      return alert('বিষয় এবং বিস্তারিত বিবরণ লিখুন।')
    }
    setCmpLoading(true)
    try {
      await portalFetch('/portal/complaint', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: cmpType, subject: cmpSubject.trim(), description: cmpDesc.trim() }),
      })
      setComplaintOpen(false)
      setCmpSubject('')
      setCmpDesc('')
      setCmpType('complaint')
      setComplaintsLoaded(false)
      alert('✅ আপনার অভিযোগ/ফিডব্যাক গ্রহণ করা হয়েছে। শীঘ্রই সাড়া পাবেন।')
    } catch (e) {
      alert('❌ ' + (e.message || 'সমস্যা হয়েছে'))
    } finally { setCmpLoading(false) }
  }

  const loadMyComplaints = async () => {
    if (complaintsLoaded) return
    try {
      const data = await portalFetch('/portal/complaint', {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setMyComplaints(data.data || [])
      setComplaintsLoaded(true)
    } catch {}
  }

  // ── Statement PDF download ────────────────────────────────
  const downloadStatement = async () => {
    setStmtLoading(true)
    try {
      const params = new URLSearchParams()
      if (stmtFrom) params.set('from', stmtFrom)
      if (stmtTo)   params.set('to',   stmtTo)
      const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
      const res = await fetch(`${BACKEND}/portal/statement?${params}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Download failed')
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const label = stmtFrom && stmtTo ? `${stmtFrom}_to_${stmtTo}` : 'full'
      a.download = `statement_${label}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStmtOpen(false)
    } catch (e) {
      alert('Statement ডাউনলোড ব্যর্থ: ' + e.message)
    } finally {
      setStmtLoading(false)
    }
  }

  const loadNotifications = async (jwt) => {
    try {
      const data = await portalFetch('/portal/notifications', {
        headers: { Authorization: `Bearer ${jwt}` }
      })
      const notifs = data.data.notifications || []
      setNotifications(notifs)
      setUnreadCount(data.data.unread_count || 0)
      const newest = notifs.find(n => !n.is_read)
      if (newest) setUnreadBanner(newest)
    } catch (e) { console.error('Notification load error:', e) }
  }

  const markAllAsRead = async (jwt) => {
    try {
      await portalFetch('/portal/notifications/read-all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${jwt}` }
      })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      setUnreadBanner(null)
    } catch (e) { console.error(e) }
  }

  const requestPushPermission = async (jwt) => {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return
      if (Notification.permission === 'denied') return
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      const swReg = await navigator.serviceWorker.ready
      const { initializeApp, getApps } = await import('firebase/app')
      const { getMessaging, getToken }  = await import('firebase/messaging')
      const firebaseConfig = {
        apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain:        `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
        projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket:     `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId:             import.meta.env.VITE_FIREBASE_APP_ID,
      }
      const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)
      const messaging = getMessaging(app)
      const fcmToken = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg,
      })
      if (!fcmToken) return
      const cacheKey = 'portal_fcm_token'
      if (sessionStorage.getItem(cacheKey) === fcmToken) return
      await portalFetch('/portal/save-fcm-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ fcm_token: fcmToken }),
      })
      sessionStorage.setItem(cacheKey, fcmToken)
    } catch (e) { console.warn('[Portal FCM] Permission/token error:', e.message) }
  }

  useEffect(() => {
    const init = async () => {
      const deviceId = await getDeviceFingerprint()

      if (portalToken) {
        try {
          // device_id পাঠাই — server চেক করবে এই device lock আছে কিনা
          const data = await portalFetch(
            `/portal/verify-token?token=${portalToken}&device_id=${encodeURIComponent(deviceId)}`
          )
          const info = data.data
          setTokenInfo(info)

          // ── নতুন: এই ডিভাইস আগে lock হয়েছে → Google login দরকার নেই
          if (info.can_skip_google) {
            // Device re-login — Google ছাড়াই JWT নাও
            try {
              const loginData = await portalFetch('/portal/device-login', {
                method: 'POST',
                body: JSON.stringify({ portal_token: portalToken, device_id: deviceId })
              })
              const jwt        = loginData.data.portal_jwt
              const customerId = loginData.data.customer?.id
              if (customerId) storageSet(getStorageKey(customerId), jwt)
              setPortalJWT(jwt)
              await loadDashboard(jwt)
            } catch (err) {
              // device login ব্যর্থ → Google login দেখাও
              setPhase('login')
            }
            return
          }

          // sessionStorage-এ JWT আছে → সরাসরি dashboard
          const savedJWT = storageGet(getStorageKey(info.customer_id))
          if (savedJWT) {
            setPortalJWT(savedJWT)
            await loadDashboard(savedJWT)
          } else {
            setPhase('welcome')
          }
        } catch (err) {
          // DEVICE_LOCKED error — বিশেষ বার্তা দেখাও
          if (err.status === 403) {
            setError(err.message || 'এই লিংক অন্য ডিভাইসে lock করা আছে।')
          } else {
            setError(err.message || 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।')
          }
          setPhase('invalid')
        }
        return
      }

      // URL-এ token নেই → sessionStorage চেক
      const allKeys = storageKeys()
      if (allKeys.length > 0) {
        const savedJWT = storageGet(allKeys[0])
        if (savedJWT) {
          setPortalJWT(savedJWT)
          await loadDashboard(savedJWT)
          return
        }
      }

      setError('লিংক পাওয়া যায়নি।')
      setPhase('invalid')
    }
    init()
  }, [portalToken])

  const googleLogin = async () => {
    setLoggingIn(true)
    setError('')
    try {
      let access_token
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

      if (Capacitor.isNativePlatform()) {
        // APK — Capacitor Google Auth plugin ব্যবহার করো
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
        await GoogleAuth.initialize({ clientId, scopes: ['profile', 'email'] })
        const googleUser = await GoogleAuth.signIn()
        access_token = googleUser.authentication.accessToken
      } else {
        // Web / PWA — popup দিয়ে OAuth token নাও
        if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID .env-এ সেট করা হয়নি।')
        access_token = await webGoogleLogin(clientId)
      }

      const deviceId = await getDeviceFingerprint()
      const data = await portalFetch('/portal/google-auth', {
        method: 'POST',
        body: JSON.stringify({
          google_token: access_token,
          portal_token: portalToken,
          device_id:    deviceId
        })
      })
      const jwt        = data.data.portal_jwt
      const customerId = data.data.customer?.id
      if (customerId) storageSet(getStorageKey(customerId), jwt)
      setPortalJWT(jwt)
      await loadDashboard(jwt)
    } catch (err) {
      if (!err?.message?.includes('cancel') && !err?.message?.includes('dismissed')) {
        setError(err.message || 'লগইন ব্যর্থ হয়েছে।')
      }
    } finally { setLoggingIn(false) }
  }

  // ── RENDER: LOADING ───────────────────────────────────────
  if (phase === 'loading') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">লিংক যাচাই করা হচ্ছে...</p>
      </div>
    </div>
  )

  // ── RENDER: INVALID ───────────────────────────────────────
  if (phase === 'invalid') return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">
          {error.includes('অন্য') || error.includes('lock') ? '🔒' : '⚠️'}
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {error.includes('অন্য') || error.includes('lock') ? 'অ্যাক্সেস নেই' : 'লিংক অকার্যকর'}
        </h2>
        <p className="text-gray-500 text-sm">{error}</p>
        <p className="text-xs text-gray-400 mt-4">নতুন লিংকের জন্য আপনার SR-এর সাথে যোগাযোগ করুন।</p>
      </div>
    </div>
  )

  // ── RENDER: WELCOME ──────────────────────────────────────
  if (phase === 'welcome') return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #1d4ed8 100%)' }}>
      {/* Top wave decoration */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>

        {/* Logo */}
        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <span style={{ color: 'white', fontSize: 36, fontWeight: 800, fontFamily: 'Georgia, serif' }}>N</span>
        </div>

        <h1 style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: '0 0 6px', textAlign: 'center', fontFamily: "'Hind Siliguri', sans-serif" }}>
          NovaTech BD
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 32px', letterSpacing: 1 }}>
          কাস্টমার পোর্টাল
        </p>

        {/* Customer info card */}
        {tokenInfo && (
          <div style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '20px 24px', width: '100%', maxWidth: 360, marginBottom: 28, textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6, letterSpacing: 1 }}>আপনার দোকান</p>
            <p style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: '0 0 4px', fontFamily: "'Hind Siliguri', sans-serif" }}>
              🏪 {tokenInfo.shop_name}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '0 0 8px' }}>{tokenInfo.owner_name}</p>
            <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', fontSize: 11, padding: '3px 12px', borderRadius: 20 }}>
              কোড: {tokenInfo.customer_code}
            </span>
          </div>
        )}

        {/* Features list */}
        <div style={{ width: '100%', maxWidth: 360, marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: '📊', title: 'হিসাবের সারসংক্ষেপ', desc: 'আপনার মোট কেনাকাটা ও বাকির তথ্য' },
            { icon: '📦', title: 'অর্ডার ট্র্যাকিং', desc: 'অর্ডার করুন ও স্ট্যাটাস দেখুন' },
            { icon: '🧾', title: 'ইনভয়েস ইতিহাস', desc: 'সকল ক্রয়ের বিবরণ একজায়গায়' },
          ].map(f => (
            <div key={f.icon} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 16px' }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{f.icon}</span>
              <div>
                <p style={{ color: 'white', fontSize: 13, fontWeight: 600, margin: 0, fontFamily: "'Hind Siliguri', sans-serif" }}>{f.title}</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <button
          onClick={() => setPhase('login')}
          style={{ width: '100%', maxWidth: 360, padding: '16px', borderRadius: 16, background: 'white', border: 'none', color: '#1e3a8a', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', fontFamily: "'Hind Siliguri', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'transform 0.15s' }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google দিয়ে প্রবেশ করুন
        </button>

        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 16, textAlign: 'center' }}>
          আপনার Gmail অ্যাকাউন্ট দিয়ে নিরাপদে প্রবেশ করুন
        </p>
      </div>

      {/* Bottom */}
      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11, padding: '16px', letterSpacing: 0.5 }}>
        © {new Date().getFullYear()} NovaTech BD Ltd.
      </p>
    </div>
  )

  // ── RENDER: LOGIN ─────────────────────────────────────────
  if (phase === 'login') return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-2xl font-bold">N</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">NovaTech BD</h1>
          <p className="text-xs text-gray-400 mt-1">কাস্টমার পোর্টাল</p>
        </div>

        {tokenInfo && (
          <div className="bg-indigo-50 rounded-2xl p-4 mb-6 text-center">
            <p className="text-xs text-indigo-400 mb-1">আপনার দোকান</p>
            <p className="font-bold text-indigo-800 text-lg">{tokenInfo.shop_name}</p>
            <p className="text-indigo-600 text-sm">{tokenInfo.owner_name}</p>
            <p className="text-xs text-indigo-400 mt-1">কোড: {tokenInfo.customer_code}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        <button
          onClick={googleLogin}
          disabled={loggingIn}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200
            hover:border-indigo-300 hover:bg-indigo-50 rounded-2xl py-4 px-6
            font-semibold text-gray-700 transition-all shadow-sm disabled:opacity-60"
        >
          {loggingIn ? (
            <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loggingIn ? 'লগইন হচ্ছে...' : 'Google দিয়ে লগইন করুন'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          আপনার Gmail দিয়ে লগইন করলে আমরা আপনার ক্রয়তথ্য দেখাতে পারব।
        </p>
      </div>
    </div>
  )

  // ── RENDER: DASHBOARD ─────────────────────────────────────
  if (phase === 'dashboard' && dashboard) {
    const {
      customer,
      sales           = [],
      credit_payments = [],
      monthly_summary = {},
      total_summary   = {},
    } = dashboard
    const tabs = [
      { id: 'summary',   label: 'সারসংক্ষেপ' },
      { id: 'orders',    label: '🛒 অর্ডার' },
      { id: 'invoices',  label: `ইনভয়েস (${invoiceTotal > 0 ? invoiceTotal : total_summary?.total_invoices || 0})` },
      { id: 'payments',  label: `পরিশোধ (${credit_payments.length})` },
      { id: 'credit_req',label: '💳 লিমিট' },
      { id: 'complaints',label: '📣 অভিযোগ' },
    ]

    // invoices ট্যাব প্রথমবার খুললে লোড করো
    const handleTabChange = (tabId) => {
      setActiveTab(tabId)
      if (tabId === 'invoices' && invoices.length === 0 && !invoiceLoading) {
        loadInvoices(portalJWT, 1, {})
      }
    }

    // Invoice filter apply করো
    const applyInvoiceFilter = () => {
      setInvoices([])
      setFilterOpen(false)
      loadInvoices(portalJWT, 1, {
        search:     invoiceSearch,
        payMethod:  invoicePayMethod,
        dateFrom:   invoiceDateFrom,
        dateTo:     invoiceDateTo,
      })
    }

    const clearInvoiceFilter = () => {
      setInvoiceSearch('')
      setInvoicePayMethod('')
      setInvoiceDateFrom('')
      setInvoiceDateTo('')
      setInvoices([])
      setFilterOpen(false)
      loadInvoices(portalJWT, 1, {})
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-5 pt-10 pb-16">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-indigo-200 text-xs mb-1">কাস্টমার পোর্টাল</p>
              <h1 className="text-xl font-bold">{customer.shop_name}</h1>
              <p className="text-indigo-200 text-sm">{customer.owner_name} • {customer.customer_code}</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Bell Icon */}
              <div className="relative">
                <button
                  onClick={() => { setShowBell(v => !v); if (unreadCount > 0) markAllAsRead(portalJWT) }}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10, padding: '8px 10px', color: 'white', fontSize: 18, cursor: 'pointer', position: 'relative' }}
                >
                  🔔
                  {unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {showBell && (
                  <div style={{ position: 'absolute', right: 0, top: 44, width: 290, maxHeight: 380, background: 'white', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflowY: 'auto', zIndex: 100 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#1e1e1e', fontWeight: 700, fontSize: 14 }}>🔔 Notification</span>
                      <button onClick={() => setShowBell(false)} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#888' }}>✕</button>
                    </div>
                    {notifications.length === 0 ? (
                      <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '24px 16px' }}>কোনো notification নেই।</p>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f9f9f9', background: n.is_read ? 'white' : '#eff6ff', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 20, marginTop: 1 }}>{n.type === 'credit_reminder' ? '💳' : '🔔'}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e1e1e' }}>{n.title}</p>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#555', lineHeight: 1.5 }}>{n.body}</p>
                            <p style={{ margin: '4px 0 0', fontSize: 10, color: '#aaa' }}>
                              {new Date(n.created_at).toLocaleString('bn-BD', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', marginTop: 5, flexShrink: 0 }} />}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  storageKeys().forEach(k => storageRemove(k))
                  storageRemove('portal_fcm_token')
                  setPhase('login'); setDashboard(null); setPortalJWT(null)
                }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10, padding: '6px 12px', color: 'white', fontSize: 12, cursor: 'pointer' }}
              >
                লগআউট
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 -mt-10 space-y-4 pb-10">
          {/* Unread Banner */}
          {unreadBanner && (
            <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', boxShadow: '0 4px 16px rgba(29,78,216,0.3)' }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>💳</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 14 }}>{unreadBanner.title}</p>
                <p style={{ margin: '4px 0 0', color: '#bfdbfe', fontSize: 12, lineHeight: 1.5 }}>{unreadBanner.body}</p>
              </div>
              <button
                onClick={() => { setUnreadBanner(null); markAllAsRead(portalJWT) }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 8px', color: 'white', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
              >✕</button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-400 mb-1">বর্তমান বাকি</p>
              <p className="text-lg font-bold text-red-600">৳{fmt(customer.current_credit)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-400 mb-1">ক্রেডিট লিমিট</p>
              <p className="text-lg font-bold text-gray-700">৳{fmt(customer.credit_limit)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-xs text-gray-400 mb-1">জমা ব্যালেন্স</p>
              <p className="text-lg font-bold text-green-600">৳{fmt(customer.credit_balance)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.id} onClick={() => handleTabChange(t.id)}
                  className={`flex-1 py-3 text-xs font-semibold transition-colors whitespace-nowrap px-2
                    ${activeTab === t.id
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                      : 'text-gray-400 hover:text-gray-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* সারসংক্ষেপ */}
              {activeTab === 'summary' && (
                <div className="space-y-5">

                  {/* ── SR Contact Card ── */}
                  {customer?.assigned_sr_name && (
                    <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                        🧑‍💼
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>আপনার বিক্রয় প্রতিনিধি</p>
                        <p style={{ margin: '2px 0 0', fontSize: 15, color: 'white', fontWeight: 700 }}>{customer.assigned_sr_name}</p>
                        {customer.assigned_sr_code && (
                          <p style={{ margin: '1px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>কোড: {customer.assigned_sr_code}</p>
                        )}
                      </div>
                      {customer?.assigned_sr_phone && (
                        <a href={`tel:${customer.assigned_sr_phone}`}
                          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: '10px 14px', color: 'white', cursor: 'pointer', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                          <span style={{ fontSize: 20 }}>📞</span>
                          <span style={{ fontSize: 9, fontWeight: 700 }}>কল করুন</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* ── এই মাস ── */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">এই মাস</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'মোট কেনাকাটা', value: `৳${fmt(monthly_summary?.total_purchase)}`, color: 'text-gray-900' },
                        { label: 'ইনভয়েস সংখ্যা', value: monthly_summary?.total_invoices ?? 0, color: 'text-indigo-600' },
                        { label: 'নগদ দিয়েছেন', value: `৳${fmt(monthly_summary?.total_cash)}`, color: 'text-green-600' },
                        { label: 'বাকি রেখেছেন', value: `৳${fmt(monthly_summary?.total_credit)}`, color: 'text-red-500' },
                      ].map((item, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">{item.label}</p>
                          <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── ৬ মাসের ট্রেন্ড চার্ট ── */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">গত ৬ মাসের ট্রেন্ড</p>
                    <MonthlyTrendChart portalJWT={portalJWT} />
                  </div>

                  {/* ── সর্বমোট ── */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">সর্বমোট</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'মোট কেনাকাটা', value: `৳${fmt(total_summary?.total_purchase)}`, color: 'text-gray-900' },
                        { label: 'মোট ইনভয়েস', value: total_summary?.total_invoices ?? 0, color: 'text-indigo-600' },
                        { label: 'মোট নগদ', value: `৳${fmt(total_summary?.total_cash)}`, color: 'text-green-600' },
                        { label: 'মোট বাকি', value: `৳${fmt(total_summary?.total_credit)}`, color: 'text-red-500' },
                      ].map((item, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">{item.label}</p>
                          <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* অর্ডার ট্যাব */}
              {activeTab === 'orders' && (
                <OrderRequestTab portalJWT={portalJWT} />
              )}

              {/* ── ক্রেডিট লিমিট আবেদন ── */}
              {activeTab === 'credit_req' && (() => {
                if (!limitReqsLoaded) loadMyLimitReqs()
                const fmtCur = (n) => parseFloat(n||0).toLocaleString('en-BD')
                const limitStatusMap = {
                  pending:  { l: '⏳ অপেক্ষমাণ', bg: '#FEF9C3', c: '#92400E' },
                  approved: { l: '✅ অনুমোদিত',  bg: '#D1FAE5', c: '#065F46' },
                  rejected: { l: '❌ নামঞ্জুর',   bg: '#FEE2E2', c: '#991B1B' },
                }
                return (
                  <div className="space-y-4">
                    {/* Credit Info Card */}
                    <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: 16, padding: '16px' }}>
                      <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>বর্তমান ক্রেডিট তথ্য</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                        <div>
                          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>লিমিট</p>
                          <p style={{ margin: '2px 0 0', color: 'white', fontSize: 18, fontWeight: 800 }}>৳{fmtCur(customer.credit_limit)}</p>
                        </div>
                        <div>
                          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>বর্তমান বাকি</p>
                          <p style={{ margin: '2px 0 0', color: '#fde68a', fontSize: 18, fontWeight: 800 }}>৳{fmtCur(customer.current_credit)}</p>
                        </div>
                      </div>
                    </div>

                    {/* New Request Button */}
                    {!creditReqOpen ? (
                      <button onClick={() => setCreditReqOpen(true)}
                        style={{ width: '100%', background: 'white', border: '2px dashed #c4b5fd', borderRadius: 14, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: '#5b21b6', fontWeight: 700, fontSize: 14 }}>
                        <span style={{ fontSize: 20 }}>💳</span> নতুন লিমিট বৃদ্ধির আবেদন করুন
                      </button>
                    ) : (
                      <div style={{ background: 'white', border: '1.5px solid #e0e7ff', borderRadius: 16, padding: 16 }}>
                        <p style={{ margin: '0 0 14px', fontWeight: 700, fontSize: 14, color: '#1e1e1e' }}>💳 ক্রেডিট লিমিট বৃদ্ধির আবেদন</p>

                        <div style={{ marginBottom: 12 }}>
                          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>আবেদনকৃত পরিমাণ ৳ *</p>
                          <input type="number" value={creditReqAmt} onChange={e => setCreditReqAmt(e.target.value)}
                            placeholder="যেমন: 50000"
                            style={{ width: '100%', border: '2px solid #e0e7ff', borderRadius: 12, padding: '12px', fontSize: 15, fontWeight: 700, outline: 'none', boxSizing: 'border-box', color: '#4f46e5' }} />
                          <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9ca3af' }}>বর্তমান লিমিট: ৳{fmtCur(customer.credit_limit)}</p>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>কারণ (ঐচ্ছিক)</p>
                          <textarea value={creditReqReason} onChange={e => setCreditReqReason(e.target.value)}
                            placeholder="কেন লিমিট বাড়ানো দরকার তা সংক্ষেপে লিখুন..."
                            rows={3} style={{ width: '100%', border: '2px solid #e0e7ff', borderRadius: 12, padding: '12px', fontSize: 13, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <button onClick={() => setCreditReqOpen(false)}
                            style={{ padding: '12px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            বাতিল
                          </button>
                          <button onClick={submitCreditRequest} disabled={creditReqLoading}
                            style={{ padding: '12px', borderRadius: 12, border: 'none', background: creditReqLoading ? '#94a3b8' : '#4f46e5', color: 'white', fontWeight: 700, fontSize: 13, cursor: creditReqLoading ? 'not-allowed' : 'pointer' }}>
                            {creditReqLoading ? 'জমা হচ্ছে...' : '✅ জমা দিন'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* My Requests History */}
                    {myLimitReqs.length > 0 && (
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>আবেদনের ইতিহাস</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {myLimitReqs.map(r => {
                            const s = limitStatusMap[r.status] || { l: r.status, bg: '#f3f4f6', c: '#374151' }
                            return (
                              <div key={r.id} style={{ background: 'white', borderRadius: 12, padding: '12px 14px', border: '1px solid #f0f0f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#4f46e5' }}>৳{fmtCur(r.requested_amount)}</p>
                                  <span style={{ background: s.bg, color: s.c, padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{s.l}</span>
                                </div>
                                {r.reason && <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280' }}>{r.reason}</p>}
                                {r.admin_note && <p style={{ margin: '0 0 4px', fontSize: 12, color: r.status === 'approved' ? '#065f46' : '#991b1b', background: r.status === 'approved' ? '#f0fdf4' : '#fff1f2', borderRadius: 6, padding: '4px 8px' }}>{r.admin_note}</p>}
                                <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>
                                  {new Date(r.created_at).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── অভিযোগ / ফিডব্যাক ── */}
              {activeTab === 'complaints' && (() => {
                if (!complaintsLoaded) loadMyComplaints()
                const cmpStatusMap = {
                  open:        { l: '🔴 খোলা',          bg: '#FEF2F2', c: '#991B1B' },
                  in_progress: { l: '🔄 প্রক্রিয়াধীন', bg: '#DBEAFE', c: '#1E40AF' },
                  resolved:    { l: '✅ সমাধান',        bg: '#D1FAE5', c: '#065F46' },
                }
                const typeOpts = [
                  { v: 'complaint',      l: '⚠️ অভিযোগ' },
                  { v: 'feedback',       l: '💬 ফিডব্যাক' },
                  { v: 'delivery_issue', l: '🚚 ডেলিভারি সমস্যা' },
                  { v: 'product_issue',  l: '📦 পণ্য সমস্যা' },
                  { v: 'payment_issue',  l: '💳 পেমেন্ট সমস্যা' },
                  { v: 'other',          l: '📌 অন্যান্য' },
                ]
                return (
                  <div className="space-y-4">
                    {/* New Complaint Button / Form */}
                    {!complaintOpen ? (
                      <button onClick={() => setComplaintOpen(true)}
                        style={{ width: '100%', background: 'white', border: '2px dashed #fca5a5', borderRadius: 14, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: '#b91c1c', fontWeight: 700, fontSize: 14 }}>
                        <span style={{ fontSize: 20 }}>📣</span> নতুন অভিযোগ / ফিডব্যাক দিন
                      </button>
                    ) : (
                      <div style={{ background: 'white', border: '1.5px solid #fecaca', borderRadius: 16, padding: 16 }}>
                        <p style={{ margin: '0 0 14px', fontWeight: 700, fontSize: 14, color: '#1e1e1e' }}>📣 অভিযোগ / ফিডব্যাক</p>

                        {/* Type */}
                        <div style={{ marginBottom: 12 }}>
                          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>ধরন *</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {typeOpts.map(t => (
                              <button key={t.v} onClick={() => setCmpType(t.v)}
                                style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${cmpType === t.v ? '#dc2626' : '#e5e7eb'}`, background: cmpType === t.v ? '#fef2f2' : 'white', color: cmpType === t.v ? '
