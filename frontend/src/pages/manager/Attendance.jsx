// ============================================================
// Manager Attendance Page
// ============================================================
import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Input, { Select } from '../../components/ui/Input'
import { FiCalendar, FiDownload } from 'react-icons/fi'
import toast from 'react-hot-toast'

export function ManagerAttendance() {
  const [attendance, setAttendance] = useState([])
  const [today,      setToday]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState('today')
  const [month,      setMonth]      = useState(String(new Date().getMonth() + 1))
  const [year,       setYear]       = useState(String(new Date().getFullYear()))

  useEffect(() => {
    const fetchToday = async () => {
      try {
        const res = await api.get('/attendance/today')
        setToday(res.data.data.workers || [])
      } catch { toast.error('তথ্য আনতে সমস্যা।') }
      finally { setLoading(false) }
    }
    fetchToday()
  }, [])

  const fetchMonthly = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/reports/attendance?month=${month}&year=${year}`)
      setAttendance(res.data.data.workers || [])
    } catch { toast.error('তথ্য আনতে সমস্যা।') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (tab === 'monthly') fetchMonthly() }, [tab, month, year])

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2024, i).toLocaleString('bn-BD', { month: 'long' })
  }))

  const statusMap = { present: 'উপস্থিত', late: 'দেরি', absent: 'অনুপস্থিত', leave: 'ছুটি' }

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-800">হাজিরা</h1>

      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {[{ key: 'today', label: 'আজকের লাইভ' }, { key: 'monthly', label: 'মাসিক রিপোর্ট' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'today' ? (
        <div className="space-y-3">
          {loading ? <div className="h-40 bg-white rounded-2xl animate-pulse" /> :
            today.map(w => (
              <Card key={w.id}>
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${w.check_in_time ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{w.name_bn}</p>
                    <p className="text-xs text-gray-400">{w.employee_code}</p>
                  </div>
                  {w.check_in_time && (
                    <div className="text-right text-xs text-gray-500">
                      <p>ইন: {new Date(w.check_in_time).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</p>
                      {w.check_out_time && <p>আউট: {new Date(w.check_out_time).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</p>}
                    </div>
                  )}
                  <Badge variant={w.status || (w.check_in_time ? 'present' : 'absent')} />
                  {w.late_minutes > 0 && <span className="text-xs text-amber-600">দেরি: {w.late_minutes} মিনিট</span>}
                </div>
              </Card>
            ))
          }
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Select options={months} value={month} onChange={e => setMonth(e.target.value)} className="w-36" />
            <Select options={[{ value: '2025', label: '২০২৫' }, { value: '2026', label: '২০২৬' }]}
              value={year} onChange={e => setYear(e.target.value)} className="w-28" />
          </div>
          {loading ? <div className="h-40 bg-white rounded-2xl animate-pulse" /> :
            <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {['নাম', 'উপস্থিত', 'দেরি', 'অনুপস্থিত', 'কর্তন'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((w, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium">{w.name_bn}</td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">{w.present}</td>
                      <td className="px-4 py-3 text-amber-600 font-semibold">{w.late}</td>
                      <td className="px-4 py-3 text-red-600 font-semibold">{w.absent}</td>
                      <td className="px-4 py-3 text-red-500">৳{parseInt(w.total_deduction || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </div>
      )}
    </div>
  )
}

// ============================================================
// Manager Customers Page
// ============================================================
export function ManagerCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')

  useEffect(() => {
    api.get('/customers')
      .then(res => setCustomers(res.data.data))
      .catch(() => toast.error('তথ্য আনতে সমস্যা।'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = customers.filter(c =>
    c.shop_name?.includes(search) || c.owner_name?.includes(search) || c.customer_code?.includes(search)
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">কাস্টমার</h1>
        <span className="text-sm text-gray-500">মোট: {customers.length}</span>
      </div>

      <Input placeholder="দোকান বা মালিকের নাম" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? <div className="h-40 bg-white rounded-2xl animate-pulse" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card key={c.id}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {c.shop_photo ? <img src={c.shop_photo} alt="" className="w-full h-full object-cover" /> : <span className="text-xl">🏪</span>}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{c.shop_name}</p>
                  <p className="text-xs text-gray-500">{c.owner_name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{c.customer_code}</p>
                  {parseFloat(c.current_credit) > 0 && (
                    <p className="text-xs text-red-600 mt-1">বকেয়া: ৳{parseFloat(c.current_credit).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Manager Routes Page
// ============================================================
export function ManagerRoutes() {
  const [routes,   setRoutes]   = useState([])
  const [pending,  setPending]  = useState([])   // SR-এর অনুমোদন-অপেক্ষায় রুট
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('active')  // 'active' | 'pending'
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState({ name: '', description: '' })
  const [saving,   setSaving]   = useState(false)
  const [processing, setProcessing] = useState({})  // { [id]: 'approving'|'rejecting' }

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/routes'),
      api.get('/routes/pending/list'),
    ]).then(([routeRes, pendingRes]) => {
      setRoutes(routeRes.data.data || [])
      setPending(pendingRes.data.data || [])
    }).catch(() => toast.error('তথ্য আনতে সমস্যা হয়েছে।'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.name.trim()) return toast.error('রুটের নাম দিন।')
    setSaving(true)
    try {
      await api.post('/routes', form)
      toast.success('রুট তৈরি হয়েছে।')
      setModal(false)
      setForm({ name: '', description: '' })
      load()
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const approve = async (id, name) => {
    setProcessing(p => ({ ...p, [id]: 'approving' }))
    try {
      await api.put(`/routes/${id}`, { status: 'approved', is_active: true })
      toast.success(`"${name}" অনুমোদন হয়েছে ✅`)
      setPending(prev => prev.filter(r => r.id !== id))
      load()  // active list রিফ্রেশ
    } catch { toast.error('অনুমোদনে সমস্যা হয়েছে।') }
    finally { setProcessing(p => ({ ...p, [id]: undefined })) }
  }

  const reject = async (id, name) => {
    setProcessing(p => ({ ...p, [id]: 'rejecting' }))
    try {
      await api.put(`/routes/${id}`, { status: 'rejected', is_active: false })
      toast.success(`"${name}" বাতিল করা হয়েছে।`)
      setPending(prev => prev.filter(r => r.id !== id))
    } catch { toast.error('বাতিলে সমস্যা হয়েছে।') }
    finally { setProcessing(p => ({ ...p, [id]: undefined })) }
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">রুট ব্যবস্থাপনা</h1>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl text-sm font-semibold">
          + নতুন রুট
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors
            ${tab === 'active' ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          সক্রিয় রুট ({routes.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`relative px-4 py-2 rounded-xl text-sm font-semibold transition-colors
            ${tab === 'pending' ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          SR আবেদন
          {pending.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-500 text-white text-[10px] flex items-center justify-center font-bold">
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {loading ? <div className="h-40 bg-white rounded-2xl animate-pulse" /> : (
        <>
          {/* ── Active routes tab ── */}
          {tab === 'active' && (
            routes.length === 0
              ? <p className="text-center text-gray-400 py-10">কোনো সক্রিয় রুট নেই।</p>
              : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {routes.map(r => (
                    <Card key={r.id}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">🗺️</div>
                        <div>
                          <p className="font-bold text-gray-800">{r.name}</p>
                          {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                          <div className="flex gap-3 mt-2 text-xs text-gray-400">
                            <span>SR: {r.worker_count || 0}</span>
                            <span>দোকান: {r.customer_count || 0}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
          )}

          {/* ── Pending requests tab ── */}
          {tab === 'pending' && (
            pending.length === 0
              ? <div className="text-center py-10 text-gray-400">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-sm">কোনো অনুমোদন-অপেক্ষায় আবেদন নেই।</p>
                </div>
              : <div className="space-y-3">
                  <p className="text-xs text-gray-400 px-1">
                    নিচের রুটগুলো SR দের পাঠানো request। অনুমোদন না দেওয়া পর্যন্ত SR-এর রুট তালিকায় দেখা যাবে না।
                  </p>
                  {pending.map(r => (
                    <Card key={r.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-xl flex-shrink-0">📍</div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 truncate">{r.name}</p>
                            {r.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{r.description}</p>}
                            <p className="text-xs text-gray-400 mt-1">
                              আবেদনকারী: <span className="font-medium text-gray-600">{r.requested_by_name || '—'}</span>
                            </p>
                            <p className="text-xs text-gray-300">
                              {new Date(r.requested_at || r.created_at).toLocaleString('bn-BD')}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => approve(r.id, r.name)}
                            disabled={!!processing[r.id]}
                            className="px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded-lg disabled:opacity-60 flex items-center gap-1"
                          >
                            {processing[r.id] === 'approving'
                              ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : '✅'} অনুমোদন
                          </button>
                          <button
                            onClick={() => reject(r.id, r.name)}
                            disabled={!!processing[r.id]}
                            className="px-3 py-1.5 bg-red-100 text-red-600 text-xs font-semibold rounded-lg disabled:opacity-60 flex items-center gap-1"
                          >
                            {processing[r.id] === 'rejecting'
                              ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                              : '✗'} বাতিল
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
          )}
        </>
      )}

      {/* ── নতুন রুট Modal (Manager সরাসরি তৈরি করবে) ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-lg mb-4">নতুন রুট</h3>
            <div className="space-y-3">
              <Input label="রুটের নাম" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <Input label="বিবরণ" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">বাতিল</button>
              <button onClick={save} disabled={saving}
                className="px-4 py-2 text-sm bg-secondary text-white rounded-xl font-semibold disabled:opacity-60">
                {saving ? 'সেভ হচ্ছে...' : 'সেভ করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ManagerAttendance
