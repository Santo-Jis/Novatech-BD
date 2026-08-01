-- ============================================================
-- Novatech BD — Tenant AI Billing (BYOK + token charge)
-- ৩০ জুলাই ২০২৬
--
-- উদ্দেশ্য:
--  ১. প্রতিটা tenant নিজের AI provider API key ব্যবহার করতে পারবে
--     (OpenAI/Anthropic/Gemini/OpenRouter — সরাসরি বা 3rd-party)।
--  ২. Super Admin ঠিক করবে প্রতিটা tenant platform-এর shared key
--     পাবে (চার্জ সহ) নাকি নিজের key বাধ্যতামূলক, নাকি সম্পূর্ণ বন্ধ।
--  ৩. Token ব্যবহারের উপর চার্জ বসবে (flat rate/1k বা markup %,
--     Super Admin বেছে নেবে — গ্লোবাল ডিফল্ট অথবা প্রতি-tenant override)।
--  ৪. চার্জ existing tenant_wallets/credit_transactions থেকে
--     auto-deduct হবে, balance শেষ হলে platform-key ব্যবহার block।
--
-- IF NOT EXISTS দিয়ে করা — production-এ রান করলে কিছু ভাঙবে না।
-- ============================================================

-- ১. প্রতি-tenant AI সেটিংস
CREATE TABLE IF NOT EXISTS tenant_ai_settings (
    tenant_id               UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

    -- 'own'      → tenant-এর নিজের key বাধ্যতামূলক (না থাকলে AI ফিচার ব্লক)
    -- 'platform' → platform-এর shared key ব্যবহার হবে, wallet থেকে চার্জ কাটবে
    -- 'blocked'  → এই tenant-এর জন্য AI ফিচার সম্পূর্ণ বন্ধ (Super Admin টগল)
    key_source              VARCHAR(20) NOT NULL DEFAULT 'platform'
                            CHECK (key_source IN ('own', 'platform', 'blocked')),

    -- Tenant-এর নিজের key (encrypt করে রাখা হয় — config/encryption.js দিয়ে)
    provider                VARCHAR(30),
    api_key_encrypted       TEXT,
    model_override          VARCHAR(100),

    -- Pricing override (NULL হলে global platform_settings ডিফল্ট ব্যবহার হবে)
    pricing_mode            VARCHAR(10) CHECK (pricing_mode IN ('flat', 'percent')),
    flat_rate_paisa_per_1k  INTEGER,
    markup_percent          NUMERIC(6,2),

    updated_by              UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ২. প্রতিটা AI কলের usage log (audit + billing history)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id),
    source              VARCHAR(30),   -- 'admin_chat' | 'customer_chat' | 'insight_job' ইত্যাদি
    key_source          VARCHAR(20),   -- কল করার সময় 'own' | 'platform' ছিল
    provider            VARCHAR(30),
    model               VARCHAR(100),
    prompt_tokens       INTEGER DEFAULT 0,
    completion_tokens   INTEGER DEFAULT 0,
    total_tokens        INTEGER DEFAULT 0,
    pricing_mode        VARCHAR(10),
    charge_paisa        INTEGER DEFAULT 0,  -- 'own' key হলে সবসময় ০ (platform কোনো চার্জ নেয় না)
    billed              BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_created ON ai_usage_logs(tenant_id, created_at);

-- RLS enable করা হলো নতুন ২টা টেবিলে (২২ জুলাই থেকে established convention —
-- backend `postgres` role দিয়ে connect করে যেটা bypassrls=true, তাই কোনো প্রভাব
-- পড়বে না, কিন্তু anon/authenticated key দিয়ে সরাসরি এক্সেস বন্ধ থাকবে)।
ALTER TABLE tenant_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- ৩. Global pricing defaults (platform_settings-এ, প্রতি-tenant override না থাকলে এগুলো ব্যবহার হবে)
INSERT INTO platform_settings (key, value, description) VALUES
    ('ai_pricing_mode',            'flat', 'ডিফল্ট AI pricing mode: flat | percent'),
    ('ai_flat_rate_paisa_per_1k',  '50',   'প্রতি ১০০০ AI token-এ কত পয়সা চার্জ (flat mode)'),
    ('ai_markup_percent',          '30',   'Provider-এর raw cost-এর উপর কত % markup (percent mode)'),
    ('ai_usd_to_bdt_rate',         '122',  'percent mode-এ USD cost কে BDT-তে convert করার রেট')
ON CONFLICT (key) DO NOTHING;

-- ৪. credit_transactions.type CHECK constraint-এ 'ai_charge' যোগ করো
--    (constraint নাম default Postgres naming ধরে নেওয়া হলো; না থাকলে no-op)
DO $$
BEGIN
    ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
    ALTER TABLE credit_transactions
        ADD CONSTRAINT credit_transactions_type_check
        CHECK (type IN ('recharge', 'refund', 'adjustment', 'sms_charge', 'email_charge', 'ai_charge'));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'credit_transactions constraint update স্কিপ করা হলো: %', SQLERRM;
END $$;
