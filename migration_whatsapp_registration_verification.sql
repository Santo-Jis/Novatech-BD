-- ============================================================
-- ✅ এই মাইগ্রেশন ইতিমধ্যে Supabase project "novatechbd"-এ Claude দিয়ে
--    সরাসরি apply করা হয়েছে (migration name: whatsapp_registration_verification)।
--    এই ফাইলটা শুধু repo-তে রেফারেন্স/ট্র্যাকিং — অন্য environment-এ লাগলে
--    ম্যানুয়ালি চালাতে হবে।
-- ============================================================
-- ZovoriX — কাস্টমার সেলফ-রেজিস্ট্রেশনে WhatsApp নম্বর OTP verification
-- (বাধ্যতামূলক) — এবং forgot-password-এ WhatsApp OTP চ্যানেল
--
-- এই টেবিলটা migration_customer_password_auth.sql-এর
-- customer_password_reset_otps থেকে ইচ্ছাকৃতভাবে আলাদা রাখা হলো:
-- রেজিস্ট্রেশনের সময় এখনো কোনো customer/person রেকর্ড তৈরিই হয়নি, তাই
-- owner FK (customer_id/person_id) দিয়ে রাখা সম্ভব না — phone নম্বর
-- নিজেই key এখানে।
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_verification_otps (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone            TEXT NOT NULL,                 -- normalized 01XXXXXXXXX ফরম্যাটে
    otp              TEXT NOT NULL,                 -- HMAC hash, plain OTP DB-তে যায় না
    expires_at       TIMESTAMPTZ NOT NULL,
    used             BOOLEAN NOT NULL DEFAULT false,
    verify_token     TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_verify_phone ON whatsapp_verification_otps(phone);
CREATE INDEX IF NOT EXISTS idx_wa_verify_token ON whatsapp_verification_otps(verify_token) WHERE verify_token IS NOT NULL;

COMMENT ON TABLE whatsapp_verification_otps IS 'Self-registration WhatsApp OTP verification — phone-keyed (owner তৈরি হওয়ার আগেই ব্যবহৃত হয়)';
