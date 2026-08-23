// chat/notes/NotesPanel.jsx
//
// অ্যাম্বার রং + লক আইকন ইচ্ছাকৃত — মূল (কাস্টমার-দৃশ্যমান) নীল/কমলা চ্যাট
// থিম থেকে স্পষ্ট আলাদা, যাতে স্টাফ ভুল করে গুলিয়ে না ফেলে এটা কাস্টমার
// দেখছে না।

import { FiLock, FiX } from 'react-icons/fi'
import { useInternalNotes } from './useInternalNotes'
import MentionInput from './MentionInput'
import { useState } from 'react'
import { timeAgo } from '../utils/time'

function NoteItem({ note }) {
  return (
    <div className="bg-amber-50/60 border border-amber-100 rounded-xl px-3.5 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[12px] font-semibold text-amber-900">{note.author_name}</p>
        <p className="text-[10.5px] text-amber-700/70">{timeAgo(new Date(note.created_at).getTime())}</p>
      </div>
      <p className="text-[13px] text-cp-text-primary whitespace-pre-wrap break-words">{note.text}</p>
    </div>
  )
}

export default function NotesPanel({ chatApi, threadId, onClose }) {
  const { notes, loading, teamMembers, posting, error, addNote } = useInternalNotes(chatApi, threadId, true)
  const [draft, setDraft] = useState('')

  const handleSubmit = async (text, mentionedIds) => {
    const ok = await addNote(text, mentionedIds)
    if (ok) setDraft('')
  }

  return (
    <div className="absolute inset-0 z-30 bg-white flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200 bg-amber-50 flex-shrink-0">
        <FiLock size={14} className="text-amber-700 flex-shrink-0" />
        <p className="font-cp-head font-semibold text-[13.5px] text-amber-900 flex-1">ইন্টারনাল নোট — কাস্টমার দেখবে না</p>
        <button onClick={onClose} type="button" aria-label="বন্ধ করুন" className="p-1.5 rounded-full hover:bg-amber-100 text-amber-700">
          <FiX size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2">
        {loading ? (
          <div className="flex justify-center pt-8">
            <span className="w-5 h-5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-center text-[12.5px] text-cp-text-muted pt-8">এখনো কোনো নোট নেই — টিমের জন্য প্রথম নোটটা লিখুন।</p>
        ) : (
          notes.map((n) => <NoteItem key={n.id} note={n} />)
        )}
      </div>

      <div className="border-t border-cp-border p-3 flex-shrink-0">
        {error && <p className="text-[11px] text-cp-error mb-1.5">{error}</p>}
        <MentionInput value={draft} onChange={setDraft} teamMembers={teamMembers} posting={posting} onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
