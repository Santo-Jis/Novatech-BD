-- ============================================================
-- কোম্পানির খরচ — ধাপ ২:
--   ক) অগ্রিম খরচ (বছরের বিমা, অগ্রিম ভাড়া) — একবার দিয়ে কয়েক মাসে সমান ভাগ
--   খ) ক্যাটাগরি অনুযায়ী মাসিক বাজেট (ডিফল্ট + নির্দিষ্ট মাসের ব্যতিক্রম)
-- আগে migration_company_expense_categories_recurring.sql চালাতে হবে।
-- সব IF NOT EXISTS — বারবার চালালে ক্ষতি নেই।
-- ============================================================

CREATE TABLE IF NOT EXISTS prepaid_expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id    UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    expense_type   VARCHAR(100) NOT NULL,
    total_amount   NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
    months         SMALLINT NOT NULL CHECK (months BETWEEN 2 AND 60),
    start_month    DATE NOT NULL,                 -- ভাগ শুরুর মাসের ১ তারিখ
    paid_date      DATE NOT NULL,                 -- টাকা আসলে যেদিন দেওয়া হয়েছে
    payment_method VARCHAR(20),
    paid_to        VARCHAR(150),
    receipt_url    TEXT,
    note           VARCHAR(500),
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prepaid_expenses_tenant ON prepaid_expenses (tenant_id);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS prepaid_expense_id UUID REFERENCES prepaid_expenses(id) ON DELETE SET NULL;

-- একই অগ্রিম খরচের একই মাসের কিস্তি দুবার ঢোকা আটকায়
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_prepaid_date
    ON expenses (prepaid_expense_id, date)
    WHERE prepaid_expense_id IS NOT NULL;

-- month NULL = প্রতি মাসের ডিফল্ট বাজেট; তারিখ থাকলে (মাসের ১ তারিখ) শুধু ওই মাসের
CREATE TABLE IF NOT EXISTS expense_budgets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
    month       DATE,
    amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_budgets
    ON expense_budgets (tenant_id, category_id, COALESCE(month, DATE '1900-01-01'));

-- ============================================================
-- RLS — এই প্রজেক্টের সব টেবিলের মতো চালু, policy ছাড়া (backend `postgres`
-- role দিয়ে যায়, তাই বাইপাস হয়; Supabase-এর পাবলিক API দিয়ে কেউ পড়তে পারবে না)।
-- ধাপ ১-এর টেবিলগুলোও এখানে।
-- ============================================================
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepaid_expenses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_budgets    ENABLE ROW LEVEL SECURITY;
