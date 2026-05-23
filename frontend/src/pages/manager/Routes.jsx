// frontend/src/pages/manager/Routes.jsx
// Manager: রুট ম্যানেজমেন্ট — দেখা, তৈরি, এডিট, SR অ্যাসাইন

import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiMapPin, FiPlus, FiUsers, FiUser, FiSearch,
  FiEdit2, FiTrash2, FiX, FiCheck, FiChevronDown,
  FiChevronUp, FiClock, FiAlertCircle
} from 'react-icons/fi'

const fmt = n => Number(n || 0).toLocaleString('bn-BD')

// ── Create / Edit Route Modal ─────────────────────────────────
function RouteModal({ route, onClose, onSuccess }) {
  const isEdit = !!route
  const [name,        setName]        = useState(route?.name || '')
  const [description, setDescription] = useState(route?.description || '')
  const [loading,     setLoading]     = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error('রুটের নাম দিন।')
    setLoading(true)
    try {
      if (isEdit) {
        await api.put(`/routes/${route.id}`, { name: name.trim(), description: description.trim() })
        toast.success('রুট আপডেট সফল।')
      } else {
        await api.post('/routes', { name: name.trim(), description: description.trim() })
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
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="যেমন: ঢাকা - মিরপুর রুট"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">বিবরণ (ঐচ্ছিক)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="রুট সম্পর্কে সংক্ষিপ্ত বিবরণ..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <FiCheck />}
          {isEdit ? 'আপডেট করুন' : 'রুট তৈরি করুন'}
        </button>
      </div>
    </div>
  )
}

// ── Assign Worker Modal ────────────────────────────────────────
function AssignWorkerModal({ route, onClose, onSuccess }) {
  const [workers,    setWorkers]    = useState([])
  const [assigned,   setAssigned]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [assigning,  setAssigning]  = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [teamRes, workerRes] = await Promise.all([
          api.get('/routes/' + route.id + '/workers'),
          api.get('/teams/manager/my')
        ])
        setAssigned(teamRes.data.data || [])
        setWorkers(teamRes.data.data
          ? (workerRes.data?.data?.members || []).filter(
              m => !teamRes.data.data.some(a => a.id === m.id)
            )
          : (workerRes.data?.data?.members || [])
        )
      } catch {
        toast.error('তথ্য আনতে সমস্যা।')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [route.id])

  const assign = async (workerId, name) => {
    setAssigning(workerId)
    try {
      const res = await api.post(`/routes/${route.id}/assign`, { worker_id: workerId })
      toast.success(res.data.message || `${name} অ্যাসাইন হয়েছে।`)
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">SR অ্যাসাইন করুন</h2>
            <p className="text-xs text-gray-400">{route.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 text-gray-500">
            <FiX />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-2">
            {assigned.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">ইতিমধ্যে অ্যাসাইন</p>
                {assigned.map(w => (
                  <div key={w.id} className="flex items-center gap-3 p-3 rounded-xl bg-green-50 border border-green-100">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <FiCheck className="text-green-600 text-sm" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{w.name_bn}</p>
                      <p className="text-xs text-gray-400">{w.employee_code}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {workers.length === 0 && assigned.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <FiUsers className="text-3xl mx-auto mb-2" />
                <p className="text-sm">কোনো SR পাওয়া যায়নি।</p>
              </div>
            )}

            {workers.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">অ্যাসাইন করুন</p>
                {workers.map(w => (
                  <div key={w.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FiUser className="text-primary text-sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{w.name_bn}</p>
                      <p className="text-xs text-gray-400">{w.employee_code}</p>
                    </div>
                    <button
                      onClick={() => assign(w.id, w.name_bn)}
                      disabled={assigning === w.id}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60"
                    >
                      {assigning === w.id
                        ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin inline-block" />
                        : 'অ্যাসাইন'}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Route Card ────────────────────────────────────────────────
function RouteCard({ route, onEdit, onDelete, onAssign, onRefresh }) {
  const [expanded, setExpanded] = useState(false)

  const lastVisit = route.last_visited_at
    ? new Date(route.last_visited_at).toLocaleDateString('bn-BD', {
        day: 'numeric', month: 'short'
      })
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 space-y-3">
        {/* হেডার */}
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
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
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

        {/* Last visitor */}
        {route.last_visited_by_name && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <FiClock size={11} />
            <span>{route.last_visited_by_name} সর্বশেষ ভিজিট করেছেন</span>
          </div>
        )}
      </div>

      {/* Expanded: Action Buttons */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 py-3 flex gap-2">
          <button
            onClick={() => onAssign(route)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold"
          >
            <FiUsers size={13} />
            SR অ্যাসাইন
          </button>
          <button
            onClick={() => onEdit(route)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-xs font-semibold"
          >
            <FiEdit2 size={13} />
            এডিট
          </button>
          <button
            onClick={() => onDelete(route)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-50 text-red-500 text-xs font-semibold"
          >
            <FiTrash2 size={13} />
            মুছুন
          </button>
        </div>
      )}
    </div>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────
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
          এই রুটটি নিষ্ক্রিয় করা হবে। সংশ্লিষ্ট কাস্টমার এবং SR assignment ক্ষতিগ্রস্ত হতে পারে।
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

// ── Main Component ────────────────────────────────────────────
export default function ManagerRoutes() {
  const [routes,      setRoutes]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [createModal, setCreateModal] = useState(false)
  const [editModal,   setEditModal]   = useState(null)
  const [assignModal, setAssignModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/routes')
      setRoutes(res.data.data || [])
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
      {/* হেডার */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">রুট ম্যানেজমেন্ট</h1>
          <p className="text-xs text-gray-400 mt-0.5">{routes.length}টি রুট</p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm"
        >
          <FiPlus />
          নতুন রুট
        </button>
      </div>

      {/* সারসংক্ষেপ */}
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

      {/* সার্চ */}
      <div className="relative">
        <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="রুট খুঁজুন..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Route List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center">
          <FiMapPin className="text-4xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {search ? 'কোনো রুট পাওয়া যায়নি।' : 'এখনও কোনো রুট তৈরি হয়নি।'}
          </p>
          {!search && (
            <button
              onClick={() => setCreateModal(true)}
              className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
            >
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
              onEdit={r   => setEditModal(r)}
              onDelete={r => setDeleteModal(r)}
              onAssign={r => setAssignModal(r)}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {createModal && (
        <RouteModal
          onClose={() => setCreateModal(false)}
          onSuccess={load}
        />
      )}
      {editModal && (
        <RouteModal
          route={editModal}
          onClose={() => setEditModal(null)}
          onSuccess={load}
        />
      )}
      {assignModal && (
        <AssignWorkerModal
          route={assignModal}
          onClose={() => setAssignModal(null)}
          onSuccess={load}
        />
      )}
      {deleteModal && (
        <DeleteConfirm
          route={deleteModal}
          onClose={() => setDeleteModal(null)}
          onSuccess={load}
        />
      )}
    </div>
  )
}
