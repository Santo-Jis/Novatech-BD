-- migration_chat_sla.sql
--
-- চ্যাট Phase 3, Session 2 — SLA ড্যাশবোর্ড + অডিট ট্রেইল
--
-- দুটো স্বতন্ত্র টেবিল, দুটো স্বতন্ত্র উদ্দেশ্যে:
--
-- ১) chat_response_events — প্রতিবার staff-এর প্রথম রিপ্লাই (কাস্টমারের
--    সর্বশেষ মেসেজের পর) হলে একটা রো — chat.controller.js-এর
--    notifyNewMessage()-এ hook করা, best-effort (ব্যর্থ হলেও মূল
--    মেসেজ-নোটিফাই ফ্লো আটকায় না)।
--
-- ২) chat_flagged_messages — staff ইচ্ছাকৃতভাবে কোনো মেসেজকে "price_quote"
--    বা "payment_promise" হিসেবে ট্যাগ করলে এখানে রেকর্ড হয় (RTDB মেসেজেও
--    সাথে সাথে flagged ফিল্ড বসে UI ব্যাজের জন্য — কিন্তু এই টেবিলটাই
--    export/অডিটের আসল সোর্স, RTDB থেকে bulk-query/export করা অস্বাভাবিক)।

CREATE TABLE IF NOT EXISTS chat_response_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  customer_message_at TIMESTAMPTZ NOT NULL,
  staff_reply_at      TIMESTAMPTZ NOT NULL,
  response_seconds    INT NOT NULL,
  replied_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_response_events_tenant ON chat_response_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_response_events_staff  ON chat_response_events(replied_by);

CREATE TABLE IF NOT EXISTS chat_flagged_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  message_client_id TEXT NOT NULL,  -- RTDB মেসেজের clientId (useChatEngine.js-এ ইতিমধ্যেই প্রতিটা মেসেজে থাকে)
  flag_type         VARCHAR(20) NOT NULL CHECK (flag_type IN ('price_quote', 'payment_promise')),
  message_text      TEXT NOT NULL, -- ফ্ল্যাগ করার মুহূর্তের স্ন্যাপশট (RTDB মেসেজ পরে এডিট/ডিলিট হলেও অডিট রেকর্ড অক্ষত থাকে)
  flagged_by        UUID NOT NULL REFERENCES users(id),
  flagged_by_name   TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_flagged_messages_tenant ON chat_flagged_messages(tenant_id, created_at);

-- ⚠️ এই দুটোতেও RLS enable করা হয়নি — একই recurring gap (দেখুন CHAT_PHASE1_README.md)
-- ALTER TABLE chat_response_events  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_flagged_messages ENABLE ROW LEVEL SECURITY;
