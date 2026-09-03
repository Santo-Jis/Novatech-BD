// pages/shared/ConnectCustomer.jsx
// ✅ NEW — SR/Worker (ও Manager) সামনাসামনি কাস্টমারের QR স্ক্যান করে
// সাথে সাথে connect করার পেজ। এটাই কাস্টমার-পোর্টালে দেখানো প্রতিশ্রুতি
// ("SR সামনাসামনি QR স্ক্যান করলে সাথে সাথে সংযোগ হয়ে যাবে")-এর বাস্তবায়ন।
//
// ব্যাকএন্ড আগে থেকেই রেডি: POST /api/connections/qr-scan { qr_code }
// (approval লাগে না, সাথে সাথে status='connected' হয়)।
//
// QR স্ক্যান কাজ না করলে/ক্যামেরা না থাকলে ফলব্যাক হিসেবে ফোন/নাম দিয়ে
// সার্চ করে রিকোয়েস্ট পাঠানোর অপশনও আছে (GET /search-persons + POST /request
// — এক্ষেত্রে কাস্টমারকে Accept করতে হবে, সাথে সাথে connect হবে না)।
//
// pages/shared/-এ রাখা হলো যাতে Worker ও Manager দুই লেআউট থেকেই একই
// পেজ রুট করা যায় (worker/manager route registration আলাদা, কম্পোনেন্ট এক)।

import { useState } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import { FiCamera, FiSearch, FiCheck, FiUserPlus, FiRefreshCw } from 'react-icons/fi'
import QrScanner from '../../components/QrScanner'
import { enqueue } from '../../api/offlineQueue'

export default function ConnectCustomer() {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [connecting,  setConnecting]  = useState(false)
  const [result,      setResult]      = useState(null) // { ok, message, data }

  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [requestingId, setRequestingId] = useState(null)
  const [scores, setScores] = useState({}) // ✅ NEW (Phase 5): { [personId]: { score, connectionCount } }

  // ── QR স্ক্যান হ্যান্ডলার ──────────────────────────────────
  // ✅ NEW (Phase 5 — কোড অডিট): মার্কেট/বাজার এলাকায় নেট প্রায়ই দুর্বল
  // থাকে — SR সামনে দাঁড়িয়ে স্ক্যান করলেও রিকোয়েস্ট পাঠাতে ব্যর্থ হতো।
  // এখন OrderForm.jsx/SalesForm.jsx-এর ঠিক একই প্যাটার্নে: অফলাইন হলে
  // queue করা হয়, নেটওয়ার্ক ফিরলে syncService.js নিজে থেকে পাঠায়।
  // ⚠️ অফলাইনে "সংযুক্ত হয়েছে" নিশ্চিতভাবে বলা যায় না (সার্ভার রেসপন্স
  // ছাড়া confirm করা অসম্ভব) — তাই বার্তাটা ইচ্ছাকৃতভাবে ভিন্ন ও honest।
  const handleScan = async (qr_code) => {
    setScannerOpen(false)
    setResult(null)

    if (!navigator.onLine) {
      try {
        await enqueue({ type: 'QR_CONNECT', payload: { qr_code } })
        setResult({ ok: true, message: 'নেট নেই — QR স্ক্যান সংরক্ষিত হয়েছে, নেটওয়ার্ক ফিরলে সংযুক্ত হবে।' })
        toast.success('📶 অফলাইনে সংরক্ষিত হয়েছে — নেট ফিরলে sync হবে', { duration: 5000 })
      } catch {
        toast.error('অফলাইনে সংরক্ষণ করতে সমস্যা হয়েছে।')
      }
      return
    }

    setConnecting(true)
    try {
      const res = await api.post('/connections/qr-scan', { qr_code })
      setResult({ ok: true, message: res.data.message || 'সংযুক্ত হয়েছে!' })
      toast.success('✅ কাস্টমার সংযুক্ত হয়েছে!')
    } catch (err) {
      const msg = err.response?.data?.message || 'সংযোগ করতে সমস্যা হয়েছে।'
      setResult({ ok: false, message: msg })
      toast.error(msg)
    } finally {
      setConnecting(false)
    }
  }

  // ── ম্যানুয়াল সার্চ (ফলব্যাক) ──────────────────────────────
  const runSearch = async () => {
    if (searchQ.trim().length < 3) { toast.error('কমপক্ষে ৩ অক্ষর লিখুন।'); return }
    setSearching(true)
    try {
      const res = await api.get('/connections/search-persons', { params: { q: searchQ.trim() } })
      const results = res.data.data || []
      setSearchResults(results)
      // ✅ NEW (Phase 5 — কোড অডিট): reliability score — অন্য কোম্পানির
      // সাথে এই person-এর ইতিহাস কেমন, connect করার সিদ্ধান্তে সহায়ক প্রসঙ্গ।
      // ফলাফল ছোট (LIMIT 20) বলে প্রতিটার জন্য আলাদা fire-and-forget কল —
      // ধীরে ধীরে ব্যাজ দেখা যাবে, প্রধান সার্চ রেজাল্ট আটকাবে না।
      results.forEach(p => {
        api.get(`/connections/persons/${p.id}/reliability-score`)
          .then(r => setScores(prev => ({ ...prev, [p.id]: r.data.data })))
          .catch(() => {})
      })
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  // ✅ NEW (Phase 5): search-ভিত্তিক রিকোয়েস্টও অফলাইন-queue সাপোর্ট করে —
  // person_id ইতিমধ্যে সার্চ রেজাল্ট থেকে জানা আছে (আগেই অনলাইনে সার্চ
  // করা হয়েছিল), তাই request পাঠানোর সময় নেট চলে গেলেও queue করা যায়।
  const sendRequest = async (person_id) => {
    if (!navigator.onLine) {
      try {
        await enqueue({ type: 'CONNECTION_REQUEST', payload: { person_id } })
        toast.success('📶 অফলাইনে সংরক্ষিত — নেট ফিরলে রিকোয়েস্ট পাঠানো হবে', { duration: 5000 })
        setSearchResults(prev => prev.map(p => p.id === person_id ? { ...p, existing_status: 'pending' } : p))
      } catch {
        toast.error('অফলাইনে সংরক্ষণ করতে সমস্যা হয়েছে।')
      }
      return
    }

    setRequestingId(person_id)
    try {
      await api.post('/connections/request', { person_id })
      toast.success('✅ রিকোয়েস্ট পাঠানো হয়েছে — কাস্টমারের Accept-এর অপেক্ষায়।')
      setSearchResults(prev => prev.map(p => p.id === person_id ? { ...p, existing_status: 'pending' } : p))
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setRequestingId(null)
    }
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div>
        <p className="text-lg font-bold text-gray-800">কাস্টমার কানেক্ট করুন</p>
        <p className="text-xs text-gray-400 mt-0.5">কাস্টমারের QR কোড স্ক্যান করলে সাথে সাথে সংযুক্ত হবে — অনুমোদনের দরকার নেই</p>
      </div>

      {/* ── QR স্ক্যান বাটন ── */}
      <button
        onClick={() => { setScannerOpen(true); setResult(null) }}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-2 py-4 bg-blue-500 text-white rounded-2xl font-bold text-sm disabled:opacity-60 active:scale-[0.98] transition-transform"
      >
        {connecting
          ? <FiRefreshCw className="animate-spin" size={18} />
          : <FiCamera size={18} />
        }
        {connecting ? 'সংযুক্ত হচ্ছে...' : 'QR কোড স্ক্যান করুন'}
      </button>

      {/* ── স্ক্যান রেজাল্ট ── */}
      {result && (
        <div className={`rounded-2xl p-4 border-2 ${result.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2">
            {result.ok ? <FiCheck className="text-emerald-600" size={18} /> : <span className="text-red-600">⚠️</span>}
            <p className={`text-sm font-semibold ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>{result.message}</p>
          </div>
        </div>
      )}

      {/* ── QR স্ক্যানার মোডাল ── */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setScannerOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-3xl p-5 w-full max-w-sm">
            <p className="text-base font-bold text-gray-800 mb-3 text-center">কাস্টমারের QR স্ক্যান করুন</p>
            <QrScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />
          </div>
        </div>
      )}

      {/* ── ফলব্যাক: ফোন/নাম দিয়ে সার্চ ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">অথবা ফোন/হোয়াটসঅ্যাপ/নাম দিয়ে খুঁজে রিকোয়েস্ট পাঠান</p>
        <div className="flex gap-2">
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="যেমন: 017XXXXXXXX বা নাম"
            className="flex-1 h-11 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            onClick={runSearch}
            disabled={searching}
            className="w-11 h-11 rounded-xl bg-blue-500 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-60"
          >
            <FiSearch size={16} />
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {searchResults.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.full_name}</p>
                  <p className="text-[11px] text-gray-400">{p.phone || p.whatsapp || p.email}</p>
                  {/* ✅ NEW (Phase 5): অন্য কোম্পানির সাথে এই person-এর
                      পেমেন্ট-ইতিহাস heuristic — শুধু একটা প্রসঙ্গ, চূড়ান্ত
                      সিদ্ধান্ত না (দেখুন paymentReliability.service.js) */}
                  {scores[p.id]?.score != null && (
                    <p className={`text-[10px] font-semibold mt-0.5 ${
                      scores[p.id].score >= 70 ? 'text-emerald-600' :
                      scores[p.id].score >= 40 ? 'text-amber-600' : 'text-red-500'
                    }`}>
                      রিলায়েবিলিটি {scores[p.id].score}/100 ({scores[p.id].connectionCount} কোম্পানি)
                    </p>
                  )}
                </div>
                {p.existing_status === 'connected' && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-3 py-1.5 flex-shrink-0">সংযুক্ত</span>
                )}
                {p.existing_status === 'pending' && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-3 py-1.5 flex-shrink-0">পেন্ডিং</span>
                )}
                {!p.existing_status && (
                  <button
                    onClick={() => sendRequest(p.id)}
                    disabled={requestingId === p.id}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 rounded-full px-3 py-1.5 flex-shrink-0 disabled:opacity-60"
                  >
                    <FiUserPlus size={12} /> রিকোয়েস্ট
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
