import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { FiPlus, FiTrash2, FiBell, FiClock, FiUsers } from 'react-icons/fi'

const EXPIRE_OPTIONS = [
  { value: 'forever', label: '♾️ মেয়াদহীন' },
  { value: '1',       label: '১ ঘণ্টা' },
  { value: '6',       label: '৬ ঘণ্টা' },
  { value: '24',      label: '১ দিন' },
  { value: '48',      label: '২ দিন' },
  { value: '72',      label: '৩ দিন' },
  { value: '168',     label: '১ সপ্তাহ' },
  { value: '720',     label: '১ মাস' },
]

const TARGET_OPTIONS = [
  { value: 'all',     label: '🌐 সকলের জন্য' },
  { value: 'worker',  label: '👷 শুধু কর্মীদের' },
  { value: 'manager', label: '🧑‍💼 শুধু ম্যানেজারদের' },
]

export default function AdminNotices() {
  const [notices,  setNotices]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState({ title: '', message: '', target_role: 'all', expires_in_hours: 'forever' })

  const fetchNotices = async () => {
    try {
      const res = await api.get('/notices/all')
      setNotices(res.data.data)
    } catch { toast.error('নোটিশ আনতে সমস্যা।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchNotices() }, [])

  const save = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast.error('শিরোনাম ও বার্তা দিন।')
      return
    }
    setSaving(true)
    try {
      await api.post('/notices', form)
      toast.success('নোটিশ পাঠানো হয়েছে।')
      setModal(false)
      setForm({ title: '', message: '', target_role: 'all', expires_in_hours: 'forever' })
      fetchNotices()
    } catch (err) { toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।') }
    finally { setSaving(false) }
  }

  const remove = async (id) => {
    try {
      await api.delete(`/notices/${id}`)
      toast.success('নোটিশ মুছা হয়েছে।')
      setNotices(prev => prev.filter(n => n.id !== id))
    } catch { toast.error('সমস্যা হয়েছে।') }
  }

  const isExpired = (n) => n.expires_at && new Date(n.expires_at) < new Date()
  const isActive  = (n) => n.is_active && !isExpired(n)

  const targetLabel = { all: '🌐 সকলে', worker: '👷 কর্মী', manager: '🧑‍💼 ম্যানেজার' }
  const targetColor = { all: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', worker: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">নোটিশ বোর্ড</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">কর্মী ও ম্যানেজারদের জন্য নোটিশ তৈরি করুন</p>
        </div>
        <Button icon={<FiPlus />} onClick={() => setModal(true)}>নতুন নোটিশ</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : notices.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-10">কোনো নোটিশ নেই।</p></Card>
      ) : (
        <div className="space-y-3">
          {notices.map(n => (
            <div key={n.id} className={`bg-white dark:bg-slate-800 rounded-2xl border p-4 shadow-sm transition-all ${!isActive(n) ? 'opacity-50 border-gray-100 dark:border-slate-700' : 'border-blue-100 dark:border-blue-900/40'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive(n) ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-slate-700'}`}>
                    <FiBell className={isActive(n) ? 'text-blue-600' : 'text-gray-400'} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{n.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${targetColor[n.target_role] || targetColor.all}`}>
                        {targetLabel[n.target_role]}
                      </span>
                      {!isActive(n) && <span className="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 px-2 py-0.5 rounded-full">মেয়াদ শেষ</span>}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <FiUsers className="text-xs" />
                        {n.creator_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <FiClock className="text-xs" />
                        {new Date(n.created_at).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {n.expires_at && (
                        <span className={isExpired(n) ? 'text-red-400' : 'text-amber-500'}>
                          মেয়াদ: {new Date(n.expires_at).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => remove(n.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0">
                  <FiTrash2 />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title="✏️ নতুন নোটিশ তৈরি করুন"
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>বাতিল</Button><Button onClick={save} loading={saving} icon={<FiBell />}>পাঠান</Button></>}>
        <div className="space-y-4">
          <Input label="📌 শিরোনাম *" placeholder="নোটিশের শিরোনাম" required
            value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <Textarea label="📝 বার্তা *" rows={4} placeholder="নোটিশের বিস্তারিত বার্তা লিখুন..."
            value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} />
          <Select label="👥 প্রাপক" options={TARGET_OPTIONS} value={form.target_role}
            onChange={e => setForm(p => ({ ...p, target_role: e.target.value }))} />
          <Select label="⏰ মেয়াদ" options={EXPIRE_OPTIONS} value={form.expires_in_hours}
            onChange={e => setForm(p => ({ ...p, expires_in_hours: e.target.value }))} />
        </div>
      </Modal>
    </div>
  )
}
