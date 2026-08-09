-- ============================================================
-- TENANT INVOICES — মাসিক সাবস্ক্রিপশন বিল (সিট-ভিত্তিক), ৬ আগস্ট ২০২৬
-- ------------------------------------------------------------
-- Billing পেজের "ইনভয়েস হিস্ট্রি" সেকশনের জন্য। এতদিন এই কনসেপ্টটাই
-- ছিল না — credit_transactions (wallet) আছে, কিন্তু সেটা SMS/Email/AI
-- pay-as-you-go চার্জের জন্য, সিট-ভিত্তিক রিকারিং সাবস্ক্রিপশন ফি-র
-- জন্য না। এইটা আলাদা, নতুন টেবিল।
--
-- বিলিং arrears-এ (মাসের ১ তারিখে, ঠিক আগের সম্পূর্ণ শেষ হওয়া মাসের
-- জন্য) — v3 আপডেট (migration_tenant_seat_history.sql দেখো): এখন
-- tenant_seat_history-তে সিট-সংখ্যা/রেট বদলের ইতিহাস থাকে, তাই
-- jobs/tenantInvoice.job.js মাসের মাঝে বদল হলে দিন-হিসেবে prorated
-- করে হিসাব করতে পারে (আগে শুধু "এখন যা আছে" দিয়ে অ্যাডভান্সে
-- বিল হতো, কারণ হিস্ট্রি ছিল না)।
--
-- আপডেট (v2): admin/owner সিট আর rate_locked=NULL সিট এখন
-- constants/planRates.js (fallback pricing table, planPricing.js-এর
-- আংশিক ডুপ্লিকেট — ম্যানুয়ালি সিঙ্কে রাখতে হবে) দিয়ে ধরা হয়।
-- rate_locked থাকলে সেটাই অগ্রাধিকার পায়; fallback শুধু তখনই যখন
-- rate_locked নেই। plan অচেনা হলে (trial placeholder/legacy) সেই
-- role বাদ যায়, ভুল রেট বসায় না।
--
-- ⚠️ সংশোধন: admin role-এর জন্য tenant_seats-এ row থাকে না ধরে
-- নিয়েছিলাম — ভুল ছিল, আসলে onboarding.controller.js-এই বসে। v3-এ
-- admin এখন স্বাভাবিক role হিসেবেই হ্যান্ডল হয়, আলাদা "implicit
-- owner" যোগ করা হয় না (আগে ডাবল-কাউন্ট হতো)।
-- ============================================================

-- sessionCleanup.job.js/kpiSnapshot.job.js-এর মতোই missed-run
-- detection-এর জন্য — migration হিসেবে কোথাও ছিল না, তাই এখানে
-- IF NOT EXISTS দিয়ে defensively বানানো হলো।
CREATE TABLE IF NOT EXISTS job_runs (
    id            SERIAL PRIMARY KEY,
    job_name      TEXT NOT NULL,
    ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rows_affected INTEGER
);
CREATE INDEX IF NOT EXISTS idx_job_runs_name_ran_at ON job_runs (job_name, ran_at DESC);

CREATE TABLE IF NOT EXISTS tenant_invoices (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL UNIQUE,
    period_start   DATE NOT NULL,               -- বিলিং মাসের প্রথম দিন
    period_end     DATE NOT NULL,               -- বিলিং মাসের শেষ দিন
    plan           TEXT NOT NULL,                -- জেনারেশনের সময়ের plan (snapshot — পরে plan বদলালেও পুরনো ইনভয়েস ঠিক থাকবে)
    seat_breakdown JSONB NOT NULL,               -- [{role, label, seat_count, rate, subtotal}, ...] — point-in-time snapshot
    total_amount   INTEGER NOT NULL,             -- ৳ (paisa না — tenant_seats.rate_locked-এর কনভেনশন মেনে)
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'void')),
    paid_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, period_start)             -- একই তেনান্টের একই মাসে দুইবার জেনারেট হওয়া আটকায়
);
CREATE INDEX IF NOT EXISTS idx_tenant_invoices_tenant ON tenant_invoices (tenant_id, period_start DESC);
