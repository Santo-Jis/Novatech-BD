-- ============================================================
-- ✅ এই মাইগ্রেশন ইতিমধ্যে Supabase project "novatechbd"-এ Claude দিয়ে
--    সরাসরি apply করা হয়েছে (migration name: customer_email_verification)।
--    এই ফাইলটা শুধু repo-তে রেফারেন্স/ট্র্যাকিং — অন্য environment-এ লাগলে
--    ম্যানুয়ালি চালাতে হবে।
-- ============================================================
-- ZovoriX — সেলফ-রেজিস্ট্রেশনে দেওয়া ইমেইল ভেরিফাই করা (magic-link)
--
-- WhatsApp-এর মতো ভারী OTP-টাইপিং ট্রিটমেন্ট না — email ঐচ্ছিক বলে
-- হালকা click-to-verify লিংক। persons টেবিলেই রাখা হচ্ছে, কারণ
-- সেলফ-রেজিস্ট্রেশনে দেওয়া email সবসময় persons.email-এ যায়
-- (customers.email আলাদা — Google OAuth থেকে আসে, তাই ইতিমধ্যেই
-- Google-verified, নতুন করে ভেরিফাই করার দরকার নেই)।
-- ============================================================

ALTER TABLE persons
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_verify_token TEXT,
    ADD COLUMN IF NOT EXISTS email_verify_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_persons_email_verify_token
    ON persons (email_verify_token) WHERE email_verify_token IS NOT NULL;

COMMENT ON COLUMN persons.email_verified IS 'সেলফ-রেজিস্ট্রেশনে দেওয়া ইমেইল magic-link দিয়ে ভেরিফাই হয়েছে কিনা';
