// pages/superadmin/ConnectionAnalytics.jsx
// ✅ NEW (Phase 6 — কোড অডিট) — connections পেইজ রোডম্যাপের শেষ ধাপ।
//
// Dashboard.jsx-এর ঠিক একই কনভেনশন (superAdminApi, LoadingState/ErrorState,
// pf- ডিজাইন টোকেন)। ট্রেন্ড লাইনের জন্য recharts — Batches.jsx-এ যেভাবে
// ব্যবহৃত হয়েছে, সেটাই মিরর করা।

import { useEffect, useState, useCallback } from 'react'
import { FiTrendingUp, FiUsers, FiClock, FiAward, FiEye, FiZap } from 'react-icons/fi'
import superAdminApi from './api/superAdminApi'
import { LoadingState, ErrorState } from './components/PanelStates'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

const STATUS_LABEL = {
  connected:    'কানেক্টেড',
  pending:      'পেন্ডিং',
  rejected:     'রিজেক্টেড',
  disconnected: 'বিচ্ছিন্ন',
  blocked:      'ব্লকড',
}
const CHANNEL_LABEL = {
  qr_scan:         'QR স্ক্যান',
  company_search:  'কোম্পানি সার্চ',
  customer_search: 'কাস্টমার সার্চ',
}

export default function ConnectionAnalytics() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await superAdminApi.get('/connection-analytics')
      setData(res.data.data)
    } catch (err) {
      if (!err._toastShown) setError('অ্যানালিটিক্স লোড করা যায়নি।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingState label="অ্যানালিটিক্স লোড হচ্ছে..." />
  if (error) return <ErrorState description={error} onRetry={load} />
  if (!data) return null

  const totalConnections = data.status_breakdown.reduce((s, r) => s + parseInt(r.count || 0), 0)
  const connectedCount = parseInt(data.status_breakdown.find(r => r.status === 'connected')?.count || 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-pf-head text-2xl font-semibold text-pf-primary-700">কানেকশন অ্যানালিটিক্স</h1>
        <p className="text-pf-text-secondary text-sm mt-1">প্ল্যাটফর্ম-ওয়াইড customer↔company সংযোগের স্বাস্থ্য</p>
      </div>

      {/* ── টপ-লাইন সংখ্যা ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FiUsers />} label="মোট রেকর্ড" value={totalConnections} />
        <StatCard icon={<FiZap />} label="বর্তমানে কানেক্টেড" value={connectedCount} accent="text-pf-success" />
        <StatCard
          icon={<FiClock />}
          label="গড় রেসপন্স-টাইম"
          value={data.response_time.avg_hours != null ? `${data.response_time.avg_hours} ঘণ্টা` : '—'}
        />
        <StatCard
          icon={<FiClock />}
          label="মিডিয়ান রেসপন্স-টাইম"
          value={data.response_time.median_hours != null ? `${data.response_time.median_hours} ঘণ্টা` : '—'}
        />
      </div>

      {/* ── স্ট্যাটাস ব্রেকডাউন ── */}
      <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
        <p className="font-pf-head font-semibold text-pf-text-primary mb-3">স্ট্যাটাস ব্রেকডাউন</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {data.status_breakdown.map(r => (
            <div key={r.status} className="bg-pf-bg-sunken rounded-lg p-3 text-center">
              <p className="font-pf-mono text-xl font-semibold text-pf-primary-700">{r.count}</p>
              <p className="text-xs text-pf-text-muted mt-0.5">{STATUS_LABEL[r.status] || r.status}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── মাসিক ট্রেন্ড ── */}
      <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
        <p className="font-pf-head font-semibold text-pf-text-primary mb-3 flex items-center gap-1.5">
          <FiTrendingUp size={15} /> মাসিক ট্রেন্ড (গত ১২ মাস)
        </p>
        {data.monthly_trend.length === 0 ? (
          <p className="text-center text-sm text-pf-text-muted py-8">এখনো পর্যাপ্ত ডেটা নেই</p>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={data.monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total_requests" name="মোট রিকোয়েস্ট" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="converted" name="কানেক্টেড হয়েছে" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── চ্যানেল-ভিত্তিক (initiated_by) ── */}
      <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
        <p className="font-pf-head font-semibold text-pf-text-primary mb-1">চ্যানেল-ভিত্তিক পারফরম্যান্স</p>
        <p className="text-xs text-pf-text-muted mb-3">কোন মাধ্যমে রিকোয়েস্ট শুরু হয়েছে, আর তার কত % শেষমেশ কানেক্টেড হয়েছে (কখনো, এমনকি পরে disconnect হলেও)</p>
        <div className="divide-y divide-pf-border">
          {data.channel_breakdown.map(r => {
            const total = parseInt(r.total || 0)
            const converted = parseInt(r.converted || 0)
            const pct = total > 0 ? Math.round((converted / total) * 100) : 0
            return (
              <div key={r.initiated_by} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-pf-text-primary">{CHANNEL_LABEL[r.initiated_by] || r.initiated_by}</p>
                  <p className="text-xs text-pf-text-muted">{total} টা রিকোয়েস্ট</p>
                </div>
                <div className="text-right">
                  <p className="font-pf-mono text-sm font-semibold text-pf-success">{pct}%</p>
                  <p className="text-xs text-pf-text-muted">কনভার্সন</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Per-tenant লিডারবোর্ড ── */}
      <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4 overflow-x-auto">
        <p className="font-pf-head font-semibold text-pf-text-primary mb-3 flex items-center gap-1.5">
          <FiAward size={15} /> কোম্পানি লিডারবোর্ড (সবচেয়ে বেশি কানেক্টেড অনুযায়ী)
        </p>
        {data.tenant_leaderboard.length === 0 ? (
          <p className="text-center text-sm text-pf-text-muted py-8">কোনো ডেটা নেই</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-pf-text-muted border-b border-pf-border">
                <th className="pb-2 font-medium">কোম্পানি</th>
                <th className="pb-2 font-medium text-right">কানেক্টেড</th>
                <th className="pb-2 font-medium text-right">পেন্ডিং</th>
                <th className="pb-2 font-medium text-right">গড় রেসপন্স</th>
              </tr>
            </thead>
            <tbody>
              {data.tenant_leaderboard.map(t => (
                <tr key={t.tenant_id} className="border-b border-pf-border last:border-0">
                  <td className="py-2 text-pf-text-primary">{t.company_name_bn || t.company_name}</td>
                  <td className="py-2 text-right font-pf-mono text-pf-success">{t.connected_count}</td>
                  <td className="py-2 text-right font-pf-mono text-pf-warning">{t.pending_count}</td>
                  <td className="py-2 text-right text-pf-text-muted">
                    {t.avg_response_hours != null ? `${t.avg_response_hours} ঘ.` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Discovery engagement (Phase 6-এ শুরু হওয়া logging) ── */}
      <div className="bg-pf-info-bg border border-pf-border rounded-xl p-4">
        <p className="font-pf-head font-semibold text-pf-text-primary mb-1 flex items-center gap-1.5">
          <FiEye size={15} /> Discovery Engagement (গত ৩০ দিন)
        </p>
        <p className="text-xs text-pf-text-muted mb-3">
          এই সেকশনের লগিং Phase 6-এই শুরু হয়েছে — পুরনো ডেটা নেই, তাই এখনো পুরো "view→connect funnel" দেখানো যাচ্ছে না। কয়েক সপ্তাহ পর এই সংখ্যাগুলো অর্থপূর্ণ ট্রেন্ড দেখাবে।
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="font-pf-mono text-xl font-semibold text-pf-primary-700">{data.discovery_engagement_30d.total_views}</p>
            <p className="text-xs text-pf-text-muted">মোট ভিউ</p>
          </div>
          <div className="text-center">
            <p className="font-pf-mono text-xl font-semibold text-pf-primary-700">{data.discovery_engagement_30d.tenants_engaged}</p>
            <p className="text-xs text-pf-text-muted">সক্রিয় কোম্পানি</p>
          </div>
          <div className="text-center">
            <p className="font-pf-mono text-xl font-semibold text-pf-primary-700">{data.discovery_engagement_30d.total_shop_impressions}</p>
            <p className="text-xs text-pf-text-muted">মোট শপ ইম্প্রেশন</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, accent = 'text-pf-primary-700' }) {
  return (
    <div className="bg-pf-bg-surface border border-pf-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-pf-text-muted">
        <span className="text-base">{icon}</span>
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={`font-pf-mono text-2xl font-semibold ${accent}`}>{value ?? 0}</p>
    </div>
  )
}
