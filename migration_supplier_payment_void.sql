-- migration_supplier_payment_void.sql
-- ভুল সাপ্লায়ার পেমেন্ট বাতিল (soft-void) — রেকর্ড মোছা হয় না, শুধু voided_at/কারণ বসে।
-- বাতিল পেমেন্ট বকেয়ার হিসাব ও PO-বরাদ্দ থেকে বাদ যায়।
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS voided_at  TIMESTAMPTZ;
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS voided_by  UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_supplier_payments_active
    ON supplier_payments (supplier_id) WHERE voided_at IS NULL;
