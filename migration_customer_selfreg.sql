-- ============================================================
-- ZovoriX — কাস্টমার সেলফ-রেজিস্ট্রেশন + Verification Badge
-- চালানোর নিয়ম: Supabase SQL Editor-এ কপি-পেস্ট করুন
-- ============================================================

-- ১. নতুন কলাম যোগ করা
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS is_verified          BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verified_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by          UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS registration_source  VARCHAR(20) NOT NULL DEFAULT 'staff';
    -- registration_source: 'staff' (SR/Manager/Admin ফর্ম পূরণ করেছে) | 'self' (কাস্টমার নিজে রেজিস্টার করেছে)

-- ২. পুরনো কাস্টমার যাদের আগে থেকেই sale আছে, তাদের verified হিসেবে backfill
--    (নতুন ফিচার চালুর পর established কাস্টমাররা যেন হঠাৎ "Unverified" না দেখায়)
UPDATE customers
SET is_verified = true,
    verified_at = COALESCE(verified_at, NOW())
WHERE is_verified = false
  AND id IN (SELECT DISTINCT customer_id FROM sales_transactions);

-- ৩. Unverified লিস্ট ফিল্টার করার জন্য ইনডেক্স
CREATE INDEX IF NOT EXISTS idx_customers_unverified
    ON customers(tenant_id, is_verified)
    WHERE is_verified = false;

-- ৪. একই WhatsApp নম্বরে বারবার সেলফ-রেজিস্ট্রেশন ঠেকাতে (active কাস্টমারের ক্ষেত্রে)
CREATE INDEX IF NOT EXISTS idx_customers_whatsapp_active
    ON customers(whatsapp)
    WHERE is_active = true AND whatsapp IS NOT NULL;
