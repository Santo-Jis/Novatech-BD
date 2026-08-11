-- ============================================================
-- Migration Step ৭: মাল্টি-ওয়্যারহাউজ ভিত্তি (ধাপ ১ — শুধু স্কিমা, additive)
-- ============================================================
-- এই মাইগ্রেশন সম্পূর্ণ additive ও ব্যাকওয়ার্ড-কম্প্যাটিবল:
--   - warehouse_id কলামগুলো নাল-এবল রাখা হয়েছে (এখনো কোনো কন্ট্রোলার এটা সেট
--     করে না, তাই NOT NULL করলে এখনই PO/batch তৈরি ভেঙে যাবে — সেটা পরের
--     ধাপে কন্ট্রোলার আপডেট হওয়ার পর করা হবে)
--   - বিদ্যমান সব product_batches/purchase_orders রো তাদের tenant-এর ডিফল্ট
--     "প্রধান গুদাম"-এ backfill হয়ে যাবে — কিছু ভাঙবে না
-- ============================================================

-- ── ১. warehouses টেবিল ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    code        VARCHAR(30),
    address     TEXT,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses(tenant_id);

-- প্রতি tenant-এ সর্বোচ্চ একটাই ডিফল্ট গুদাম থাকতে পারবে (DB-লেভেলে guaranteed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_one_default_per_tenant
    ON warehouses(tenant_id) WHERE is_default = true;

COMMENT ON TABLE warehouses IS
    'একাধিক গুদাম/স্টক-লোকেশন সাপোর্টের ভিত্তি। is_default=true গুদামটাই নতুন ব্যাচ/PO-র
     ডিফল্ট হবে যদি ব্যবহারকারী সুনির্দিষ্ট কিছু না বেছে নেয়।';

-- ── ২. প্রতিটা বিদ্যমান tenant-এর জন্য ডিফল্ট "প্রধান গুদাম" তৈরি ──
INSERT INTO warehouses (tenant_id, name, code, is_default, is_active)
SELECT t.id, 'প্রধান গুদাম', 'MAIN', true, true
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.tenant_id = t.id AND w.is_default = true
);

-- ── ৩. product_batches-এ warehouse_id ────────────────────────
ALTER TABLE product_batches
    ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

UPDATE product_batches b
SET warehouse_id = w.id
FROM warehouses w
WHERE w.tenant_id = b.tenant_id AND w.is_default = true
  AND b.warehouse_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_batches_warehouse ON product_batches(warehouse_id);

-- ── ৪. purchase_orders-এ warehouse_id ────────────────────────
ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

UPDATE purchase_orders po
SET warehouse_id = w.id
FROM warehouses w
WHERE w.tenant_id = po.tenant_id AND w.is_default = true
  AND po.warehouse_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse ON purchase_orders(warehouse_id);
