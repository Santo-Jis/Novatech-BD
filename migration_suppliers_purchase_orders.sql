-- ============================================================
-- Novatech BD — ধাপ ৩: Supplier + Purchase Order সিস্টেম
-- চালানোর নিয়ম: Supabase SQL Editor-এ কপি-পেস্ট করুন
-- IF NOT EXISTS দিয়ে করা — আগে থেকে টেবিল থাকলে কিছু ভাঙবে না।
-- ============================================================

-- ============================================================
-- ১. SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name           VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone          VARCHAR(30),
    email          VARCHAR(150),
    address        TEXT,
    notes          TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- একই tenant-এ একই নামে দুইবার সাপ্লায়ার যোগ হবে না (ভুলে ডুপ্লিকেট ঠেকাতে)
    UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- ============================================================
-- ২. PURCHASE ORDERS
-- status: 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled'
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    po_number     VARCHAR(40) NOT NULL,
    supplier_id   UUID NOT NULL REFERENCES suppliers(id),
    status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'ordered', 'partial', 'received', 'cancelled')),
    order_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    notes         TEXT,
    total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- PO নাম্বার প্রতি tenant-এ ইউনিক (যেমন PO-202607-0001)
    UNIQUE (tenant_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_tenant          ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier         ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_tenant_status    ON purchase_orders(tenant_id, status);

-- ============================================================
-- ৩. PURCHASE ORDER ITEMS
-- quantity_received সময়ে সময়ে (আংশিক চালান) বাড়তে থাকে
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id        UUID NOT NULL REFERENCES products(id),
    quantity_ordered  INTEGER NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (quantity_received <= quantity_ordered)
);

CREATE INDEX IF NOT EXISTS idx_poi_po      ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_product ON purchase_order_items(product_id);

-- ============================================================
-- নোট: মাল গ্রহণ (receive) করার সময় stock_movements টেবিলে
-- movement_type='in', reference_type='purchase', reference_id=purchase_orders.id
-- দিয়ে লগ হবে — নতুন কোনো "receipts" টেবিল লাগেনি, বিদ্যমান
-- stock_movements-ই GRN history হিসেবে কাজ করবে (StockMovementsModal.jsx
-- এ আগে থেকেই 'purchase' রেফারেন্স টাইপের label বসানো ছিল)।
-- ============================================================
