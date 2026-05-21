// frontend/src/pages/manager/PortalDevices.jsx
// Manager: নিজের route-এর customer-দের portal device দেখা ও revoke করা

import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiSmartphone, FiSearch, FiRefreshCw, FiX,
  FiAlertTriangle, FiShield, FiChevronRight,
  FiMonitor, FiTablet, FiClock, FiUser
} from 'react-icons/fi'

// ── Helpers ──────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  const d   = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60)     return 'এইমাত্র'
  if (diff < 3600)   return `${Math.floor(diff / 60)} মিনিট আগে`
  if (diff < 86400)  return `${Math.floor(diff / 3600)} ঘণ্টা আগে`
  if (diff < 604800) return `${Math.floor(diff / 86400)} দিন আগে`
  return d.toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' })
}

const isExpired = (iso) => iso ? new Date(iso) < new Date() : false

const DeviceIcon = ({ label = '' }) => {
  const l = label.toLowerCase()
  if (l.includes('iphone') || l.includes('android') || l.includes('samsung'))
    return <FiSmartphone className="text-blue-500" />
  if (l.includes('ipad') || l.includes('tablet'))
    return <FiTablet className="text-purple-500" />
  return <FiMonitor className="text-gray-500" />
}

// ── Confirm Modal ─────────────────────────────────────────────
function ConfirmModal({ title, desc, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && !loading && onCancel()}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <FiAlertTriangle className="text-red-500 text-lg" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{desc}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold disabled:opacity-50"
          >
            বাতিল
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : null}
            Revoke করুন
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Device Drawer ─────────────────────────────────────────────
function DeviceDrawer({ customer, onClose, onRevoked }) {
  const [devices,  setDevices]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [confirm,  setConfirm]  = useState(null)   // { type: 'single'|'all', device? }
  const [revoking, setRevoking] = useState(false)

  const loadDevices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/admin/portal-devices/${customer.id}`)
      setDevices(res.data.data?.devices || [])
    } catch {
      toast.error('Device তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [customer.id])

  useEffect(() => { loadDevices() }, [loadDevices])

  const activeDevices = devices.filter(d => d.is_active)

  const doRevokeOne = async () => {
    setRevoking(true)
    try {
      await api.delete(`/admin/portal-devices/${customer.id}/${confirm.device.id}`)
      toast.success(`"${confirm.device.device_label}" revoke করা হয়েছে।`)
      setConfirm(null)
      loadDevices()
      onRevoked()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setRevoking(false)
    }
  }

  const doRevokeAll = async () => {
    setRevoking(true)
    try {
      await api.delete(`/admin/portal-devices/${customer.id}`, {
        data: { also_revoke_link: false }  // manager JWT invalidate করতে পারবে না
      })
      toast.success(`${activeDevices.length}টি device revoke করা হয়েছে।`)
      setConfirm(null)
      loadDevices()
      onRevoked()
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setRevoking(false)
    }
  }

  const linkExp = isExpired(customer.link_expires_at)

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex justify-end"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-white h-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-primary text-white px-4 py-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base">Device ম্যানেজমেন্ট</h2>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg">
              <FiX className="text-xl" />
            </button>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="font-semibold text-sm">{customer.shop_name}</p>
            <p className="text-white/70 text-xs mt-0.5">{customer.owner_name} · {customer.customer_code}</p>
            {customer.portal_email && (
              <p className="text-white/60 text-xs mt-1 flex items-center gap-1">
                <FiShield className="text-xs" /> {customer.portal_email}
              </p>
            )}
          </div>
        </div>

        {/* Status badges */}
        <div className="px-4 py-3 flex gap-2 flex-wrap border-b border-gray-100 flex-shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            activeDevices.length > 0
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            ✓ {activeDevices.length} সক্রিয় device
          </span>
          {customer.last_login && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-medium flex items-center gap-1">
              <FiClock className="text-xs" /> {fmtDate(customer.last_login)}
            </span>
          )}
          {customer.link_expires_at && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              linkExp ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
            }`}>
              {linkExp ? '⚠ Link মেয়াদ শেষ' : 'Link সক্রিয়'}
            </span>
          )}
        </div>

        {/* Device list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1,2].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FiSmartphone className="text-4xl text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">এখনো কোনো device login করেনি</p>
              <p className="text-gray-300 text-xs mt-1">Google login করলে device যোগ হবে</p>
            </div>
          ) : (
            <>
              {/* Active devices */}
              {activeDevices.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    সক্রিয় ({activeDevices.length})
                  </p>
                  <div className="space-y-2">
                    {activeDevices.map(device => (
                      <div key={device.id}
                           className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 shadow-sm">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <DeviceIcon label={device.device_label} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {device.device_label}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fmtDate(device.last_used_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => setConfirm({ type: 'single', device })}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 font-semibold border border-red-100 flex-shrink-0"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inactive devices */}
              {devices.filter(d => !d.is_active).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">
                    বাতিল ({devices.filter(d => !d.is_active).length})
                  </p>
                  <div className="space-y-2">
                    {devices.filter(d => !d.is_active).map(device => (
                      <div key={device.id}
                           className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center gap-3 opacity-50">
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <DeviceIcon label={device.device_label} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-500 truncate">
                            {device.device_label}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fmtDate(device.last_used_at)}
                          </p>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-400 flex-shrink-0">
                          বাতিল
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer action */}
        {activeDevices.length > 1 && (
          <div className="p-4 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={() => setConfirm({ type: 'all' })}
              className="w-full py-3 rounded-xl bg-red-50 text-red-500 text-sm font-bold border border-red-100"
            >
              সব {activeDevices.length}টি Device Revoke করুন
            </button>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal
          title={confirm.type === 'all'
            ? `সব ${activeDevices.length}টি Device Revoke?`
            : `"${confirm.device?.device_label}" Revoke?`}
          desc={confirm.type === 'all'
            ? `${customer.shop_name}-এর সব device বাতিল হবে। কাস্টমারকে আবার Google দিয়ে login করতে হবে।`
            : 'এই device থেকে আর login হবে না।'}
          loading={revoking}
          onConfirm={confirm.type === 'all' ? doRevokeAll : doRevokeOne}
          onCancel={() => !revoking && setConfirm(null)}
        />
      )}
    </div>
  )
}

// ── Customer Card ─────────────────────────────────────────────
function CustomerCard({ customer, onManage }) {
  const hasDevices  = customer.active_device_count > 0
  const loginedOnce = !!customer.portal_email
  const linkExp     = isExpired(customer.link_expires_at)

  return (
    <div
      onClick={() => onManage(customer)}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 active:bg-gray-50 cursor-pointer"
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
        hasDevices ? 'bg-green-100' : 'bg-gray-100'
      }`}>
        <FiUser className={hasDevices ? 'text-green-600' : 'text-gray-400'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-800 text-sm truncate">{customer.shop_name}</p>
          {linkExp && customer.link_expires_at && (
            <span className="text-xs bg-red-100 text-red-500 px-1.5 py-0.5 rounded-md flex-shrink-0">মেয়াদ শেষ</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{customer.owner_name} · {customer.customer_code}</p>
        {loginedOnce ? (
          <p className="text-xs text-blue-500 mt-0.5 truncate">{customer.portal_email}</p>
        ) : (
          <p className="text-xs text-gray-300 mt-0.5">এখনো login করেনি</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {hasDevices ? (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            {customer.active_device_count} device
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
            device নেই
          </span>
        )}
        {customer.last_login && (
          <p className="text-xs text-gray-400">{fmtDate(customer.last_login)}</p>
        )}
        <FiChevronRight className="text-gray-300 text-sm" />
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function ManagerPortalDevices() {
  const [customers, setCustomers] = useState([])
  const [stats,     setStats]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState('all')   // 'all' | 'yes' | 'no'
  const [selected,  setSelected]  = useState(null)
  const [page,      setPage]      = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [custRes, statsRes] = await Promise.all([
        api.get('/admin/portal-devices', {
          params: { page, limit: 20, search: search || undefined, has_devices: filter === 'all' ? undefined : filter }
        }),
        api.get('/admin/portal-devices/stats'),
      ])
      setCustomers(custRes.data.data || [])
      setTotalPages(custRes.data.pagination?.totalPages || 1)
      setStats(statsRes.data.data?.overview || null)
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [page, search, filter])

  useEffect(() => {
    const t = setTimeout(loadData, search ? 400 : 0)
    return () => clearTimeout(t)
  }, [loadData, search])

  const handleFilterChange = (f) => { setFilter(f); setPage(1) }

  return (
    <div className="space-y-4 pb-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">পোর্টাল Device</h1>
          <p className="text-xs text-gray-400 mt-0.5">আপনার রুটের কাস্টমারদের device</p>
        </div>
        <button onClick={loadData} disabled={loading}
          className="p-2 rounded-xl bg-white border border-gray-200 text-gray-500 disabled:opacity-40">
          <FiRefreshCw className={`text-lg ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <p className="text-xl font-bold text-gray-800">{stats.total_portal_customers || 0}</p>
            <p className="text-xs text-gray-400 mt-0.5">মোট portal</p>
          </div>
          <div className="bg-green-50 rounded-2xl border border-green-100 p-3 text-center">
            <p className="text-xl font-bold text-green-600">{stats.customers_with_active_device || 0}</p>
            <p className="text-xs text-green-500 mt-0.5">device আছে</p>
          </div>
          <div className="bg-blue-50 rounded-2xl border border-blue-100 p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{stats.active_last_7_days || 0}</p>
            <p className="text-xs text-blue-500 mt-0.5">৭ দিনে active</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Shop, মালিক বা কোড খুঁজুন..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'সব' },
          { key: 'yes', label: '✓ Device আছে' },
          { key: 'no',  label: '✗ নেই' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
              filter === f.key
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Customer list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <FiSmartphone className="text-4xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">কোনো কাস্টমার পাওয়া যায়নি।</p>
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map(c => (
            <CustomerCard key={c.id} customer={c} onManage={setSelected} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-600 disabled:opacity-40 font-medium"
          >
            ← আগে
          </button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-600 disabled:opacity-40 font-medium"
          >
            পরে →
          </button>
        </div>
      )}

      {/* Device drawer */}
      {selected && (
        <DeviceDrawer
          customer={selected}
          onClose={() => setSelected(null)}
          onRevoked={loadData}
        />
      )}
    </div>
  )
}
