-- ============================================================
-- migration_feed_engagement.sql
-- Redesign Phase ১ — ফিড এনগেজমেন্ট (like + report)
--
-- company_posts আর customer_posts টেবিল দুটো অপরিবর্তিত রাখা হলো
-- (working code ভাঙার ঝুঁকি নেই)। এনগেজমেন্ট যোগ হচ্ছে পলিমরফিক
-- shared টেবিল দিয়ে — দুই post type-ই একসাথে সার্ভ করবে, আলাদা
-- company_post_likes / customer_post_likes বানানো লাগছে না।
--
-- reaction কলামে আপাতত শুধু 'like' যাবে (v1, app-level enforced) —
-- ইচ্ছাকৃতভাবে CHECK constraint দেয়া হয়নি, যাতে পরে নতুন reaction
-- টাইপ যোগ করতে ALTER লাগবে না।
--
-- feed_reports: customer_post-এ threshold-এ পৌঁছালে auto-hide হবে
-- (feedEngagement.controller.js দেখুন) — company_post-এর রিপোর্ট
-- শুধু জমা থাকবে, auto-hide না (admin-composed অফিসিয়াল কনটেন্ট,
-- কয়েকজনের রিপোর্টে নিজে থেকে লুকানো ঠিক না — Phase ২-এ admin
-- queue দিয়ে রিভিউ হবে)।
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS feed_reactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_type   VARCHAR(20) NOT NULL CHECK (post_type IN ('company_post','customer_post')),
    post_id     UUID NOT NULL,
    person_id   UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    reaction    VARCHAR(20) NOT NULL DEFAULT 'like',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_type, post_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_reactions_post   ON feed_reactions(post_type, post_id);
CREATE INDEX IF NOT EXISTS idx_feed_reactions_person ON feed_reactions(person_id);

CREATE TABLE IF NOT EXISTS feed_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_type           VARCHAR(20) NOT NULL CHECK (post_type IN ('company_post','customer_post')),
    post_id             UUID NOT NULL,
    reporter_person_id  UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    reason              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_type, post_id, reporter_person_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_reports_post ON feed_reports(post_type, post_id);

COMMIT;

-- রোলব্যাক (ম্যানুয়াল, এই migration-এর অংশ না):
-- DROP TABLE IF EXISTS feed_reactions;
-- DROP TABLE IF EXISTS feed_reports;
