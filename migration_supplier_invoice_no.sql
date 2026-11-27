-- migration_supplier_invoice_no.sql
-- মাল গ্রহণের সময় সাপ্লায়ারের চালান/ইনভয়েস নম্বর রাখার জন্য (বিল মেলানো সহজ করতে)।
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_invoice_no VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_invoice
    ON purchase_orders (tenant_id, supplier_invoice_no) WHERE supplier_invoice_no IS NOT NULL;
