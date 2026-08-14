-- ============================================================
-- ✅ এই মাইগ্রেশন ইতিমধ্যে Supabase project "novatechbd"-এ Claude দিয়ে
--    সরাসরি apply করা হয়েছে (migration name: customer_portal_login_events)।
--    এই ফাইলটা শুধু repo-তে রেফারেন্স/ট্র্যাকিং — অন্য environment-এ লাগলে
--    ম্যানুয়ালি চালাতে হবে।
-- ============================================================
-- ZovoriX — কাস্টমার পোর্টাল: লগইন ইভেন্ট ট্র্যাকিং (device + location)
--
-- customer_portal_devices থেকে ইচ্ছাকৃতভাবে আলাদা টেবিল — ওখানে
-- customer_id ও google_email কলাম NOT NULL, তাই company-বিহীন
-- person-দের (password login-এ যাদের customer_id নেই) জন্য কাজ করে
-- না। এই নতুন টেবিল customer_id/person_id দুটোর যেকোনো একটা
-- সমর্থন করে (customer_password_reset_otps-এর মতো একই প্যাটার্ন),
-- এবং password ও Google — দুই লগইন মেথডের জন্যই কাজ করে।
--
-- উদ্দেশ্য: নতুন ডিভাইস থেকে লগইন হলে (এবং প্রথমবার লগইন না হলে)
-- customer কে email/WhatsApp-এ সতর্কতা পাঠানো, city/country সহ।
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_portal_login_events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id        UUID REFERENCES customers(id) ON DELETE CASCADE,
    person_id          UUID REFERENCES persons(id)   ON DELETE CASCADE,
    login_method       TEXT NOT NULL,        -- 'password' | 'google'
    device_fingerprint TEXT,
    ip_address         TEXT,
    city               TEXT,
    country            TEXT,
    user_agent         TEXT,
    is_new_device      BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_portal_login_events_owner_chk
        CHECK ((customer_id IS NOT NULL)::int + (person_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS idx_login_events_customer
    ON customer_portal_login_events(customer_id, device_fingerprint) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_login_events_person
    ON customer_portal_login_events(person_id, device_fingerprint) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_login_events_created
    ON customer_portal_login_events(created_at);

COMMENT ON TABLE customer_portal_login_events IS 'Password + Google login events — device/location tracking for new-device security alerts';
