-- Phase 5: Product-Supplier ম্যাপিং — কোন সাপ্লায়ার কোন পণ্য কী দামে/কত দিনে সরবরাহ করে।
-- PurchaseOrders.jsx-এর "Create PO" ফর্মে পণ্য বাছাইয়ের সময় এই দর অটো-সাজেস্ট হিসেবে
-- ব্যবহৃত হয় (ম্যাপিং না থাকলে products.cost_price-এ ফলব্যাক, আগের মতোই)।
--
-- UNIQUE (supplier_id, product_id) — একই সাপ্লায়ারের একই পণ্যে একটাই বর্তমান দর থাকবে,
-- দাম বদলালে নতুন রো না বানিয়ে বিদ্যমান রো আপডেট হয় (ON CONFLICT ... DO UPDATE)।
--
-- Supabase-এ ইতিমধ্যে apply করা হয়েছে (migration: create_supplier_products_table)।
-- এই ফাইলটা শুধু repo-তে ট্র্যাকিং/অন্য এনভায়রনমেন্টে রান করার জন্য।

CREATE TABLE IF NOT EXISTS supplier_products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    lead_time_days  INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_product  ON supplier_products(product_id);
