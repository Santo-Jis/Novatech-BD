// chat/components/ThreadOptionsMenu.jsx
//
// ধাপ ২ (Foundation) — Block/Report কেবাব মেনু। AttachMenu.jsx-এর ঠিক একই
// dropdown প্যাটার্ন (click-outside ref, absolute positioning), শুধু
// হেডারে বসে বলে নিচের দিকে খোলে (উপরের দিকে না)।
//
// ⚠️ unblock বাটন role-নির্বিশেষে সব staff-কে দেখানো হচ্ছে (এই কম্পোনেন্ট
// পর্যন্ত ইউজারের role/permission তথ্য pass করা হয়নি, ChatInbox.jsx-এর
// component tree ঘেঁটে সেটা আনা এই কাজের স্কোপের বাইরে রাখা হলো) — ব্যাকএন্ড
// isManagement মিডলওয়্যার দিয়ে আসল অনুমতি-চেক করে, অনুমতি না থাকলে সার্ভারের
// এরর মেসেজটাই দেখানো হয়। Management না হলে বাটন দেখা যাবে কিন্তু চাপলে
// "অনুমতি নেই" জাতীয় এরর আসবে — perfect না, কিন্তু নিরাপদ (সার্ভার-সাইড গেট
// অক্ষত), আর ভবিষ্যতে role prop যোগ করে সহজেই সূক্ষ্ম করা যাবে।

import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { FiMoreVertical, FiSlash, FiFlag, FiX, FiCheck } from 'react-icons/fi'

const REPORT_CATEGORIES = [
  { value: 'abusive', label: 'অপব্যবহার' },
  { value: 'spam', label: 'স্প্যাম' },
  { value: 'harassment', label: 'হয়রানি' },
  { value: 'other', label: 'অন্যান্য' },
]

export default function ThreadOptionsMenu({ chatApi, threadId, blocked, canUnblock = true, accent, myName }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('menu') // 'menu' | 'block-confirm' | 'report-form'
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('') // 'blocked' | 'unblocked' | 'reported' — সংক্ষিপ্ত সময়ের জন্য দেখানো হয়
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) closeAll()
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const closeAll = () => {
    setOpen(false)
    setView('menu')
    setError('')
    setReason('')
    setCategory('')
    setNote('')
  }

  const flashDone = (what) => {
    setDone(what)
    closeAll()
    setTimeout(() => setDone(''), 2500)
  }

  const handleBlock = async () => {
    setBusy(true)
    setError('')
    try {
      await chatApi.blockThread(threadId, reason || undefined, myName)
      flashDone('blocked')
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'ব্লক করা যায়নি')
    } finally {
      setBusy(false)
    }
  }

  const handleUnblock = async () => {
    setBusy(true)
    setError('')
    try {
      await chatApi.unblockThread(threadId)
      flashDone('unblocked')
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'আনব্লক করা যায়নি')
    } finally {
      setBusy(false)
    }
  }

  const handleReport = async () => {
    if (!category) {
      setError('একটা ক্যাটাগরি বেছে নিন')
      return
    }
    setBusy(true)
    setError('')
    try {
      await chatApi.reportThread(threadId, category, note || undefined, undefined, myName)
      flashDone('reported')
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'রিপোর্ট পাঠানো যায়নি')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-cp-success px-2">
        <FiCheck size={13} />
        {done === 'blocked' && 'ব্লক করা হয়েছে'}
        {done === 'unblocked' && 'আনব্লক করা হয়েছে'}
        {done === 'reported' && 'রিপোর্ট পাঠানো হয়েছে'}
      </span>
    )
  }

  return (
    <div className="relative flex-shrink-0" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label="থ্রেড অপশন"
        className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90',
          open ? (accent === 'warmth' ? 'bg-cp-warmth-600 text-white' : 'bg-cp-trust-500 text-white') : 'text-cp-text-secondary hover:bg-cp-bg-alt'
        )}
      >
        <FiMoreVertical size={17} />
      </button>

      {open && (
        <div className="absolute top-11 right-0 w-64 bg-white rounded-2xl border border-cp-border shadow-lg overflow-hidden z-20">
          {view === 'menu' && (
            <>
              {blocked ? (
                canUnblock && (
                  <button
                    onClick={handleUnblock}
                    disabled={busy}
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-cp-bg-alt disabled:opacity-50"
                  >
                    <span className="w-7 h-7 rounded-lg bg-cp-success/10 text-cp-success flex items-center justify-center flex-shrink-0">
                      <FiSlash size={13} />
                    </span>
                    <span className="text-[13px] font-medium text-cp-text-primary">আনব্লক করুন</span>
                    {busy && <span className="ml-auto w-3.5 h-3.5 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />}
                  </button>
                )
              ) : (
                <button
                  onClick={() => setView('block-confirm')}
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-cp-bg-alt"
                >
                  <span className="w-7 h-7 rounded-lg bg-cp-error/10 text-cp-error flex items-center justify-center flex-shrink-0">
                    <FiSlash size={13} />
                  </span>
                  <span className="text-[13px] font-medium text-cp-text-primary">ব্লক করুন</span>
                </button>
              )}
              <button
                onClick={() => setView('report-form')}
                type="button"
                className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-cp-bg-alt border-t border-cp-border"
              >
                <span className="w-7 h-7 rounded-lg bg-cp-warning-bg text-cp-warning flex items-center justify-center flex-shrink-0">
                  <FiFlag size={13} />
                </span>
                <span className="text-[13px] font-medium text-cp-text-primary">রিপোর্ট করুন</span>
              </button>
            </>
          )}

          {view === 'block-confirm' && (
            <div className="p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-semibold text-cp-text-primary">এই কথোপকথন ব্লক করবেন?</p>
                <button onClick={() => setView('menu')} type="button" aria-label="বাতিল"><FiX size={15} className="text-cp-text-secondary" /></button>
              </div>
              <p className="text-[11.5px] text-cp-text-secondary mb-2">ব্লক করলে দুই পক্ষই নতুন মেসেজ পাঠাতে পারবে না, আনব্লক না হওয়া পর্যন্ত।</p>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="কারণ (ঐচ্ছিক)"
                className="w-full text-[12.5px] px-2.5 py-2 rounded-lg border border-cp-border mb-2 focus:outline-none focus:ring-1 focus:ring-cp-trust-500"
              />
              {error && <p className="text-[11px] text-cp-error mb-2">{error}</p>}
              <button
                onClick={handleBlock}
                disabled={busy}
                type="button"
                className="w-full py-2 rounded-lg bg-cp-error text-white text-[12.5px] font-medium disabled:opacity-50"
              >
                {busy ? 'ব্লক করা হচ্ছে...' : 'ব্লক করুন'}
              </button>
            </div>
          )}

          {view === 'report-form' && (
            <div className="p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-semibold text-cp-text-primary">রিপোর্ট করুন</p>
                <button onClick={() => setView('menu')} type="button" aria-label="বাতিল"><FiX size={15} className="text-cp-text-secondary" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {REPORT_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    type="button"
                    className={clsx(
                      'px-2.5 py-1.5 rounded-full text-[11.5px] font-medium border',
                      category === c.value
                        ? 'bg-cp-trust-500 text-white border-cp-trust-500'
                        : 'border-cp-border text-cp-text-secondary hover:bg-cp-bg-alt'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="বিস্তারিত (ঐচ্ছিক)"
                rows={2}
                className="w-full text-[12.5px] px-2.5 py-2 rounded-lg border border-cp-border mb-2 resize-none focus:outline-none focus:ring-1 focus:ring-cp-trust-500"
              />
              {error && <p className="text-[11px] text-cp-error mb-2">{error}</p>}
              <button
                onClick={handleReport}
                disabled={busy}
                type="button"
                className="w-full py-2 rounded-lg bg-cp-warning text-white text-[12.5px] font-medium disabled:opacity-50"
              >
                {busy ? 'পাঠানো হচ্ছে...' : 'রিপোর্ট পাঠান'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
