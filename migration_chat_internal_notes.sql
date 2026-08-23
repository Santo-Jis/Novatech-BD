-- migration_chat_internal_notes.sql
--
-- চ্যাট Phase 3, Session 1 — ইন্টারনাল নোট/@মেনশন
--
-- ⚠️ ডিজাইন সিদ্ধান্ত: এই টেবিলটা RTDB মেসেজ পাইপলাইনের সম্পূর্ণ বাইরে,
-- ইচ্ছাকৃতভাবে। নোট RTDB-তে রেখে ক্লায়েন্ট-সাইডে "customer হলে লুকাও" — এই
-- প্যাটার্ন ব্যবহার করা হয়নি, কারণ RTDB security rules-এ ভুল হলে (বা কেউ
-- devtools দিয়ে RTDB সরাসরি পড়লে) কাস্টমার নিজের সম্পর্কে লেখা ইন্টারনাল নোট
-- দেখে ফেলতে পারত। তার বদলে সম্পূর্ণ আলাদা টেবিল + staff-only REST এন্ডপয়েন্ট —
-- কাস্টমার-facing কোনো কোড পাথ এই টেবিল স্পর্শই করে না।
--
-- Visibility: tenant_id ম্যাচ করলেই দেখা যায় (main inbox-এর role-based
-- per-thread visibility এখানে replicate করা হয়নি — ইচ্ছাকৃত সরলীকরণ,
-- ইন্টারনাল নোট পুরো টিমের জন্য দৃশ্যমান হওয়াটা সমস্যা না, কাস্টমার-ডেটা
-- ক্রস-টেন্যান্ট লিকের মতো না)।

CREATE TABLE IF NOT EXISTS chat_internal_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  author_id           UUID NOT NULL REFERENCES users(id),
  author_name         TEXT NOT NULL,
  text                TEXT NOT NULL,
  mentioned_user_ids  UUID[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_internal_notes_thread   ON chat_internal_notes(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_internal_notes_tenant   ON chat_internal_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_internal_notes_mentions ON chat_internal_notes USING GIN(mentioned_user_ids);

-- ⚠️ এই সেশনে অন্য নতুন টেবিলের মতোই এখানেও RLS enable করা হয়নি (দেখুন
-- CHAT_PHASE1_README.md-এর RLS ডিসক্লোজার — এটা সেই একই, বারবার ফিরে আসা
-- ফাঁক, প্যাটার্ন হিসেবে ফ্ল্যাগ করা থাকল)।
-- ALTER TABLE chat_internal_notes ENABLE ROW LEVEL SECURITY;
