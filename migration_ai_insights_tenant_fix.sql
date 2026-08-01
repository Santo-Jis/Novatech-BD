-- ============================================================
-- Fix: ai_insights cross-tenant data leak
-- ৩১ জুলাই ২০২৬
--
-- সমস্যা: ai_insights টেবিলে tenant_id ছিল না। background AI Insights
-- job-এ generateAdminInsight()/collectDailyData(null) কোনো tenant filter
-- ছাড়াই পুরো প্ল্যাটফর্মের সব tenant-এর attendance/sales/credit ডাটা
-- একসাথে aggregate করতো, আর সেই *একই* summary "কোম্পানির দৈনিক
-- সারসংক্ষেপ" হিসেবে প্রতিটা tenant-এর প্রতিটা admin-কে দেখানো হতো —
-- মানে এক tenant-এর admin আরেক tenant-এর ব্যবসার ডাটা (aggregate ফর্মে)
-- দেখতে পেতো।
--
-- ফিক্স: ai.job.js এখন tenant-ভিত্তিক loop-এ চলে, প্রতিটা insight এখন
-- সংশ্লিষ্ট tenant_id ট্যাগ করে সেভ হয়, আর read/mark-read উভয় endpoint-ই
-- এখন tenant_id দিয়ে scope করা।
--
-- (এই migration ইতিমধ্যে Supabase:apply_migration দিয়ে সরাসরি live
-- database-এ apply করা হয়েছে — এই ফাইলটা শুধু রেকর্ড/রেফারেন্সের জন্য।)
-- ============================================================

ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant ON ai_insights(tenant_id);

-- পুরনো insight-গুলো cross-tenant-contaminated ছিল (tenant_id assign করার
-- নির্ভরযোগ্য উপায় নেই), তাই মুছে দেওয়া হলো। এমনিতেই ৩০ দিন পর auto-delete হতো।
DELETE FROM ai_insights WHERE tenant_id IS NULL;

ALTER TABLE ai_insights ALTER COLUMN tenant_id SET NOT NULL;
