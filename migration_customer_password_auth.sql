-- ============================================================
-- ✅ এই মাইগ্রেশন ইতিমধ্যে Supabase project "novatechbd"-এ Claude দিয়ে
--    সরাসরি apply করা হয়েছে (migration name: customer_password_auth)।
--    এই ফাইলটা শুধু repo-তে রেফারেন্স/ট্র্যাকিং হিসেবে রাখা — অন্য কোনো
--    environment (staging/local) সেটাপ করলে ওখানে ম্যানুয়ালি চালাতে হবে।
-- ============================================================
-- ZovoriX — কাস্টমার পোর্টাল: Password দিয়ে লগইন (Google-এর বিকল্প)
-- চালানোর নিয়ম: Supabase SQL Editor-এ কপি-পেস্ট করুন
--
-- প্রেক্ষাপট: এতদিন কাস্টমার পোর্টালে শুধু Google login ছিল।
-- এখন identifier (email/মোবাইল) + password দিয়েও লগইন করা যাবে।
--
-- ডিজাইন: password_hash দুই জায়গায় রাখা হচ্ছে — persons (global identity,
-- নতুন self-register flow) এবং customers (tenant-bound legacy রেকর্ড) —
-- ঠিক যেভাবে email কলামও দুই টেবিলেই আলাদাভাবে আছে এবং directGoogleAuth
-- দুটোকেই আলাদাভাবে হ্যান্ডেল করে। login lookup customers আগে চেক করে,
-- না পেলে persons — Google auth flow-এর প্যাটার্ন হুবহু অনুসরণ করে।
-- ============================================================

-- ১. password_hash কলাম যোগ (nullable — পুরনো Google-only কাস্টমার/person-দের
--    জন্য NULL থাকবে, যতক্ষণ না তারা রেজিস্ট্রেশনে বা "পাসওয়ার্ড রিসেট"
--    ফ্লো দিয়ে একটা সেট করে)
ALTER TABLE persons
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ২. Password reset / প্রথমবার পাসওয়ার্ড সেট করার OTP টেবিল
--    (staff-side password_reset_otps থেকে আলাদা — ওটার user_id
--    FK শুধু users(id)-এর দিকে, customer/person আলাদা identity)
CREATE TABLE IF NOT EXISTS customer_password_reset_otps (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id      UUID REFERENCES customers(id) ON DELETE CASCADE,
    person_id        UUID REFERENCES persons(id)   ON DELETE CASCADE,
    otp              TEXT NOT NULL,               -- HMAC hash, plain OTP কখনো DB-তে যায় না
    expires_at       TIMESTAMPTZ NOT NULL,
    used             BOOLEAN NOT NULL DEFAULT false,
    reset_token      TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- ঠিক একটা owner থাকতে হবে — customer_id ও person_id দুটো একসাথে
    -- বা দুটোই খালি থাকতে পারবে না
    CONSTRAINT customer_password_reset_otps_owner_chk
        CHECK ((customer_id IS NOT NULL)::int + (person_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS idx_cpwreset_customer
    ON customer_password_reset_otps(customer_id) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cpwreset_person
    ON customer_password_reset_otps(person_id) WHERE person_id IS NOT NULL;

-- ৩. identifier দিয়ে লগইন lookup দ্রুত করার জন্য ইনডেক্স
--    (আগে থেকে থাকতে পারে — IF NOT EXISTS দিয়ে নিরাপদ)
CREATE INDEX IF NOT EXISTS idx_customers_email_lower
    ON customers (LOWER(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_persons_email_lower
    ON persons (LOWER(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_whatsapp
    ON customers (whatsapp) WHERE whatsapp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_persons_whatsapp
    ON persons (whatsapp) WHERE whatsapp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_sms_phone
    ON customers (sms_phone) WHERE sms_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_persons_phone
    ON persons (phone) WHERE phone IS NOT NULL;
