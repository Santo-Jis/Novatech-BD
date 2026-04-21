// frontend/src/pages/manager/VisitOrder.jsx
// Manager: রুট অনুযায়ী কাস্টমারদের visit ক্রম নির্ধারণ
// Drag & Drop + নম্বর ইনপুট — দুটো পদ্ধতিই আছে

import { useState, useEffect, useRef } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiMenu, FiSave, FiRefreshCw, FiHash,
  FiChevronUp, FiChevronDown, FiCheck
} from 'react-icons/fi'

export default function VisitOrder() {
  const [routes,    setRoutes]    = useState([])
  const [routeId,   setRouteId]   = useState('')
  const [customers, setCustomers] = useState([]) // { id, shop_name, owner_name, visit_order }
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [dirty,     setDirty]     = useState(false)

  // Drag state
  const dragIdx = useRef(null)

  // ── Load routes ────────────────────────────────────────────
  useEffect(() => {
    api.get('/routes').then(res => {
      const list = res.data.data || []
      setRoutes(list)
      if (list.length > 0) setRouteId(String(list[0].id))
    })
  }, [])

  // ── Load customers when route changes ──────────────────────
  useEffect(() => {
    if (!routeId) return
    setLoading(true)
    setDirty(false)
    api.get(`/customers?route_id=${routeId}&limit=200`)
      .then(res => {
        const list = (res.data.data || []).map((c, i) => ({
          ...c,
          // visit_order আসলে সেটা রাখো, না আসলে index+1
          visit_order: c.visit_order ?? (i + 1)
        }))
        // visit_order অনুযায়ী sort
        list.sort((a, b) => (a.visit_order ?? 999) - (b.visit_order ?? 999))
        setCustomers(list)
      })
      .catch(() => toast.error('কাস্টমার আনতে সমস্যা হয়েছে।'))
      .finally(() => setLoading(false))
  }, [routeId])

  // ── Drag handlers ──────────────────────────────────────────
  const onDragStart = (idx) => { dragIdx.current = idx }

  const onDragOver = (e, idx) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    const reordered = [...customers]
    const [moved]   = reordered.splice(dragIdx.current, 1)
    reordered.splice(idx, 0, moved)
    // visit_order রিনম্বার
    const renumbered = reordered.map((c, i) => ({ ...c, visit_order: i + 1 }))
    setCustomers(renumbered)
    dragIdx.current = idx
    setDirty(true)
  }

  const onDragEnd = () => { dragIdx.current = null }

  // ── Number input change ────────────────────────────────────
  const handleOrderChange = (id, val) => {
    const num = parseInt(val)
    setCustomers(prev => prev.map(c =>
      c.id === id ? { ...c, visit_order: isNaN(num) ? null : num } : c
    ))
    setDirty(true)
  }

  // ── Move up/down buttons ───────────────────────────────────
  const move = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= customers.length) return
    const reordered = [...customers]
    ;[reordered[idx], reordered[target]] = [reordered[target], reordered[idx]]
    const renumbered = reordered.map((c, i) => ({ ...c, visit_order: i + 1 }))
    setCustomers(renumbered)
    setDirty(true)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!routeId) return
    setSaving(true)
    try {
      const orders = customers.map(c => ({
        customer_id: c.id,
        visit_order: c.visit_order ?? null
      }))
      await api.put('/customers/visit-order', { route_id: routeId, orders })
      toast.success('Visit ক্রম সেভ হয়েছে ✅')
      setDirty(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'সেভ করতে সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  // ── Reset (serial 1,2,3...) ────────────────────────────────
  const handleReset = () => {
    setCustomers(prev => prev.map((c, i) => ({ ...c, visit_order: i + 1 })))
    setDirty(true)
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Visit ক্রম নির্ধারণ</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            কার্ড টেনে বা নম্বর দিয়ে ক্রম ঠিক করুন
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100
                       text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            <FiRefreshCw size={14} /> রিসেট
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary
                       text-white text-sm font-semibold shadow-sm
                       disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : dirty ? <FiSave size={14} /> : <FiCheck size={14} />
            }
            {saving ? 'সেভ হচ্ছে...' : dirty ? 'সেভ করুন' : 'সেভ হয়েছে'}
          </button>
        </div>
      </div>

      {/* ── Route Selector ── */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
          রুট বেছে নিন
        </label>
        <select
          value={routeId}
          onChange={e => setRouteId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                     focus:outline-none focus:border-primary/60 bg-white"
        >
          {routes.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* ── Instruction banner ── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
        <FiMenu size={14} className="flex-shrink-0" />
        <span>
          কার্ড ধরে <strong>টানুন</strong> অথবা বাঁ দিকের{' '}
          <FiHash size={11} className="inline" /> নম্বর বক্সে সরাসরি ক্রম লিখুন।
          SR-এর ফোনে এই ক্রমেই দোকান দেখাবে।
        </span>
      </div>

      {/* ── Customer List ── */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400">
          এই রুটে কোনো কাস্টমার নেই।
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c, idx) => (
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
                <FiMenu size={18} />
              </div>

              {/* Order number input */}
              <div className="flex-shrink-0">
                <input
                  type="number"
                  min="1"
                  value={c.visit_order ?? ''}
                  onChange={e => handleOrderChange(c.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-12 text-center border border-gray-200 rounded-lg py-1
                             text-sm font-bold text-primary focus:outline-none
                             focus:border-primary/60"
                />
              </div>

              {/* Customer info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{c.shop_name}</p>
                <p className="text-xs text-gray-400 truncate">{c.owner_name}</p>
              </div>

              {/* Up/Down buttons */}
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 rounded-md bg-gray-50 text-gray-400 hover:bg-gray-100
                             disabled:opacity-30 transition-colors"
                >
                  <FiChevronUp size={14} />
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === customers.length - 1}
                  className="p-1 rounded-md bg-gray-50 text-gray-400 hover:bg-gray-100
                             disabled:opacity-30 transition-colors"
                >
                  <FiChevronDown size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom save bar (sticky, shown when dirty) */}
      {dirty && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary text-white py-3.5 rounded-2xl font-semibold
                         text-sm shadow-lg flex items-center justify-center gap-2
                         disabled:opacity-60 active:scale-95 transition-transform"
            >
              {saving
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <FiSave />
              }
              {saving ? 'সেভ হচ্ছে...' : 'ক্রম সেভ করুন'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
