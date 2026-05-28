import { useState, useEffect } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'

// ──────────────────────────────────────────────
// Admin Settings → Credit Alert Section
// এটি Admin Settings পেজে import করে render করুন:
//   <AdminCreditSettings />
// ──────────────────────────────────────────────

export default function AdminCreditSettings() {
    const [loading,   setLoading]   = useState(true)
    const [saving,    setSaving]    = useState(false)
    const [threshold, setThreshold] = useState(80)
    const [requireApproval, setRequireApproval] = useState(false)
    const [dirty,     setDirty]     = useState(false)

    useEffect(() => {
        const load = async () => {
            try {
                const res = await api.get('/credit-approvals/settings')
                setThreshold(res.data.data.alert_threshold_pct)
                setRequireApproval(res.data.data.require_approval)
            } catch {
                toast.error('সেটিংস লোড করা যায়নি।')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const save = async () => {
        setSaving(true)
        try {
            await api.put('/credit-approvals/settings', {
                alert_threshold_pct: threshold,
                require_approval:    requireApproval
            })
            toast.success('✅ Credit সেটিংস সংরক্ষিত হয়েছে।')
            setDirty(false)
        } catch (err) {
            toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
        } finally {
            setSaving(false)
        }
    }

    const change = (fn) => { fn(); setDirty(true) }

    // ── Progress bar preview ────────────────────────────────
    const pct = threshold
    const barColor =
        pct >= 90 ? 'bg-red-500' :
        pct >= 70 ? 'bg-amber-400' :
        'bg-emerald-400'

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/3" />
                <div className="h-10 bg-gray-100 rounded-xl" />
                <div className="h-10 bg-gray-100 rounded-xl" />
            </div>
        )
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
                <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                    💳
                </div>
                <div>
                    <p className="font-bold text-sm text-gray-800">Credit Alert সেটিংস</p>
                    <p className="text-[11px] text-gray-400">বকেয়া সতর্কতা ও অনুমোদন নিয়ন্ত্রণ</p>
                </div>
            </div>

            <div className="p-5 space-y-5">

                {/* ── Threshold Slider ────────────────────────── */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-gray-700">Alert Threshold</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                Credit limit-এর কত % হলে SR-কে সতর্কতা দেখাবে
                            </p>
                        </div>
                        <div className={`px-3 py-1.5 rounded-xl text-sm font-bold ${
                            pct >= 90 ? 'bg-red-100 text-red-700' :
                            pct >= 70 ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                        }`}>
                            {threshold}%
                        </div>
                    </div>

                    {/* Slider */}
                    <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={threshold}
                        onChange={e => change(() => setThreshold(parseInt(e.target.value)))}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-orange-500"
                        style={{
                            background: `linear-gradient(to right, #f97316 ${threshold}%, #e5e7eb ${threshold}%)`
                        }}
                    />

                    {/* Tick marks */}
                    <div className="flex justify-between text-[10px] text-gray-400 px-0.5">
                        {[10, 25, 50, 75, 90, 100].map(v => (
                            <span key={v} className={v === threshold ? 'text-orange-500 font-bold' : ''}>{v}%</span>
                        ))}
                    </div>

                    {/* Preview bar */}
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                        <p className="text-[10px] text-gray-400 font-medium">প্রিভিউ — কাস্টমার এই অবস্থায় SR দেখবে:</p>
                        <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className={`font-semibold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {pct}% ব্যবহৃত — {pct >= 100 ? '🚫 লিমিট পূর্ণ' : pct >= 90 ? '⚠️ প্রায় পূর্ণ' : pct >= 70 ? '⚠️ সতর্কতা দেখাবে' : '✅ স্বাভাবিক'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Require Approval Toggle ──────────────────── */}
                <div className={`rounded-2xl border-2 p-4 transition-colors ${requireApproval ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-base">{requireApproval ? '🔒' : '🔓'}</span>
                                <p className="text-sm font-semibold text-gray-800">Manager Approval বাধ্যতামূলক</p>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                                {requireApproval
                                    ? 'চালু আছে — SR credit limit-এ পৌঁছলে Manager অনুমোদন ছাড়া বিক্রি করতে পারবে না।'
                                    : 'বন্ধ আছে — SR নিজেই credit-এ বিক্রি করতে পারবে (শুধু warning দেখাবে)।'
                                }
                            </p>
                        </div>
                        {/* Toggle switch */}
                        <button
                            onClick={() => change(() => setRequireApproval(p => !p))}
                            className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none ${requireApproval ? 'bg-blue-500' : 'bg-gray-300'}`}
                        >
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${requireApproval ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                    </div>

                    {requireApproval && (
                        <div className="mt-3 bg-blue-100 rounded-xl px-3 py-2 text-[11px] text-blue-800 leading-relaxed">
                            ℹ️ SR Sales Form-এ "Manager অনুমোদন চান" বাটন দেখাবে। Manager অনুমোদ দিলেই বিক্রয় করা যাবে।
                        </div>
                    )}
                </div>

                {/* ── Save button ──────────────────────────────── */}
                {dirty && (
                    <button
                        onClick={save}
                        disabled={saving}
                        className="w-full py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                        {saving
                            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : '💾'
                        }
                        {saving ? 'সংরক্ষণ হচ্ছে...' : 'পরিবর্তন সংরক্ষণ করুন'}
                    </button>
                )}

                {!dirty && (
                    <p className="text-center text-[11px] text-gray-400">
                        ✅ সর্বশেষ সংরক্ষিত সেটিংস চলছে
                    </p>
                )}
            </div>
        </div>
    )
}
