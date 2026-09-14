-- ============================================================
-- migration_company_post_visibility.sql
-- Redesign Phase ১.৫ — company_posts অডিয়েন্স/ভিজিবিলিটি কন্ট্রোল
--
-- অডিটে পাওয়া গিয়েছিল: getPortalCompanyPosts platform-এর সব কোম্পানির
-- পোস্ট marketplace-wide দেখাচ্ছিল, connection-ভিত্তিক কোনো ফিল্টার
-- ছাড়াই। সিদ্ধান্ত হলো এটা bug না — Facebook/LinkedIn-এর মতো audience
-- selector ফিচার হিসেবে সবগুলো লেভেলই (public সহ) থাকা দরকার, admin
-- ইচ্ছেমতো বেছে নেবে।
--
-- visibility ডিফল্ট 'public' — বিদ্যমান সব পোস্টের আচরণ অপরিবর্তিত
-- থাকবে (backward compatible, breaking না)।
-- ============================================================

BEGIN;

ALTER TABLE company_posts
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public';

DO $$
BEGIN
    ALTER TABLE company_posts
        ADD CONSTRAINT company_posts_visibility_check
        CHECK (visibility IN ('public', 'connections', 'select', 'private'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- visibility = 'select'-এ কাদের দেখানো হবে — admin-এর বেছে নেওয়া নির্দিষ্ট
-- customer। customer_id (person_id না) — কারণ admin নিজের customer লিস্ট
-- থেকেই বেছে নেয় (এক person একাধিক tenant-এর আলাদা customer হতে পারে)।
CREATE TABLE IF NOT EXISTS company_post_audience (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES company_posts(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_company_post_audience_post ON company_post_audience(post_id);

COMMIT;

-- রোলব্যাক (ম্যানুয়াল):
-- ALTER TABLE company_posts DROP CONSTRAINT IF EXISTS company_posts_visibility_check;
-- ALTER TABLE company_posts DROP COLUMN IF EXISTS visibility;
-- DROP TABLE IF EXISTS company_post_audience;
