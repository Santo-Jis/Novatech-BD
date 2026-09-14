-- ============================================================
-- migration_feed_video.sql
-- Redesign Phase ১.৬ — company_posts + customer_posts ভিডিও সাপোর্ট
--
-- ভিডিও ফাইল নিজেই Cloudinary-তে যায় (resource_type=video, ঠিক
-- chatMedia.service.js-এর ভয়েস-নোটের মতোই) — এখানে শুধু resulting URL।
--
-- image_url আর video_url একে অপরের সাথে mutually exclusive রাখা হচ্ছে
-- app-level-এ (একটা আপলোড হলে আরেকটা ক্লিয়ার হয়ে যায়) — একসাথে দুটোই
-- সাপোর্ট করা (carousel/gallery) এখনো স্কোপে নেই, ইচ্ছাকৃতভাবে সরল রাখা।
-- ============================================================

BEGIN;

ALTER TABLE company_posts  ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE customer_posts ADD COLUMN IF NOT EXISTS video_url TEXT;

COMMIT;

-- রোলব্যাক (ম্যানুয়াল):
-- ALTER TABLE company_posts DROP COLUMN IF EXISTS video_url;
-- ALTER TABLE customer_posts DROP COLUMN IF EXISTS video_url;
