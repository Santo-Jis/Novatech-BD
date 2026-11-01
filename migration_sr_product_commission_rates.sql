-- ============================================================
-- SR × প্রডাক্ট ভিত্তিক আলাদা কমিশন রেট
-- ============================================================
-- উদাহরণ: X প্রডাক্টে Y SR নগদ আদায় করলে ২%, একই X প্রডাক্টে Z SR পাবে ১.৩%।
--
-- রেট বাছাইয়ের অগ্রাধিকার (উপর থেকে নিচে):
--   1) sr_product_commission_rates-এ (SR, প্রডাক্ট) জোড়ার রেট        ← এই ফাইলের টেবিল
--   2) users.commission_rate_override (SR-এর সব-প্রডাক্ট নির্দিষ্ট রেট)
--   3) কোম্পানির স্ল্যাব (commission_settings)
--
-- কোনো সারি না থাকলে আচরণ হুবহু আগের মতো — বিদ্যমান ডেটা বদলায় না।
-- নিরাপদে বারবার চালানো যায়।
-- ============================================================

CREATE TABLE IF NOT EXISTS sr_product_commission_rates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    worker_id   UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rate        NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, worker_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_srpcr_worker  ON sr_product_commission_rates (tenant_id, worker_id);
CREATE INDEX IF NOT EXISTS idx_srpcr_product ON sr_product_commission_rates (tenant_id, product_id);

COMMENT ON TABLE sr_product_commission_rates IS
  'নির্দিষ্ট SR-এর নির্দিষ্ট প্রডাক্টের কমিশন হার (%)। সারি না থাকলে SR-এর নির্দিষ্ট রেট, তা-ও না থাকলে স্ল্যাব।';
