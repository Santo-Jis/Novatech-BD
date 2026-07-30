-- ============================================================
-- Novatech BD — ধাপ ১: cost_price + category/brand + low-stock reorder alert
-- চালানোর নিয়ম: Supabase SQL Editor-এ কপি-পেস্ট করুন
-- IF NOT EXISTS / ADD COLUMN IF NOT EXISTS দিয়ে করা — আগে থেকে
-- কলাম/টেবিল থাকলেও নিরাপদে চালানো যাবে, কিছু ভাঙবে না।
-- ============================================================

-- ============================================================
-- ১. PRODUCT CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS product_categories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    name_bn    VARCHAR(100),
    parent_id  UUID REFERENCES product_categories(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant ON product_categories(tenant_id);

-- ============================================================
-- ২. PRODUCTS টেবিলে নতুন কলাম
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price     NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id    UUID REFERENCES product_categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand          VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point  INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- ============================================================
-- নোট: এই মাইগ্রেশনটা আগে GitHub রিপোতে না থাকায় কোড আর DB
-- স্কিমা এতদিন সিঙ্কে ছিল না — এখন থেকে backend/src/controllers/
-- product.controller.js ও category.controller.js এই কলামগুলো
-- ব্যবহার করবে।
-- ============================================================
