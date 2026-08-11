-- ============================================================
-- Migration Step ৮: Per-Warehouse Stock ভিত্তি (ধাপ ১ — সমান্তরাল/additive)
-- ============================================================
-- এই মাইগ্রেশন products.stock-কে একবিন্দুও বদলায় না — এটা একটা সমান্তরাল
-- warehouse_stock লেজার তৈরি করে যা ভবিষ্যতে কন্ট্রোলারগুলো পাশাপাশি আপডেট
-- করবে। কোনো বিদ্যমান ফ্লো (POS/অর্ডার/রিটার্ন) এই মাইগ্রেশনের কারণে ভাঙবে না।

-- ── ১. warehouse_stock টেবিল ──────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_stock (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity     INTEGER NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_tenant  ON warehouse_stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON warehouse_stock(product_id);

COMMENT ON TABLE warehouse_stock IS
    'products.stock-এর সমান্তরাল, গুদাম-ভিত্তিক স্টক লেজার। products.stock এখনো
     সোর্স অফ ট্রুথ (POS/রিপোর্ট/অ্যালার্ট সব এটাই পড়ে) — এই টেবিল ভবিষ্যতে ধীরে
     ধীরে প্রতিটা কন্ট্রোলারে পাশাপাশি সিঙ্ক করা হবে।';

-- ── ২. বিদ্যমান products.stock ডিফল্ট গুদামে ব্যাকফিল ──────────
-- (এখন প্রতিটা tenant-এর একটাই গুদাম আছে, তাই এই মুহূর্তে total stock =
--  সেই গুদামের স্টক ধরে নেওয়া নিরাপদ)
INSERT INTO warehouse_stock (tenant_id, warehouse_id, product_id, quantity)
SELECT p.tenant_id, w.id, p.id, COALESCE(p.stock, 0)
FROM products p
JOIN warehouses w ON w.tenant_id = p.tenant_id AND w.is_default = true
ON CONFLICT (warehouse_id, product_id) DO NOTHING;

-- ── ৩. orders-এ warehouse_id (কোন গুদাম থেকে SR-কে ইস্যু হলো) ──
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

UPDATE orders o
SET warehouse_id = w.id
FROM warehouses w
WHERE w.tenant_id = o.tenant_id AND w.is_default = true
  AND o.warehouse_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON orders(warehouse_id);
