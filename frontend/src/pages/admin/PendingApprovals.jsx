import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import {
  FiCheck, FiX, FiUser, FiEdit, FiEye,
  FiMapPin, FiShoppingCart, FiDollarSign,
  FiCreditCard, FiAlertCircle
} from 'react-icons/fi'

export default function PendingApprovals() {
  const [tab,             setTab]             = useState('employees')
  const [employees,       setEmployees]       = useState([])
  const [edits,           setEdits]           = useState([])
  const [routes,          setRoutes]          = useState([])
  const [orders,          setOrders]          = useState([])
  const [settlements,     setSettlements]     = useState([])
  const [creditApprovals, setCreditApprovals] = useState([])
  const [dueLeaderboard,  setDueLeaderboard]  = useState([])
  const [loading,         setLoading]         = useState(true)
  const [detailModal,     setDetailModal]     = useState(null)
  const [tempPasswords,   setTempPasswords]   = useState({})
  const [processing,      setProcessing]      = useState({})

  const fetchData = async () => {
    setLoading(true)
    try {
      const [empRes, editRes, routeRes, orderRes, settlementRes, creditRes, dueRes] =
        await Promise.all([
          api.get('/employees/pending'),
          api.get('/employees/audit'),
          api.get('/routes/pending/list'),
          api.get('/orders/pending'),
          api.get('/settlements/pending'),
          api.get('/credit-approvals/pending'),
          api.get('/credit-approvals/due-leaderboard'),
        ])
      setEmployees(empRes.data.data || [])
      setEdits(editRes.data.data || [])
      const allRoutes = routeRes.data.data || []
      setRoutes(allRoutes.filter(r => r.status === 'pending'))
      setOrders(orderRes.data.data || [])
      setSettlements(settlementRes.data.data || [])
      setCreditApprovals(creditRes.data.data || [])
      setDueLeaderboard(dueRes.data.data || [])
    } catch {
      toast.error('\u09A4\u09A5\u09CD\u09AF \u0986\u09A8\u09A4\u09C7 \u09B8\u09AE\u09B8\u09CD\u09AF\u09BE \u09B9\u09AF\u09BC\u09C7\u099B\u09C7\u0964')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const approveEmployee = async (id) => {
    try {
      const res = await api.put('/employees/' + id + '/approve', {
        temp_password: tempPasswords[id] || 'NTB@2026'
      })
      toast.success(res.data.message)
      fetchData()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    }
  }

  const rejectEmployee = async (id) => {
    try {
      await api.put('/employees/' + id + '/reject', { reason: 'Admin' })
      toast.success('Rejected')
      fetchData()
    } catch { toast.error('Error') }
  }

  const approveEdit = async (id) => {
    try {
      await api.put('/employees/audit/' + id + '/approve')
      toast.success('Edit approved')
      fetchData()
    } catch { toast.error('Error') }
  }

  const rejectEdit = async (id) => {
    try {
      await api.put('/employees/audit/' + id + '/reject', { reason: 'Admin' })
      toast.success('Edit rejected')
      fetchData()
    } catch { toast.error('Error') }
  }

  const approveRoute = async (id, name) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put('/routes/' + id, { status: 'approved', is_active: true })
      toast.success('Route approved: ' + name)
      setRoutes(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    } finally {
      setProcessing(p => ({ ...p, [id]: false }))
    }
  }

  const rejectRoute = async (id, name) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put('/routes/' + id, { status: 'rejected', is_active: false })
      toast.success('Route rejected: ' + name)
      setRoutes(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    } finally {
      setProcessing(p => ({ ...p, [id]: false }))
    }
  }

  const approveOrder = async (id) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put('/orders/' + id + '/approve')
      toast.success('Order approved')
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    } finally {
      setProcessing(p => ({ ...p, [id]: false }))
    }
  }

  const rejectOrder = async (id) => {
    setProcessing(p => ({ ...p, [id]: true }))
    try {
      await api.put('/orders/' + id + '/reject', { reason: 'Admin' })
      toast.success('Order rejected')
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    } finally {
      setProcessing(p => ({ ...p, [id]: false }))
    }
  }

  const approveSettlement = async (id) => {
    setProcessing(p => ({ ...p, ['s_' + id]: true }))
    try {
      await api.put('/settlements/' + id + '/approve')
      toast.success('Settlement approved')
      setSettlements(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    } finally {
      setProcessing(p => ({ ...p, ['s_' + id]: false }))
    }
  }

  const approveCredit = async (id) => {
    setProcessing(p => ({ ...p, ['c_' + id]: true }))
    try {
      await api.put('/credit-approvals/' + id + '/approve')
      toast.success('Credit approved')
      setCreditApprovals(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    } finally {
      setProcessing(p => ({ ...p, ['c_' + id]: false }))
    }
  }

  const rejectCredit = async (id) => {
    setProcessing(p => ({ ...p, ['c_' + id]: true }))
    try {
      await api.put('/credit-approvals/' + id + '/reject', { reason: 'Admin' })
      toast.success('Credit rejected')
      setCreditApprovals(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error')
    } finally {
      setProcessing(p => ({ ...p, ['c_' + id]: false }))
    }
  }

  const allItems = [
    ...employees.map(e => ({ ...e, _type: 'employee' })),
    ...edits.map(e => ({ ...e, _type: 'edit' })),
    ...routes.map(e => ({ ...e, _type: 'route' })),
    ...orders.map(e => ({ ...e, _type: 'order' })),
    ...settlements.map(e => ({ ...e, _type: 'settlement' })),
    ...creditApprovals.map(e => ({ ...e, _type: 'credit' })),
  ]

  const TABS = [
    { key: 'all',         label: 'সব (' + allItems.length + ')' },
    { key: 'employees',   label: 'কর্মচারী (' + employees.length + ')' },
    { key: 'edits',       label: 'এডিট (' + edits.length + ')' },
    { key: 'routes',      label: 'রুট (' + routes.length + ')' },
    { key: 'orders',      label: 'অর্ডার (' + orders.length + ')' },
    { key: 'settlements', label: 'হিসাব (' + settlements.length + ')' },
    { key: 'credits',     label: 'ক্রেডিট (' + creditApprovals.length + ')' },
  ]

  const Spinner = () => (
    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
  )
  const SpinnerRed = () => (
    <span className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin inline-block" />
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-800">পেন্ডিং অনুমোদন</h1>

      {/* Tab bar */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ' +
              (tab === t.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-500 hover:text-gray-700')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>

      ) : tab === 'all' ? (
        <div className="space-y-3">
          {allItems.length === 0 ? (
            <Card>
              <p className="text-center text-gray-400 py-8">কোনো পেন্ডিং আইটেম নেই।</p>
            </Card>
          ) : allItems.map(item => (
            <Card key={item._type + '-' + item.id}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg bg-gray-100">
                  {item._type === 'employee' ? '👤'
                    : item._type === 'edit' ? '✏️'
                    : item._type === 'route' ? '📍'
                    : item._type === 'order' ? '🛒'
                    : item._type === 'credit' ? '💳'
                    : '💰'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">
                    {item.name_bn || item.worker_name || item.customer_name || item.name || '-'}
                  </p>
                  {item.total_amount
                    ? <p className="text-sm text-primary font-bold">৳{Number(item.total_amount).toLocaleString()}</p>
                    : null}
                  {item.requested_amount
                    ? <p className="text-sm text-primary font-bold">৳{Number(item.requested_amount).toLocaleString()}</p>
                    : null}
                </div>
                <button
                  onClick={() => setTab(
                    item._type === 'settlement' ? 'settlements'
                    : item._type === 'credit' ? 'credits'
                    : item._type + 's'
                  )}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium"
                >
                  দেখুন
                </button>
              </div>
            </Card>
          ))}
        </div>

      ) : tab === 'employees' ? (
        <div className="space-y-3">
          {employees.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং কর্মচারী নেই।</p></Card>
          ) : employees.map(emp => (
            <Card key={emp.id}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {emp.profile_photo
                    ? <img src={emp.profile_photo} alt="" className="w-full h-full object-cover" />
                    : <FiUser className="text-primary text-xl" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">{emp.name_bn}</p>
                    <Badge variant={emp.role} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{emp.email || emp.phone}</p>
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
                  <button onClick={() => setDetailModal(emp)}
                    className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600">
                    <FiEye />
                  </button>
                  <button onClick={() => rejectEmployee(emp.id)}
                    className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600">
                    <FiX />
                  </button>
                  <button onClick={() => approveEmployee(emp.id)}
                    className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1">
                    <FiCheck /> অনুমোদন
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

      ) : tab === 'edits' ? (
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
                        <span className="text-gray-400 line-through">
                          {String(edit.previous_values?.[key] || '-')}
                        </span>
                        <span className="text-gray-700">→ {String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => rejectEdit(edit.id)}
                    className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600">
                    <FiX />
                  </button>
                  <button onClick={() => approveEdit(edit.id)}
                    className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1">
                    <FiCheck /> অনুমোদন
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

      ) : tab === 'orders' ? (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং অর্ডার নেই।</p></Card>
          ) : orders.map(order => (
            <div key={order.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <FiShoppingCart className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-800">{order.worker_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{order.employee_code}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary text-sm">
                    ৳{Number(order.total_amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-12 px-4 py-2 bg-gray-50 border-b border-gray-100">
                <p className="col-span-5 text-xs font-semibold text-gray-500">পণ্য</p>
                <p className="col-span-2 text-xs font-semibold text-gray-500 text-center">দাম</p>
                <p className="col-span-2 text-xs font-semibold text-gray-500 text-center">পরিমাণ</p>
                <p className="col-span-3 text-xs font-semibold text-gray-500 text-right">মোট</p>
              </div>
              {(Array.isArray(order.items) ? order.items : []).map((item, i) => (
                <div key={i}
                  className={'grid grid-cols-12 px-4 py-2.5 items-center ' + (i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}>
                  <div className="col-span-5">
                    <p className="text-xs font-medium text-gray-800">{item.product_name}</p>
                  </div>
                  <p className="col-span-2 text-xs text-gray-500 text-center">
                    ৳{parseFloat(item.price || 0).toLocaleString()}
                  </p>
                  <p className="col-span-2 text-xs font-bold text-amber-600 text-center">
                    {item.requested_qty || 0}
                  </p>
                  <p className="col-span-3 text-xs font-bold text-primary text-right">
                    ৳{(parseFloat(item.price || 0) * (item.requested_qty || 0)).toLocaleString()}
                  </p>
                </div>
              ))}
              <div className="flex gap-2 p-3 bg-gray-50 border-t border-gray-100">
                <button onClick={() => rejectOrder(order.id)} disabled={processing[order.id]}
                  className="flex-1 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                  {processing[order.id] ? <SpinnerRed /> : <FiX size={14} />}
                  বাতিল
                </button>
                <button onClick={() => approveOrder(order.id)} disabled={processing[order.id]}
                  className="flex-2 px-6 py-2 rounded-xl bg-secondary text-white text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                  {processing[order.id] ? <Spinner /> : <FiCheck size={14} />}
                  অনুমোদন
                </button>
              </div>
            </div>
          ))}
        </div>

      ) : tab === 'settlements' ? (
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
                  <p className="font-semibold text-gray-800">
                    {s.worker_name || s.employee_name || '-'}
                  </p>
                  <div className="mt-1 text-sm text-gray-600 space-y-0.5">
                    <p>মোট বিক্রয়: <span className="font-bold text-primary">
                      ৳{Number(s.total_sales || 0).toLocaleString()}
                    </span></p>
                    <p>নগদ সংগ্রহ: <span className="font-bold text-secondary">
                      ৳{Number(s.cash_collected || 0).toLocaleString()}
                    </span></p>
                  </div>
                </div>
                <button onClick={() => approveSettlement(s.id)}
                  disabled={processing['s_' + s.id]}
                  className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50">
                  {processing['s_' + s.id] ? <Spinner /> : <FiCheck />}
                  অনুমোদন
                </button>
              </div>
            </Card>
          ))}
        </div>

      ) : tab === 'routes' ? (
        <div className="space-y-3">
          {routes.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো পেন্ডিং রুট নেই।</p></Card>
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
                    আবেদনকারী: {route.requested_by_name || '-'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => rejectRoute(route.id, route.name)}
                    disabled={processing[route.id]}
                    className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50">
                    {processing[route.id] ? <SpinnerRed /> : <FiX />}
                  </button>
                  <button onClick={() => approveRoute(route.id, route.name)}
                    disabled={processing[route.id]}
                    className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50">
                    {processing[route.id] ? <Spinner /> : <FiCheck />}
                    অনুমোদন
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

      ) : tab === 'credits' ? (
        <div className="space-y-4">
          {dueLeaderboard.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                <FiAlertCircle /> সবচেয়ে বেশি বাকি
              </p>
              <div className="space-y-2">
                {dueLeaderboard.slice(0, 5).map((shop, i) => (
                  <div key={shop.customer_id || i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {shop.customer_name || shop.shop_name || '-'}
                      </p>
                      <p className="text-xs text-gray-500">{shop.sr_name || ''}</p>
                    </div>
                    <span className="text-sm font-bold text-red-600">
                      ৳{Number(shop.total_due || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {creditApprovals.length === 0 ? (
            <Card>
              <p className="text-center text-gray-400 py-8">কোনো পেন্ডিং ক্রেডিট আবেদন নেই।</p>
            </Card>
          ) : creditApprovals.map(c => (
            <Card key={c.id}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <FiCreditCard className="text-violet-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">
                    {c.customer_name || c.shop_name || '-'}
                  </p>
                  <p className="text-xs text-gray-500">SR: {c.requester_name || c.sr_name || '-'}</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4">
                    <p className="text-xs text-gray-500">
                      বর্তমান লিমিট:{' '}
                      <span className="font-bold text-gray-700">
                        ৳{Number(c.current_limit || c.credit_limit || 0).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      আবেদনকৃত:{' '}
                      <span className="font-bold text-primary">
                        ৳{Number(c.requested_limit || c.requested_amount || 0).toLocaleString()}
                      </span>
                    </p>
                  </div>
                  {c.note && (
                    <p className="text-xs text-gray-400 mt-1 italic">"{c.note}"</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => rejectCredit(c.id)}
                    disabled={processing['c_' + c.id]}
                    className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50">
                    {processing['c_' + c.id] ? <SpinnerRed /> : <FiX />}
                  </button>
                  <button onClick={() => approveCredit(c.id)}
                    disabled={processing['c_' + c.id]}
                    className="px-4 py-2 rounded-lg bg-secondary text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50">
                    {processing['c_' + c.id] ? <Spinner /> : <FiCheck />}
                    অনুমোদন
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

      ) : null}

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
