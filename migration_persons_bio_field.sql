-- customer পোর্টাল প্রোফাইল — শপ-ফটোর নিচে Facebook-স্টাইল bio টেক্সট
-- (Section 1 হেডার রিডিজাইনের অংশ, persons.profile_photo-এর পাশাপাশি)
--
-- ⚠️ এই ফাইলটা এখনো Supabase-এ apply করা হয়নি (আগের migration ফাইলগুলোর
-- মতো "already applied, শুধু ট্র্যাকিং" না) — Supabase Dashboard-এর SQL
-- Editor-এ এই স্টেটমেন্টটা রান করে নিতে হবে, নাহলে getMyAreaAndField/
-- updateMyAreaAndField-এর নতুন bio কলাম-রেফারেন্স ব্যর্থ হবে।

ALTER TABLE persons
    ADD COLUMN IF NOT EXISTS bio VARCHAR(280);
