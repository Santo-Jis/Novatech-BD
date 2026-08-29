-- ============================================================
-- TRIAL EXPIRED STATUS — ২০ আগস্ট ২০২৬
-- ------------------------------------------------------------
-- এতদিন trial_ends_at শুধু তথ্য হিসেবে সেভ হতো, কোথাও enforce হতো না —
-- ৩ মাস পার হয়ে গেলেও tenant status='trial'-এই থেকে যেত, পূর্ণ অ্যাক্সেস
-- চালু থাকতো, কখনো বিলও হতো না।
--
-- এখন: jobs/trialExpiry.job.js প্রতিদিন trial_ends_at পার হওয়া trial
-- tenant-দের status='trial_expired'-এ নিয়ে আসবে। middlewares/auth.js
-- আর controllers/auth.controller.js উভয়েই এই স্ট্যাটাসে শুধু admin
-- role-কে ঢুকতে দেয় (আপগ্রেড পেজ দেখার জন্য), বাকি সব role ব্লক।
-- frontend/src/layouts/AdminLayout.jsx-এ admin-এর জন্য পুরো UI ব্লক
-- করে শুধু আপগ্রেড CTA দেখানো হয়।
--
-- 'suspended' থেকে ইচ্ছাকৃতভাবে আলাদা রাখা হলো — 'suspended' সাধারণত
-- Super Admin-এর ম্যানুয়াল অ্যাকশন (non-payment/violation ইত্যাদি),
-- যেখানে admin-সহ কাউকেই ঢুকতে দেওয়া ঠিক না। 'trial_expired' একটা
-- softer, self-service অবস্থা — admin-কে আপগ্রেড-পথ দেখানো দরকার।
-- ============================================================

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
    CHECK (status IN ('trial', 'active', 'suspended', 'cancelled', 'trial_expired'));
