-- ============================================================
-- ⚠️ এই মাইগ্রেশন এখনো Supabase-এ apply করা হয়নি — Supabase SQL
--    Editor-এ কপি-পেস্ট করে ম্যানুয়ালি চালাতে হবে (migration name
--    হিসেবে ব্যবহার করুন: customer_login_otp)।
-- ============================================================
-- ZovoriX — SR-added কাস্টমারের জন্য "Continue → WhatsApp OTP →
-- সরাসরি লগইন" ফ্লো (পাসওয়ার্ড/Google ছাড়াই, প্রথমবার অ্যাক্সেসের
-- জন্য)।
--
-- customer_password_reset_otps থেকে ইচ্ছাকৃতভাবে আলাদা টেবিল:
-- সেটার ফলাফল একটা reset_token (যেটা দিয়ে পরে password সেট করতে
-- হয়) — এখানে OTP যাচাই হলেই সরাসরি JWT সেশন ইস্যু হয়ে যায়,
-- password কোথাও ছোঁয়া হয় না। দুটো ভিন্ন ফলাফল একই টেবিলে রাখলে
-- verify/reset এন্ডপয়েন্টগুলোয় purpose-branching লাগত — তার
-- চেয়ে registration-verification vs password-reset OTP যেভাবে
-- আগে থেকেই আলাদা টেবিলে আছে, সেই একই কনভেনশন অনুসরণ করা হলো।
--
-- customer_password_reset_otps/customer_portal_login_events-এর
-- মতোই owner-keyed (customer_id/person_id, ঠিক একটা) — বর্তমান
-- স্কোপে শুধু customer_id ব্যবহার হবে (SR-added, customer_code
-- দিয়ে খোঁজা হয়), person_id ভবিষ্যতে self-registered person-দের
-- জন্য একই মেকানিজম চাইলে সহজে যোগ করা যাবে বলে রাখা হলো।
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_login_otps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    person_id   UUID REFERENCES persons(id)   ON DELETE CASCADE,
    otp         TEXT NOT NULL,               -- HMAC hash, plain OTP কখনো DB-তে যায় না
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_login_otps_owner_chk
        CHECK ((customer_id IS NOT NULL)::int + (person_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS idx_login_otps_customer
    ON customer_login_otps(customer_id) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_otps_person
    ON customer_login_otps(person_id) WHERE person_id IS NOT NULL;

-- customer_portal_login_events.login_method-এ এখন তৃতীয় মান যোগ
-- হচ্ছে: 'whatsapp_otp' (আগে থেকে ছিল 'password' | 'google')। এটা
-- একটা প্লেইন TEXT কলাম, কোনো CHECK/ENUM constraint নেই — তাই কোনো
-- ALTER দরকার নেই, শুধু ডকুমেন্টেশনের জন্য এখানে উল্লেখ রাখা হলো।

COMMENT ON TABLE customer_login_otps IS 'SR-added কাস্টমারের প্রথমবার/পরবর্তী লগইনের জন্য WhatsApp OTP — সফল হলে সরাসরি JWT সেশন ইস্যু হয়, password ছোঁয়া হয় না';
