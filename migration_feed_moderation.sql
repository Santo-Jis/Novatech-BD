-- ============================================================
-- migration_feed_moderation.sql
-- Redesign Phase ১.৮ — মডারেশন কিউ
--
-- feed_reports জমা হচ্ছিল Phase ১ থেকেই (customer_post ৩ রিপোর্টে
-- auto-hide, company_post শুধু জমা থাকত) কিন্তু রিভিউ করার কোনো UI/
-- ট্র্যাকিং ছিল না। reviewed_at/reviewed_by দিয়ে বোঝা যাবে কোন রিপোর্ট
-- এখনো "pending" (admin এখনো দেখেনি) — মডারেশন কিউ শুধু pending
-- রিপোর্টগুলোই দেখাবে।
-- ============================================================

BEGIN;

ALTER TABLE feed_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE feed_reports ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_feed_reports_pending ON feed_reports(post_type, post_id) WHERE reviewed_at IS NULL;

COMMIT;

-- রোলব্যাক (ম্যানুয়াল):
-- ALTER TABLE feed_reports DROP COLUMN IF EXISTS reviewed_at;
-- ALTER TABLE feed_reports DROP COLUMN IF EXISTS reviewed_by;
