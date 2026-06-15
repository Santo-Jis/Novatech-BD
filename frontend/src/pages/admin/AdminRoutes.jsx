// frontend/src/pages/admin/Routes.jsx
// Admin: রুট ম্যানেজমেন্ট + Customer Sequence সেট করার UI
//
// নতুন যা যোগ হয়েছে (আগের Routes ছিল না, এটি নতুন):
//   - সব route তালিকা + stats
//   - প্রতিটা route-এ "Sequence সেট করুন" বাটন
//   - CustomerSequenceModal: drag-and-drop + number input
//   - Live SR Status panel (আজকে কে কোন route-এ)

import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiMapPin, FiPlus, FiUsers, FiUser, FiSearch,
  FiEdit2, FiTrash2, FiX, FiCheck, FiChevronDown,
  FiChevronUp, FiClock, FiAlertCircle, FiList,
  FiMenu, FiSave, FiRefreshCw, FiHash, FiActivity,
  FiNavigation
} from 'react-icons/fi'

const fmt = n => Number(n || 0).toLocaleString('bn-BD')

// ── Customer Sequence Drag-and-Drop Modal ─────────────────────
function CustomerSequenceModal({ route, onClose }) {
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [dirty,     setDirty]     = useState(false)
  const dragIdx = useRef(null)

  useEffect(() => {
    setLoading(true)
    api.get(`/routes/${route.id}/customers`)
      .then(res => {
        const list = (res.data.data || []).map((c, i) => ({
          ...c,
          visit_order: c.visit_order ?? (i + 1)
        }))
        list.sort((a, b) => (a.visit_order ?? 9999) - (b.visit_order ?? 9999))
        setCustomers(list)
      })
      .catch(() => toast.error('কাস্টমার আনতে সমস্যা।'))
      .finally(() => setLoading(false))
  }, [route.id])

  // ── Drag handlers ──────────────────────────────────────────
  const onDragStart = idx => { dragIdx.current = idx }
  const onDragOver  = (e, idx) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    const list = [...customers]
    const [moved] = list.splice(dragIdx.current, 1)
    list.splice(idx, 0, moved)
    setCustomers(list.map((c, i) => ({ ...c, visit_order: i + 1 })))
    dragIdx.current = idx
    setDirty(true)
  }
  const onDragEnd = () => { dragIdx.current = null }

  // ── Number input ───────────────────────────────────────────
  const handleOrderChange = (id, val) => {
    const num = parseInt(val)
    setCustomers(prev => prev.map(c =>
      c.id === id ? { ...c, visit_order: isNaN(num) ? null : num } : c
    ))
    setDirty(true)
  }

  // ── Move up/down ───────────────────────────────────────────
  const move = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= customers.length) return
    const list = [...customers]
    ;[list[idx], list[target]] = [list[target], list[idx]]
    setCustomers(list.map((c, i) => ({ ...c, visit_order: i + 1 })))
    setDirty(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      const orders = customers.map(c => ({
        customer_id: c.id,
        visit_order: c.visit_order ?? null
      }))
      await api.put('/customers/visit-order', { route_id: route.id, orders })
      toast.success('Sequence সেভ হয়েছে ✅')
      setDirty(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'সেভ করতে সমস্যা।')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setCustomers(prev => prev.map((c, i) => ({ ...c, visit_order: i + 1 })))
    setDirty(true)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Customer Sequence</h2>
            <p className="text-xs text-gray-400 mt-0.5">{route.name} — SR কোন দোকানে আগে যাবে</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset}
              className="p-2 rounded-xl bg-gray-100 text-gray-500 text-xs flex items-center gap-1">
              <FiRefreshCw size={13} /> রিসেট
            </button>
            <button onClick={onClose}
              className="p-2 rounded-xl bg-gray-100 text-gray-500">
              <FiX />
            </button>
          </div>
        </div>

        {/* Instruction */}
        <div className="mx-4 mt-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700 flex items-center gap-2 flex-shrink-0">
          <FiMenu size={13} className="flex-shrink-0" />
          <span>কার্ড ধরে <strong>টানুন</strong> বা নম্বর বক্সে সরাসরি ক্রম লিখুন। SR-এর ফোনে এই ক্রমেই দেখাবে।</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
            ))
          ) : customers.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FiUser className="text-3xl mx-auto mb-2" />
              <p>এই রুটে কোনো কাস্টমার নেই।</p>
            </div>
          ) : customers.map((c, idx) => (
            <div
              key={c.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={e => onDragOver(e, idx)}
              onDragEnd={onDragEnd}
              className="bg-white rounded-2xl px-3 py-3 shadow-sm border border-gray-100
                         flex items-center gap-3 cursor-grab active:cursor-grabbing
                         active:shadow-md active:scale-[1.01] transition-all select-none"
            >
              {/* Drag handle */}
              <div className="text-gray-300 flex-shrink-0">
                <FiMenu size={17} />
              </div>

              {/* Order number */}
              <div className="flex-shrink-0">
                <input
                  type="number"
                  min="1"
                  value={c.visit_order ?? ''}
                  onChange={e => handleOrderChange(c.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-12 text-center border border-gray-200 rounded-lg py-1
                             text-sm font-bold text-primary focus:outline-none focus:border-primary/60"
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{c.shop_name}</p>
                <p className="text-xs text-gray-400 truncate">{c.owner_name}</p>
              </div>

              {/* GPS indicator */}
              {c.latitude && c.longitude && (
                <FiNavigation size={12} className="text-blue-400 flex-shrink-0" title="GPS আছে" />
              )}

              {/* Up/Down */}
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => move(idx, -1)} disabled={idx === 0}
                  className="p-1 rounded-md bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30">
                  <FiChevronUp size={13} />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === customers.length - 1}
                  className="p-1 rounded-md bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30">
                  <FiChevronDown size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Save footer */}
        <div className="px-4 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-bold text-sm
                       flex items-center justify-center gap-2 disabled:opacity-50
                       active:scale-95 transition-transform"
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : dirty ? <FiSave size={15} /> : <FiCheck size={15} />
            }
            {saving ? 'সেভ হচ্ছে...' : dirty ? 'Sequence সেভ করুন' : 'সেভ হয়েছে'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Live SR Status Panel ───────────────────────────────────────
function LiveStatusPanel({ onClose }) {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/routes/live-status')
      setData(res.data.data || [])
    } catch {
      toast.error('Live status আনতে সমস্যা।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000) // প্রতি ১ মিনিটে refresh
    return () => clearInterval(interval)
  }, [load])

  // Route-এ group করো
  const grouped = data.reduce((acc, row) => {
    if (!acc[row.route_id]) {
      acc[row.route_id] = { route_name: row.route_name, workers: [] }
    }
    acc[row.route_id].workers.push(row)
    return acc
  }, {})

  const timeAgo = (ts) => {
    if (!ts) return null
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
    if (s < 60)  return `${s}s আগে`
    if (s < 3600) return `${Math.floor(s/60)}m আগে`
    return `${Math.floor(s/3600)}h আগে`
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[85vh] flex flex-col">

        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <h2 className="font-bold text-gray-800 text-lg">Live Route Status</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="p-2 rounded-xl bg-gray-100 text-gray-500">
              <FiRefreshCw size={14} />
            </button>
            <button onClick={onClose}
              className="p-2 rounded-xl bg-gray-100 text-gray-500">
              <FiX />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
            ))
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FiActivity className="text-3xl mx-auto mb-2" />
              <p>আজকে কেউ কোনো রুটে নেই।</p>
            </div>
          ) : Object.values(grouped).map((group, gi) => (
            <div key={gi} className="bg-gray-50 rounded-2xl p-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FiMapPin size={11} />
                {group.route_name}
              </p>
              <div className="space-y-2">
                {group.workers.map(w => {
                  const pct = w.total_customers > 0
                    ? Math.round((w.visits_today / w.total_customers) * 100)
                    : 0
                  const isActive = w.last_seen_at &&
                    (Date.now() - new Date(w.last_seen_at).getTime()) < 5 * 60 * 1000
                  return (
                    <div key={w.worker_id}
                      className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {w.profile_photo
                          ? <img src={w.profile_photo} alt="" className="w-full h-full rounded-full object-cover" />
                          : <FiUser className="text-primary text-sm" />
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-gray-800 truncate">{w.worker_name}</p>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                        </div>
                        <p className="text-[11px] text-gray-400">{w.employee_code}</p>

                        {/* Progress bar */}
                        <div className="mt-1.5">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[10px] text-gray-400">
                              {w.visits_today}/{w.total_customers} ভিজিট
                            </span>
                            <span className="text-[10px] font-bold text-primary">{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Last seen */}
                      {w.last_seen_at && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-gray-400">{timeAgo(w.last_seen_at)}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Create / Edit Route Modal ─────────────────────────────────
function RouteModal({ route, managers, onClose, onSuccess }) {
  const isEdit = !!route
  const [name,        setName]        = useState(route?.name || '')
  const [description, setDescription] = useState(route?.description || '')
  const [managerId,   setManagerId]   = useState(route?.manager_id || '')
  const [loading,     setLoading]     = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error('রুটের নাম দিন।')
    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        ...(managerId && { manager_id: managerId })
      }
      if (isEdit) {
        await api.put(`/routes/${route.id}`, payload)
        toast.success('রুট আপডেট সফল।')
      } else {
        await api.post('/routes', payload)
        toast.success('নতুন রুট তৈরি হয়েছে।')
      }
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">
            {isEdit ? 'রুট এডিট করুন' : 'নতুন রুট তৈরি করুন'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 text-gray-500">
            <FiX />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">রুটের নাম *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="যেমন: ঢাকা - মিরপুর রুট"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">বিবরণ (ঐচ্ছিক)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="রুট সম্পর্কে সংক্ষিপ্ত বিবরণ..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
          {managers.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Manager (ঐচ্ছিক)</label>
              <select value={managerId} onChange={e => setManagerId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option value="">— Manager বেছে নিন —</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.name_bn}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button onClick={handleSubmit} disabled={loading}
          className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
          {loading
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <FiCheck />}
          {isEdit ? 'আপডেট করুন' : 'রুট তৈরি করুন'}
        </button>
      </div>
    </div>
  )
}

// ── Delete Confirm ────────────────────────────────────────────
function DeleteConfirm({ route, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const handleDelete = async () => {
    setLoading(true)
    try {
      await api.delete(`/routes/${route.id}`)
      toast.success('রুট মুছে দেওয়া হয়েছে।')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'মুছতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <FiAlertCircle className="text-red-500" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">রুট মুছবেন?</h2>
            <p className="text-sm text-gray-500">{route.name}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          এই রুটটি নিষ্ক্রিয় করা হবে। সংশ্লিষ্ট SR assignment ক্ষতিগ্রস্ত হতে পারে।
        </p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold">
            বাতিল
          </button>
          <button onClick={handleDelete} disabled={loading}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-60">
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              : 'মুছে দিন'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Route Card ────────────────────────────────────────────────
function RouteCard({ route, onEdit, onDelete, onSequence }) {
  const [expanded, setExpanded] = useState(false)

  const lastVisit = route.last_visited_at
    ? new Date(route.last_visited_at).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FiMapPin className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-800 truncate">{route.name}</p>
            {route.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{route.description}</p>
            )}
            {route.manager_name && (
              <p className="text-xs text-gray-400">ম্যানেজার: {route.manager_name}</p>
            )}
          </div>
          <button onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            {expanded ? <FiChevronUp /> : <FiChevronDown />}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 rounded-xl p-2 text-center">
            <p className="text-xs text-blue-400">SR</p>
            <p className="text-sm font-bold text-blue-700">{fmt(route.worker_count)}</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-2 text-center">
            <p className="text-xs text-purple-400">কাস্টমার</p>
            <p className="text-sm font-bold text-purple-700">{fmt(route.customer_count)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-2 text-center">
            <p className="text-xs text-green-400">শেষ ভিজিট</p>
            <p className="text-xs font-bold text-green-700">{lastVisit || '—'}</p>
          </div>
        </div>

        {route.last_visited_by_name && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <FiClock size={11} />
            <span>{route.last_visited_by_name} সর্বশেষ ভিজিট করেছেন</span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-50 px-4 py-3 flex gap-2 flex-wrap">
          {/* Sequence বাটন — নতুন */}
          <button
            onClick={() => onSequence(route)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-semibold border border-indigo-100"
          >
            <FiHash size={13} />
            Sequence সেট করুন
          </button>
          <button onClick={() => onEdit(route)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-xs font-semibold">
            <FiEdit2 size={13} />
            এডিট
          </button>
          <button onClick={() => onDelete(route)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-50 text-red-500 text-xs font-semibold">
            <FiTrash2 size={13} />
            মুছুন
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function AdminRoutes() {
  const [routes,      setRoutes]      = useState([])
  const [managers,    setManagers]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [createModal, setCreateModal] = useState(false)
  const [editModal,   setEditModal]   = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [seqModal,    setSeqModal]    = useState(null)   // Customer Sequence
  const [liveModal,   setLiveModal]   = useState(false)  // Live Status

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [routeRes, empRes] = await Promise.all([
        api.get('/routes'),
        api.get('/employees?role=manager&status=active').catch(() => ({ data: { data: [] } }))
      ])
      setRoutes(routeRes.data.data || [])
      setManagers(empRes.data.data || [])
    } catch {
      toast.error('রুট তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = routes.filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.description?.toLowerCase().includes(search.toLowerCase()) ||
    r.manager_name?.includes(search)
  )

  const totalWorkers   = routes.reduce((s, r) => s + parseInt(r.worker_count  || 0), 0)
  const totalCustomers = routes.reduce((s, r) => s + parseInt(r.customer_count || 0), 0)

  if (loading) return (
    <div className="space-y-4">
      <div className="h-24 bg-white rounded-2xl animate-pulse" />
      <div className="h-10 bg-white rounded-xl animate-pulse" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-40 bg-white rounded-2xl animate-pulse" />
      ))}
    </div>
  )

  return (
    <div className="space-y-4 pb-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">রুট ম্যানেজমেন্ট</h1>
          <p className="text-xs text-gray-400 mt-0.5">{routes.length}টি রুট</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Live Status বাটন */}
          <button
            onClick={() => setLiveModal(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-green-50 text-green-600 text-sm font-semibold border border-green-100"
          >
            <FiActivity size={14} />
            Live
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm"
          >
            <FiPlus />
            নতুন রুট
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'মোট রুট',     value: routes.length,  bg: 'bg-blue-50',   text: 'text-blue-700'   },
          { label: 'মোট SR',      value: totalWorkers,   bg: 'bg-green-50',  text: 'text-green-700'  },
          { label: 'মোট কাস্টমার', value: totalCustomers, bg: 'bg-purple-50', text: 'text-purple-700' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center`}>
            <p className={`text-xl font-bold ${s.text}`}>{fmt(s.value)}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="রুট খুঁজুন..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>

      {/* Route List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center">
          <FiMapPin className="text-4xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {search ? 'কোনো রুট পাওয়া যায়নি।' : 'এখনও কোনো রুট তৈরি হয়নি।'}
          </p>
          {!search && (
            <button onClick={() => setCreateModal(true)}
              className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">
              প্রথম রুট তৈরি করুন
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(route => (
            <RouteCard
              key={route.id}
              route={route}
              onEdit={r    => setEditModal(r)}
              onDelete={r  => setDeleteModal(r)}
              onSequence={r => setSeqModal(r)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {createModal && (
        <RouteModal managers={managers} onClose={() => setCreateModal(false)} onSuccess={load} />
      )}
      {editModal && (
        <RouteModal route={editModal} managers={managers}
          onClose={() => setEditModal(null)} onSuccess={load} />
      )}
      {deleteModal && (
        <DeleteConfirm route={deleteModal}
          onClose={() => setDeleteModal(null)} onSuccess={load} />
      )}
      {seqModal && (
        <CustomerSequenceModal route={seqModal} onClose={() => setSeqModal(null)} />
      )}
      {liveModal && (
        <LiveStatusPanel onClose={() => setLiveModal(false)} />
      )}
    </div>
  )
}
