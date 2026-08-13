-- ============================================================
-- Migration Step 10: Promotions Phase 3 (Governance — Approval + Audit)
-- ============================================================
-- (renumbered step8 → step10; step8 আপনার টিমের warehouse_stock migration
--  ইতোমধ্যে নিয়ে নিয়েছিল। লাইভ DB-তে প্রয়োগ করা আছে, এটা শুধু রেকর্ড।)
-- ============================================================
-- বড় ছাড়ের promotion (বড় %, বড় flat amount, বা বাজেট-ক্যাপ ছাড়া) তৈরি/এডিট
-- করলে সরাসরি লাইভ না হয়ে 'pending' অবস্থায় থাকবে, দ্বিতীয় admin approve
-- না করা পর্যন্ত। থ্রেশহোল্ড promotion.utils.js-এর needsApproval()-এ।
--
-- audit_logs-এ hook করার জন্য নতুন কোনো কলাম লাগেনি — ওই টেবিল আগে থেকেই
-- generic (table_name/record_id/old_value/new_value), শুধু app কোড থেকে
-- promotion.controller.js এখন সেটাতে লেখে (৯টা অন্য মডিউলের মতোই)।
-- ============================================================

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'auto_approved',
  ADD COLUMN IF NOT EXISTS approval_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_approval_status_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_approval_status_check
  CHECK (approval_status = ANY (ARRAY['auto_approved','pending','approved','rejected']::character varying[]));

UPDATE promotions SET approval_status = 'auto_approved' WHERE approval_status IS NULL;
