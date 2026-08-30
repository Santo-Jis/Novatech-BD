-- ============================================================
-- TENANT FIRST ACTIVATED AT — ২৬ আগস্ট ২০২৬
-- ------------------------------------------------------------
-- বাগ: trial থেকে active-এ রূপান্তরের আগের ট্রায়াল-দিনগুলোও
-- jobs/tenantInvoice.job.js ভুলভাবে বিল করে ফেলতো (arrears, পুরো
-- ক্যালেন্ডার মাস ধরে) — কারণ tenant_seat_history-তে ট্রায়ালের
-- সময়ের সিটও (onboarding.controller.js-এর ফিক্সড রেটে) রেকর্ড
-- থাকতো, আর জব শুধু "এখন active কিনা" দেখতো, "পুরো মাস active
-- ছিল কিনা" না। উদাহরণ: ২৬ তারিখে প্ল্যান কিনলে, পরের মাসের ১
-- তারিখের জব ভুলভাবে পুরো আগের মাস (১-৩১) ধরে বিল করতো, অথচ
-- ১-২৫ আসলে ফ্রি ট্রায়াল ছিল।
--
-- ফিক্স: trial→active রূপান্তরের ঠিক মুহূর্তে এই কলাম সেট হয়
-- (planBooking.service.js::approveBooking, COALESCE দিয়ে —
-- শুধু প্রথমবার, পরের প্ল্যান-বদলে ছোঁয়া হয় না) অথবা সরাসরি
-- paid signup-এ creation-এই (planBooking.service.js নতুন tenant
-- পথ, superAdmin.controller.js::createTenant)। জব এই তারিখের
-- আগের কোনো দিন কখনো বিল করে না, tenant_seat_history যাই বলুক।
--
-- NULL হলে (এই ফিচারের আগে থেকেই active থাকা legacy tenant) —
-- কোনো ক্ল্যাম্প হয় না, আগের আচরণ (পুরো পিরিয়ড) বজায় থাকে।
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS first_activated_at TIMESTAMPTZ;

-- NovaTech BD (প্রোডাকশন) — আগেই ম্যানুয়ালি সেটআপ করা হয়েছিল
-- (plan=erp, tenant_seat_history effective_from=2000-01-01)। সেই
-- একই সেন্টিনেল তারিখ, ব্যাখ্যাযোগ্য/সামঞ্জস্যপূর্ণ রাখতে।
UPDATE tenants SET first_activated_at = '2000-01-01T00:00:00Z'::timestamptz
WHERE id = '00000000-0000-0000-0000-000000000001' AND first_activated_at IS NULL;
