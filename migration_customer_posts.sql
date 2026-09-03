-- ============================================================
-- migration_customer_posts.sql
-- Phase 5 (কোড অডিট) — "কাস্টমার পোস্ট" (HomeFeed.jsx-এর একমাত্র বাকি
-- থাকা placeholder সেকশন সম্পূর্ণ করা)।
--
-- company_posts-এর ঠিক একই সরল প্যাটার্ন অনুসরণ করা হয়েছে (soft-delete
-- is_active, কোনো moderation flag/like/comment না — v1 ইচ্ছাকৃতভাবে সরল)।
--
-- ভিজিবিলিটি মডেল: post-টা কোনো নির্দিষ্ট tenant_id-এ বাঁধা না —
-- "network" হিসেবে দেখানো হয় (দেখুন customerPost.controller.js-এর
-- getNetworkFeed): শুধু ওইসব person-এর পোস্ট দেখা যাবে যাদের সাথে
-- অন্তত একটা connected কোম্পানি শেয়ার করা আছে। এটাই ConnectionsTab.jsx-এর
-- আদি কমেন্টে উল্লেখ করা "শপ↔শপ নেটওয়ার্ক" ভিশনের বাস্তবায়ন।
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS customer_posts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id   UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    image_url   TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- body খালি না হওয়া নিশ্চিত করা (app-level trim-checkও থাকবে, DB-level এটা defense-in-depth)
DO $$
BEGIN
    ALTER TABLE customer_posts
        ADD CONSTRAINT customer_posts_body_not_empty CHECK (length(trim(body)) > 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_posts_person       ON customer_posts(person_id);
CREATE INDEX IF NOT EXISTS idx_customer_posts_created_at   ON customer_posts(created_at DESC);

COMMIT;

-- রোলব্যাক (ম্যানুয়াল, এই migration-এর অংশ না):
-- DROP TABLE IF EXISTS customer_posts;
