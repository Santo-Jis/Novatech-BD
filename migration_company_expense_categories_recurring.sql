-- ============================================================
-- কোম্পানির খরচ — ধাপ ১:
--   ক) ক্যাটাগরির তালিকা (প্রতি tenant নিজে যোগ/নাম বদল/বন্ধ করতে পারবে)
--   খ) নির্দিষ্ট মাসিক খরচ (ভাড়া, ইন্টারনেট ইত্যাদি) — মাসে মাসে নিজে জমা হবে
--   গ) পেমেন্ট পদ্ধতি, কাকে দেওয়া হলো, রসিদের ছবি
--
-- আগে migration_expenses_link_reports.sql ও migration_expenses_source.sql চালাতে হবে।
-- সব IF NOT EXISTS — বারবার চালালে ক্ষতি নেই।
-- চালানোর নিয়ম: Supabase SQL Editor-এ কপি-পেস্ট করুন।
--
-- নকশার সিদ্ধান্ত: expenses.expense_type (টেক্সট) আগের মতোই থাকছে এবং ক্যাটাগরির
-- নাম সেখানে লেখা হয়, তাই P&L / লেজার রিপোর্ট (expense_type দিয়ে GROUP BY) একটুও
-- বদলাতে হয়নি। category_id শুধু নাম-বদল ও বন্ধ করার জন্য।
-- ============================================================

-- ১. ক্যাটাগরি
CREATE TABLE IF NOT EXISTS expense_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON expense_categories (tenant_id);

-- বিদ্যমান সব tenant-এ আগের স্থির তালিকাটা বসিয়ে দিই
INSERT INTO expense_categories (tenant_id, name, sort_order)
SELECT t.id, d.name, d.ord
  FROM tenants t
 CROSS JOIN (VALUES
    ('অফিস ভাড়া', 1), ('গুদাম ভাড়া', 2), ('বিদ্যুৎ বিল', 3), ('পানি/গ্যাস বিল', 4),
    ('ইন্টারনেট/ফোন বিল', 5), ('গাড়ি/জ্বালানি', 6), ('মেরামত ও রক্ষণাবেক্ষণ', 7),
    ('অফিস সামগ্রী', 8), ('মার্কেটিং/বিজ্ঞাপন', 9), ('আপ্যায়ন', 10),
    ('আইনি/ট্যাক্স/লাইসেন্স ফি', 11), ('অন্যান্য', 12)
 ) AS d(name, ord)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ২. নির্দিষ্ট মাসিক খরচের টেমপ্লেট
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    expense_type    VARCHAR(100) NOT NULL,           -- ক্যাটাগরির নামের কপি (P&L-এর জন্য)
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    day_of_month    SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
    start_date      DATE NOT NULL,                   -- এই তারিখ বা পরের প্রথম day_of_month থেকে শুরু
    end_date        DATE,                            -- খালি = অনির্দিষ্টকাল
    payment_method  VARCHAR(20),
    paid_to         VARCHAR(150),
    note            VARCHAR(500),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_tenant ON recurring_expenses (tenant_id, is_active);

-- ৩. expenses টেবিলে নতুন কলাম
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category_id          UUID REFERENCES expense_categories(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method       VARCHAR(20);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_to              VARCHAR(150);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url          TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL;

-- একই টেমপ্লেট থেকে একই তারিখে দুবার খরচ ঢোকা আটকায় (job বারবার চললেও নিরাপদ)
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_recurring_date
    ON expenses (recurring_expense_id, date)
    WHERE recurring_expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (tenant_id, category_id);

-- ৪. পুরনো manual খরচ: নাম মিললে category_id জুড়ে দিই
UPDATE expenses e
   SET category_id = c.id
  FROM expense_categories c
 WHERE e.category_id IS NULL
   AND e.source = 'manual'
   AND c.tenant_id = e.tenant_id
   AND c.name = e.expense_type;
