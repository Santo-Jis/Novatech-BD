-- ============================================================
-- migration_discovery_views.sql
-- Phase 6 (কোড অডিট — connection analytics) — discovery view logging
--
-- ⚠️ প্রেক্ষাপট: discovery.controller.js-এর getDiscoveryShops আগে থেকে
-- কোনো view/impression লগ করত না — শুধু successful connection (initiated_by
-- দিয়ে) রেকর্ড হতো। মানে "কেউ discovery-তে একটা শপ দেখেছে কিন্তু connect
-- করেনি" — এই তথ্য কোথাও ছিল না, তাই আসল discovery→connection funnel
-- (view-rate থেকে conversion-rate) হিসাব করা সম্ভব ছিল না।
--
-- এই টেবিল থেকে এখন থেকে ডেটা জমা শুরু হবে — কিন্তু পুরনো (এই migration-এর
-- আগের) কোনো view ডেটা নেই, তাই funnel রিপোর্ট অর্থপূর্ণ হতে কিছু সপ্তাহ
-- সময় লাগবে। shown_person_ids আলাদাভাবে রাখা হয়েছে (শুধু count না) যাতে
-- ভবিষ্যতে "person X কবে কবে কোন tenant-কে দেখানো হয়েছিল, আর কবে connect
-- হলো" — এই লেভেলের বিস্তারিত অ্যানালাইসিস সম্ভব হয়।
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS discovery_views (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    viewed_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    shown_person_ids    UUID[] NOT NULL DEFAULT '{}',
    shown_count         INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_views_tenant       ON discovery_views(tenant_id);
CREATE INDEX IF NOT EXISTS idx_discovery_views_created_at   ON discovery_views(created_at DESC);
-- GIN ইনডেক্স — "person X কবে শো হয়েছিল" জাতীয় array-containment কুয়েরির জন্য
CREATE INDEX IF NOT EXISTS idx_discovery_views_shown_gin    ON discovery_views USING GIN(shown_person_ids);

COMMIT;

-- রোলব্যাক (ম্যানুয়াল): DROP TABLE IF EXISTS discovery_views;
