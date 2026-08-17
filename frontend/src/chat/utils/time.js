// chat/utils/time.js — MessagesTab.jsx আর ChatInbox.jsx দুই জায়গাতেই হুবহু
// একই timeAgo/clockTime ফাংশন ছিল। এক জায়গায়।

export function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'এখনই'
  if (min < 60) return `${min} মি আগে`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ঘণ্টা আগে`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'গতকাল'
  if (day < 7) return `${day} দিন আগে`
  return new Date(ts).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })
}

export function clockTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
}

// টাইপিং/স্টেল-প্রেজেন্স চেক করতে — কোনো RTDB timestamp কি "এখনো তাজা" (n সেকেন্ডের মধ্যে)?
export function isFresh(ts, maxAgeMs) {
  if (!ts) return false
  return Date.now() - ts < maxAgeMs
}
