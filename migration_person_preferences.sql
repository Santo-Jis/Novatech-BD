-- ============================================================
-- ZovoriX — কাস্টমার পোর্টাল: থিম / ভাষা / নোটিফিকেশন পছন্দ
--
-- আগে এগুলো শুধু frontend localStorage-এ থাকতো (PersonalizationPage.jsx) —
-- backend-এ persist হতো না, তাই নতুন ডিভাইসে লগইন করলেই সব সেটিং
-- হারিয়ে যেত। এই টেবিল person-level (customer/tenant-level না) —
-- getPersonId() pattern-এর সাথে সামঞ্জস্যপূর্ণ, কারণ একই person
-- একাধিক তেনন্টের সাথে connected থাকতে পারে এবং পছন্দ সব জায়গায়
-- একই হওয়া উচিত।
--
-- notification_prefs JSONB — ক্যাটাগরি ভবিষ্যতে বাড়লে (এখন:
-- order/invoice/promo/chat/security) নতুন মাইগ্রেশন ছাড়াই যোগ করা
-- যাবে; কিন্তু validation controller-এ (customerPortalProfile.controller.js)
-- হয়, DB লেভেলে না।
-- ============================================================

CREATE TABLE IF NOT EXISTS person_preferences (
    person_id           UUID PRIMARY KEY REFERENCES persons(id) ON DELETE CASCADE,
    theme                TEXT NOT NULL DEFAULT 'system',
    language             TEXT NOT NULL DEFAULT 'bn',
    notification_prefs   JSONB NOT NULL DEFAULT '{
        "order":    {"push": true,  "sms": true,  "email": true},
        "invoice":  {"push": true,  "sms": true,  "email": true},
        "promo":    {"push": true,  "sms": false, "email": false},
        "chat":     {"push": true,  "sms": false, "email": false},
        "security": {"push": true,  "sms": true,  "email": true}
    }'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT person_preferences_theme_chk    CHECK (theme IN ('light', 'dark', 'system')),
    CONSTRAINT person_preferences_language_chk CHECK (language IN ('bn', 'en'))
);

-- ✅ প্রজেক্টের বাকি সব টেবিলের মতোই RLS enabled, কোনো policy ছাড়া —
-- backend service_role দিয়ে কানেক্ট করে, যেটা RLS bypass করে (persons/
-- customers/customer_portal_login_events-এও একই সেটআপ, লাইভ স্কিমা
-- চেক করে কনফার্ম করা হয়েছে)।
ALTER TABLE person_preferences ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE person_preferences IS
    'কাস্টমার পোর্টাল: থিম/ভাষা/নোটিফিকেশন পছন্দ — person-level, multi-tenant connection জুড়ে একই সেট। row না থাকলে API ডিফল্ট রিটার্ন করে; প্রথম PUT-এ upsert হয়।';
