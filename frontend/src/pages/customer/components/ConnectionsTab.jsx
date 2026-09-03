// components/ConnectionsTab.jsx
// ✅ NEW — "নেটওয়ার্ক" ট্যাব (IA স্কেলেটন ধাপ ১)
//
// এই ফিচারের ব্যাকএন্ড আগে থেকেই সম্পূর্ণ রেডি ছিল
// (customerPortalConnection.controller.js: my-companies, pending,
// search-companies, request, accept/reject, disconnect, my-qr) কিন্তু
// ফ্রন্টএন্ডে এতদিন কোনো UI ছিল না — এই ফাইলটাই তার প্রথম UI।
//
// এটাই ভবিষ্যতের Social/Discovery Phase (কোম্পানি পোস্ট ফিড, শপ↔শপ
// নেটওয়ার্ক)-এর natural home — এই কার্ড-লিস্ট প্যাটার্নটাই পরে ফিডে
// এক্সটেন্ড করা যাবে, তাই এখনই এই আলাদা ট্যাব/ফাইল হিসেবে রাখা হলো
// (Invoices/Payments-এর সাথে না মিশিয়ে)।
//
// আর্কিটেকচার নোট: 01-Requirements-Spec.md ধারা ৩.১ অনুযায়ী সংযোগ
// কোম্পানি-লেভেলে, aggregate + company-ট্যাগ প্যাটার্নে — এই ট্যাবই
// সেই কোম্পানি-লিস্টের একমাত্র সোর্স, বাকি সব ট্যাব (Invoices/Payments/
// Credit ইত্যাদি) এই লিস্ট থেকেই company filter chip বানায়।
//
// OrderRequestTab.jsx/InvoicesTab.jsx-এর মতোই self-contained: নিজের
// state/fetch নিজেই সামলায়, শুধু portalJWT prop নেয়।

import { useState, useEffect, useCallback } from 'react'
import {
  FiSearch, FiX, FiCheck, FiLink, FiPlus, FiSlash, FiRotateCcw, FiDownload,
} from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpCard from './ui/CpCard'
import CpButton from './ui/CpButton'
import CpInput from './ui/CpInput'

export default function ConnectionsTab({
  portalJWT, switchCompany, onConnectionsChanged,
  downloadConsolidatedStatement, consolidatedStmtLoading, // ✅ NEW (Phase 5)
}) {
  const [companies, setCompanies] = useState([])
  const [pending,   setPending]   = useState([])
  const [blocked,   setBlocked]   = useState([]) // ✅ NEW (Phase 3 — কোড অডিট)
  const [loading,   setLoading]   = useState(true)
  const [errorMsg,  setErrorMsg]  = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [switchingId, setSwitchingId] = useState(null)

  const [qrOpen,    setQrOpen]    = useState(false)
  const [qrData,    setQrData]   = useState(null)
  const [qrLoading, setQrLoading] = useState(false)

  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchQ,       setSearchQ]       = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching,     setSearching]     = useState(false)
  const [sendingId,     setSendingId]     = useState(null)

  const authHeader = { Authorization: `Bearer ${portalJWT}` }

  // ── কানেক্টেড কোম্পানি + পেন্ডিং রিকোয়েস্ট + ব্লক লিস্ট লোড ─────
  const load = useCallback(async () => {
    setLoading(true); setErrorMsg('')
    try {
      const [co, pe, bl] = await Promise.all([
        portalFetch('/portal/connections/my-companies', { headers: authHeader }),
        portalFetch('/portal/connections/pending',       { headers: authHeader }),
        portalFetch('/portal/connections/blocked',       { headers: authHeader }),
      ])
      setCompanies(co.data || [])
      setPending(pe.data || [])
      setBlocked(bl.data || [])
      // ✅ NEW (Phase 4): parent (DashboardView)-এর ব্যাজ কাউন্ট সিঙ্কে রাখো —
      // accept/reject-এর পর load() আবার চলে, তখনও এটা কল হয়ে ব্যাজ সাথে সাথে আপডেট হয়
      onConnectionsChanged?.((pe.data || []).length)
    } catch {
      setErrorMsg('কোম্পানি তালিকা আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── নিজের QR কোড ────────────────────────────────────────────
  const openQr = async () => {
    setQrOpen(true)
    if (qrData) return
    setQrLoading(true)
    try {
      const res = await portalFetch('/portal/connections/my-qr', { headers: authHeader })
      setQrData(res.data)
    } catch {
      setActionMsg('QR কোড আনতে সমস্যা হয়েছে।')
    } finally {
      setQrLoading(false)
    }
  }

  // ── নতুন কোম্পানি সার্চ ─────────────────────────────────────
  const runSearch = async () => {
    if (searchQ.trim().length < 2) return
    setSearching(true)
    try {
      const res = await portalFetch(`/portal/connections/search-companies?q=${encodeURIComponent(searchQ.trim())}`, { headers: authHeader })
      setSearchResults(res.data || [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const sendRequest = async (tenant_id) => {
    setSendingId(tenant_id)
    try {
      await portalFetch('/portal/connections/request', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({ tenant_id }),
      })
      setActionMsg('✅ রিকোয়েস্ট পাঠানো হয়েছে — কোম্পানির Accept-এর অপেক্ষায়।')
      setSearchResults(prev => prev.filter(c => c.tenant_id !== tenant_id))
    } catch (err) {
      setActionMsg(err?.message || 'রিকোয়েস্ট পাঠাতে সমস্যা হয়েছে।')
    } finally {
      setSendingId(null)
    }
  }

  // ── পেন্ডিং রিকোয়েস্ট Accept/Reject ────────────────────────
  const acceptReq = async (connection_id) => {
    try {
      await portalFetch(`/portal/connections/${connection_id}/accept`, { method: 'POST', headers: authHeader })
      load()
    } catch {
      setActionMsg('Accept করতে সমস্যা হয়েছে।')
    }
  }
  const rejectReq = async (connection_id) => {
    try {
      await portalFetch(`/portal/connections/${connection_id}/reject`, { method: 'POST', headers: authHeader })
      load()
    } catch {
      setActionMsg('বাতিল করতে সমস্যা হয়েছে।')
    }
  }
  const disconnect = async (connection_id) => {
    if (!window.confirm('এই কোম্পানির সাথে সংযোগ বিচ্ছিন্ন করবেন?')) return
    try {
      await portalFetch(`/portal/connections/${connection_id}/disconnect`, { method: 'POST', headers: authHeader })
      load()
    } catch {
      setActionMsg('সংযোগ বিচ্ছিন্ন করতে সমস্যা হয়েছে।')
    }
  }

  // ── ব্লক/আনব্লক ── ✅ NEW (Phase 3 — কোড অডিট)
  // pending রিকোয়েস্ট থেকে সরাসরি ব্লক করা যায় (আলাদা করে reject করার
  // দরকার নেই — block নিজেই যেকোনো non-blocked status থেকে কাজ করে)।
  const blockReq = async (connection_id) => {
    if (!window.confirm('এই কোম্পানিকে ব্লক করবেন? তারা আর কানেকশন রিকোয়েস্ট পাঠাতে পারবে না।')) return
    try {
      await portalFetch(`/portal/connections/${connection_id}/block`, { method: 'POST', headers: authHeader })
      load()
    } catch {
      setActionMsg('ব্লক করতে সমস্যা হয়েছে।')
    }
  }
  const blockCompany = async (connection_id) => {
    if (!window.confirm('এই কোম্পানিকে ব্লক করবেন? সংযোগ বিচ্ছিন্ন হয়ে যাবে এবং তারা আর নতুন রিকোয়েস্ট পাঠাতে পারবে না, যতক্ষণ না আপনি আনব্লক করেন।')) return
    try {
      await portalFetch(`/portal/connections/${connection_id}/block`, { method: 'POST', headers: authHeader })
      load()
    } catch {
      setActionMsg('ব্লক করতে সমস্যা হয়েছে।')
    }
  }
  const unblockCompany = async (connection_id) => {
    try {
      await portalFetch(`/portal/connections/${connection_id}/unblock`, { method: 'POST', headers: authHeader })
      load()
    } catch {
      setActionMsg('আনব্লক করতে সমস্যা হয়েছে।')
    }
  }

  // ✅ নতুন — কোম্পানির কার্ডে ট্যাপ করলে সেই কোম্পানির ড্যাশবোর্ডে প্রবেশ
  // (person-only/company-বিহীন session থেকে প্রথম কোম্পানিতে ঢোকার একমাত্র পথ,
  // এবং একাধিক-কোম্পানি কাস্টমারের জন্যও company switch করার সরাসরি উপায়)
  const handleSwitch = async (connection_id) => {
    if (!switchCompany || switchingId) return
    setSwitchingId(connection_id)
    setActionMsg('')
    try {
      await switchCompany(connection_id)
      // সফল হলে phase নিজে থেকেই dashboard-এ চলে যাবে (usePortalAuth-এর ভেতরে)
    } catch {
      setActionMsg('প্রবেশ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।')
      setSwitchingId(null)
    }
  }

  const companyName = (c) => c.company_name_bn || c.company_name
  const fmtCur = (n) => parseFloat(n || 0).toLocaleString('en-US')

  return (
    <div className="flex flex-col gap-3">
      {/* ── Header actions ── */}
      <div className="flex gap-2">
        <CpButton variant="secondary" size="sm" icon={FiLink} onClick={openQr} className="flex-1">
          আমার QR কোড
        </CpButton>
        <CpButton variant="primary" size="sm" icon={FiPlus} onClick={() => setSearchOpen(true)} className="flex-1">
          নতুন কোম্পানি যোগ করুন
        </CpButton>
      </div>

      {actionMsg && (
        <CpCard variant="sunken" padding="sm" className="flex items-center justify-between gap-2">
          <span className="text-xs text-cp-text-secondary">{actionMsg}</span>
          <button onClick={() => setActionMsg('')} className="text-cp-text-muted flex-shrink-0"><FiX size={14} /></button>
        </CpCard>
      )}
      {errorMsg && (
        <CpCard variant="sunken" padding="sm"><span className="text-xs text-cp-error">{errorMsg}</span></CpCard>
      )}

      {/* ── পেন্ডিং রিকোয়েস্ট ── */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-cp-text-secondary mb-1.5 px-1">
            পেন্ডিং রিকোয়েস্ট ({pending.length})
          </p>
          <div className="flex flex-col gap-2">
            {pending.map(p => (
              <CpCard key={p.connection_id} padding="sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.logo_url
                      ? <img src={p.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                      : <div className="w-9 h-9 rounded-xl bg-cp-trust-100 flex items-center justify-center text-cp-trust-700 font-bold flex-shrink-0">{companyName(p)?.[0]}</div>
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-cp-text-primary truncate">{companyName(p)}</p>
                      <p className="text-[10px] text-cp-text-muted">আপনাকে কানেকশন রিকোয়েস্ট পাঠিয়েছে</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => acceptReq(p.connection_id)} className="w-8 h-8 rounded-full bg-cp-confidence-600 text-white flex items-center justify-center">
                      <FiCheck size={14} />
                    </button>
                    <button onClick={() => rejectReq(p.connection_id)} className="w-8 h-8 rounded-full bg-cp-bg-alt text-cp-text-muted flex items-center justify-center">
                      <FiX size={14} />
                    </button>
                    <button onClick={() => blockReq(p.connection_id)} title="ব্লক করুন" className="w-8 h-8 rounded-full bg-cp-error-bg text-cp-error flex items-center justify-center">
                      <FiSlash size={14} />
                    </button>
                  </div>
                </div>
              </CpCard>
            ))}
          </div>
        </div>
      )}

      {/* ── কানেক্টেড কোম্পানি ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <p className="text-xs font-semibold text-cp-text-secondary">
            কানেক্টেড কোম্পানি {companies.length > 0 && `(${companies.length})`}
          </p>
          {/* ✅ NEW (Phase 5 — কোড অডিট): সব কোম্পানির বকেয়া এক PDF-এ */}
          {companies.length > 0 && downloadConsolidatedStatement && (
            <button
              onClick={downloadConsolidatedStatement}
              disabled={consolidatedStmtLoading}
              className="text-[10px] font-semibold text-cp-trust-600 flex items-center gap-1 disabled:opacity-50"
            >
              <FiDownload size={11} />
              {consolidatedStmtLoading ? 'তৈরি হচ্ছে...' : 'স্টেটমেন্ট PDF'}
            </button>
          )}
        </div>

        {loading && (
          <CpCard padding="md"><p className="text-xs text-cp-text-muted text-center">লোড হচ্ছে...</p></CpCard>
        )}

        {!loading && companies.length === 0 && (
          <CpCard padding="lg" className="text-center">
            <p className="text-sm text-cp-text-secondary mb-1">এখনো কোনো কোম্পানির সাথে সংযোগ নেই।</p>
            <p className="text-xs text-cp-text-muted">SR আপনার QR স্ক্যান করলে, অথবা উপরের "নতুন কোম্পানি যোগ করুন" বাটন দিয়ে সংযোগ করুন।</p>
          </CpCard>
        )}

        <div className="flex flex-col gap-2">
          {companies.map(c => (
            <CpCard key={c.connection_id} padding="md">
              <div className="flex items-center gap-3">
                {c.logo_url
                  ? <img src={c.logo_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-11 h-11 rounded-xl bg-cp-trust-100 flex items-center justify-center text-cp-trust-700 font-bold flex-shrink-0">{companyName(c)?.[0]}</div>
                }
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-cp-text-primary truncate">{companyName(c)}</p>
                  <p className="text-[10px] text-cp-text-muted font-cp-mono">{c.customer_code || ''}</p>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => disconnect(c.connection_id)} className="text-[10px] text-cp-error px-2 py-1 rounded-lg bg-cp-error-bg whitespace-nowrap">
                    বিচ্ছিন্ন
                  </button>
                  <button onClick={() => blockCompany(c.connection_id)} className="text-[10px] text-cp-text-muted px-2 py-1 rounded-lg bg-cp-bg-alt whitespace-nowrap">
                    ব্লক
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mt-2.5">
                <div className="flex-1 bg-cp-bg-alt rounded-xl px-3 py-2">
                  <p className="text-[9px] text-cp-text-muted">ক্রেডিট লিমিট</p>
                  <p className="text-sm font-bold text-cp-text-primary font-cp-mono">৳{fmtCur(c.credit_limit)}</p>
                </div>
                <div className="flex-1 bg-cp-confidence-100 rounded-xl px-3 py-2">
                  <p className="text-[9px] text-cp-confidence-600">বকেয়া</p>
                  <p className="text-sm font-bold text-cp-confidence-600 font-cp-mono">৳{fmtCur(c.current_credit)}</p>
                </div>
              </div>
              {switchCompany && (
                <CpButton
                  variant="primary"
                  size="sm"
                  fullWidth
                  className="mt-2.5"
                  loading={switchingId === c.connection_id}
                  onClick={() => handleSwitch(c.connection_id)}
                >
                  প্রবেশ করুন
                </CpButton>
              )}
            </CpCard>
          ))}
        </div>
      </div>

      {/* ── ব্লক করা কোম্পানি ── ✅ NEW (Phase 3 — কোড অডিট)
           নিজে যা ব্লক করেছি শুধু তা-ই এখানে দেখা যায় ও আনব্লক করা যায়
           (কোম্পানি যা ব্লক করেছে তা এখানে দেখানো হয় না — ইচ্ছাকৃত, দেখুন
           customerPortalConnection.controller.js: getMyBlockedCompanies) */}
      {blocked.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-cp-text-secondary mb-1.5 px-1">
            ব্লক করা কোম্পানি ({blocked.length})
          </p>
          <div className="flex flex-col gap-2">
            {blocked.map(b => (
              <CpCard key={b.connection_id} padding="sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {b.logo_url
                      ? <img src={b.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0 opacity-60" />
                      : <div className="w-9 h-9 rounded-xl bg-cp-bg-alt flex items-center justify-center text-cp-text-muted font-bold flex-shrink-0">{companyName(b)?.[0]}</div>
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-cp-text-muted truncate">{companyName(b)}</p>
                      <p className="text-[10px] text-cp-text-muted">আপনি ব্লক করেছেন</p>
                    </div>
                  </div>
                  <button onClick={() => unblockCompany(b.connection_id)} className="text-[10px] text-cp-text-secondary px-2 py-1 rounded-lg bg-cp-bg-alt flex items-center gap-1 flex-shrink-0">
                    <FiRotateCcw size={11} /> আনব্লক
                  </button>
                </div>
              </CpCard>
            ))}
          </div>
        </div>
      )}

      {/* ── QR মোডাল ── */}
      {qrOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setQrOpen(false)}>
          <div className="bg-white w-full max-w-[480px] rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <p className="text-base font-bold text-cp-text-primary">আমার QR কোড</p>
              <button onClick={() => setQrOpen(false)}><FiX size={20} className="text-cp-text-muted" /></button>
            </div>
            {qrLoading && <p className="text-xs text-cp-text-muted text-center py-8">লোড হচ্ছে...</p>}
            {!qrLoading && qrData && (
              <div className="flex flex-col items-center gap-3 pb-4">
                {/* ⚠️ NOTE: এখানে qrcode npm প্যাকেজ ইনস্টল না থাকায় (offline network)
                    সাময়িকভাবে qrserver.com-এর পাবলিক ইমেজ API ব্যবহার করা হলো —
                    ডেটা শুধু qr_code ভ্যালু (কোনো ব্যক্তিগত তথ্য পাঠানো হচ্ছে না)।
                    ভবিষ্যতে অফলাইন/সেলফ-হোস্টেড জেনারেশন দরকার হলে `qrcode` npm
                    প্যাকেজ যোগ করে ক্লায়েন্ট-সাইড জেনারেট করা যাবে। */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData.qr_code)}`}
                  alt="QR কোড"
                  className="w-[220px] h-[220px] rounded-2xl border border-cp-border"
                />
                <p className="text-sm font-semibold text-cp-text-primary">{qrData.full_name}</p>
                <p className="text-xs text-cp-text-muted text-center px-6">
                  SR সামনাসামনি এই QR স্ক্যান করলে সাথে সাথে সংযোগ হয়ে যাবে — অনুমোদনের দরকার নেই।
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── সার্চ/কানেক্ট মোডাল ── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setSearchOpen(false)}>
          <div className="bg-white w-full max-w-[480px] rounded-t-3xl p-5 max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <p className="text-base font-bold text-cp-text-primary">কোম্পানি খুঁজুন</p>
              <button onClick={() => setSearchOpen(false)}><FiX size={20} className="text-cp-text-muted" /></button>
            </div>
            <div className="flex gap-2 mb-3 items-start">
              <div className="flex-1">
                <CpInput
                  placeholder="কোম্পানির নাম লিখুন..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runSearch()}
                />
              </div>
              <CpButton variant="primary" size="md" icon={FiSearch} loading={searching} onClick={runSearch} />
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {searchResults.map(c => (
                <CpCard key={c.tenant_id} padding="sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-cp-text-primary truncate">{companyName(c)}</p>
                        {c.match_score > 0 && (
                          <span className="flex-shrink-0 text-[9px] font-semibold text-cp-confidence-600 bg-cp-confidence-100 rounded-full px-2 py-0.5">
                            আপনার এলাকা/ফিল্ড ম্যাচ
                          </span>
                        )}
                      </div>
                      {c.company_address && <p className="text-[10px] text-cp-text-muted truncate">{c.company_address}</p>}
                    </div>
                    <CpButton
                      variant="secondary" size="sm"
                      loading={sendingId === c.tenant_id}
                      onClick={() => sendRequest(c.tenant_id)}
                    >
                      রিকোয়েস্ট
                    </CpButton>
                  </div>
                </CpCard>
              ))}
              {!searching && searchQ.trim().length >= 2 && searchResults.length === 0 && (
                <p className="text-xs text-cp-text-muted text-center py-6">কোনো কোম্পানি পাওয়া যায়নি।</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
