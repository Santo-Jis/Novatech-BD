// frontend/src/pages/customer/CustomerAIChat.jsx
// Customer AI Chat — Sales + Company Support
// Security: শুধু নিজের data দেখতে পাবে — backend-এ JWT-bound

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// ── Portal JWT helper ──────────────────────────────────────────
function getPortalJWT() {
  const key = Object.keys(localStorage).find(k => k.startsWith('portal_jwt_'))
  return key ? localStorage.getItem(key) : null
}

async function portalPost(path, body) {
  const jwt = getPortalJWT()
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'সমস্যা হয়েছে।')
  return data
}

async function portalGet(path) {
  const jwt = getPortalJWT()
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'সমস্যা হয়েছে।')
  return data
}

// ── Quick suggestions — role-specific ─────────────────────────
const QUICK_QUESTIONS = [
  { text: 'আমার বাকি কত?',              emoji: '💳' },
  { text: 'সাম্প্রতিক কেনাকাটা দেখাও', emoji: '🧾' },
  { text: 'এই মাসে কত কিনেছি?',         emoji: '📊' },
  { text: 'SR-এর নম্বর কত?',            emoji: '📞' },
  { text: 'আমার অর্ডার কোথায়?',         emoji: '📦' },
  { text: 'পণ্যের দাম জানতে চাই',       emoji: '🏷️' },
]

// ── Message bubble ─────────────────────────────────────────────
function MessageBubble({ msg, customerInfo }) {
  const isUser = msg.role === 'user'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      gap: 10,
      marginBottom: 16,
      animation: 'msg-in 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {/* AI Avatar */}
      {!isUser && (
        <div style={{
          width: 36, height: 36, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, marginTop: 2,
          boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
        }}>🤖</div>
      )}

      {/* Bubble */}
      <div style={{
        maxWidth: '78%',
        padding: '12px 16px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser
          ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
          : 'rgba(15,23,42,0.8)',
        border: isUser
          ? 'none'
          : '1px solid rgba(99,102,241,0.2)',
        color: isUser ? '#fff' : '#e2e8f0',
        fontSize: 14,
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        backdropFilter: 'blur(12px)',
        boxShadow: isUser
          ? '0 4px 20px rgba(99,102,241,0.35)'
          : '0 2px 16px rgba(0,0,0,0.3)',
      }}>
        {msg.content}

        {msg.time && (
          <div style={{ fontSize: 10, color: isUser ? 'rgba(255,255,255,0.5)' : '#475569', marginTop: 6 }}>
            {msg.time}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div style={{
          width: 36, height: 36, borderRadius: 12, flexShrink: 0,
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 800, color: '#a5b4fc', marginTop: 2,
        }}>
          {(customerInfo?.shop_name || 'C')[0].toUpperCase()}
        </div>
      )}
    </div>
  )
}

// ── Typing indicator ───────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 12, flexShrink: 0,
        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
      }}>🤖</div>
      <div style={{
        padding: '14px 18px',
        borderRadius: '18px 18px 18px 4px',
        background: 'rgba(15,23,42,0.8)',
        border: '1px solid rgba(99,102,241,0.2)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#6366f1',
            animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function CustomerAIChat() {
  const navigate = useNavigate()

  // Customer info from JWT
  const [customerInfo, setCustomerInfo] = useState({})
  useEffect(() => {
    try {
      const key = Object.keys(localStorage).find(k => k.startsWith('portal_jwt_'))
      if (!key) { navigate('/login', { replace: true }); return }
      const jwt = localStorage.getItem(key)
      const decoded = JSON.parse(atob(jwt.split('.')[1]))
      setCustomerInfo(decoded)
    } catch { navigate('/login', { replace: true }) }
  }, [navigate])

  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [historyLoaded, setHistLoaded]= useState(false)
  const bottomRef                     = useRef(null)
  const inputRef                      = useRef(null)

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Load recent history + welcome message
  useEffect(() => {
    if (!customerInfo.shop_name || historyLoaded) return
    setHistLoaded(true)

    const welcome = {
      role: 'assistant',
      content: `আস্সালামু আলাইকুম! 👋\n\n${customerInfo.shop_name || 'আপনাকে'} স্বাগতম।\n\nআমি আপনার ব্যক্তিগত সহকারী — কেনাকাটার তথ্য, বাকি, পেমেন্ট বা SR-এর সাথে যোগাযোগ — যেকোনো বিষয়ে সাহায্য করতে পারি।\n\nকী জানতে চান? 😊`,
      time: null,
    }

    // Recent history আনো
    portalGet('/portal/ai-chat/history?limit=10')
      .then(res => {
        const hist = (res.data || []).flatMap(row => [
          { role: 'user',      content: row.message, time: row.time },
          { role: 'assistant', content: row.reply,   time: null },
        ])
        setMessages(hist.length > 0 ? [...hist] : [welcome])
      })
      .catch(() => setMessages([welcome]))
  }, [customerInfo, historyLoaded])

  // Send message
  const send = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    setInput('')
    const userMsg = { role: 'user', content: msg, time: null }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const recentHistory = messages.slice(-8).map(m => ({
        role: m.role, content: m.content
      }))

      const res = await portalPost('/portal/ai-chat', {
        message: msg,
        history: recentHistory,
      })

      const aiMsg = {
        role:    'assistant',
        content: res.data.reply,
        time:    null,
      }
      setMessages(prev => [...prev, aiMsg])

    } catch (err) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: `❌ ${err.message || 'সমস্যা হয়েছে। আবার চেষ্টা করুন।'}`,
        time:    null,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [input, loading, messages])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const clearChat = () => {
    setHistLoaded(false)
    setMessages([])
    setTimeout(() => setHistLoaded(false), 50)
  }

  const isNewChat = messages.length <= 1

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 140px)', // header + bottom nav বাদ
      padding: '0 0 0',
    }}>
      <style>{`
        @keyframes msg-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes typing-dot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%       { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes quick-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .quick-btn:active { transform: scale(0.95); }
        .send-btn:active  { transform: scale(0.92); }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 8px',
        borderBottom: '1px solid rgba(99,102,241,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          }}>🤖</div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>
              AI সহকারী
            </p>
            <p style={{ margin: 0, fontSize: 11, color: '#4ade80' }}>
              ● সক্রিয়
            </p>
          </div>
        </div>

        {/* New Chat button */}
        <button
          onClick={clearChat}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 10,
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.25)',
            color: '#a5b4fc', fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ✏️ নতুন চ্যাট
        </button>
      </div>

      {/* ── Security badge ──────────────────────────────────── */}
      <div style={{
        margin: '8px 16px 0',
        padding: '7px 12px',
        borderRadius: 10,
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.2)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13 }}>🔒</span>
        <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
          শুধু আপনার তথ্য দেখানো হয় — সম্পূর্ণ নিরাপদ
        </span>
      </div>

      {/* ── Messages ────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex', flexDirection: 'column',
      }}>
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} customerInfo={customerInfo} />
        ))}

        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick Suggestions — শুধু নতুন chat-এ ────────────── */}
      {isNewChat && !loading && (
        <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: '#475569', marginBottom: 8, fontWeight: 600 }}>
            দ্রুত প্রশ্ন করুন:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={q.text}
                className="quick-btn"
                onClick={() => send(q.text)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 12px', borderRadius: 20,
                  background: 'rgba(99,102,241,0.1)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  color: '#a5b4fc', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  animation: `quick-in 0.35s ease ${i * 60}ms backwards`,
                  transition: 'all 0.2s',
                }}
              >
                <span>{q.emoji}</span>
                <span>{q.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input Area ──────────────────────────────────────── */}
      <div style={{
        padding: '8px 12px 12px',
        borderTop: '1px solid rgba(99,102,241,0.15)',
        background: 'rgba(2,6,23,0.6)',
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10,
          background: 'rgba(15,23,42,0.8)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 18, padding: '8px 8px 8px 14px',
          boxShadow: '0 0 0 0 rgba(99,102,241,0)',
          transition: 'box-shadow 0.2s',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="যেকোনো প্রশ্ন করুন..."
            rows={1}
            style={{
              flex: 1, resize: 'none', border: 'none', outline: 'none',
              background: 'transparent', color: '#e2e8f0', fontSize: 14,
              lineHeight: 1.6, minHeight: 24, maxHeight: 100,
              fontFamily: 'inherit',
            }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
            }}
          />

          <button
            className="send-btn"
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: input.trim() && !loading
                ? 'linear-gradient(135deg, #6366f1, #7c3aed)'
                : 'rgba(99,102,241,0.15)',
              border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, transition: 'all 0.2s',
              boxShadow: input.trim() && !loading ? '0 4px 16px rgba(99,102,241,0.4)' : 'none',
            }}
          >
            {loading
              ? <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: '2.5px solid rgba(255,255,255,0.2)',
                  borderTopColor: '#fff',
                  animation: 'spin 0.7s linear infinite',
                }} />
              : '➤'
            }
          </button>
        </div>

        <p style={{
          textAlign: 'center', fontSize: 10, color: '#334155',
          margin: '6px 0 0',
        }}>
          AI উত্তর সবসময় সঠিক নাও হতে পারে • গুরুত্বপূর্ণ বিষয়ে SR-এর সাথে যোগাযোগ করুন
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
