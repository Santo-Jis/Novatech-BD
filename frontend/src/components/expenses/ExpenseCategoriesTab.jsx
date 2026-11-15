import { useState } from 'react'
import api from '../../api/axios'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Badge from '../ui/Badge'
import toast from 'react-hot-toast'
import { FiPlus, FiEdit2, FiCheck, FiX, FiTrash2 } from 'react-icons/fi'

// ক্যাটাগরি ব্যবস্থাপনা — নতুন যোগ, নাম বদল (আগের সব খরচেও বদলায়), বন্ধ/চালু, মোছা
export default function ExpenseCategoriesTab({ categories, onChanged }) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')

  const call = async (fn, okMsg) => {
    try {
      const { data } = await fn()
      toast.success(data?.message || okMsg)
      await onChanged()
      return true
    } catch (e) {
      toast.error(e.response?.data?.message || 'কাজটি সম্পন্ন হয়নি।')
      return false
    }
  }

  const add = async () => {
    if (!newName.trim()) return toast.error('ক্যাটাগরির নাম দিন।')
    setAdding(true)
    if (await call(() => api.post('/expense/company/categories', { name: newName.trim() }), 'যোগ হয়েছে।')) setNewName('')
    setAdding(false)
  }

  const saveRename = async (c) => {
    if (!editName.trim()) return toast.error('নাম খালি রাখা যাবে না।')
    if (editName.trim() === c.name) return setEditId(null)
    if (await call(() => api.put(`/expense/company/categories/${c.id}`, { name: editName.trim() }), 'নাম বদলেছে।')) setEditId(null)
  }

  const remove = (c) => {
    const msg = c.usage_count > 0
      ? `"${c.name}"-এ ${c.usage_count}টা খরচ আছে, তাই মুছবে না — বন্ধ হয়ে যাবে। এগিয়ে যাবেন?`
      : `"${c.name}" মুছে ফেলবেন?`
    if (window.confirm(msg)) call(() => api.delete(`/expense/company/categories/${c.id}`), 'সম্পন্ন।')
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-500">
        খরচ লেখার সময় এই তালিকা থেকে বেছে নিতে হয়, তাই একই খরচ "ভাড়া", "Rent", "দোকান ভাড়া" তিন নামে ভাগ হয় না।
        নাম বদলালে আগের সব খরচ ও রিপোর্টেও নতুন নাম দেখাবে।
      </p>

      <div className="flex gap-2 items-end">
        <Input className="flex-1" label="নতুন ক্যাটাগরি" value={newName} maxLength={100}
               onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
               placeholder="যেমন: নিরাপত্তা প্রহরী, ট্রেড লাইসেন্স" />
        <Button icon={<FiPlus />} loading={adding} onClick={add}>যোগ করুন</Button>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
        {categories.length === 0 && <div className="p-6 text-center text-sm text-gray-400">কোনো ক্যাটাগরি নেই।</div>}
        {categories.map(c => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            {editId === c.id ? (
              <>
                <Input className="flex-1" value={editName} maxLength={100} autoFocus
                       onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRename(c)} />
                <button onClick={() => saveRename(c)} className="p-2 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="সংরক্ষণ"><FiCheck /></button>
                <button onClick={() => setEditId(null)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700" title="বাতিল"><FiX /></button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <span className={c.is_active ? 'font-medium text-gray-800 dark:text-gray-100' : 'text-gray-400 line-through'}>{c.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{c.usage_count} খরচ</span>
                </div>
                {!c.is_active && <Badge variant="gray">বন্ধ</Badge>}
                <button onClick={() => { setEditId(c.id); setEditName(c.name) }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500" title="নাম বদলান"><FiEdit2 /></button>
                <button onClick={() => call(() => api.put(`/expense/company/categories/${c.id}`, { is_active: !c.is_active }), 'হালনাগাদ হয়েছে।')}
                        className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700">
                  {c.is_active ? 'বন্ধ করুন' : 'চালু করুন'}
                </button>
                <button onClick={() => remove(c)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="মুছুন"><FiTrash2 /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
