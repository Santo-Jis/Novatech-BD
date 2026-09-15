-- migration_commission_ledger.sql
--
-- Commission redesign — Phase ১ — append-only ledger, shadow-mode dual-write
--
-- এই migration কোনো read path বদলায় না। পুরনো `commission` টেবিলের পাশে
-- একটা নতুন, শুধু-যোগ-হওয়া (append-only) ledger বসছে — dual-write শুরু হবে
-- commissionLedger.service.js থেকে, আর একটা reconciliation job (দেখো
-- jobs/commissionReconciliation.job.js) রোজ যাচাই করবে দুটো মেলে কিনা।
-- Cutover (read path ledger-এ সরানো) Phase ২-এ, এখনো না।
--
-- Design নোট:
--  - Append-only: কোনো row কখনো UPDATE/DELETE হয় না, শুধু নতুন row যোগ হয়।
--  - "বর্তমান ব্যালেন্স" = SUM(amount) — earn/adjustment positive,
--    payout/reversal negative। commission টেবিলের মতো mutable 'paid' flag
--    এখানে নেই ইচ্ছাকৃতভাবে।
--  - Phase ১-এ শুধু entry_type='earn' লেখা হয়, delta-ভিত্তিক (নতুন total −
--    আগে ledger-এ যা ছিল)। এতে করে কোনো দিন paid হয়ে যাওয়ার পরও দেরিতে আসা
--    sale-এর কমিশন silently হারিয়ে না গিয়ে "এখনো owed" হিসেবে ধরা পড়ে —
--    পুরনো commission টেবিলে এই একই কেসে সরাসরি কিছু করা যেত না (দেখো
--    commission.service.js-এর P0 FIX কমেন্ট, Bug #4)।
--  - payout-side dual-write (payCommission/paySalary) ইচ্ছাকৃতভাবে Phase ১-এ
--    নেই — এখনো পুরনো commission.paid ফ্ল্যাগ-ই একমাত্র সত্য উৎস। payout
--    entry-টাইপ Phase ২-এ যোগ হবে, যখন read path আসলে cutover হবে।
--  - slab_id → commission_settings(id): সেই মুহূর্তে ঠিক কোন slab থেকে rate
--    এসেছিল তার snapshot রাখার জায়গা। commission_settings.id আসলে
--    INTEGER/serial (UUID না) — লাইভ স্কিমা চেক করে নিশ্চিত করা হয়েছে।
--    Phase ১-এ এই কলাম ইচ্ছাকৃতভাবে NULL থাকবে (calculateCommissionRate
--    এখনো slab_id রিটার্ন করে না) — Phase ২-এ পূরণ হবে।
--
-- ⚠️ RLS নোট (গুরুত্বপূর্ণ, আগের প্ল্যানের সংশোধন):
--    এই প্রজেক্টে backend সবসময় `postgres` role দিয়ে কানেক্ট করে
--    (backend.env.example: DB_USER=postgres), যেটা Postgres-এ owner/superuser
--    হিসেবে RLS বাইপাস করে — policy থাকুক বা না থাকুক। তাই এখানে RLS চালু
--    করলেও এটা backend-এর নিজের bug (যেমন tenant_id ফিল্টার ভুলে যাওয়া)
--    থেকে সুরক্ষা দেয় না — সেটা এখনো application-layer guard
--    (commissionLedger.service.js-এর validation) আর isolation টেস্ট থেকেই
--    আসে। এখানে RLS শুধু defense-in-depth: ভবিষ্যতে কেউ সরাসরি Supabase
--    anon/authenticated key দিয়ে অ্যাক্সেস করতে চাইলে তার বিরুদ্ধে (এই
--    প্রজেক্টের অন্য commission-সংক্রান্ত টেবিলগুলোতেও ঠিক এই একই প্যাটার্ন
--    আছে: RLS enabled, policy শূন্য = default deny)।

CREATE TABLE IF NOT EXISTS commission_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  entry_type        TEXT NOT NULL CHECK (entry_type IN ('earn', 'adjustment', 'payout', 'reversal')),
  commission_type   TEXT NOT NULL CHECK (commission_type IN ('daily', 'attendance_bonus')),
  date              DATE NOT NULL,               -- বিক্রয়/বোনাসের তারিখ
  amount            NUMERIC(14,2) NOT NULL,      -- earn/adjustment: +, payout/reversal: -
  sales_amount      NUMERIC(14,2),               -- শুধু daily-earn entry-র জন্য প্রাসঙ্গিক
  commission_rate   NUMERIC(5,2),                -- ঐ মুহূর্তে প্রযোজ্য rate (snapshot)
  slab_id           INTEGER REFERENCES commission_settings(id),  -- Phase ১-এ NULL, দেখো উপরের নোট
  source_type       TEXT,                        -- 'sale' | 'attendance_bonus_rule' | 'commission_payment' | 'salary_payment' | 'manual_adjustment' | 'reversal'
  source_id         TEXT,                        -- সংশ্লিষ্ট রেকর্ডের id — polymorphic বলে TEXT
  idempotency_key   TEXT,
  old_commission_id UUID,                        -- shadow-mode-এ পুরনো commission.id-র সাথে link (Phase ১ reconciliation-এর জন্য; cutover-এর পর drop করা যাবে)
  created_by        UUID REFERENCES users(id),   -- payout/adjustment হলে কোন admin করলো; system-generated earn entries-এ NULL
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- একই ঘটনার duplicate write ঠেকাতে — idempotency_key দিলে unique হতে হবে
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_ledger_idempotency
  ON commission_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_ledger_user_date
  ON commission_ledger(user_id, date);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_tenant
  ON commission_ledger(tenant_id);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_old_commission
  ON commission_ledger(old_commission_id) WHERE old_commission_id IS NOT NULL;

ALTER TABLE commission_ledger ENABLE ROW LEVEL SECURITY;
-- ইচ্ছাকৃতভাবে কোনো policy নেই — অন্য commission-সংক্রান্ত টেবিলের প্যাটার্ন
-- অনুসরণ করে (default deny for anon/authenticated, backend postgres role
-- হিসেবে unaffected)।

-- ✅ সত্যিকারের append-only — DB-level এনফোর্স। এই প্রজেক্টে ইতিমধ্যে
-- money_ledger আর stock_ledger-এ ঠিক এই কনভেনশন আছে (reject_ledger_mutation()
-- ফাংশন, trg_<table>_immutable নাম) — নতুন কিছু বানানো হয়নি, সেটাই অনুসরণ
-- করা হলো। এখন UPDATE/DELETE করার চেষ্টা করলে trigger নিজেই exception
-- ছুঁড়বে — শুধু application-level discipline-এর উপর ভরসা করতে হয় না।
CREATE TRIGGER trg_commission_ledger_immutable
    BEFORE UPDATE OR DELETE ON commission_ledger
    FOR EACH ROW
    EXECUTE FUNCTION reject_ledger_mutation();
