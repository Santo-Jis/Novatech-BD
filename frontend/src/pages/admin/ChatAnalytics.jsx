// pages/admin/ChatAnalytics.jsx
// Phase 3, Session 2 — SLA ড্যাশবোর্ড + অডিট ট্রেইল (এক্সপোর্টযোগ্য)
//
// ইচ্ছাকৃতভাবে cp- (চ্যাট) থিম না — এটা admin রিপোর্টিং সেকশনের অংশ, তাই
// Reports.jsx/Wallet.jsx-এর সাথে মেলানো slate/gray/primary প্যালেট।

import { useState, useEffect, useCallback } from 'react'
import { FiClock, FiUsers, FiAlertCircle, FiDownload, FiTag, FiDollarSign, FiRefreshCw } from 'react-icons/fi'
import { createChatApi } from '../../chat/api/chatApi'

function formatDuration(seconds) {
  if (!seconds || seconds < 60) return `${seconds || 0} সে.`
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} মিনিট`
  const hr = Math.floor(min / 60)
  const rem = min % 60
  return rem ? `${hr} ঘণ্টা ${rem} মিনিট` : `${hr} ঘণ্টা`
}

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tint}`}>
          <Icon size={15} />
        </span>
        <p className="text-[12.5px] text-gray-500 font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  )
}

function downloadCsv(rows) {
  const headers = ['তারিখ', 'ধরন', 'কাস্টমার', 'ফ্ল্যাগকারী', 'মেসেজ']
  const flagLabel = { price_quote: 'প্রাইস কোট', payment_promise: 'পেমেন্ট প্রমিজ' }
  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        new Date(r.created_at).toLocaleString('bn-BD'),
        flagLabel[r.flag_type] || r.flag_type,
        (r.shop_name || r.owner_name || '').replace(/,/g, ' '),
        r.flagged_by_name.replace(/,/g, ' '),
        `"${r.message_text.replace(/"/g, "'").replace(/\n/g, ' ')}"`,
      ].join(',')
    ),
  ]
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chat-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ChatAnalytics() {
  const [chatApi] = useState(() => createChatApi('staff'))
  const [days, setDays] = useState(7)
  const [stats, setStats] = useState(null)
  const [flagged, setFlagged] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, f] = await Promise.all([chatApi.getSlaStats(days), chatApi.listFlaggedMessages(Math.max(days, 30))])
      setStats(s)
      setFlagged(f)
    } catch (e) {
      console.error('[chat-analytics] load error:', e.message)
    } finally {
      setLoading(false)
    }
  }, [chatApi, days])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">চ্যাট SLA ও অডিট ট্রেইল</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">রেসপন্স-টাইম, টিম পারফরম্যান্স আর ফ্ল্যাগ করা মেসেজ</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700"
          >
            <option value={7}>গত ৭ দিন</option>
            <option value={30}>গত ৩০ দিন</option>
            <option value={90}>গত ৯০ দিন</option>
          </select>
          <button onClick={load} type="button" className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500">
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && !stats ? (
        <div className="flex justify-center py-16">
          <span className="w-6 h-6 border-2 border-gray-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatCard icon={FiClock} label="গড় রেসপন্স-টাইম" value={formatDuration(stats?.summary?.avg_seconds)} tint="bg-blue-50 text-blue-600" />
            <StatCard icon={FiClock} label="মিডিয়ান" value={formatDuration(stats?.summary?.median_seconds)} tint="bg-indigo-50 text-indigo-600" />
            <StatCard icon={FiUsers} label="মোট রিপ্লাই" value={stats?.summary?.reply_count ?? 0} tint="bg-slate-100 text-slate-600" />
          </div>

          {/* ── স্টাফ-ভিত্তিক ── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            <p className="px-4 py-3 border-b border-gray-100 font-semibold text-[13.5px] text-gray-700">স্টাফ-ভিত্তিক রেসপন্স-টাইম</p>
            {(!stats?.byStaff || stats.byStaff.length === 0) ? (
              <p className="px-4 py-6 text-center text-[13px] text-gray-400">এই সময়ে কোনো রিপ্লাই রেকর্ড নেই</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {stats.byStaff.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                    <p className="text-[13px] text-gray-700">{s.name_bn || s.name_en}</p>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold text-gray-800">{formatDuration(s.avg_seconds)}</p>
                      <p className="text-[11px] text-gray-400">{s.reply_count} রিপ্লাই</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── অপেক্ষমান থ্রেড ── */}
          {stats?.pending?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
              <p className="px-4 py-3 border-b border-gray-100 font-semibold text-[13.5px] text-gray-700 flex items-center gap-1.5">
                <FiAlertCircle size={13} className="text-amber-500" /> এখনো অনুত্তরিত ({stats.pending.length})
              </p>
              <div className="divide-y divide-gray-100">
                {stats.pending.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-[13px] text-gray-700">{p.shop_name || p.owner_name}</p>
                      <p className="text-[11px] text-gray-400">{p.thread_type === 'support' ? 'সাপোর্ট' : 'পার্সোনাল'}</p>
                    </div>
                    <p className="text-[12px] font-medium text-amber-600">{formatDuration(p.waiting_seconds)} ধরে</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ফ্ল্যাগ করা মেসেজ / অডিট ── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-[13.5px] text-gray-700">ফ্ল্যাগ করা মেসেজ ({flagged.length})</p>
              <button
                onClick={() => downloadCsv(flagged)}
                disabled={flagged.length === 0}
                type="button"
                className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-40"
              >
                <FiDownload size={12} /> CSV এক্সপোর্ট
              </button>
            </div>
            {flagged.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-gray-400">এখনো কোনো মেসেজ ফ্ল্যাগ করা হয়নি</p>
            ) : (
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {flagged.map((f) => (
                  <div key={f.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      {f.flag_type === 'price_quote' ? <FiTag size={11} className="text-blue-500" /> : <FiDollarSign size={11} className="text-green-600" />}
                      <p className="text-[11.5px] font-medium text-gray-500">
                        {f.flag_type === 'price_quote' ? 'প্রাইস কোট' : 'পেমেন্ট প্রমিজ'} · {f.shop_name || f.owner_name}
                      </p>
                      <p className="text-[10.5px] text-gray-400 ml-auto">{new Date(f.created_at).toLocaleDateString('bn-BD')}</p>
                    </div>
                    <p className="text-[13px] text-gray-700">{f.message_text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
