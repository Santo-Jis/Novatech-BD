-- migration_chat_messages.sql
--
-- চ্যাট ধাপ ২ (Foundation) — Postgres dual-write
--
-- RTDB-ই এখনো আসল ডেলিভারি চ্যানেল (real-time, source of truth থাকছে) — এই
-- টেবিলটা শুধু একটা কপি, তিনটা উদ্দেশ্যে: ফুল-টেক্সট সার্চ (pg_trgm, already
-- ইনস্টলড), অডিট/এক্সপোর্ট, আর ভবিষ্যতের AI-grounding (flag-trend ড্যাশবোর্ড
-- ইত্যাদি, দেখুন CHAT_REDESIGN_ROADMAP.md ধাপ ৫)।
--
-- staff-সাইড chat.controller.js আর customer-সাইড customerPortalChat.controller.js
-- — দুটোরই notifyNewMessage()-এ best-effort insert হয় (RTDB write সফল হওয়ার
-- পরে, response block না করে; ব্যর্থ হলে শুধু log, ডেলিভারি অপ্রভাবিত)।
--
-- ⚠️ voice/card মেসেজের পূর্ণ payload (voiceUrl/cardPayload) এখানে আসছে না
-- ইচ্ছাকৃতভাবে — শুধু kind ট্যাগ হয়, যাতে অন্তত জানা যায় কিছু পাঠানো হয়েছিল।
-- সেই পূর্ণাঙ্গ payload দরকার হলে (search/audit-এ voice/card অন্তর্ভুক্ত করতে
-- চাইলে) এটা পরের সেশনের কাজ।
--
-- ⚠️ sender_id ইচ্ছাকৃতভাবে TEXT, UUID+FK না — staff হলে users.id, customer
-- হলে person_id, দুটো ভিন্ন টেবিল থেকে আসে (polymorphic), একটা FK দুটোকেই
-- ধরতে পারবে না।

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  client_id   TEXT NOT NULL,
  sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('staff', 'customer')),
  sender_id   TEXT,
  sender_name TEXT,
  kind        VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'voice', 'card')),
  text        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- notify() রিট্রাই/ডাবল-কল হলেও ডুপ্লিকেট রো ঠেকানোর গ্যারান্টি (controller-এ ON CONFLICT DO NOTHING)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_thread_client ON chat_messages(thread_id, client_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant ON chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_text_trgm ON chat_messages USING GIN (text gin_trgm_ops);

-- ✅ ২০২৬-০৯-০৩: RLS এই সেশনেই লাইভ apply + verify করা, বাকি সব চ্যাট টেবিলের মতোই
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
