import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Input, { Select } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'
import {
  FiShield, FiFilter, FiRefreshCw, FiChevronLeft, FiChevronRight,
  FiUser, FiDatabase, FiClock, FiGlobe, FiInfo
} from 'react-icons/fi'
import Modal from '../../components/ui/Modal'

// ─── Helpers ─────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('bn-BD', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const ACTION_LABELS = {
  CREATE: { label: 'তৈরি', variant: 'approved' },
  UPDATE: { label: 'আপডেট', variant: 'info' },
  DELETE: { label: 'মুছে ফেলা', variant: 'rejected' },
  LOGIN:  { label: 'লগইন', variant: 'active' },
  LOGOUT: { label: 'লগআউট', variant: 'gray' },
  APPROVE: { label: 'অনুমোদন', variant: 'approved' },
  REJECT:  { label: 'বাতিল', variant: 'rejected' },
  REVOKE_PORTAL_DEVICE:  { label: 'ডিভাইস বাতিল', variant: 'suspended' },
  RESTORE_PORTAL_DEVICE: { label: 'ডিভাইস পুনরুদ্ধার', variant: 'active' },
  ADJUST_STOCK: { label: 'স্টক এডজাস্ট', variant: 'warning' },
  PAY_COMMISSION: { label: 'কমিশন পরিশোধ', variant: 'cash' },
  PAY_SALARY: { label: 'বেতন পরিশোধ', variant: 'cash' },
}

const ROLE_LABELS = {
  admin: 'অ্যাডমিন', manager: 'ম্যানেজার', supervisor: 'সুপারভাইজার',
  sr: 'SR', accountant: 'হিসাবরক্ষক', asm: 'ASM', rsm: 'RSM',
}

const ACTION_OPTIONS = [
  { value: '', label: 'সব অ্যাকশন' },
  // কর্মচারী
  { value: 'APPROVE_EMPLOYEE',    label: '✅ কর্মচারী অনুমোদন' },
  { value: 'REJECT_EMPLOYEE',     label: '❌ কর্মচারী বাতিল' },
  { value: 'SUSPEND_EMPLOYEE',    label: '⛔ কর্মচারী সাসপেন্ড' },
  { value: 'REACTIVATE_EMPLOYEE', label: '🔄 কর্মচারী পুনরুদ্ধার' },
  { value: 'EDIT_EMPLOYEE',       label: '✏️ কর্মচারী সম্পাদনা' },
  { value: 'PAY_SALARY',          label: '💰 বেতন পরিশোধ' },
  { value: 'CANCEL_SALARY',       label: '🚫 বেতন বাতিল' },
  { value: 'PAY_COMMISSION',      label: '💵 কমিশন পরিশোধ' },
  { value: 'ATTENDANCE_CORRECTION', label: '📋 হাজিরা সংশোধন' },
  // টিম
  { value: 'CREATE_TEAM',         label: '➕ টিম তৈরি' },
  { value: 'UPDATE_TEAM',         label: '✏️ টিম আপডেট' },
  { value: 'MOVE_SR_TO_TEAM',     label: '🔀 SR টিমে যোগ' },
  { value: 'REMOVE_SR_FROM_TEAM', label: '➖ SR টিম থেকে সরানো' },
  { value: 'SET_SR_TARGET',       label: '🎯 SR টার্গেট নির্ধারণ' },
  { value: 'SET_TEAM_TARGET',     label: '🎯 টিম টার্গেট নির্ধারণ' },
  // পোর্টাল
  { value: 'REVOKE_PORTAL_DEVICE',     label: '📵 ডিভাইস বাতিল' },
  { value: 'REVOKE_ALL_PORTAL_DEVICES',label: '📵 সব ডিভাইস বাতিল' },
  { value: 'RESTORE_PORTAL_DEVICE',    label: '📱 ডিভাইস পুনরুদ্ধার' },
  { value: 'APPROVE_CUSTOMER_EDIT',    label: '✅ কাস্টমার সম্পাদনা অনুমোদন' },
  { value: 'SET_CREDIT_LIMIT',         label: '💳 ক্রেডিট সীমা নির্ধারণ' },
  // সিস্টেম
  { value: 'UPDATE_SETTINGS',           label: '⚙️ সেটিংস আপডেট' },
  { value: 'UPDATE_AI_CONFIG',          label: '🤖 AI কনফিগ আপডেট' },
  { value: 'UPDATE_COMMISSION_SETTINGS',label: '📊 কমিশন সেটিংস আপডেট' },
]

const CATEGORY_OPTIONS = [
  { value: '',         label: 'সব বিভাগ' },
  { value: 'employee', label: '👤 কর্মচারী' },
  { value: 'team',     label: '👥 টিম' },
  { value: 'portal',   label: '🌐 কাস্টমার পোর্টাল' },
  { value: 'system',   label: '⚙️ সিস্টেম' },
]

const ROLE_OPTIONS = [
  { value: '',           label: 'সব রোল' },
  { value: 'admin',      label: 'অ্যাডমিন' },
  { value: 'manager',    label: 'ম্যানেজার' },
  { value: 'supervisor', label: 'সুপারভাইজার' },
  { value: 'sr',         label: 'SR' },
  { value: 'accountant', label: 'হিসাবরক্ষক' },
]

// ─── Detail Modal ─────────────────────────────────────────────
function LogDetailModal({ log, onClose }) {
  if (!log) return null

  const formatJSON = (val) => {
    if (!val) return '—'
    try {
      const parsed = typeof val === 'string' ? JSON.parse(val) : val
      return JSON.stringify(parsed, null, 2)
    } catch {
      return String(val)
    }
  }

  const action = ACTION_LABELS[log.action] || { label: log.action, variant: 'gray' }

  return (
    <Modal isOpen={!!log} onClose={onClose} title="অডিট লগ বিবরণ" size="lg">
      <div className="space-y-5">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">অ্যাকশন</p>
            <Badge variant={action.variant} label={action.label} />
          </div>
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">টেবিল</p>
            <p className="text-sm font-mono font-semibold text-gray-700 dark:text-gray-200">{log.table_name || '—'}</p>
          </div>
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide flex items-center gap-1"><FiUser size={11} /> ব্যবহারকারী</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{log.user_name || 'অজানা'}</p>
            <p className="text-xs text-gray-400">{ROLE_LABELS[log.user_role] || log.user_role}</p>
          </div>
          <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide flex items-center gap-1"><FiClock size={11} /> সময়</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmtDate(log.created_at)}</p>
          </div>
        </div>

        {/* IP + Record ID */}
        <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-700/30 rounded-xl px-4 py-3">
          <span className="flex items-center gap-1.5"><FiGlobe size={12} /> IP: <span className="font-mono text-gray-700 dark:text-gray-200">{log.ip_address || '—'}</span></span>
          <span className="flex items-center gap-1.5"><FiDatabase size={12} /> Record ID: <span className="font-mono text-gray-700 dark:text-gray-200">{log.record_id ? String(log.record_id).slice(0, 20) + (String(log.record_id).length > 20 ? '…' : '') : '—'}</span></span>
        </div>

        {/* Old / New Value */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-red-500 mb-1.5 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> আগের মান
            </p>
            <pre className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 text-xs text-red-700 dark:text-red-300 rounded-xl p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all font-mono">
              {formatJSON(log.old_value)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-600 mb-1.5 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> নতুন মান
            </p>
            <pre className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 text-xs text-emerald-700 dark:text-emerald-300 rounded-xl p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all font-mono">
              {formatJSON(log.new_value)}
            </pre>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function AuditLogs() {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0]

  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState(1)
  const [total,     setTotal]     = useState(0)
  const [selected,  setSelected]  = useState(null)
  const [filters,   setFilters]   = useState({ action: '', category: '', user_role: '', from: weekAgo, to: today })
  const [applied,   setApplied]   = useState({ action: '', category: '', user_role: '', from: weekAgo, to: today })

  const LIMIT = 50

  const fetchLogs = useCallback(async (f = applied, p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p, limit: LIMIT })
      if (f.action)    params.set('action', f.action)
      if (f.category && !f.action) params.set('category', f.category)
      if (f.user_role) params.set('user_role', f.user_role)
      if (f.from)      params.set('from', f.from)
      if (f.to)        params.set('to', f.to)
      const res = await api.get(`/admin/audit-logs?${params}`)
      setLogs(res.data.data || [])
      setTotal(res.data.pagination?.total ?? res.data.data?.length ?? 0)
    } catch {
      toast.error('লগ আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [applied, page])

  useEffect(() => { fetchLogs() }, [page]) // eslint-disable-line

  const applyFilters = () => {
    setApplied({ ...filters })
    setPage(1)
    fetchLogs(filters, 1)
  }

  const totalPages = Math.ceil(total / LIMIT)

  const getAction = (action) => ACTION_LABELS[action] || { label: action, variant: 'gray' }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <FiShield className="text-primary" /> অডিট লগ
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">সিস্টেমে সব পরিবর্তনের ইতিহাস</p>
        </div>
        <button
          onClick={() => fetchLogs(applied, page)}
          className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        >
          <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          রিফ্রেশ
        </button>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4">
          <div className="flex flex-wrap gap-3 items-end">

            {/* বিভাগ ফিল্টার */}
            <div className="w-44">
              <Select
                label="বিভাগ"
                value={filters.category}
                onChange={e => setFilters(f => ({ ...f, category: e.target.value, action: '' }))}
                options={CATEGORY_OPTIONS}
              />
            </div>

            {/* নির্দিষ্ট অ্যাকশন */}
            <div className="w-52">
              <Select
                label="নির্দিষ্ট অ্যাকশন"
                value={filters.action}
                onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
                options={ACTION_OPTIONS}
              />
            </div>

            {/* রোল ফিল্টার */}
            <div className="w-36">
              <Select
                label="রোল"
                value={filters.user_role}
                onChange={e => setFilters(f => ({ ...f, user_role: e.target.value }))}
                options={ROLE_OPTIONS}
              />
            </div>

            <div>
              <Input
                label="শুরুর তারিখ"
                type="date"
                value={filters.from}
                onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
              />
            </div>
            <div>
              <Input
                label="শেষ তারিখ"
                type="date"
                value={filters.to}
                onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
              />
            </div>

            <Button onClick={applyFilters} icon={<FiFilter size={14} />}>
              ফিল্টার করুন
            </Button>

            {/* active filter badge */}
            {(applied.category || applied.action || applied.user_role) && (
              <button
                onClick={() => {
                  const reset = { action: '', category: '', user_role: '', from: weekAgo, to: today }
                  setFilters(reset); setApplied(reset); setPage(1); fetchLogs(reset, 1)
                }}
                className="text-xs text-red-500 hover:text-red-700 underline"
              >
                ফিল্টার মুছুন
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center">
            <FiShield className="mx-auto text-4xl text-gray-300 dark:text-slate-600 mb-3" />
            <p className="text-gray-400 dark:text-gray-500 text-sm">এই ফিল্টারে কোনো লগ নেই।</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-700">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">সময়</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">অ্যাকশন</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">ব্যবহারকারী</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">টেবিল</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold">IP</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const act = getAction(log.action)
                  return (
                    <tr
                      key={log.id || i}
                      className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                        {fmtDate(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={act.variant} label={act.label} size="xs" />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-700 dark:text-gray-200">{log.user_name || 'অজানা'}</p>
                        <p className="text-xs text-gray-400">{ROLE_LABELS[log.user_role] || log.user_role}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {log.table_name || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {log.ip_address || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(log)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                          title="বিস্তারিত দেখুন"
                        >
                          <FiInfo size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              পেজ {page} / {totalPages} &nbsp;·&nbsp; মোট {total} লগ
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <FiChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <LogDetailModal log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
