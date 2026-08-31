-- ============================================================
-- migration_connection_blocking.sql
-- Phase 3 (কোড অডিট — connection পেইজ) — customer_company_connections-এ
-- 'blocked' status যোগ করা।
--
-- ⚠️ নোট: এই bundle-এ customer_company_connections টেবিলের মূল migration
-- ফাইল পাওয়া যায়নি (সম্ভবত সরাসরি Supabase Studio-তে বানানো হয়েছিল,
-- কোড অডিটের সময়ও এটা একটা পর্যবেক্ষণ ছিল)। তাই status কলামে ঠিক কী
-- constraint আছে (বা আদৌ আছে কিনা) নিশ্চিতভাবে জানা সম্ভব হয়নি। এই
-- migration তাই defensively লেখা হয়েছে — CHECK constraint থাকলে
-- ডায়নামিকভাবে খুঁজে বের করে replace করে, না থাকলে চুপচাপ শুধু নতুন
-- constraint যোগ করে। বারবার চালালেও নিরাপদ (idempotent)।
--
-- PRODUCTION-এ চালানোর আগে স্টেজিং-এ একবার যাচাই করে নেওয়ার পরামর্শ থাকল।
-- ============================================================

BEGIN;

-- ১. কে ব্লক করেছে ও কখন — নতুন কলাম (idempotent)
ALTER TABLE customer_company_connections
    ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS blocked_by VARCHAR(10);

DO $$
BEGIN
    ALTER TABLE customer_company_connections
        ADD CONSTRAINT customer_company_connections_blocked_by_check
        CHECK (blocked_by IS NULL OR blocked_by IN ('company', 'customer'));
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'blocked_by constraint আগে থেকেই আছে, স্কিপ করা হলো';
END $$;

-- ২. status কলামের বিদ্যমান CHECK constraint (যদি থাকে) ডায়নামিকভাবে
-- খুঁজে বের করে 'blocked' সহ পুনরায় তৈরি করো — constraint-এর আসল নাম
-- আগে থেকে জানা নেই বলে pg_constraint থেকে লুকআপ করা হচ্ছে।
DO $$
DECLARE
    existing_constraint TEXT;
BEGIN
    SELECT con.conname INTO existing_constraint
    FROM pg_constraint con
    JOIN pg_class rel     ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'customer_company_connections'
      AND con.contype = 'c'
      AND att.attname = 'status'
    LIMIT 1;

    IF existing_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE customer_company_connections DROP CONSTRAINT %I', existing_constraint);
        RAISE NOTICE 'পুরনো status constraint (%) সরানো হলো, নতুন করে বসানো হচ্ছে', existing_constraint;
    ELSE
        RAISE NOTICE 'status কলামে কোনো CHECK constraint পাওয়া যায়নি (app-level validation-নির্ভর ছিল) — নতুন constraint যোগ করা হচ্ছে';
    END IF;

    ALTER TABLE customer_company_connections
        ADD CONSTRAINT customer_company_connections_status_check
        CHECK (status IN ('pending', 'connected', 'rejected', 'disconnected', 'blocked'));
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'status constraint আগে থেকেই ঠিক আছে, স্কিপ করা হলো';
END $$;

COMMIT;

-- ============================================================
-- রোলব্যাক (দরকার হলে ম্যানুয়ালি চালানোর জন্য, এই migration-এর অংশ না):
--
-- ALTER TABLE customer_company_connections
--     DROP CONSTRAINT IF EXISTS customer_company_connections_status_check,
--     DROP CONSTRAINT IF EXISTS customer_company_connections_blocked_by_check,
--     DROP COLUMN IF EXISTS blocked_at,
--     DROP COLUMN IF EXISTS blocked_by;
-- (⚠️ রোলব্যাকের আগে status='blocked' থাকা row থাকলে সেগুলো আগে অন্য
-- status-এ সরিয়ে নিতে হবে, নইলে নতুন constraint যোগ করার সময় এরর দেবে)
-- ============================================================
