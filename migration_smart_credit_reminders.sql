-- migration_smart_credit_reminders.sql
--
-- স্মার্ট বাকি-রিমাইন্ডারের জন্য। শুধু কলাম/টেবিল/ইনডেক্স যোগ হয়, কোনো ডেটা বদলায় না।
-- বারবার চালানো নিরাপদ (IF NOT EXISTS)।
-- ⚠️ নতুন job deploy করার আগে এটা রান করুন।

-- ১) রিমাইন্ডার লগে ধাপ/চ্যানেল/তখনকার বাকি রেকর্ড
ALTER TABLE credit_reminder_logs
    ADD COLUMN IF NOT EXISTS stage        SMALLINT,        -- ১..৫ (ম্যানুয়ালে NULL)
    ADD COLUMN IF NOT EXISTS channel      VARCHAR(30),     -- whatsapp / email / whatsapp+email / staff
    ADD COLUMN IF NOT EXISTS amount_due   NUMERIC(12,2),   -- তখনকার ইনভয়েস-ভিত্তিক বাকি
    ADD COLUMN IF NOT EXISTS oldest_due_days INT,          -- সবচেয়ে পুরনো অপরিশোধিত ইনভয়েসের বয়স
    ADD COLUMN IF NOT EXISTS source       VARCHAR(10) DEFAULT 'manual'; -- auto / manual

-- "শেষ রিমাইন্ডার কবে" — job-এর সবচেয়ে বেশি চলা query
CREATE INDEX IF NOT EXISTS idx_credit_reminder_logs_cust_sent
    ON credit_reminder_logs (customer_id, sent_at DESC);

-- ২) কাস্টমার "আমি ... তারিখে দেব" বললে রিমাইন্ডার বন্ধ রাখার তথ্য
CREATE TABLE IF NOT EXISTS credit_reminder_snoozes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
    customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    snoozed_until  DATE NOT NULL,
    promised_amount NUMERIC(12,2),
    created_by     VARCHAR(20) NOT NULL DEFAULT 'customer',  -- customer / sr / admin
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_reminder_snoozes_cust
    ON credit_reminder_snoozes (customer_id, snoozed_until DESC);

-- বাকি সব টেবিলের মতো: RLS চালু, policy নেই (backend postgres রোলে বাইপাস করে)
ALTER TABLE credit_reminder_snoozes ENABLE ROW LEVEL SECURITY;

-- ৩) অটো-রিমাইন্ডারে কখনো কখনো কোনো SR থাকে না — sr_id NOT NULL থাকলে তা শিথিল করা (NULL থাকলেও নিরাপদ)
ALTER TABLE credit_reminder_logs ALTER COLUMN sr_id DROP NOT NULL;
