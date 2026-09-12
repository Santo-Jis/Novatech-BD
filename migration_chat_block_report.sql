-- migration_chat_block_report.sql
--
-- চ্যাট ধাপ ২ (Foundation) — Block / Report
--
-- chat_blocks: থ্রেড-লেভেল ব্লক (per-person/global না) — কারণ একই কাস্টমার
-- একাধিক tenant-এ আলাদা customer_id/থ্রেড পায় (দেখুন chatFirebase.service.js-এর
-- comment), তাই থ্রেড-ই স্বাভাবিক স্কোপ-বাউন্ডারি। blocked_by_type/id
-- ইচ্ছাকৃতভাবে polymorphic TEXT (staff→users.id, customer→person_id) —
-- chat_messages-এর sender_id-এর মতোই কারণে FK নেই।
--
-- unblock ইচ্ছাকৃতভাবে staff/management-only (কন্ট্রোলারে রুট-লেভেলে
-- আটকানো) — যে ব্লক করল সে নিজেই যেন একতরফা আনব্লক করতে না পারে, একজন
-- মানুষ (সুপারভাইজার) রিভিউ করুক এটাই উদ্দেশ্য।
--
-- chat_reports: chat_flagged_messages-এর থেকে ইচ্ছাকৃতভাবে আলাদা টেবিল —
-- ওটা bussiness/CRM ফ্ল্যাগ (price_quote/credit_risk ইত্যাদি, staff-only,
-- বিক্রি/ক্রেডিট বিশ্লেষণের জন্য), এটা trust & safety রিপোর্ট (staff+customer
-- দুই পাশ থেকেই, অপব্যবহার/হয়রানি রিপোর্টের জন্য) — উদ্দেশ্য আলাদা বলে
-- conflate করা ঠিক হবে না।

CREATE TABLE IF NOT EXISTS chat_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID NOT NULL UNIQUE REFERENCES chat_threads(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  blocked_by_type VARCHAR(10) NOT NULL CHECK (blocked_by_type IN ('staff', 'customer')),
  blocked_by_id   TEXT NOT NULL,
  blocked_by_name TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_blocks_tenant ON chat_blocks(tenant_id);

CREATE TABLE IF NOT EXISTS chat_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id          UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  message_client_id  TEXT,   -- NULL মানে পুরো থ্রেড/কথোপকথন রিপোর্ট, নির্দিষ্ট মেসেজ না
  reporter_type      VARCHAR(10) NOT NULL CHECK (reporter_type IN ('staff', 'customer')),
  reporter_id        TEXT NOT NULL,
  reporter_name      TEXT,
  category           VARCHAR(20) NOT NULL CHECK (category IN ('abusive', 'spam', 'harassment', 'other')),
  note               TEXT,
  status             VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_reports_tenant ON chat_reports(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_reports_thread ON chat_reports(thread_id);

ALTER TABLE chat_blocks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;
