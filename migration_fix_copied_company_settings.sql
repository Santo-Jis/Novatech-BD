-- ============================================================
-- migration_fix_copied_company_settings.sql
--
-- সমস্যা: নতুন tenant তৈরির সময় default tenant (Novatech)-এর সব
-- system_settings কপি হতো — company_name / address / phone / email সহ।
-- ফলে অন্য কোম্পানির Settings → "কোম্পানি তথ্য"-তে Novatech-এর তথ্য দেখাত।
--
-- এই migration শুধু সেই tenant-দের ঠিক করে যাদের মান এখনও default-এর
-- হুবহু কপি (অর্থাৎ admin নিজে কিছু বদলায়নি)। Admin যা বদলেছে তা অক্ষত থাকবে।
-- একাধিকবার চালালেও ক্ষতি নেই (idempotent)।
-- ============================================================

-- ১. কপি হওয়া company_* মান → tenants টেবিলের (signup-এ দেওয়া) নিজস্ব মান
UPDATE system_settings ss
   SET value = v.new_value,
       updated_at = NOW()
  FROM tenants t
  JOIN LATERAL (VALUES
        ('company_name',    t.company_name::text),
        ('company_address', t.company_address::text),
        ('company_phone',   t.company_phone::text),
        ('company_email',   t.company_email::text)
  ) AS v(key, new_value) ON TRUE
 WHERE ss.tenant_id = t.id
   AND ss.key = v.key
   AND t.id <> '00000000-0000-0000-0000-000000000001'
   AND COALESCE(v.new_value, '') <> ''
   AND ss.value IS NOT DISTINCT FROM (
         SELECT d.value FROM system_settings d
          WHERE d.tenant_id = '00000000-0000-0000-0000-000000000001' AND d.key = ss.key);

-- ২. tenants টেবিলে মান নেই কিন্তু default-এর কপি রয়ে গেছে → মুছে দাও (ফাঁকা দেখাবে)
DELETE FROM system_settings ss
 USING tenants t
 WHERE ss.tenant_id = t.id
   AND t.id <> '00000000-0000-0000-0000-000000000001'
   AND ss.key IN ('company_name','company_address','company_phone','company_email')
   AND ss.value IS NOT DISTINCT FROM (
         SELECT d.value FROM system_settings d
          WHERE d.tenant_id = '00000000-0000-0000-0000-000000000001' AND d.key = ss.key);

-- ৩. ⚠️ পেমেন্ট নম্বর (bKash/Nagad) — default-এর কপি থাকলে অন্য কোম্পানির
--    কাস্টমার Novatech-এর নম্বরে টাকা পাঠানোর নির্দেশ দেখতে পারে।
--    নিচের অংশ চালানোর আগে নিশ্চিত হও কোম্পানিগুলো নিজেদের নম্বর বসাবে।
--    (ডিফল্টভাবে comment করা আছে — দরকার হলে /* */ সরিয়ে চালাও)
/*
DELETE FROM system_settings ss
 WHERE ss.tenant_id <> '00000000-0000-0000-0000-000000000001'
   AND ss.key IN ('bkash_number','nagad_number')
   AND ss.value IS NOT DISTINCT FROM (
         SELECT d.value FROM system_settings d
          WHERE d.tenant_id = '00000000-0000-0000-0000-000000000001' AND d.key = ss.key);
*/
