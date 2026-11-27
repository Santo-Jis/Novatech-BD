-- migration_supplier_payment_allocations.sql
--
-- সাপ্লায়ার পেমেন্ট → নির্দিষ্ট Purchase Order-এ বরাদ্দ (per-PO allocation)
--
-- ডিজাইন (payment_allocations / supplier_payments-এর মতোই "computed", stored নয়):
--   * purchase_orders-এ paid/due কলাম যোগ হচ্ছে না।
--   * PO-র পেইড = SUM(supplier_payment_allocations.amount), বাকি = total_amount − পেইড
--   * একটা পেমেন্ট একাধিক PO-তে ভাগ হতে পারে, তাই আলাদা join টেবিল।
--   * supplier-level বকেয়ার ফর্মুলা (SUM(PO) − SUM(payments)) অপরিবর্তিত।
--
-- ⚠️ এই ফাইল রান করার পরেই নতুন backend deploy করুন।

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_id         UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    purchase_order_id  UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_payment_alloc_unique_idx
    ON supplier_payment_allocations (payment_id, purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_supplier_payment_alloc_po
    ON supplier_payment_allocations (purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_supplier_payment_alloc_tenant
    ON supplier_payment_allocations (tenant_id);

-- ============================================================
-- ব্যাকফিল: আগের পেমেন্ট (যেগুলোর কোনো বরাদ্দ নেই) পুরনো PO থেকে শুরু করে (FIFO) বসানো।
-- বারবার চালালেও নিরাপদ — শুধু বরাদ্দহীন পেমেন্টে কাজ করে, বাকি থাকা PO-তেই বসায়।
-- ============================================================
DO $$
DECLARE
    pay RECORD;
    po  RECORD;
    left_amt NUMERIC;
    po_due   NUMERIC;
    take     NUMERIC;
BEGIN
    FOR pay IN
        SELECT sp.id, sp.tenant_id, sp.supplier_id, sp.amount
        FROM supplier_payments sp
        WHERE NOT EXISTS (SELECT 1 FROM supplier_payment_allocations a WHERE a.payment_id = sp.id)
        ORDER BY sp.created_at ASC
    LOOP
        left_amt := pay.amount;
        FOR po IN
            SELECT p.id, p.total_amount
            FROM purchase_orders p
            WHERE p.supplier_id = pay.supplier_id
              AND p.tenant_id   = pay.tenant_id
              AND p.status IN ('ordered','partial','received')
            ORDER BY p.order_date ASC, p.created_at ASC
        LOOP
            EXIT WHEN left_amt <= 0;
            po_due := po.total_amount - COALESCE(
                (SELECT SUM(a.amount) FROM supplier_payment_allocations a WHERE a.purchase_order_id = po.id), 0);
            CONTINUE WHEN po_due <= 0;
            take := LEAST(left_amt, po_due);
            INSERT INTO supplier_payment_allocations (tenant_id, payment_id, purchase_order_id, amount)
            VALUES (pay.tenant_id, pay.id, po.id, take);
            left_amt := left_amt - take;
        END LOOP;
    END LOOP;
END $$;
