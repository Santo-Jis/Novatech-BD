-- ============================================================
-- Migration: Notification Delivery Logs (email_logs, sms_logs)
-- + customer_notifications — schema catch-up
--
-- ✅ VERIFIED (Phase 0, ২০২৬-০৯-১৪): Supabase MCP দিয়ে সরাসরি
-- production DB (project: novatechbd) কানেক্ট করে প্রতিটা column type,
-- FK, delete-rule, আর existing index information_schema/pg_catalog
-- থেকে query করে verify করা হয়েছে — কোনো অনুমান নেই। আগের ভার্সনে
-- email_logs-এর timestamp কলাম নিয়ে যে অনিশ্চয়তা ছিল (sent_at অনুমান
-- করা হয়েছিল কোডের কমেন্ট থেকে), সেটা এখন কনফার্মড: sent_at সঠিক।
--
-- এই তিনটা টেবিলেরই কোনো migration file repo-তে ছিল না (Supabase
-- console থেকে সরাসরি তৈরি হয়েছিল)। এই ফাইলটা সেই gap বন্ধ করে, আর
-- fresh/staging environment production-এর সাথে structurally identical
-- রাখার জন্য।
--
-- SAFE TO RUN ON PRODUCTION: সবকিছু IF NOT EXISTS। টেবিল আগে থেকেই
-- আছে বলে CREATE TABLE অংশ সম্পূর্ণ no-op হবে (column/constraint কিছুই
-- বদলাবে না)। নিচে "✅ নতুন" চিহ্নিত ৩টা index verify করে দেখা গেছে
-- production-এ মিসিং ছিল — শুধু ওগুলোই নতুন করে যোগ হবে। RLS তিনটাতেই
-- আগে থেকে enabled (verified) — ENABLE ROW LEVEL SECURITY লাইনগুলো
-- তাই idempotent no-op।
-- ============================================================

-- ── email_logs (verified: 435 রো, status distribution — sent 308,
-- blocked 126, failed 1) ──
-- ⚠️ পাশাপাশি পাওয়া একটা তথ্য (এই migration-এর স্কোপের বাইরে কিন্তু
-- গুরুত্বপূর্ণ): production-এর প্রায় ২৯% email 'blocked' status-এ —
-- মানে insufficient wallet balance-এর কারণে পাঠানোই হয়নি। এটা আলাদা
-- ইস্যু হিসেবে দেখা দরকার (wallet top-up reminder/alert)।
CREATE TABLE IF NOT EXISTS email_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NULL REFERENCES tenants(id),
    email          VARCHAR(255) NOT NULL,
    subject        VARCHAR(255) NOT NULL,
    message_type   VARCHAR(50) NOT NULL DEFAULT 'custom',
    status         VARCHAR(20) NOT NULL
                   CHECK (status IN ('sent','failed','disabled','dev','blocked')),
    error_message  TEXT NULL,
    sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_tenant ON email_logs(tenant_id, sent_at DESC);
-- ✅ নতুন — production-এ verify করে দেখা গেছে মিসিং ছিল। getRecentEmails()-এর
-- `email ILIKE $2` filter-কে সাহায্য করবে এক্সাক্ট/prefix ম্যাচে।
CREATE INDEX IF NOT EXISTS idx_email_logs_email ON email_logs(email);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;


-- ── sms_logs (verified: 5 রো, সবগুলোই status='blocked') ──
CREATE TABLE IF NOT EXISTS sms_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NULL REFERENCES tenants(id),
    phone          VARCHAR(20) NOT NULL,
    message_type   VARCHAR(50) NOT NULL DEFAULT 'custom',
    provider       VARCHAR(50) NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sent','failed','disabled','dev','blocked')),
    error_message  TEXT NULL,
    sent_by        UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_tenant  ON sms_logs(tenant_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone   ON sms_logs(phone);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status  ON sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_type    ON sms_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON sms_logs(sent_at DESC);
-- ✅ নতুন — production-এ verify করে দেখা গেছে মিসিং ছিল। admin.controller.js-এর
-- "LEFT JOIN users ON u.id = sl.sent_by" কোয়েরিকে সাহায্য করবে।
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_by ON sms_logs(sent_by);

ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;


-- ── customer_notifications (verified: 127 রো) ──
CREATE TABLE IF NOT EXISTS customer_notifications (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    type        VARCHAR(50) NOT NULL DEFAULT 'general',
    is_read     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cnotif_customer ON customer_notifications(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cnotif_unread   ON customer_notifications(customer_id, is_read) WHERE is_read = false;
-- ✅ নতুন — production-এ verify করে দেখা গেছে মিসিং ছিল।
CREATE INDEX IF NOT EXISTS idx_cnotif_tenant   ON customer_notifications(tenant_id, created_at DESC);

ALTER TABLE customer_notifications ENABLE ROW LEVEL SECURITY;
