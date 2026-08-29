-- migration_chat_ai_flags.sql
--
-- চ্যাট Phase 4 — ইন্টেলিজেন্স লেয়ার
--
-- নতুন কোনো টেবিল লাগেনি — Phase 3, Session 2-এর chat_flagged_messages
-- টেবিলটাই রিইউজ করা হচ্ছে। AI রিস্ক-চেক ফিচার staff-কে "credit_risk" বা
-- "complaint" সাজেস্ট করবে, staff এক-ক্লিকে accept করলে সেটাও এই একই অডিট
-- টেবিলে যায় (দেখুন chat.controller.js-এর flagMessage — flagged_by এখানে
-- AI না, accept-করা staff-ই থাকে, transparency-র জন্য)।
--
-- ⚠️ chat_flagged_messages টেবিলটা Phase 3, Session 2-এর migration_chat_sla.sql
-- চালালে তৈরি হয় — সেটা এখনো না চালিয়ে থাকলে এই মাইগ্রেশন আগে ওটা চালান।

ALTER TABLE chat_flagged_messages DROP CONSTRAINT IF EXISTS chat_flagged_messages_flag_type_check;
ALTER TABLE chat_flagged_messages ADD CONSTRAINT chat_flagged_messages_flag_type_check
  CHECK (flag_type IN ('price_quote', 'payment_promise', 'credit_risk', 'complaint'));

-- ⚠️ উপরের DROP CONSTRAINT IF EXISTS কনস্ট্রেইন্টের নাম Postgres-এর ডিফল্ট
-- নেমিং কনভেনশন ধরে লেখা (<table>_<column>_check)। যদি ব্যর্থ হয় (নাম না
-- মিললে), আগে চেক করুন: SELECT conname FROM pg_constraint WHERE conrelid =
-- 'chat_flagged_messages'::regclass AND contype = 'c'; — তারপর সঠিক নাম দিয়ে
-- DROP করুন।
