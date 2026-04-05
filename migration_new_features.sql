-- ============================================================
-- NovaTechBD — নতুন ফিচারের জন্য SQL Migration
-- চালানোর নিয়ম: Supabase SQL Editor-এ কপি-পেস্ট করুন
-- ============================================================

-- ১. নোটিশ বোর্ড টেবিল
CREATE TABLE IF NOT EXISTS notices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        VARCHAR(200)    NOT NULL,
    message      TEXT            NOT NULL,
    target_role  VARCHAR(20)     NOT NULL DEFAULT 'all',  -- 'all', 'worker', 'manager', 'admin'
    created_by   UUID            REFERENCES users(id),
    expires_at   TIMESTAMPTZ,
    is_active    BOOLEAN         DEFAULT true,
    created_at   TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notices_active ON notices(is_active, target_role, expires_at);

-- ২. বিক্রয়ে ভ্যাট ও ডিসকাউন্ট কলাম যোগ
ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS vat_rate       NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vat_amount     NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_type  VARCHAR(10) DEFAULT 'percent', -- 'percent' | 'fixed'
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS net_amount     NUMERIC(12,2) GENERATED ALWAYS AS
        (total_amount + COALESCE(vat_amount,0) - COALESCE(discount_amount,0)) STORED;

-- ৩. AI Chat history টেবিল (optional — লগ রাখার জন্য)
CREATE TABLE IF NOT EXISTS ai_chat_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id),
    message    TEXT NOT NULL,
    reply      TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_user ON ai_chat_logs(user_id, created_at DESC);

-- ৪. System settings-এ নতুন কী যোগ (ভ্যাট ডিফল্ট)
INSERT INTO system_settings (key, value, description)
VALUES
    ('default_vat_rate',     '0',     'ডিফল্ট ভ্যাট হার (%)'),
    ('vat_enabled',          'false',  'ভ্যাট সিস্টেম চালু/বন্ধ'),
    ('max_discount_percent', '20',    'সর্বোচ্চ ডিসকাউন্ট (%)'),
    ('notice_max_days',      '30',    'নোটিশের সর্বোচ্চ মেয়াদ (দিন)')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- যাচাই করুন
-- ============================================================
SELECT 'notices table: ' || COUNT(*)::text FROM notices;
SELECT 'vat_rate column exists: ' || COUNT(*)::text
FROM information_schema.columns
WHERE table_name = 'sales_transactions' AND column_name = 'vat_rate';
