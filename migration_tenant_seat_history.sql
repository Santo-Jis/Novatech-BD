-- ============================================================
-- TENANT SEAT HISTORY — সিট-সংখ্যা/রেট বদলের ইতিহাস, ৬ আগস্ট ২০২৬
-- ------------------------------------------------------------
-- কেন: migration_tenant_invoices_table.sql-এর ইনভয়েস অ্যাডভান্সে
-- (মাসের শুরুতে, "এখন যা আছে তাই") বিল করতো — কারণ tenant_seats-এ
-- শুধু "এখন কী আছে" থাকে, "মাসের মধ্যে কখন কী ছিল" থাকে না। এই
-- টেবিল সেই হিস্ট্রি রাখে, যাতে jobs/tenantInvoice.job.js এখন
-- ARREARS-এ (আগের মাসের জন্য, মাসের ১ তারিখে) প্রোরেটেড হিসাব
-- করতে পারে — সিট-সংখ্যা/রেট মাসের মাঝে বদলালে দিন-হিসেবে ভাগ করে।
--
-- দুই জায়গায় হুক বসানো হয়েছে (দুটোই একই ট্রানজেকশনের ভিতরে,
-- client.query দিয়ে, যাতে atomic থাকে):
--   • onboarding.controller.js — ট্রায়াল সাইনআপ (changed_reason='onboarding')
--   • planBooking.service.js-এর upsertSeats() — প্ল্যান আপগ্রেড
--     (changed_reason='plan_upgrade')
--
-- ⚠️ জানা সীমাবদ্ধতা: upsertSeats()-এ `if (count <= 0) continue` আছে —
-- মানে কোনো role-এর সিট ০-তে নামানো (সরিয়ে ফেলা) এখন তাদের নিজের
-- booking flow-ই সাপোর্ট করে না, তাই history-তেও সেই "সরিয়ে ফেলা"
-- ধরা পড়বে না — শেষ জানা নন-জিরো কাউন্টই চলতে থাকবে। এটা আমাদের
-- নতুন গ্যাপ না, তাদের বিদ্যমান booking flow-এরই সীমাবদ্ধতা।
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_seat_history (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role           TEXT NOT NULL,
    seat_count     INTEGER NOT NULL,
    rate_locked    INTEGER,                          -- NULL হতে পারে (পুরনো ডেটা) — invoice job fallback ব্যবহার করবে
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_reason TEXT NOT NULL DEFAULT 'unknown'    -- 'onboarding' | 'plan_upgrade' | 'backfill'
);
CREATE INDEX IF NOT EXISTS idx_tenant_seat_history_lookup
    ON tenant_seat_history (tenant_id, role, effective_from);

-- ব্যাকফিল — বিদ্যমান tenant_seats-এর প্রতিটা row-কে "শুরু থেকেই এমন
-- ছিল" (২০০০ সাল থেকে, একটা নিরাপদ সেন্টিনেল তারিখ) ধরে একটা এন্ট্রি
-- দেওয়া হলো, যাতে ফিচার চালুর পর প্রথম ইনভয়েসেও যাদের সিট বদলায়নি
-- তাদের সঠিক পুরো-মাসের হিসাব হয় (আংশিক মাস দেখিয়ে কম বিল না হয়)।
-- idempotent — (tenant_id, role)-এ আগে থেকে কোনো এন্ট্রি থাকলে স্কিপ।
INSERT INTO tenant_seat_history (tenant_id, role, seat_count, rate_locked, effective_from, changed_reason)
SELECT ts.tenant_id, ts.role, ts.seat_count, ts.rate_locked, '2000-01-01T00:00:00Z'::timestamptz, 'backfill'
FROM tenant_seats ts
WHERE NOT EXISTS (
    SELECT 1 FROM tenant_seat_history h
    WHERE h.tenant_id = ts.tenant_id AND h.role = ts.role
);
