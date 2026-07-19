-- ============================================================
-- Novatech BD — Super Admin Phase 3 (TICKET-08)
-- `tenants` টেবিলের schema — repo-তে version-control করার জন্য
-- (আগে এই টেবিল শুধু live Supabase-এ ছিল, কোনো migration ফাইল ছিল না)
--
-- ⚠️ এই টেবিল ইতিমধ্যে production Supabase-এ আছে ও ব্যবহার হচ্ছে।
-- এই ফাইল রান করলে কিছু ভাঙবে না — সব `IF NOT EXISTS` দিয়ে করা, তাই
-- existing DB-তে রান করলে no-op হবে। মূল উদ্দেশ্য: fresh/নতুন DB সেটআপ
-- করার সময় (স্টেজিং/টেস্ট এনভায়রনমেন্ট) এই টেবিল যেন এক কমান্ডেই তৈরি
-- হয়ে যায়, আর schema-টা git history-তে ট্র্যাক থাকে।
--
-- চালানোর নিয়ম: Supabase SQL Editor-এ কপি-পেস্ট করুন
-- সোর্স: live schema থেকে 19 July 2026-এ generate করা
--   (information_schema.columns + pg_constraint + pg_indexes দিয়ে
--    যাচাই করে হুবহু মেলানো হয়েছে)
-- ============================================================

-- ১. মূল টেবিল
CREATE TABLE IF NOT EXISTS tenants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- পরিচিতি
    slug                    VARCHAR(50)  NOT NULL UNIQUE,   -- সাবডোমেইন/ইউআরএল-এ ব্যবহৃত হবে
    company_name            VARCHAR(200) NOT NULL,
    company_name_bn         VARCHAR(200),
    company_address         TEXT,
    company_phone           VARCHAR(20),
    company_email           VARCHAR(100),
    logo_url                TEXT,

    -- Subscription / lifecycle
    status                  VARCHAR(20) DEFAULT 'trial'
                            CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
    plan                    VARCHAR(20) DEFAULT 'basic'
                            CHECK (plan IN ('basic', 'pro', 'enterprise')),
    trial_ends_at           TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    subscription_ends_at    TIMESTAMPTZ,

    -- Plan limits
    max_employees           INTEGER DEFAULT 10,
    max_customers            INTEGER DEFAULT 200,
    ai_tokens_monthly       INTEGER DEFAULT 50000,
    ai_tokens_used          INTEGER DEFAULT 0,
    ai_reset_at             TIMESTAMPTZ DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),

    -- Billing
    billing_email           VARCHAR(100),
    billing_name            VARCHAR(200),

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ২. Default tenant seed (fresh DB-তে দরকার — এই id-টাই কোডে
--    DEFAULT_TENANT_ID হিসেবে hardcode করা আছে, backward-compat fallback-এর জন্য)
INSERT INTO tenants (id, slug, company_name, status, plan)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'novatechbd',
    'NovaTech BD',
    'active',
    'enterprise'
)
ON CONFLICT (id) DO NOTHING;

-- ৩. Note: index তৈরিতে UNIQUE constraint (slug) থেকেই automatically
--    ইনডেক্স হয়ে যায় (tenants_slug_key), তাই আলাদা করে CREATE INDEX
--    লাগে না — শুধু স্পষ্টতার জন্য এখানে উল্লেখ করা হলো:
--    tenants_pkey       → id (PRIMARY KEY)
--    tenants_slug_key   → slug (UNIQUE)

-- ============================================================
-- ভবিষ্যতে যদি tenant সংখ্যা অনেক বেড়ে যায় এবং status/plan দিয়ে
-- ঘনঘন ফিল্টার করা লাগে (Super Admin dashboard-এ), তখন যোগ করার কথা
-- ভাবা যেতে পারে (এখনই দরকার নেই, ১টা tenant থাকা অবস্থায়):
--
-- CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
-- CREATE INDEX IF NOT EXISTS idx_tenants_plan   ON tenants(plan);
-- ============================================================
