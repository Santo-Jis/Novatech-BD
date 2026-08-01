// PriceListManageModal.jsx — একটা নির্দিষ্ট মূল্য তালিকার প্রোডাক্ট দাম/এলাকা/কাস্টমার ম্যানেজ করা (Step ৫)
import { useState, useEffect } from 'react'
import api from '../api/axios'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { Select } from './ui/Input'
import toast from 'react-hot-toast'
import { FiPlus, FiX } from 'react-icons/fi'

const TABS = (detail) => [
  { key: 'items',     label: `প্রোডাক্ট দাম (${detail.items.length})` },
  { key: 'areas',     label: `এলাকা (${detail.areas.length})` },
  { key: 'customers', label: `নির্দিষ্ট কাস্টমার (${detail.customers.length})` },
]

export default function PriceListManageModal({ isOpen, onClose, priceListId, onChanged }) {
  const [detail,   setDetail]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [tab,      setTab]      = useState('items')

  const [products,  setProducts]  = useState([])
  const [routes,    setRoutes]    = useState([])
  const [customers, setCustomers] = useState([])

  const [newItem,       setNewItem]       = useState({ product_id: '', price: '' })
  const [newRouteId,    setNewRouteId]    = useState('')
  const [newCustomerId, setNewCustomerId] = useState('')

  const fetchDetail = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/price-lists/${priceListId}`)
      setDetail(res.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (isOpen && priceListId) {
      fetchDetail()
      setTab('items')
      setNewItem({ product_id: '', price: '' }); setNewRouteId(''); setNewCustomerId('')
      api.get('/products?is_active=true').then(r => setProducts(r.data.data || [])).catch(() => {})
      api.get('/routes').then(r => setRoutes(r.data.data || [])).catch(() => {})
      api.get('/customers', { params: { limit: 200 } }).then(r => setCustomers(r.data.data || [])).catch(() => {})
    }
  }, [isOpen, priceListId])

  const notifyChanged = () => { fetchDetail(); onChanged?.() }

  const addItem = async () => {
    if (!newItem.product_id || newItem.price === '') { toast.error('প্রোডাক্ট ও দাম দিন।'); return }
    setBusy(true)
    try {
      await api.put(`/price-lists/${priceListId}/items`, { items: [{ product_id: newItem.product_id, price: parseFloat(newItem.price) }] })
      setNewItem({ product_id: '', price: '' })
      notifyChanged()
    } catch (e) { toast.error(e.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setBusy(false) }
  }
  const removeItem = async (productId) => {
    try { await api.delete(`/price-lists/${priceListId}/items/${productId}`); notifyChanged() }
    catch { toast.error('সরাতে সমস্যা হয়েছে।') }
  }

  const addArea = async () => {
    if (!newRouteId) return
    setBusy(true)
    try { await api.post(`/price-lists/${priceListId}/areas`, { route_ids: [newRouteId] }); setNewRouteId(''); notifyChanged() }
    catch (e) { toast.error(e.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setBusy(false) }
  }
  const removeArea = async (routeId) => {
    try { await api.delete(`/price-lists/${priceListId}/areas/${routeId}`); notifyChanged() }
    catch { toast.error('সরাতে সমস্যা হয়েছে।') }
  }

  const addCustomer = async () => {
    if (!newCustomerId) return
    setBusy(true)
    try { await api.post(`/price-lists/${priceListId}/customers`, { customer_ids: [newCustomerId] }); setNewCustomerId(''); notifyChanged() }
    catch (e) { toast.error(e.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setBusy(false) }
  }
  const removeCustomer = async (customerId) => {
    try { await api.delete(`/price-lists/${priceListId}/customers/${customerId}`); notifyChanged() }
    catch { toast.error('সরাতে সমস্যা হয়েছে।') }
  }

  if (!isOpen) return null

  const assignedProductIds  = new Set((detail?.items || []).map(i => i.product_id))
  const productOptions      = products.filter(p => !assignedProductIds.has(p.id)).map(p => ({ value: p.id, label: `${p.name} (${p.sku})` }))
  const assignedRouteIds    = new Set((detail?.areas || []).map(a => a.route_id))
  const routeOptions        = routes.filter(r => !assignedRouteIds.has(r.id)).map(r => ({ value: r.id, label: r.name }))
  const assignedCustomerIds = new Set((detail?.customers || []).map(c => c.customer_id))
  const customerOptions     = customers.filter(c => !assignedCustomerIds.has(c.id)).map(c => ({ value: c.id, label: `${c.shop_name} (${c.customer_code})` }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={detail ? `মূল্য তালিকা: ${detail.name_bn || detail.name}` : 'মূল্য তালিকা'} size="lg">
      {loading || !detail ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-slate-700 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {TABS(detail).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tab === t.key ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'items' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">যে প্রোডাক্ট এখানে নেই সেটার বেস দামই (Products পেজের দাম) ব্যবহার হবে।</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Select options={productOptions} value={newItem.product_id} onChange={e => setNewItem(p => ({ ...p, product_id: e.target.value }))} /></div>
                <input
                  type="number" min="0" step="0.01" placeholder="দাম"
                  value={newItem.price}
                  onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))}
                  className="w-28 border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800"
                />
                <Button size="md" onClick={addItem} loading={busy} disabled={!newItem.product_id || newItem.price === ''}><FiPlus /></Button>
              </div>
              <div className="border border-gray-100 dark:border-slate-700 rounded-xl divide-y divide-gray-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                {detail.items.length === 0 && <p className="text-xs text-gray-400 text-center py-6">কোনো প্রোডাক্টের বিশেষ দাম যোগ করা হয়নি।</p>}
                {detail.items.map(it => (
                  <div key={it.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{it.product_name}</p>
                      <p className="text-[11px] text-gray-400">বেস দাম ৳{parseFloat(it.base_price).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-primary">৳{parseFloat(it.price).toLocaleString()}</span>
                      <button onClick={() => removeItem(it.product_id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"><FiX size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'areas' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">যেসব রুটের কাস্টমার এই মূল্য তালিকা পাবে (নির্দিষ্ট কাস্টমার override না থাকলে)।</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Select options={routeOptions} value={newRouteId} onChange={e => setNewRouteId(e.target.value)} /></div>
                <Button size="md" onClick={addArea} loading={busy} disabled={!newRouteId}><FiPlus /></Button>
              </div>
              <div className="border border-gray-100 dark:border-slate-700 rounded-xl divide-y divide-gray-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                {detail.areas.length === 0 && <p className="text-xs text-gray-400 text-center py-6">কোনো এলাকা যোগ করা হয়নি।</p>}
                {detail.areas.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-gray-700 dark:text-gray-200">{a.route_name}</span>
                    <button onClick={() => removeArea(a.route_id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"><FiX size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'customers' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">এলাকা/ডিফল্টের চেয়ে বেশি অগ্রাধিকার পায় — এই কাস্টমাররা সবসময় এই তালিকার দাম পাবে।</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Select options={customerOptions} value={newCustomerId} onChange={e => setNewCustomerId(e.target.value)} /></div>
                <Button size="md" onClick={addCustomer} loading={busy} disabled={!newCustomerId}><FiPlus /></Button>
              </div>
              <div className="border border-gray-100 dark:border-slate-700 rounded-xl divide-y divide-gray-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                {detail.customers.length === 0 && <p className="text-xs text-gray-400 text-center py-6">কোনো নির্দিষ্ট কাস্টমার যোগ করা হয়নি।</p>}
                {detail.customers.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-gray-700 dark:text-gray-200">{c.shop_name} <span className="text-gray-400 text-xs">({c.customer_code})</span></span>
                    <button onClick={() => removeCustomer(c.customer_id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"><FiX size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
