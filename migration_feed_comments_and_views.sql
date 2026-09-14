-- ============================================================
-- migration_feed_comments_and_views.sql
-- Redesign Phase ১.৯ — কমেন্ট, unread ট্র্যাকিং, প্রাইভেসি ফিক্স
--
-- এই তিনটা একসাথে, কারণ তিনটাই একই অডিট থেকে পাওয়া "সম্পূর্ণ" চিহ্নিত
-- জায়গার ফাঁক ঠিক করছে (দেখুন project-status.md):
--
--  ১. feed_comments — মূল ভিশন ডকে ছিল, Phase ১ বাস্তবায়নে বাদ পড়েছিল।
--     parent_comment_id রাখা হলো ভবিষ্যতের সত্যিকারের threading-এর জন্য,
--     যদিও এখনকার UI flat (list, নেস্টেড না) — এতে পরে থ্রেডিং যোগ করতে
--     আরেকটা migration লাগবে না।
--
--  ২. feed_view_state — "unread-first bump" করতে personIদ-ভিত্তিক শেষ
--     কবে ফিড দেখেছে সেটা লাগবে। NULL/না-থাকা মানে "কখনো ফিড দেখেনি" —
--     সেক্ষেত্রে সব পোস্টকে "নতুন" দেখানো হবে না (প্রথমবার সবকিছু
--     "নতুন" ব্যাজ দেওয়া বিরক্তিকর), শুধু row তৈরির পর থেকে effective।
--
--  ৩. customer_posts.deleted_at — এখন delete মানে শুধু is_active=false,
--     কবে হয়েছে তা জানা নেই। hard-delete cron চালাতে (privacy fix)
--     এই টাইমস্ট্যাম্প লাগবে। company_posts-এ যোগ করা হলো না ইচ্ছাকৃতভাবে —
--     সেটা admin-এর নিজের বিজনেস কনটেন্ট, প্রাইভেসি-উদ্বেগ নেই, admin
--     নিজের পোস্ট হিস্ট্রি/ড্রাফট রাখতে চাইতে পারে।
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS feed_comments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_type         VARCHAR(20) NOT NULL CHECK (post_type IN ('company_post','customer_post')),
    post_id           UUID NOT NULL,
    person_id         UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES feed_comments(id) ON DELETE CASCADE,
    body              TEXT NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 500),
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_comments_post ON feed_comments(post_type, post_id, created_at);

CREATE TABLE IF NOT EXISTS feed_view_state (
    person_id     UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMIT;

-- রোলব্যাক (ম্যানুয়াল):
-- DROP TABLE IF EXISTS feed_comments;
-- DROP TABLE IF EXISTS feed_view_state;
-- ALTER TABLE customer_posts DROP COLUMN IF EXISTS deleted_at;
