// chat/services/offlineQueue.js
//
// অফলাইন-ফার্স্ট সেন্ড কিউ — মেসেজ কম্পোজার থেকে "send" চাপার সাথে সাথেই
// এখানে ঢুকে যায় (status: 'pending'), UI সাথে সাথে optimistic bubble দেখায়।
// useChatEngine ব্যাকগ্রাউন্ডে flush করে — সফল হলে queue থেকে বাদ (RTDB
// listener-এই আসল মেসেজ চলে আসবে), নেটওয়ার্ক না থাকলে/ব্যর্থ হলে retry,
// ৩ বারের পর 'failed' — ইউজার ম্যানুয়ালি retry/discard করতে পারবে।
//
// Module-level singleton + সাধারণ pub-sub, যাতে কোনো থ্রেড খোলা না থাকলেও
// (অ্যাপ ব্যাকগ্রাউন্ডে থাকলেও) queue-টা বেঁচে থাকে localStorage-এ, আর যেকোনো
// কম্পোনেন্ট subscribe করে বর্তমান অবস্থা দেখতে পারে।
//
// ⚠️ এইটা রিয়েল অ্যাপ কোড (Claude.ai artifact না) — তাই localStorage ব্যবহার
// এখানে সম্পূর্ণ নিরাপদ ও স্বাভাবিক, Capacitor WebView-তেও কাজ করে।

const STORAGE_KEY = 'zovorix_chat_offline_queue_v1'
const MAX_ATTEMPTS = 3

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // quota/private-mode ইত্যাদি — silently skip, in-memory কিউ তবু কাজ করবে চলতি সেশনে
  }
}

let queue = loadFromStorage()
const listeners = new Set()

function emit() {
  const snapshot = queue.slice()
  listeners.forEach((fn) => fn(snapshot))
}

export function subscribeQueue(fn) {
  listeners.add(fn)
  fn(queue.slice())
  return () => listeners.delete(fn)
}

export function enqueueMessage({ threadId, text, senderType, senderName }) {
  const item = {
    clientId: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    threadId,
    text,
    senderType,
    senderName,
    createdAtLocal: Date.now(),
    status: 'pending', // 'pending' | 'sending' | 'failed'
    attempts: 0,
  }
  queue = [...queue, item]
  persist(queue)
  emit()
  return item
}

export function markSending(clientId) {
  queue = queue.map((i) => (i.clientId === clientId ? { ...i, status: 'sending' } : i))
  persist(queue)
  emit()
}

export function markFailed(clientId) {
  queue = queue.map((i) =>
    i.clientId === clientId ? { ...i, status: 'failed', attempts: i.attempts + 1 } : i
  )
  persist(queue)
  emit()
}

// পাঠানো সফল হলে, বা RTDB listener-এ clientId মিলে গেলে — কিউ থেকে বাদ
export function removeFromQueue(clientId) {
  queue = queue.filter((i) => i.clientId !== clientId)
  persist(queue)
  emit()
}

// ব্যর্থ মেসেজ আবার চেষ্টা করার জন্য 'pending'-এ ফিরিয়ে আনা (attempts রিসেট হয় না, ইতিহাস থাকে)
export function retryMessage(clientId) {
  queue = queue.map((i) => (i.clientId === clientId ? { ...i, status: 'pending' } : i))
  persist(queue)
  emit()
}

export function discardMessage(clientId) {
  removeFromQueue(clientId)
}

export function getQueueForThread(threadId) {
  return queue.filter((i) => i.threadId === threadId)
}

export function getPendingClientIds() {
  return queue.filter((i) => i.status !== 'failed').map((i) => i.clientId)
}
