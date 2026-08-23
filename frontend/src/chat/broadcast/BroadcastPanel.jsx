// chat/broadcast/BroadcastPanel.jsx

import { useState } from 'react'
import clsx from 'clsx'
import { FiRadio, FiX, FiCheck, FiUsers, FiSend } from 'react-icons/fi'
import { useBroadcast } from './useBroadcast'

export default function BroadcastPanel({ chatApi, db, uid, ready, senderName, onClose }) {
  const b = useBroadcast(chatApi, db, uid, ready, senderName)
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)

  const checkedCount = b.recipients.filter((r) => r.checked).length
  const withThreadCount = b.recipients.filter((r) => r.thread_id).length

  const handleSendClick = () => {
    if (!text.trim() || checkedCount === 0) return
    setConfirming(true)
  }

  const confirmSend = async () => {
    setConfirming(false)
    await b.send(text)
  }

  return (
    <div className="absolute inset-0 z-40 bg-white flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-cp-border bg-cp-bg-alt flex-shrink-0">
        <FiRadio size={15} className="text-cp-trust-600 flex-shrink-0" />
        <p className="font-cp-head font-semibold text-[14px] text-cp-text-primary flex-1">ব্রডকাস্ট — একসাথে অনেককে পাঠান</p>
        <button onClick={onClose} type="button" aria-label="বন্ধ করুন" className="p-1.5 rounded-full hover:bg-cp-bg-sunken text-cp-text-secondary">
          <FiX size={18} />
        </button>
      </div>

      {b.results ? (
        // ── ফলাফল ──
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <span className="w-14 h-14 rounded-full bg-cp-trust-100 text-cp-trust-700 flex items-center justify-center mb-3">
            <FiCheck size={26} />
          </span>
          <p className="font-cp-head font-semibold text-[16px] text-cp-text-primary">পাঠানো শেষ</p>
          <p className="text-[13.5px] text-cp-text-secondary mt-1">
            {b.results.successCount} জনের কাছে সফলভাবে পৌঁছেছে
            {b.results.failCount > 0 && <span className="text-cp-error"> · {b.results.failCount} জনের কাছে ব্যর্থ</span>}
          </p>
          <button
            onClick={onClose}
            type="button"
            className="mt-5 px-5 py-2 rounded-full bg-cp-trust-500 text-white text-[13.5px] font-medium"
          >
            বন্ধ করুন
          </button>
        </div>
      ) : b.sending ? (
        // ── প্রগ্রেস ──
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <span className="w-6 h-6 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin mb-3" />
          <p className="text-[13.5px] text-cp-text-secondary">পাঠানো হচ্ছে... {b.progress.done}/{b.progress.total}</p>
          <div className="w-48 h-1.5 rounded-full bg-cp-bg-sunken overflow-hidden mt-2">
            <div
              className="h-full bg-cp-trust-500 rounded-full transition-all"
              style={{ width: `${b.progress.total ? (b.progress.done / b.progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* রুট বাছাই */}
            <div>
              <label className="text-[12px] font-semibold text-cp-text-secondary block mb-1.5">রুট বেছে নিন</label>
              <select
                value={b.routeId}
                onChange={(e) => b.loadRecipients(e.target.value)}
                className="w-full text-[13.5px] border border-cp-border rounded-lg px-3 py-2 bg-white text-cp-text-primary"
              >
                <option value="">-- রুট বেছে নিন --</option>
                {b.routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name || r.route_name || r.id}</option>
                ))}
              </select>
            </div>

            {b.error && <p className="text-[12px] text-cp-error">{b.error}</p>}

            {/* রেসিপিয়েন্ট লিস্ট */}
            {b.loadingRecipients ? (
              <div className="flex justify-center py-6">
                <span className="w-5 h-5 border-2 border-cp-border border-t-cp-trust-500 rounded-full animate-spin" />
              </div>
            ) : b.recipients.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-cp-text-secondary flex items-center gap-1">
                    <FiUsers size={12} /> রেসিপিয়েন্ট ({checkedCount}/{withThreadCount} নির্বাচিত)
                  </label>
                </div>
                <div className="border border-cp-border rounded-xl max-h-56 overflow-y-auto divide-y divide-cp-border/60">
                  {b.recipients.map((r) => (
                    <label
                      key={r.customer_id}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-2 text-[13px]',
                        !r.thread_id ? 'opacity-50' : 'cursor-pointer hover:bg-cp-bg-alt'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={r.checked}
                        disabled={!r.thread_id}
                        onChange={() => b.toggleRecipient(r.customer_id)}
                        className="accent-cp-trust-500"
                      />
                      <span className="flex-1 text-cp-text-primary">{r.shop_name || r.owner_name}</span>
                      {!r.thread_id && <span className="text-[10.5px] text-cp-text-muted">থ্রেড নেই</span>}
                    </label>
                  ))}
                </div>
              </div>
            ) : b.routeId ? (
              <p className="text-[12.5px] text-cp-text-muted text-center py-4">এই রুটে কোনো কাস্টমার নেই</p>
            ) : null}

            {/* মেসেজ */}
            {b.recipients.length > 0 && (
              <div>
                <label className="text-[12px] font-semibold text-cp-text-secondary block mb-1.5">মেসেজ</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder="যা পাঠাতে চান লিখুন — সবার থ্রেডে একই মেসেজ যাবে..."
                  className="w-full resize-none bg-cp-bg-sunken rounded-xl px-3 py-2.5 text-[13.5px] font-cp-body outline-none border border-transparent focus:border-cp-border-focus"
                />
              </div>
            )}
          </div>

          {b.recipients.length > 0 && (
            <div className="border-t border-cp-border p-3 flex-shrink-0">
              {confirming ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[12.5px] text-cp-text-secondary">{checkedCount} জনকে পাঠানো হবে, নিশ্চিত?</p>
                  <button onClick={() => setConfirming(false)} type="button" className="px-3 py-1.5 rounded-full text-[12.5px] text-cp-text-secondary border border-cp-border">
                    বাতিল
                  </button>
                  <button onClick={confirmSend} type="button" className="px-3 py-1.5 rounded-full text-[12.5px] font-medium text-white bg-cp-trust-500">
                    হ্যাঁ, পাঠান
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSendClick}
                  disabled={!text.trim() || checkedCount === 0}
                  type="button"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-cp-trust-500 text-white text-[13.5px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FiSend size={14} /> {checkedCount} জনকে পাঠান
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
