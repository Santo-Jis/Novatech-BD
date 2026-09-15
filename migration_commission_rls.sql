-- migration_commission_rls.sql
--
-- Commission subsystem — non-bypass role + real RLS policies
--
-- ✅ ইতিমধ্যে Supabase-এ (project: novatechbd) সরাসরি apply করা হয়েছে।
-- এই ফাইলটা repo-তে রাখা হলো শুধু history/tracking-এর জন্য, বাকি
-- migration_*.sql ফাইলগুলোর কনভেনশন মেনে।
--
-- সমস্যা: backend সবসময় `postgres` role দিয়ে কানেক্ট করে (backend.env.example:
-- DB_USER=postgres), যেটা RLS বাইপাস করে (owner/superuser)। ফলে
-- commission_settings-এ RLS enable থাকলেও application-এর নিজের bug
-- (tenant_id ফিল্টার ভুলে যাওয়া) থেকে কোনো সুরক্ষা পাওয়া যায় না।
--
-- সমাধান: commission-সংক্রান্ত queries-এর জন্য একটা আলাদা, সীমিত-ক্ষমতার
-- role বানানো হলো যেটা RLS বাইপাস করে না। শুধু commission.service.js আর
-- commissionLedger.service.js এই নতুন role দিয়ে কানেক্ট করবে (isolated
-- connection pool, দেখো config/tenantScopedDb.js) — বাকি পুরো অ্যাপ্লিকেশন
-- (sales, chat, GPS, settlement, সব) আগের মতোই postgres role দিয়ে চলবে,
-- কিছুই বদলাচ্ছে না। তাই এই পরিবর্তনের ঝুঁকি শুধু commission subsystem-এই
-- সীমাবদ্ধ, পুরো অ্যাপ না।
--
-- Scope: commission_settings, commission, commission_ledger, users (শুধু
-- read, commission টেবিলের tenant-check subquery-র জন্য দরকার যেহেতু
-- commission টেবিলে সরাসরি tenant_id column নেই)।
--
-- ⚠️ এখানকার পাসওয়ার্ড টেম্পোরারি ছিল — apply করার পরপরই Supabase SQL
-- editor-এ গিয়ে ALTER ROLE দিয়ে আসল পাসওয়ার্ড সেট করা হয়েছে, যাতে সেটা
-- কখনো এই ফাইলে/chat history-তে না থাকে। রোল ব্যবহার করতে চাইলে দেখুন
-- README-COMMISSION-RLS.md।
--
-- সীমাবদ্ধতা (ইচ্ছাকৃত, এই ধাপের scope): sales_transactions, collections,
-- credit_payments — এই তিনটাতেও tenant_id column আছে এবং ভবিষ্যতে একই
-- প্যাটার্নে RLS দেওয়া যাবে, কিন্তু এই ধাপে commission.service.js-এর
-- getDailyCommissionableSales() এখনো পুরনো pool-ই ব্যবহার করছে। একইভাবে
-- commission.controller.js, salary.controller.js, bonus.job.js-এর direct
-- commission/commission_settings queries এখনো পুরনো pool-এই — এগুলো একটা
-- পরবর্তী, আলাদা ধাপ হিসেবে প্রস্তাবিত।

CREATE ROLE app_backend WITH LOGIN NOBYPASSRLS PASSWORD 'TEMP_CHANGE_ME_IMMEDIATELY';

GRANT USAGE ON SCHEMA public TO app_backend;

GRANT SELECT ON commission_settings TO app_backend;
GRANT SELECT, INSERT, UPDATE ON commission TO app_backend;
GRANT SELECT, INSERT ON commission_ledger TO app_backend;
GRANT SELECT ON users TO app_backend;

-- commission_settings — সরাসরি tenant_id column আছে
CREATE POLICY app_backend_tenant_scope ON commission_settings
    FOR SELECT
    TO app_backend
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- commission — কোনো tenant_id column নেই, user_id → users.tenant_id দিয়ে চেক
CREATE POLICY app_backend_tenant_scope ON commission
    FOR SELECT
    TO app_backend
    USING (user_id IN (SELECT id FROM users WHERE tenant_id = current_setting('app.tenant_id', true)::uuid));

CREATE POLICY app_backend_tenant_scope_write ON commission
    FOR INSERT
    TO app_backend
    WITH CHECK (user_id IN (SELECT id FROM users WHERE tenant_id = current_setting('app.tenant_id', true)::uuid));

CREATE POLICY app_backend_tenant_scope_update ON commission
    FOR UPDATE
    TO app_backend
    USING (user_id IN (SELECT id FROM users WHERE tenant_id = current_setting('app.tenant_id', true)::uuid))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE tenant_id = current_setting('app.tenant_id', true)::uuid));

-- commission_ledger — সরাসরি tenant_id column আছে
CREATE POLICY app_backend_tenant_scope ON commission_ledger
    FOR SELECT
    TO app_backend
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY app_backend_tenant_scope_write ON commission_ledger
    FOR INSERT
    TO app_backend
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- users — শুধু commission টেবিলের tenant-check subquery-র জন্য read access
CREATE POLICY app_backend_tenant_scope ON users
    FOR SELECT
    TO app_backend
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
