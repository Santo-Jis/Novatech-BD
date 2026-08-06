// utils/companyColor.js
// ✅ NEW (পার্ট ২ — কোম্পানি ভিজ্যুয়াল ট্যাগ সিস্টেম)
//
// প্রতিটা কোম্পানির জন্য একটা সামঞ্জস্যপূর্ণ (deterministic), আলাদা রঙ —
// একই কোম্পানি সবসময় একই রঙ পাবে, পুরো অ্যাপ জুড়ে (ইনভয়েস, ক্রেডিট,
// পেমেন্ট, অভিযোগ, রিটার্ন, সামারি — সবখানে)। cp- ব্র্যান্ড রঙ থেকে
// (trust=নীল/confidence=সবুজ/warmth=কমলা, যেগুলো UI স্ট্যাটাস বোঝাতে
// ব্যবহৃত হয়) ইচ্ছাকৃতভাবে আলাদা প্যালেট — "এই রঙ মানে কোন কোম্পানি"
// আর "এই রঙ মানে কী স্ট্যাটাস (সফল/সতর্কতা)" যাতে না গুলিয়ে যায়।
//
// ⚠️ গুরুত্বপূর্ণ: Tailwind-এর JIT কম্পাইলার সোর্স কোডে যে ক্লাস-নেম
// স্ট্রিং literal ভাবে খুঁজে পায়, শুধু সেগুলোই CSS বানায়। তাই
// `bg-${colorName}-500` -এর মতো টেমপ্লেট-লিটারেলে ডাইনামিকভাবে ক্লাস-নেম
// জোড়া লাগানো কাজ করবে না (production build-এ চুপচাপ স্টাইল হারিয়ে
// যাবে)। এই কারণেই নিচের পুরো প্যালেট আগে থেকেই fully-written ক্লাস-
// স্ট্রিং হিসেবে রাখা — শুধু ইনডেক্স দিয়ে বেছে নেওয়া হয়, ক্লাস-নেম
// রানটাইমে তৈরি করা হয় না।

const PALETTE = [
  { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/25',  text: 'text-indigo-700',  dot: 'bg-indigo-500' },
  { bg: 'bg-rose-500/10',    border: 'border-rose-500/25',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  { bg: 'bg-teal-500/10',    border: 'border-teal-500/25',    text: 'text-teal-700',    dot: 'bg-teal-500' },
  { bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  { bg: 'bg-purple-500/10',  border: 'border-purple-500/25',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  { bg: 'bg-cyan-600/10',    border: 'border-cyan-600/25',    text: 'text-cyan-700',    dot: 'bg-cyan-600' },
  { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/25', text: 'text-fuchsia-700', dot: 'bg-fuchsia-500' },
  { bg: 'bg-lime-600/10',    border: 'border-lime-600/25',    text: 'text-lime-700',    dot: 'bg-lime-600' },
]

// ছোট, দ্রুত স্ট্রিং হ্যাশ (djb2-ধাঁচের) — ক্রিপ্টোগ্রাফিক নিরাপত্তার
// দরকার নেই, শুধু consistent ইনডেক্স বেছে নেওয়াই লক্ষ্য
function hashKey(key) {
  const str = String(key || '')
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0 // hash*33 + charCode
  }
  return Math.abs(hash)
}

// key হিসেবে সম্ভব হলে tenant_id দাও (নাম বদলালেও রঙ একই থাকবে);
// tenant_id না থাকলে company name দিলেও চলবে।
export function getCompanyColor(key) {
  const idx = hashKey(key) % PALETTE.length
  return PALETTE[idx]
}
