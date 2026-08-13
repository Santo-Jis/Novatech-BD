-- ============================================================
-- Migration Step 11: Promotions Phase 5 (Reach — Banner)
-- ============================================================
-- (renumbered step9 → step11 — এই ফাইল রিভিশনের সাথে তাল মিলিয়ে।
--  লাইভ DB-তে প্রয়োগ করা আছে, এটা শুধু রেকর্ড।)
-- ============================================================
-- Customer portal visibility ও notification auto-announce কোনো নতুন
-- কলাম লাগেনি (বিদ্যমান notifications/customers/promotions টেবিল দিয়েই
-- হয়েছে) — শুধু banner image-এর জন্য এই একটা কলাম।
-- ============================================================

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS banner_image_url TEXT;
