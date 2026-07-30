-- ============================================================
-- Novatech BD — plan কলামে নতুন ৪-টায়ার প্রাইসিং যোগ (standard/pro/max/erp)
--
-- ⚠️ এই টেবিল প্রোডাকশন Supabase-এ লাইভ আছে। এই মাইগ্রেশন রান না করলে
-- superAdmin.controller.js-এর updateTenantPlan নতুন plan নাম (standard/
-- max/erp) দিয়ে কল করলে DB-লেভেলে "violates check constraint
-- tenants_plan_check" এরর দিয়ে ফেইল করবে — কারণ বর্তমান constraint
-- (migration_tenants_table.sql) শুধু ('basic','pro','enterprise') মানে।
--
-- কেন সব পুরনো নাম রেখে দেওয়া হলো, পুরোপুরি বদলানো হলো না:
--   1. onboarding.controller.js এখনো ট্রায়াল সাইনআপে plan='basic' বসায়
--      (placeholder — ট্রায়াল শেষে আসল টায়ার বেছে নিতে হয়), তাই 'basic'
--      এখনো দরকার।
--   2. যদি কোনো বিদ্যমান tenant আগে থেকেই 'pro'/'enterprise'-এ থেকে থাকে,
--      constraint সরু করে ফেললে (শুধু নতুন ৪টা রেখে) সেই পুরনো row-গুলোর
--      উপর ALTER করতে গেলে এমনিতেই ফেইল করবে।
--   এই মাইগ্রেশন শুধু নতুন নাম *যোগ* করছে, পুরনো কোনোটা সরাচ্ছে না — তাই
--   existing ডেটা বা trial সাইনআপ ফ্লো কিছুই ভাঙবে না।
--
-- চালানোর নিয়ম: Supabase SQL Editor-এ কপি-পেস্ট করুন।
--
-- নোট: constraint-এর নাম ধরে নেওয়া হয়েছে Postgres-এর ডিফল্ট নামকরণ
-- (tenants_plan_check), যেহেতু মূল CREATE TABLE-এ constraint-কে আলাদা নাম
-- দেওয়া হয়নি। যদি এই মাইগ্রেশন "constraint tenants_plan_check does not
-- exist" এরর দেয়, তাহলে আগে আসল নাম বের করে নিন:
--
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'tenants'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%plan%';
--
-- ...তারপর নিচের দুই লাইনে tenants_plan_check-এর জায়গায় আসল নাম বসান।
-- ============================================================

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;

ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
    CHECK (plan IN ('basic', 'pro', 'enterprise', 'standard', 'max', 'erp'));

-- এই মাইগ্রেশন idempotent — বারবার রান করলেও সমস্যা নেই (DROP...IF EXISTS
-- তারপর একই সংজ্ঞা দিয়ে ADD)।
