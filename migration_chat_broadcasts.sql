-- migration_chat_broadcasts.sql
--
-- চ্যাট Phase 3, Session 3 — ব্রডকাস্ট/ক্যাম্পেইন সেন্ড
--
-- শুধু audit/history লগ — আসল মেসেজ কন্টেন্ট আগের মতোই RTDB-তে (প্রতিটা
-- রেসিপিয়েন্টের নিজের personal থ্রেডে, একটা করে সাধারণ মেসেজ হিসেবে)।
-- এই টেবিলটা শুধু "কে, কবে, কতজনকে, কী পাঠিয়েছিল" এর রেকর্ড রাখে।

CREATE TABLE IF NOT EXISTS chat_broadcasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  sender_id         UUID NOT NULL REFERENCES users(id),
  sender_name       TEXT NOT NULL,
  text              TEXT NOT NULL,
  total_recipients  INT NOT NULL DEFAULT 0,
  success_count     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_broadcasts_tenant ON chat_broadcasts(tenant_id, created_at);

-- ALTER TABLE chat_broadcasts ENABLE ROW LEVEL SECURITY; -- (একই recurring gap, দেখুন CHAT_PHASE1_README.md)
