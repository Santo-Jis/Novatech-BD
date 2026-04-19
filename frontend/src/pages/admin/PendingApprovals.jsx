import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { FiCheck, FiX, FiUser, FiEdit, FiEye, FiMapPin, FiShoppingCart, FiDollarSign } from 'react-icons/fi'

export default function PendingApprovals() {
  const [tab,           setTab]           = useState('employees')
  const [employees,     setEmployees]     = useState([])
  const [edits,         setEdits]         = useState([])
  const [routes,        setRoutes]        = useState([])
  const [orders,        setOrders]        = useState([])
  const [settlements,   setSettlements]   = useState([])
  const [loading,       setLoading]       = useState(true)
  const [detailModal,   setDetailModal]   = useState(null)
  const [tempPasswords, setTempPasswords] = useState({})
  const [processing,    setProcessing]    = useState({})

  const fetchData = async () => {
    setLoading(true)
    try {
      const [empRes, editRes, routeRes, orderRes, settlementRes] = await Promise.all([
        api.get('/employees/pending'),
        api.get('/employees/audit'),
        api.get('/routes/pending/list'),
        api.get('/orders/pending'),
        api.get('/settlements/pending'),
      ])
      setEmployees(empRes.data.data || [])
      setEdits(editRes.data.data || [])
      const allRoutes = routeRes.data.data || []
      setRoutes(allRoutes.filter(r => r.status === 'pending'))
      setOrders(orderRes.data.data || [])
      setSettlements(settlementRes.data.data || [])
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const approveEmployee = async (id) => {
    try {
      const res = await api.put(`/employees/${id}/approve`, {
        temp_password: tempPasswords[id] || 'NTB@2026'
      })
      toast.success(res.data.message)
      fetchData()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
  }

  const rejectEmployee = async (id) => {
    try {
      await api.put(`/employees/${id}/reject`, { reason: 'Admin কর্তৃক বাতিল' })
      toast.success('আবেদন বাতিল করা হয়েছে।')
      fetchData()
    } catch { toast.error('সমস্যা হয়েছে।') }
  }

  const approveEdit = async (id) => {
    try {
      await api.put(`/employees/audit/${id}/approve`)
      toast.success('এডিট অনুমোদন সফল।')
      fetchData()
    } catch { toast.error('সমস্যা হয়েছে।') }
  }

  const rejectEdit = async (id) => {
    try {
      await api.put(`/employees/audit/${id}/reject`, { reason: 'Admin কর্তৃক বাতিল' })
      toast.success('এডিট বাতিল করা হয়েছে।')
      fetchData()
    } catch { toast.error('সমস্যা হয়েছে।') }
  }

  const approveRoute = async (id, name) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put(`/routes/${id}`, { status: 'approved', is_active: true })
      toast.success(`✅ "${name}" রুট অনুমোদন হয়েছে।`)
      setRoutes(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setProcessing(p => ({ ...p, [id]: false }))
    }
  }

  const rejectRoute = async (id, name) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put(`/routes/${id}`, { status: 'rejected', is_active: false })
      toast.success(`❌ "${name}" রুট বাতিল করা হয়েছে।`)
      setRoutes(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setProcessing(p => ({ ...p, [id]: false }))
    }
  }

  const approveOrder = async (id) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put(`/orders/${id}/approve`)
      toast.success('অর্ডার অনুমোদন সফল।')
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setProcessing(p => ({ ...p, [id]: false })) }
  }

  const rejectOrder = async (id) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put(`/orders/${id}/reject`, { reason: 'Admin কর্তৃক বাতিল' })
      toast.success('অর্ডার বাতিল করা হয়েছে।')
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setProcessing(p => ({ ...p, [id]: false })) }
  }

  const approveSettlement = async (id) => {
    setProcessing(p => ({ ...p, [`s_${id}`]: true }))
    try {
      await api.put(`/settlements/${id}/approve`)
      toast.success('হিসাব অনুমোদন সফল।')
      setSettlements(prev => prev.filter(s => s.id !== id))
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setProcessing(p => ({ ...p, [`s_${id}`]: false })) }
  }

  const allItems = [
    ...employees.map(e=>({...e,_type:'employee'})),
    ...edits.map(e=>({...e,_type:'edit'})),
    ...routes.map(e=>({...e,_type:'route'})),
    ...orders.map(e=>({...e,_type:'order'})),
    ...settlements.map(e=>({...e,_type:'settlement'})),
  ]
  const tabs = [
    { key: 'all', label: `সব (${allItems.length})` },
    { key: 'employees',   label: `নতুন কর্মচারী (${employees.length})` },
    { key: 'edits',       label: `এডিট রিকোয়েস্ট (${edits.length})` },
    { key: 'routes',      label: `রুট আবেদন (${routes.length})` },
    { key: 'orders',      label: `অর্ডার (${orders.length})` },
    { key: 'settlements', label: `হিসাব (${settlements.length})` },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-800">পেন্ডিং অনুমোদন</h1>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
        </div>
            ) : tab === 'all' ? (
        <div className="space-y-3">
          {allItems.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং আইটেম নেই।</p></Card>
          ) : allItems.map(item => (
            <Card key={item._type+'-'+item.id}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg
                  ${item._type==='employee'?'bg-blue-100':item._type==='edit'?'bg-amber-100':item._type==='route'?'bg-purple-100':item._type==='order'?'bg-green-100':'bg-teal-100'}">
                  {item._type==='employee'?'👤':item._type==='edit'?'✏️':item._type==='route'?'📍':item._type==='order'?'🛒':'💰'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium
                      ${item._type==='employee'?'bg-blue-100 text-blue-700':item._type==='edit'?'bg-amber-100 text-amber-700':item._type==='route'?'bg-purple-100 text-purple-700':item._type==='order'?'bg-green-100 text-green-700':'bg-teal-100 text-teal-700'}">
                      {item._type==='employee'?'কর্মচারী':item._type==='edit'?'এডিট':item._type==='route'?'রুট':item._type==='order'?'অর্ডার':'হিসাব'}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-800 mt-0.5">
                    {item.name_bn || item.worker_name || item.name || '—'}
                  </p>
                  {item.total_amount && <p className="text-sm text-primary font-bold">৳{Number(item.total_amount).toLocaleString('bn-BD')}</p>}
                  {item.total_sales && <p className="text-sm text-primary font-bold">৳{Number(item.total_sales).toLocaleString('bn-BD')}</p>}
                </div>
                <button onClick={()=>setTab(item._type==='settlement'?'settlements':item._type+'s')}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                  দেখুন
                </button>
              </div>
            </Card>
          ))}
        </div>

      ) : tab === 'employees' ? (

        /* ── নতুন কর্মচারী ── */
        <div className="space-y-3">
          {employees.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং কর্মচারী নেই।</p></Card>
          ) : employees.map(emp => (
            <Card key={emp.id}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {emp.profile_photo
                    ? <img src={emp.profile_photo} alt="" className="w-full h-full object-cover" />
                    : <FiUser className="text-primary text-xl" />
                  }
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">{emp.name_bn}</p>
                    <Badge variant={emp.role} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{emp.email || emp.phone}</p>
                  <p className="text-xs text-gray-400">
                    যোগদান: {new Date(emp.join_date || emp.created_at).toLocaleDateString('bn-BD')}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">অস্থায়ী পাসওয়ার্ড:</span>
                    <input
                      type="text"
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-32"
                      placeholder="NTB@2026"
                      value={tempPasswords[emp.id] || ''}
                      onChange={e => setTempPasswords(prev => ({ ...prev, [emp.id]: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setDetailModal(emp)} className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600">
                    <FiEye />
                  </button>
                  <button onClick={() => rejectEmployee(emp.id)} className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600">
                    <FiX />
                  </button>
                  <button onClick={() => approveEmployee(emp.id)} className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1">
                    <FiCheck /> অনুমোদন
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

      ) : tab === 'edits' ? (

        /* ── এডিট রিকোয়েস্ট ── */
        <div className="space-y-3">
          {edits.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং এডিট নেই।</p></Card>
          ) : edits.map(edit => (
            <Card key={edit.id}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <FiEdit className="text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{edit.name_bn}</p>
                  <p className="text-xs text-gray-400">{edit.employee_code}</p>
                  <div className="mt-2 space-y-1">
                    {Object.entries(edit.changes || {}).map(([key, val]) => (
                      <div key={key} className="flex gap-2 text-xs">
                        <span className="text-gray-500 font-medium w-32 flex-shrink-0">{key}:</span>
                        <span className="text-gray-400 line-through">{String(edit.previous_values?.[key] || '—')}</span>
                        <span className="text-gray-700">→ {String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => rejectEdit(edit.id)} className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600">
                    <FiX />
                  </button>
                  <button onClick={() => approveEdit(edit.id)} className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1">
                    <FiCheck /> অনুমোদন
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

      ) : tab === 'orders' ? (

        /* ── অর্ডার অনুমোদন ── */
        <div className="space-y-3">
          {orders.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং অর্ডার নেই।</p></Card>
          ) : orders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Card Header */}
              <div className="flex items-center gap-3 p-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <FiShoppingCart className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-800">{order.worker_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{order.employee_code}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary text-sm">৳{Number(order.total_amount || 0).toLocaleString('bn-BD')}</p>
                  <p className="text-xs text-gray-400">{new Date(order.requested_at || order.created_at).toLocaleString('bn-BD')}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="px-0">
                {/* Table Header */}
                <div className="grid grid-cols-12 px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="col-span-5 text-xs font-semibold text-gray-500">পণ্য</p>
                  <p className="col-span-2 text-xs font-semibold text-gray-500 text-center">দাম</p>
                  <p className="col-span-2 text-xs font-semibold text-gray-500 text-center">পরিমাণ</p>
                  <p className="col-span-3 text-xs font-semibold text-gray-500 text-right">মোট</p>
                </div>
                {/* Table Rows */}
                {(Array.isArray(order.items) ? order.items : []).map((item, i) => (
                  <div key={i} className={`grid grid-cols-12 px-4 py-2.5 items-center ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <div className="col-span-5">
                      <p className="text-xs font-medium text-gray-800 leading-tight">{item.product_name}</p>
                    </div>
                    <p className="col-span-2 text-xs text-gray-500 text-center">৳{parseFloat(item.price || 0).toLocaleString()}</p>
                    <p className="col-span-2 text-xs font-bold text-amber-600 text-center">{item.requested_qty || 0} পিস</p>
                    <p className="col-span-3 text-xs font-bold text-primary text-right">
                      ৳{(parseFloat(item.price || 0) * (item.requested_qty || 0)).toLocaleString()}
                    </p>
                  </div>
                ))}
                {/* Total Row */}
                <div className="grid grid-cols-12 px-4 py-2.5 bg-primary/5 border-t border-primary/10">
                  <p className="col-span-9 text-xs font-bold text-gray-700">সর্বমোট ({(Array.isArray(order.items) ? order.items : []).length} পণ্য)</p>
                  <p className="col-span-3 text-xs font-bold text-primary text-right">৳{Number(order.total_amount || 0).toLocaleString('bn-BD')}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 p-3 bg-gray-50 border-t border-gray-100">
                <button
                  onClick={() => rejectOrder(order.id)}
                  disabled={processing[order.id]}
                  className="flex-1 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {processing[order.id]
                    ? <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin block" />
                    : <FiX size={14} />}
                  বাতিল
                </button>
                <button
                  onClick={() => approveOrder(order.id)}
                  disabled={processing[order.id]}
                  className="flex-2 px-6 py-2 rounded-xl bg-secondary text-white text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {processing[order.id]
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <FiCheck size={14} />}
                  অনুমোদন দিন
                </button>
              </div>
            </div>
          ))}
        </div>

      ) : tab === 'settlements' ? (

        /* ── হিসাব অনুমোদন ── */
        <div className="space-y-3">
          {settlements.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং হিসাব নেই।</p></Card>
          ) : settlements.map(s => (
            <Card key={s.id}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <FiDollarSign className="text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{s.worker_name || s.employee_name || '—'}</p>
                  <p className="text-xs text-gray-400">{s.employee_code || ''}</p>
                  <div className="mt-1 text-sm text-gray-600 space-y-0.5">
                    <p>মোট বিক্রয়: <span className="font-bold text-primary">৳{Number(s.total_sales || 0).toLocaleString('bn-BD')}</span></p>
                    <p>নগদ সংগ্রহ: <span className="font-bold text-secondary">৳{Number(s.cash_collected || 0).toLocaleString('bn-BD')}</span></p>
                  </div>
                  <p className="text-xs text-gray-400">
                    তারিখ: {new Date(s.settlement_date || s.created_at).toLocaleDateString('bn-BD')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveSettlement(s.id)}
                    disabled={processing[`s_${s.id}`]}
                    className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                  >
                    {processing[`s_${s.id}`]
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <FiCheck />}
                    অনুমোদন
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

      ) : (

        /* ── রুট আবেদন ── */
        <div className="space-y-3">
          {routes.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং রুট আবেদন নেই।</p></Card>
          ) : routes.map(route => (
            <Card key={route.id}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <FiMapPin className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{route.name}</p>
                  {route.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{route.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    আবেদনকারী: <span className="font-medium text-gray-600">{route.requested_by_name || '—'}</span>
                  </p>
                  <p className="text-xs text-gray-400">
                    সময়: {new Date(route.requested_at || route.created_at).toLocaleString('bn-BD')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => rejectRoute(route.id, route.name)}
                    disabled={processing[route.id]}
                    className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50"
                  >
                    {processing[route.id]
                      ? <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin block" />
                      : <FiX />
                    }
                  </button>
                  <button
                    onClick={() => approveRoute(route.id, route.name)}
                    disabled={processing[route.id]}
                    className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                  >
                    {processing[route.id]
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <FiCheck />
                    }
                    অনুমোদন
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title="কর্মচারীর বিস্তারিত">
        {detailModal && (
          <div className="space-y-2 text-sm">
            {[
              ['নাম (বাংলা)', detailModal.name_bn],
              ['নাম (ইংরেজি)', detailModal.name_en],
              ['পদবী', detailModal.role],
              ['ফোন', detailModal.phone],
              ['ইমেইল', detailModal.email],
              ['যোগদান', detailModal.join_date],
            ].map(([label, val]) => val && (
              <div key={label} className="flex gap-3">
                <span className="text-gray-500 w-32 flex-shrink-0">{label}</span>
                <span className="font-medium">{val}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
