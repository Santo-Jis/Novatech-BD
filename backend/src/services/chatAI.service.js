// backend/src/services/chatAI.service.js
//
// চ্যাট Phase 4 — শুধু prompt-building (কোনো AI কল এখানে না, সেটা
// controller-এ callAI() দিয়ে হয়, ঠিক customerAiChat-এর প্যাটার্নের মতোই)।
//
// ⚠️ মেসেজ-হিস্ট্রি ব্যাকএন্ড RTDB থেকে টেনে আনে না — ফ্রন্টএন্ড নিজের লাইভ
// engine.messages থেকে সাম্প্রতিক N-টা পাঠায় (customerAiChat-এর history
// param-এর মতোই established প্যাটার্ন)। ব্যাকএন্ডকে নতুন করে Admin SDK দিয়ে
// RTDB পড়ার কোড লিখতে হয়নি এতে।

const MAX_MESSAGES_IN_PROMPT = 20
const MAX_MSG_LEN = 300

function formatHistory(recentMessages, customerName) {
  return recentMessages
    .slice(-MAX_MESSAGES_IN_PROMPT)
    .map((m) => {
      const who = m.senderType === 'customer' ? customerName || 'কাস্টমার' : m.senderName || 'স্টাফ'
      const text = String(m.text || '').slice(0, MAX_MSG_LEN)
      return `${who}: ${text}`
    })
    .join('\n')
}

function buildDraftReplyPrompt(recentMessages, customerName) {
  const history = formatHistory(recentMessages, customerName)
  return (
    `নিচে একটা ডিস্ট্রিবিউটর আর তাদের রিটেইল কাস্টমার "${customerName || 'কাস্টমার'}"-এর মধ্যে ` +
    `হওয়া চ্যাটের সাম্প্রতিক অংশ:\n\n${history}\n\n` +
    `স্টাফের হয়ে কাস্টমারের সর্বশেষ মেসেজের একটা সংক্ষিপ্ত, পেশাদার, বন্ধুত্বপূর্ণ বাংলা রিপ্লাই খসড়া লিখুন। ` +
    `শুধু রিপ্লাই টেক্সটটাই দিন, অন্য কোনো ব্যাখ্যা/ভূমিকা ছাড়া।`
  )
}

function buildSummaryPrompt(recentMessages, customerName) {
  const history = formatHistory(recentMessages, customerName)
  return (
    `নিচে একটা ডিস্ট্রিবিউটর আর তাদের রিটেইল কাস্টমার "${customerName || 'কাস্টমার'}"-এর মধ্যে ` +
    `হওয়া চ্যাটের কথোপকথন:\n\n${history}\n\n` +
    `এই কথোপকথনের ৩-৪ বাক্যের একটা সংক্ষিপ্ত বাংলা সারাংশ দিন — মূল বিষয়, কোনো সিদ্ধান্ত/প্রতিশ্রুতি হয়ে থাকলে সেটা, ` +
    `আর কিছু এখনো ঝুলে থাকলে (unresolved) সেটা উল্লেখ করুন।`
  )
}

function buildRiskCheckPrompt(recentMessages, customerName) {
  const history = formatHistory(recentMessages, customerName)
  return (
    `নিচে একটা ডিস্ট্রিবিউটর আর তাদের রিটেইল কাস্টমার "${customerName || 'কাস্টমার'}"-এর মধ্যে ` +
    `হওয়া চ্যাটের সাম্প্রতিক অংশ:\n\n${history}\n\n` +
    `কাস্টমারের মেসেজগুলোতে পেমেন্ট না করতে পারা/দেরি হওয়ার ইঙ্গিত (credit risk), অথবা কোনো অভিযোগ/অসন্তুষ্টি ` +
    `(complaint) আছে কিনা বিশ্লেষণ করুন।\n\n` +
    `শুধু এই JSON ফরম্যাটে উত্তর দিন, অন্য কিছু না:\n` +
    `{"detected": true/false, "flagType": "credit_risk"|"complaint"|null, "reason": "<এক লাইনে কারণ, বাংলায়>"}`
  )
}

function parseRiskCheckResponse(text) {
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/)
    if (!match) return { detected: false, flagType: null, reason: '' }
    const parsed = JSON.parse(match[0])
    if (!['credit_risk', 'complaint'].includes(parsed.flagType)) parsed.flagType = null
    return { detected: Boolean(parsed.detected && parsed.flagType), flagType: parsed.flagType, reason: String(parsed.reason || '').slice(0, 300) }
  } catch {
    return { detected: false, flagType: null, reason: '' }
  }
}

module.exports = { buildDraftReplyPrompt, buildSummaryPrompt, buildRiskCheckPrompt, parseRiskCheckResponse }
