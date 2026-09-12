// chat/components/CannedResponsePicker.jsx
//
// ধাপ ২ (Foundation) — Canned Responses picker। AttachMenu.jsx/ThreadOptionsMenu.jsx-এর
// একই dropdown প্যাটার্ন। Composer-এর leadingAction-এ বসে (AttachMenu-এর পাশে)।
//
// ⚠️ create/delete UI সব staff-কেই দেখানো হচ্ছে, role-নির্বিশেষে — ঠিক
// ThreadOptionsMenu.jsx-এর unblock বাটনের মতোই একই সীমাবদ্ধতা (component tree-তে
// role তথ্য pass করা হয়নি)। ব্যাকএন্ড isManagement দিয়ে আসল গেট করে, non-management
// staff চেষ্টা করলে সার্ভারের এরর মেসেজ দেখবে।

import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { FiZap, FiPlus, FiTrash2, FiX, FiSearch } from 'react-icons/fi'

export default function CannedResponsePicker({ chatApi, onInsert, accent }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null) // null = লোড হয়নি এখনো
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const loadItems = async () => {
    try {
      const data = await chatApi.listCannedResponses()
      setItems(data)
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'লোড করা যায়নি')
      setItems([])
    }
  }

  const handleOpen = () => {
    setOpen(true)
    if (items === null) loadItems()
  }

  const close = () => {
    setOpen(false)
    setAdding(false)
    setFilter('')
    setError('')
    setNewTitle('')
    setNewBody('')
  }

  const handlePick = (body) => {
    onInsert(body)
    close()
  }

  const handleCreate = async () => {
    if (!newTitle.trim() || !newBody.trim()) {
      setError('টাইটেল ও লেখা দুটোই দিন')
      return
    }
    setBusy(true)
    setError('')
    try {
      const created = await chatApi.createCannedResponse(newTitle.trim(), newBody.trim())
      setItems((prev) => [...(prev || []), created].sort((a, b) => a.title.localeCompare(b.title)))
      setAdding(false)
      setNewTitle('')
      setNewBody('')
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'তৈরি করা যায়নি')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    try {
      await chatApi.deleteCannedResponse(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (e2) {
      setError(e2?.response?.data?.message || e2.message || 'মুছে ফেলা যায়নি')
    }
  }

  const filtered = (items || []).filter(
    (i) => !filter.trim() || i.title.toLowerCase().includes(filter.toLowerCase()) || i.body.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="relative flex-shrink-0" ref={boxRef}>
      <button
        onClick={() => (open ? close() : handleOpen())}
        type="button"
        aria-label="দ্রুত রিপ্লাই"
        className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90',
          open ? (accent === 'warmth' ? 'bg-cp-warmth-600 text-white' : 'bg-cp-trust-500 text-white') : 'text-cp-text-secondary hover:bg-cp-bg-alt'
        )}
      >
        <FiZap size={17} />
      </button>

      {open && (
        <div className="absolute bottom-11 left-0 w-72 max-h-96 flex flex-col bg-white rounded-2xl border border-cp-border shadow-lg overflow-hidden z-20">
          {!adding ? (
            <>
              <div className="p-2 border-b border-cp-border flex items-center gap-1.5">
                <FiSearch size={13} className="text-cp-text-muted flex-shrink-0 ml-1" />
                <input
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="খুঁজুন..."
                  className="flex-1 text-[12.5px] px-1 py-1.5 bg-transparent outline-none"
                />
                <button onClick={() => setAdding(true)} type="button" aria-label="নতুন টেমপ্লেট" className="p-1.5 rounded-lg hover:bg-cp-bg-alt text-cp-text-secondary flex-shrink-0">
                  <FiPlus size={15} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
                {items === null && <p className="text-[12px] text-cp-text-muted text-center py-6">লোড হচ্ছে...</p>}
                {items !== null && filtered.length === 0 && (
                  <p className="text-[12px] text-cp-text-muted text-center py-6">কোনো টেমপ্লেট নেই</p>
                )}
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handlePick(item.body)}
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-cp-bg-alt border-b border-cp-border last:border-0 group flex items-start gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-cp-text-primary truncate">{item.title}</p>
                      <p className="text-[11.5px] text-cp-text-secondary line-clamp-1">{item.body}</p>
                    </div>
                    <span
                      onClick={(e) => handleDelete(item.id, e)}
                      role="button"
                      aria-label="মুছুন"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-cp-text-muted hover:text-cp-error flex-shrink-0"
                    >
                      <FiTrash2 size={12} />
                    </span>
                  </button>
                ))}
              </div>
              {error && <p className="text-[11px] text-cp-error px-3 py-1.5 border-t border-cp-border">{error}</p>}
            </>
          ) : (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-semibold text-cp-text-primary">নতুন টেমপ্লেট</p>
                <button onClick={() => setAdding(false)} type="button" aria-label="বাতিল"><FiX size={15} className="text-cp-text-secondary" /></button>
              </div>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="টাইটেল (যেমন: ডেলিভারি আপডেট)"
                className="w-full text-[12.5px] px-2.5 py-2 rounded-lg border border-cp-border mb-2 focus:outline-none focus:ring-1 focus:ring-cp-trust-500"
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="মেসেজের লেখা"
                rows={3}
                className="w-full text-[12.5px] px-2.5 py-2 rounded-lg border border-cp-border mb-2 resize-none focus:outline-none focus:ring-1 focus:ring-cp-trust-500"
              />
              {error && <p className="text-[11px] text-cp-error mb-2">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={busy}
                type="button"
                className={clsx(
                  'w-full py-2 rounded-lg text-white text-[12.5px] font-medium disabled:opacity-50',
                  accent === 'warmth' ? 'bg-cp-warmth-600' : 'bg-cp-trust-500'
                )}
              >
                {busy ? 'যোগ হচ্ছে...' : 'যোগ করুন'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
