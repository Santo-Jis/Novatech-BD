-- Step ৫: মাল্টিপল প্রাইস লিস্ট (পাইকারি/খুচরা/এলাকাভিত্তিক) + চ্যানেল সাপোর্ট
-- চ্যানেল ৩টা: van_sales (SR-এর সরাসরি বিক্রি), app_ecommerce (in-app কাস্টমার পোর্টাল),
-- public_ecommerce (ভবিষ্যতের পাবলিক স্টোরফ্রন্ট — এখনই স্কিমা রেডি রাখা হচ্ছে, UI এখনো নেই)
--
-- ⚠️ এই ফাইলটা রেফারেন্সের জন্য — ইতিমধ্যে Supabase MCP দিয়ে সরাসরি
-- প্রোডাকশন DB-তে চালানো হয়ে গেছে (project: javqvlntzcymqyivovhc)।

CREATE TABLE IF NOT EXISTS price_lists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    name_bn     VARCHAR(150),
    price_type  VARCHAR(20) NOT NULL DEFAULT 'custom' CHECK (price_type IN ('wholesale','retail','area','custom')),
    channel     VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (channel IN ('van_sales','app_ecommerce','public_ecommerce','all')),
    is_default  BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    notes       TEXT,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_list_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id  UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price          NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (price_list_id, product_id)
);

CREATE TABLE IF NOT EXISTS price_list_areas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id  UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    route_id       UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (price_list_id, route_id)
);

CREATE TABLE IF NOT EXISTS price_list_customers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id  UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, price_list_id)
);

CREATE INDEX IF NOT EXISTS idx_price_lists_tenant_channel   ON price_lists(tenant_id, channel, is_active);
CREATE INDEX IF NOT EXISTS idx_price_list_items_list        ON price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_price_list_items_product     ON price_list_items(product_id);
CREATE INDEX IF NOT EXISTS idx_price_list_areas_route       ON price_list_areas(route_id);
CREATE INDEX IF NOT EXISTS idx_price_list_customers_customer ON price_list_customers(customer_id);

ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_customers ENABLE ROW LEVEL SECURITY;
-- policy নেই (repo-র বাকি সব টেবিলের মতোই), app-layer tenant_id ফিল্টারিং-এর ওপর নির্ভর করে
