-- migration_chat_canned_responses.sql
--
-- চ্যাট ধাপ ২ (Foundation) — Canned Responses, তবে একটা গুরুত্বপূর্ণ সংশোধনী সহ।
--
-- ⚠️ মূল রোডম্যাপ আইটেম ধরে নিয়েছিল `support_canned_responses` টেবিলটাই
-- (যেটা advisor-স্ক্যানে RLS-gap তালিকায় প্রথম দেখেছিলাম) এই চ্যাট ফিচারের
-- জন্য — যাচাই করতে গিয়ে দেখা গেল সেটা ভুল অনুমান ছিল। ওই টেবিল আসলে
-- platformSupport.controller.js-এর — Novatech-BD-এর নিজস্ব platform_staff
-- টিম tenant ব্যবসাগুলোকে সাপোর্ট দেয় (support_tickets-এর টেমপ্লেট রিপ্লাই),
-- সম্পূর্ণ ভিন্ন ডোমেইন, কোনো ফ্রন্টএন্ডই নেই এখনো। সেটাতে হাত না দিয়ে,
-- এই নতুন tenant-scoped টেবিলটাই আসল উদ্দেশ্য পূরণ করে — sales rep/support
-- staff রিটেইল কাস্টমারকে দ্রুত স্ট্যান্ডার্ড রিপ্লাই পাঠাতে পারবে।

CREATE TABLE IF NOT EXISTS chat_canned_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_canned_responses_tenant ON chat_canned_responses(tenant_id, title);

ALTER TABLE chat_canned_responses ENABLE ROW LEVEL SECURITY;
