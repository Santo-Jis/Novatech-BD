import { useState, useRef, useEffect } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/auth.store'
import toast from 'react-hot-toast'
import { FiSend, FiCpu, FiRefreshCw } from 'react-icons/fi'

const QUICK_QUESTIONS = [
  'আজকের বিক্রয় কেমন?',
  'কোন SR সবচেয়ে ভালো পারফর্ম করছে?',
  'বকেয়া কমানোর পরামর্শ দাও',
  'এই মাসের টার্গেট অর্জন সম্ভব?',
  'কোন রুটে বিক্রয় কম?',
  'কর্মী অনুপস্থিতি কমাতে কী করা উচিত?',
]

export default function AIChat() {
  const { user }         = useAuthStore()
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `আস্সালামু আলাইকুম ${user?.name_bn}! আমি NovaTech BD এর AI ম্যানেজার। ব্যবসার যেকোনো প্রশ্ন করুন।`
  }])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef              = useRef(null)
  const inputRef               = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    setInput('')
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = messages.slice(-6)
      const res = await api.post('/ai/chat', { message: msg, history })
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.data.reply }])
    } catch (err) {
      const errMsg = err.response?.data?.message || 'AI চ্যাটে সমস্যা হয়েছে।'
      toast.error(errMsg)
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${errMsg}` }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: `নতুন কথোপকথন শুরু হলো। কী জানতে চান?` }])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center shadow-md">
            <FiCpu className="text-white text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">AI ম্যানেজার চ্যাট</h1>
            <p className="text-xs text-gray-400">AI · রিয়েল-টাইম ব্যবসায়িক পরামর্শ</p>
          </div>
        </div>
        <button onClick={clearChat} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
          <FiRefreshCw className="text-xs" /> নতুন চ্যাট
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2 pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                <FiCpu className="text-white text-sm" />
              </div>
            )}
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-br-sm'
                : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-slate-700 rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-gray-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 mt-1 text-sm font-bold text-gray-600 dark:text-gray-300">
                {user?.name_bn?.[0]}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center flex-shrink-0 mt-1">
              <FiCpu className="text-white text-sm animate-pulse" />
            </div>
            <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm">
              <div className="flex gap-1.5 items-center h-5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 2 && (
        <div className="flex-shrink-0 py-3">
          <p className="text-xs text-gray-400 mb-2 font-medium">দ্রুত প্রশ্ন:</p>
          <div className="flex gap-2 flex-wrap">
            {QUICK_QUESTIONS.map(q => (
              <button key={q} onClick={() => send(q)}
                className="text-xs px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 pt-3 border-t border-gray-100 dark:border-slate-700">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="যেকোনো প্রশ্ন করুন... (Enter পাঠান)"
            rows={1}
            className="flex-1 resize-none border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary dark:focus:border-blue-500 transition-colors"
            style={{ minHeight: '44px', maxHeight: '120px' }}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
          />
          <button onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-11 h-11 rounded-xl bg-primary dark:bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary-dark transition-colors shadow-md flex-shrink-0">
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <FiSend className="text-sm" />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
