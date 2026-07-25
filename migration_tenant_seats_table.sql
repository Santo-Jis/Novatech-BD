-- ============================================================
-- Novatech BD — Seat-limit enforcement
-- `tenant_seats` টেবিলের schema — repo-তে version-control করার জন্য
--
-- ⚠️ এই টেবিলে onboarding.controller.js signup-এর সময় role অনুযায়ী
-- seat_count ইনসার্ট করে (ON CONFLICT (tenant_id, role) DO UPDATE),
-- আর employee.controller.js এখন থেকে সেটা আসলে enforce করে (নতুন
-- কর্মচারী তৈরি / archived কর্মচারী reactivate করার সময়)।
--
-- IF NOT EXISTS দিয়ে করা — আগে থেকে টেবিল থাকলে কিছু ভাঙবে না।
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_seats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role        VARCHAR(30) NOT NULL,      -- 'manager' | 'worker' | 'shop_keeper' | 'stock_keeper'
    seat_count  INTEGER NOT NULL DEFAULT 0 CHECK (seat_count >= 0),
    rate_locked INTEGER,                   -- সাইনআপের সময়ের ৳/মাস রেট (পরে দাম বাড়লেও এই tenant-এর জন্য লক থাকে)
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),

    -- প্রতিটা tenant-এর প্রতিটা role-এর জন্য একটাই row থাকবে
    -- (onboarding.controller.js-এর ON CONFLICT (tenant_id, role) এর জন্য দরকার)
    UNIQUE (tenant_id, role)
);

CREATE INDEX IF NOT EXISTS idx_tenant_seats_tenant_id ON tenant_seats(tenant_id);

-- users টেবিলে (tenant_id, role) দিয়ে COUNT(*) করা হয় প্রতিটা
-- কর্মচারী-তৈরির রিকোয়েস্টে (assertSeatAvailable, employee.controller.js),
-- তাই এই কম্বিনেশনে ইনডেক্স থাকা জরুরি (না থাকলে ইউজার সংখ্যা বাড়ার
-- সাথে সাথে প্রতিটা create-employee কল ধীর হয়ে যাবে)
CREATE INDEX IF NOT EXISTS idx_users_tenant_role_status ON users(tenant_id, role, status);
