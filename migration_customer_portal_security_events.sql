-- ============================================================
-- ZovoriX — কাস্টমার পোর্টাল: সেলফ-সার্ভিস সিকিউরিটি অ্যাকশনের audit trail
--
-- staff-side audit_logs টেবিল থেকে ইচ্ছাকৃতভাবে আলাদা টেবিল, নতুন করে
-- reuse করা হয়নি: audit_logs.user_id সবসময় tenant staff (users টেবিল)
-- রেফার করে এবং tenant_id-এর সাথে বাঁধা (দেখুন admin.controller.js,
-- employee.controller.js, adminDevice.controller.js-এর ব্যবহার) —
-- customer portal identity (person_id/customer_id) সম্পূর্ণ ভিন্ন
-- namespace, একই টেবিলে mix করলে actor অস্পষ্ট হয়ে যেত। এই প্যাটার্নটা
-- customer_portal_login_events থেকেই অনুসরণ করা হলো, যেটা একই কারণে
-- customer_portal_devices থেকে আলাদা টেবিল হিসেবে বানানো হয়েছিল।
--
-- এই টেবিল শুধু security-sensitive self-service অ্যাকশনের জন্য —
-- পাসওয়ার্ড পরিবর্তন, ডিভাইস revoke, অ্যাকাউন্ট ডিলিট। রুটিন
-- personalization (থিম/ভাষা) এখানে log হয় না, ওসব sensitive না —
-- ওটার জন্য person_preferences.updated_at-ই যথেষ্ট।
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_portal_security_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id    UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,   -- 'PASSWORD_CHANGED' | 'PASSWORD_SET' | 'DEVICE_REVOKED' | 'ACCOUNT_DELETE_REQUESTED'
    table_name   TEXT,
    record_id    UUID,
    old_value    JSONB,
    new_value    JSONB,
    ip_address   TEXT,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_security_events_person
    ON customer_portal_security_events(person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_security_events_customer
    ON customer_portal_security_events(customer_id, created_at DESC) WHERE customer_id IS NOT NULL;

-- ✅ প্রজেক্টের বাকি সব টেবিলের মতোই RLS enabled, কোনো policy ছাড়া —
-- backend service_role দিয়ে কানেক্ট করে, যেটা RLS bypass করে।
ALTER TABLE customer_portal_security_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE customer_portal_security_events IS
    'কাস্টমার পোর্টাল সেলফ-সার্ভিস সিকিউরিটি অ্যাকশনের audit trail (password/device/delete) — staff-side audit_logs থেকে ইচ্ছাকৃতভাবে আলাদা namespace।';
