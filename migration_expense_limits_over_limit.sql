-- ============================================================
-- SR খরচ: প্রতি-কর্মী দৈনিক সীমা + সীমা ছাড়ালে অনুমোদন-সাপেক্ষ জমা
-- শুধু কলাম যোগ (নিরাপদ, আবার চালালেও ক্ষতি নেই)।
-- ============================================================

-- NULL = কোম্পানির সাধারণ সীমা (system_settings.expense_daily_limit) প্রযোজ্য
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS expense_daily_limit NUMERIC(10,2)
    CHECK (expense_daily_limit IS NULL OR expense_daily_limit >= 0);

-- সীমা ছাড়ালে true + কর্মীর দেওয়া কারণ; ম্যানেজার অনুমোদনের সময় দেখেন
ALTER TABLE expense_reports
    ADD COLUMN IF NOT EXISTS over_limit        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS over_limit_reason TEXT;
