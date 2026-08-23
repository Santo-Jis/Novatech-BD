// chat/notes/MentionInput.jsx

import { useState, useRef } from 'react'
import { FiSend } from 'react-icons/fi'

export default function MentionInput({ value, onChange, teamMembers, posting, onSubmit }) {
  const [showList, setShowList] = useState(false)
  const [query, setQuery] = useState('')
  const [mentioned, setMentioned] = useState([]) // {id, name_bn} picked via @
  const taRef = useRef(null)

  const handleChange = (e) => {
    const v = e.target.value
    onChange(v)
    const cursorPos = e.target.selectionStart
    const match = v.slice(0, cursorPos).match(/@([^\s@]*)$/)
    if (match) {
      setQuery(match[1])
      setShowList(true)
    } else {
      setShowList(false)
    }
  }

  const pickMember = (m) => {
    const cursorPos = taRef.current.selectionStart
    const upToCursor = value.slice(0, cursorPos)
    const replaced = upToCursor.replace(/@([^\s@]*)$/, `@${m.name_bn} `)
    onChange(replaced + value.slice(cursorPos))
    setMentioned((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]))
    setShowList(false)
    taRef.current?.focus()
  }

  const filtered = teamMembers.filter((m) => (m.name_bn || '').toLowerCase().includes(query.toLowerCase())).slice(0, 5)

  const handleSubmit = () => {
    if (!value.trim() || posting) return
    const stillMentioned = mentioned.filter((m) => value.includes(`@${m.name_bn}`))
    onSubmit(value.trim(), stillMentioned.map((m) => m.id))
    setMentioned([])
  }

  return (
    <div className="relative">
      {showList && filtered.length > 0 && (
        <div className="absolute bottom-full mb-1.5 left-0 w-52 bg-white border border-cp-border rounded-xl shadow-lg overflow-hidden z-20">
          {filtered.map((m) => (
            <button key={m.id} onClick={() => pickMember(m)} type="button" className="w-full text-left px-3 py-2 hover:bg-cp-bg-alt">
              <span className="text-[13px] text-cp-text-primary">{m.name_bn}</span>
              <span className="text-cp-text-muted text-[11px] ml-1.5">{m.role}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !showList) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          rows={2}
          placeholder="নোট লিখুন, @ দিয়ে টিমমেট মেনশন করুন..."
          className="flex-1 resize-none bg-cp-bg-sunken rounded-xl px-3 py-2 text-[13px] font-cp-body outline-none border border-transparent focus:border-amber-300"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || posting}
          type="button"
          className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {posting ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <FiSend size={14} />}
        </button>
      </div>
    </div>
  )
}
