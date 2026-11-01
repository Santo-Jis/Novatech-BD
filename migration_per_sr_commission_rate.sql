-- ============================================================
-- SR ভিত্তিক আলাদা কমিশন রেট
-- ============================================================
-- users.commission_rate_override:
--   NULL   → কোম্পানির স্ল্যাব (commission_settings) অনুযায়ী, আগের মতোই
--   0..100 → এই SR সব বিক্রয়ে এই নির্দিষ্ট শতাংশ পাবে (স্ল্যাব উপেক্ষা)
--
-- শুধু একটি nullable কলাম যোগ হচ্ছে — বিদ্যমান ডেটা/আচরণ বদলায় না।
-- নিরাপদে বারবার চালানো যায় (IF NOT EXISTS)।
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS commission_rate_override NUMERIC(5,2) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_commission_rate_override_range'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_commission_rate_override_range
      CHECK (commission_rate_override IS NULL
             OR (commission_rate_override >= 0 AND commission_rate_override <= 100));
  END IF;
END $$;

COMMENT ON COLUMN users.commission_rate_override IS
  'SR-এর নিজস্ব কমিশন হার (%)। NULL = কোম্পানির স্ল্যাব ব্যবহার হবে।';
