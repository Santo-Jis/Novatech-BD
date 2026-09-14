-- ============================================================
-- migration_feed_gallery.sql
-- Redesign Phase ১.৭ — company_posts + customer_posts মাল্টি-ইমেজ গ্যালারি
--
-- image_url/video_url (single slot) অপরিবর্তিত থাকছে — পুরনো পোস্ট আর
-- সিঙ্গেল-ছবি আপলোড এন্ডপয়েন্ট দুটোই আগের মতোই কাজ করবে। নতুন media
-- JSONB কলাম যোগ হচ্ছে শুধু "গ্যালারি" (একাধিক ছবি) পোস্টের জন্য —
-- ফরম্যাট: [{"type":"image","url":"https://..."}, ...]
--
-- রিড-সাইড অগ্রাধিকার (ফ্রন্টএন্ডে): media থাকলে → carousel; নেই তো
-- video_url থাকলে → video; নেই তো image_url থাকলে → single image।
-- ============================================================

BEGIN;

ALTER TABLE company_posts  ADD COLUMN IF NOT EXISTS media JSONB;
ALTER TABLE customer_posts ADD COLUMN IF NOT EXISTS media JSONB;

COMMIT;

-- রোলব্যাক (ম্যানুয়াল):
-- ALTER TABLE company_posts DROP COLUMN IF EXISTS media;
-- ALTER TABLE customer_posts DROP COLUMN IF EXISTS media;
