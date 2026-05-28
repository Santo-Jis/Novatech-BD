import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import { FiRefreshCw, FiCheck, FiX, FiChevronDown, FiChevronUp, FiAlertTriangle, FiClock, FiTrendingUp } from 'react-icons/fi'

// ── সময় ফরম্যাট helper ─────────────────────────────────
function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (mins  < 1)   return 'এইমাত্র'
    if (mins  < 60)  return `${mins} মিনিট আগে`
    if (hours < 24)  return `${hours} ঘন্টা আগে`
    return `${days} দিন আগে`
}

function timeLeft(expiresAt) {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'মেয়াদ শেষ'
    const hours = Math.floor(diff / 3600000)
    const mins  = Math.floor((diff % 3600000) / 60000)
    if (hours < 1) return `${mins} মিনিট বাকি`
    return `${hours}ঘ ${mins}মি বাকি`
}

// ── Credit পরিমাণ রঙ ────────────────────────────────────
function pctColor(pct) {
    if (pct >= 100) return { bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700',    text: 'text-red-600' }
    if (pct >= 80)  return { bar: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700', text: 'text-amber-600' }
    return              { bar: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-600' }
}

// ── Approval Card ────────────────────────────────────────
function ApprovalCard({ item, onApprove, onReject }) {
    const [expanded,   setExpanded]   = useState(false)
    const [rejectNote, setRejectNote] = useState('')
    const [showReject, setShowReject] = useState(false)
    const [loading,    setLoading]    = useState(false)

    const pct = parseInt(item.credit_used_pct || 0)
    const colors = pctColor(pct)
    const isFull = pct >= 100

    const handleApprove = async () => {
        setLoading(true)
        await onApprove(item.id)
        setLoading(false)
    }

    const handleReject = async () => {
        setLoading(true)
        await onReject(item.id, rejectNote)
        setLoading(false)
        setShowReject(false)
    }

    return (
        <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${isFull ? 'border-red-200' : pct >= 80 ? 'border-amber-200' : 'border-gray-100'}`}>
            <div className="p-4 space-y-3">
                {/* Row 1: Shop + time */}
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-800 leading-tight">{item.shop_name}</p>
                        <p className="text-xs text-gray-400">{item.owner_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                        <p className="text-[10px] text-gray-400">{timeAgo(item.created_at)}</p>
                        <p className={`text-[10px] font-medium ${
                            timeLeft(item.expires_at) === 'মেয়াদ শেষ'
                                ? 'text-red-400'
                                : 'text-amber-500'
                        }`}>
                            ⏱ {timeLeft(item.expires_at)}
                        </p>
                    </div>
                </div>

                {/* Row 2: SR + amount */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                            👤 {item.sr_name}
                        </span>
                    </div>
                    <p className="text-base font-bold text-orange-600">
                        ৳{parseInt(item.requested_amount).toLocaleString()}
                    </p>
                </div>

                {/* Credit progress */}
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                        <span>বর্তমান বাকি: <strong className={colors.text}>৳{parseInt(item.current_credit).toLocaleString()}</strong></span>
                        <span>লিমিট: ৳{parseInt(item.credit_limit).toLocaleString()}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${colors.bar}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                        />
                    </div>
                    <div className="flex justify-between items-center">
                        <span className={`text-[10px] font-bold ${colors.text}`}>{pct}% ব্যবহৃত</span>
                        {isFull && (
                            <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">লিমিট পূর্ণ</span>
                        )}
                    </div>
                </div>

                {/* SR note (collapsible) */}
                {item.note && (
                    <button
                        onClick={() => setExpanded(p => !p)}
                        className="flex items-center gap-1 text-[11px] text-gray-400"
                    >
                        {expanded ? <FiChevronUp size={11} /> : <FiChevronDown size={11} />}
                        SR-এর নোট দেখুন
                    </button>
                )}
                {expanded && item.note && (
                    <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 italic">
                        "{item.note}"
                    </div>
                )}

                {/* Reject note input */}
                {showReject && (
                    <div className="space-y-2">
                        <input
                            type="text"
                            placeholder="Reject-এর কারণ (ঐচ্ছিক)"
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-red-200 rounded-xl focus:outline-none focus:border-red-400 bg-red-50"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setShowReject(false); setRejectNote('') }}
                                className="flex-1 py-2 border border-gray-200 rounded-xl text-xs text-gray-500"
                            >
                                বাতিল
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={loading}
                                className="flex-1 py-2 bg-red-500 text-white rounded-xl text-xs font-semibold disabled:opacity-60"
                            >
                                {loading ? '...' : '✕ Reject নিশ্চিত করুন'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                {!showReject && (
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => setShowReject(true)}
                            disabled={loading}
                            className="flex-1 py-2.5 border-2 border-red-200 text-red-500 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97] disabled:opacity-60"
                        >
                            <FiX size={13} /> Reject
                        </button>
                        <button
                            onClick={handleApprove}
                            disabled={loading}
                            className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] disabled:opacity-60"
                        >
                            {loading
                                ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <FiCheck size={13} />
                            }
                            Approve
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Due Leaderboard Row ──────────────────────────────────
function DueRow({ item, rank }) {
    const pct    = parseInt(item.credit_used_pct || 0)
    const colors = pctColor(pct)
    const isFull = pct >= 100

    return (
        <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
            {/* Rank */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                rank === 1 ? 'bg-red-500 text-white' :
                rank === 2 ? 'bg-orange-400 text-white' :
                rank === 3 ? 'bg-amber-400 text-white' :
                'bg-gray-100 text-gray-500'
            }`}>
                {rank}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 leading-tight truncate">{item.shop_name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                    {item.assigned_sr ? `👤 ${item.assigned_sr}` : '—'} · {item.route_name || '—'}
                </p>
                {/* Mini progress */}
                <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${colors.bar}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                        />
                    </div>
                    <span className={`text-[9px] font-bold ${colors.text} flex-shrink-0`}>{pct}%</span>
                </div>
            </div>

            {/* Amount */}
            <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-red-500">৳{parseInt(item.current_credit).toLocaleString()}</p>
                {isFull && <span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">লিমিট পূর্ণ</span>}
            </div>
        </div>
    )
}

// ── MAIN PAGE ────────────────────────────────────────────
export default function ManagerCreditApprovals() {
    const [tab,          setTab]          = useState('pending')  // 'pending' | 'leaderboard' | 'history'
    const [pending,      setPending]      = useState([])
    const [leaderboard,  setLeaderboard]  = useState(null)
    const [history,      setHistory]      = useState([])
    const [loading,      setLoading]      = useState(true)
    const [refreshing,   setRefreshing]   = useState(false)

    // ── Data loaders ───────────────────────────────────────
    const loadPending = useCallback(async () => {
        try {
            const res = await api.get('/credit-approvals/pending')
            setPending(res.data.data)
        } catch {
            toast.error('Pending list লোড করা যায়নি।')
        }
    }, [])

    const loadLeaderboard = useCallback(async () => {
        try {
            const res = await api.get('/credit-approvals/due-leaderboard')
            setLeaderboard(res.data)
        } catch {
            toast.error('Leaderboard লোড করা যায়নি।')
        }
    }, [])

    const loadHistory = useCallback(async () => {
        try {
            const res = await api.get('/credit-approvals/history')
            setHistory(res.data.data)
        } catch { /* silent */ }
    }, [])

    useEffect(() => {
        const init = async () => {
            setLoading(true)
            await Promise.all([loadPending(), loadLeaderboard()])
            setLoading(false)
        }
        init()
    }, [loadPending, loadLeaderboard])

    useEffect(() => {
        if (tab === 'history' && history.length === 0) loadHistory()
    }, [tab, history.length, loadHistory])

    const refresh = async () => {
        setRefreshing(true)
        await Promise.all([loadPending(), loadLeaderboard()])
        if (tab === 'history') await loadHistory()
        setRefreshing(false)
        toast.success('আপডেট হয়েছে।', { duration: 1500 })
    }

    // ── Approve / Reject handlers ──────────────────────────
    const handleApprove = async (requestId) => {
        try {
            await api.put(`/credit-approvals/${requestId}/approve`)
            toast.success('✅ Approval দেওয়া হয়েছে। SR বিক্রি করতে পারবে।')
            setPending(prev => prev.filter(p => p.id !== requestId))
        } catch (err) {
            toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
        }
    }

    const handleReject = async (requestId, note) => {
        try {
            await api.put(`/credit-approvals/${requestId}/reject`, { review_note: note })
            toast.success('Request reject করা হয়েছে।')
            setPending(prev => prev.filter(p => p.id !== requestId))
        } catch (err) {
            toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
        }
    }

    // ── Loading skeleton ────────────────────────────────────
    if (loading) {
        return (
            <div className="p-4 space-y-3 animate-fade-in">
                <div className="h-6 bg-gray-100 rounded-xl w-1/2 animate-pulse" />
                {[1,2,3].map(i => (
                    <div key={i} className="h-36 bg-white rounded-2xl border border-gray-100 animate-pulse" />
                ))}
            </div>
        )
    }

    const lb = leaderboard

    return (
        <div className="p-4 space-y-4 animate-fade-in pb-10">

            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-bold text-gray-800 text-base">Credit Approvals</h1>
                    <p className="text-xs text-gray-400 mt-0.5">বাকি অনুমোদন ও বকেয়া নিয়ন্ত্রণ</p>
                </div>
                <button
                    onClick={refresh}
                    disabled={refreshing}
                    className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 active:scale-90"
                >
                    <FiRefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Summary Cards */}
            {lb && (
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                        <p className="text-lg font-bold text-red-500">{lb.summary.total_customers_with_due}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">বকেয়া কাস্টমার</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                        <p className="text-lg font-bold text-orange-500">
                            ৳{Math.round(lb.summary.total_due_amount / 1000)}K
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">মোট বকেয়া</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                        <p className="text-lg font-bold text-amber-500">{lb.summary.high_risk_count}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">উচ্চ ঝুঁকি (≥80%)</p>
                    </div>
                </div>
            )}

            {/* Pending badge */}
            {pending.length > 0 && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                    <span className="text-orange-500 text-sm">🔔</span>
                    <p className="text-xs font-semibold text-orange-700">
                        {pending.length}টি approval pending — SR অপেক্ষায় আছে
                    </p>
                </div>
            )}

            {/* Tab bar */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
                {[
                    { key: 'pending',     icon: <FiClock size={11} />,       label: `Pending${pending.length > 0 ? ` (${pending.length})` : ''}` },
                    { key: 'leaderboard', icon: <FiTrendingUp size={11} />,  label: 'বকেয়া Ranking' },
                    { key: 'history',     icon: <FiAlertTriangle size={11} />, label: 'ইতিহাস' },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                            tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
                        }`}
                    >
                        {t.icon}{t.label}
                    </button>
                ))}
            </div>

            {/* ── TAB: Pending Approvals ─────────────────────── */}
            {tab === 'pending' && (
                <div className="space-y-3">
                    {pending.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center text-2xl">✅</div>
                            <p className="text-sm font-semibold text-gray-600">কোনো pending request নেই</p>
                            <p className="text-xs text-gray-400">সব SR স্বাভাবিকভাবে বিক্রি করছে।</p>
                        </div>
                    ) : (
                        pending.map(item => (
                            <ApprovalCard
                                key={item.id}
                                item={item}
                                onApprove={handleApprove}
                                onReject={handleReject}
                            />
                        ))
                    )}
                </div>
            )}

            {/* ── TAB: Due Leaderboard ──────────────────────── */}
            {tab === 'leaderboard' && (
                <div className="space-y-3">
                    {!lb || lb.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center text-2xl">🎉</div>
                            <p className="text-sm font-semibold text-gray-600">কোনো বকেয়া নেই!</p>
                        </div>
                    ) : (
                        <>
                            {/* Limit-exceeded section */}
                            {lb.data.some(r => parseInt(r.credit_used_pct) >= 100) && (
                                <div className="bg-red-50 rounded-2xl border border-red-200 overflow-hidden">
                                    <div className="px-4 pt-3 pb-1">
                                        <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                                            🚫 লিমিট অতিক্রম — {lb.summary.over_limit_count}টি কাস্টমার
                                        </p>
                                    </div>
                                    <div className="px-4 pb-2">
                                        {lb.data
                                            .filter(r => parseInt(r.credit_used_pct) >= 100)
                                            .map((item, i) => <DueRow key={item.id} item={item} rank={i + 1} />)
                                        }
                                    </div>
                                </div>
                            )}

                            {/* All due customers */}
                            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                <div className="px-4 pt-3 pb-1 border-b border-gray-50">
                                    <p className="text-xs font-bold text-gray-600">সর্বাধিক বকেয়া — {lb.data.length}টি কাস্টমার</p>
                                </div>
                                <div className="px-4 pb-2">
                                    {lb.data.map((item, i) => (
                                        <DueRow key={item.id} item={item} rank={i + 1} />
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── TAB: History ──────────────────────────────── */}
            {tab === 'history' && (
                <div className="space-y-2">
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <p className="text-sm text-gray-400">কোনো ইতিহাস নেই।</p>
                        </div>
                    ) : (
                        history.map(item => (
                            <div key={item.id} className={`bg-white rounded-2xl border px-4 py-3 flex items-center gap-3 ${item.status === 'approved' ? 'border-emerald-100' : 'border-red-100'}`}>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${item.status === 'approved' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                                    {item.status === 'approved' ? '✅' : '✕'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{item.shop_name}</p>
                                    <p className="text-[10px] text-gray-400">
                                        SR: {item.sr_name} · {timeAgo(item.created_at)}
                                    </p>
                                    {item.review_note && (
                                        <p className="text-[10px] text-gray-500 italic mt-0.5">"{item.review_note}"</p>
                                    )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-bold text-gray-700">
                                        ৳{parseInt(item.requested_amount).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] text-gray-400">{item.reviewed_by_name}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
