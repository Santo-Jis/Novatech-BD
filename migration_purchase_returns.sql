-- migration_purchase_returns.sql
-- সাপ্লায়ারকে মাল ফেরত (Purchase Return / Debit Note)
--
-- ফেরত রেকর্ড হলে:
--   * স্টক কমে (products.stock, warehouse_stock, product_batches) এবং stock_movements-এ 'out' লগ হয়
--   * সাপ্লায়ারের বকেয়া কমে: বকেয়া = গৃহীত মাল − ফেরত − পেমেন্ট
--   * ফেরতের অঙ্ক = ফেরত পরিমাণ × PO-তে গ্রহণকৃত unit_cost (যা বকেয়ায় যোগ হয়েছিল)
-- কোনো stored balance নেই — আগের মতোই সবকিছু compute হয়।

CREATE TABLE IF NOT EXISTS purchase_returns (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    return_number      VARCHAR(30) NOT NULL,
    purchase_order_id  UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    supplier_id        UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    total_amount       NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    reason             TEXT NOT NULL,
    note               TEXT,
    created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_returns_number_unique_idx ON purchase_returns (tenant_id, return_number);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_po       ON purchase_returns (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns (supplier_id);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    return_id   UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost   NUMERIC(14,4) NOT NULL,
    line_total  NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return  ON purchase_return_items (return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product ON purchase_return_items (product_id);

ALTER TABLE purchase_returns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;
