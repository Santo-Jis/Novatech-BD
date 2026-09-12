/**
 * check-rls.js
 *
 * ধাপ ২ (Foundation) — এই সেশনে ম্যানুয়ালি যে pg_class/pg_namespace query
 * বারবার চালিয়ে ১৮টা টেবিলে RLS বন্ধ পাওয়া গিয়েছিল (দেখুন
 * CHAT_REDESIGN_ROADMAP.md), সেটাকেই একটা রিইউজেবল, CI-তে চালানোর মতো
 * স্ক্রিপ্টে পরিণত করা হলো — যাতে এই ক্লাসের গ্যাপ ভবিষ্যতে কোনো সেশনে
 * (মানুষ বা এজেন্ট) চুপচাপ আবার তৈরি হয়ে ২ সপ্তাহ ধরে অলক্ষিত না থাকে।
 *
 * ব্যবহার (backend ফোল্ডার থেকে):
 *   node scripts/check-rls.js
 *
 * DB কানেকশন যেভাবেই সেট করা থাকুক (../src/config/db.js যা পড়ে — DATABASE_URL
 * বা DB_HOST/DB_USER/... env var), সেটার বিপরীতেই চেক চলবে। মানে এই স্ক্রিপ্ট
 * নিজে থেকে "প্রোডাকশন" বা "টেস্ট" জানে না — যে DB-এর ক্রেডেনশিয়াল env-এ
 * দেওয়া থাকবে, সেটাই চেক হবে।
 *
 * exit code 0 = সব public টেবিলে RLS চালু। exit code 1 = কোনো একটায় বন্ধ পাওয়া
 * গেছে (তালিকাসহ প্রিন্ট হবে) — এই নন-জিরো এক্সিট কোডটাই CI/pre-deploy গেট
 * হিসেবে কাজ করে।
 *
 * ⚠️ ইচ্ছাকৃতভাবে "RLS enabled কিন্তু policy জিরো" চেক করে না — এই কোডবেসে
 * সেটা প্রায় ৯০টা টেবিলেই স্বাভাবিক/নিরাপদ প্যাটার্ন (ব্যাকএন্ড postgres role
 * দিয়ে RLS বাইপাস করে, frontend কখনো supabase-js দিয়ে সরাসরি অ্যাক্সেস করে
 * না)। সেটা ফ্ল্যাগ করলে ৯০টা false-positive আসবে প্রতিবার — signal-কে
 * noise-এ ডুবিয়ে দেবে। শুধু "rls_disabled_in_public"-ক্লাসের আসল, actionable
 * সমস্যাটাই চেক করা হয়, যেটা সম্পূর্ণ ভিন্ন এবং সবসময় genuinely exploitable।
 */

require('dotenv').config()
const { query, pool } = require('../src/config/db')

const run = async () => {
  const { rows } = await query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
    ORDER BY c.relname
  `)

  if (rows.length === 0) {
    console.log('✅ RLS check পাস — public স্কিমার সব টেবিলেই Row Level Security চালু আছে।')
    await pool.end()
    process.exit(0)
  }

  console.error(`❌ RLS check ব্যর্থ — ${rows.length}টা টেবিলে RLS বন্ধ পাওয়া গেছে:\n`)
  rows.forEach((r) => console.error(`   - ${r.table_name}`))
  console.error(
    '\n   ফিক্স: প্রতিটার জন্য ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;\n' +
    '   (policy লাগবে না যদি ব্যাকএন্ড RLS-বাইপাস করা role দিয়ে কানেক্ট করে — বাকি স্কিমার\n' +
    '   established pattern অনুযায়ী)। নতুন টেবিলের migration লেখার সময় এই লাইনটা\n' +
    '   কমেন্ট করে না রেখে সাথে সাথেই uncommented রাখাই এখন থেকে দস্তুর।'
  )
  await pool.end()
  process.exit(1)
}

run().catch((err) => {
  console.error('❌ RLS check চালাতেই ব্যর্থ (DB কানেকশন সমস্যা?):', err.message)
  process.exit(1)
})
