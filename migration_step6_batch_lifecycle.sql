-- ============================================================
-- Migration Step ৬: Batch Lifecycle (Admin ব্যাচ ও মেয়াদ — Phase ২)
-- ============================================================
-- এই মাইগ্রেশন সম্পূর্ণ additive — কোনো existing কলাম/টেবিল মোছে না,
-- কোনো ডেটা হারায় না। নতুন কলামগুলোর ডিফল্ট ভ্যালু আছে, তাই পুরনো
-- কোড (PO receive, FEFO consumption ইত্যাদি) আগের মতোই কাজ করবে।
--
-- যা যোগ হচ্ছে:
--   ১. product_batches: status, unit_cost, supplier_id, purchase_order_id
--   ২. batch_adjustments: স্ট্যাটাস পরিবর্তন/রাইট-অফের audit log
-- ============================================================

-- ── ১. product_batches — লাইফসাইকেল ও সোর্স ট্র্যাকিং কলাম ──────
ALTER TABLE product_batches
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC,
    ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id),
    ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id);

-- status শুধু নির্দিষ্ট কয়েকটা মান নিতে পারবে
ALTER TABLE product_batches
    DROP CONSTRAINT IF EXISTS product_batches_status_check;
ALTER TABLE product_batches
    ADD CONSTRAINT product_batches_status_check
    CHECK (status IN ('active', 'quarantine', 'damaged', 'written_off', 'returned_to_supplier'));

CREATE INDEX IF NOT EXISTS idx_product_batches_status      ON product_batches(status);
CREATE INDEX IF NOT EXISTS idx_product_batches_supplier_id ON product_batches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_po_id       ON product_batches(purchase_order_id);

COMMENT ON COLUMN product_batches.status IS
    'active=বিক্রয়যোগ্য | quarantine=সাময়িক হোল্ড | damaged=ক্ষতিগ্রস্ত | written_off=রাইট-অফ করা হয়েছে | returned_to_supplier=সাপ্লায়ারকে ফেরত। শুধু active ব্যাচ FEFO কনজাম্পশনে বিবেচিত হয়।';
COMMENT ON COLUMN product_batches.unit_cost IS
    'এই ব্যাচ রিসিভ করার সময়কার ইউনিট কস্ট (স্ন্যাপশট) — products.cost_price পরে ওয়েটেড-এভারেজে বদলে গেলেও এই ব্যাচের ঐতিহাসিক মূল্য অক্ষত থাকে।';

-- ── ২. batch_adjustments — স্ট্যাটাস পরিবর্তন/রাইট-অফের audit log ──
CREATE TABLE IF NOT EXISTS batch_adjustments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    batch_id            UUID NOT NULL REFERENCES product_batches(id) ON DELETE CASCADE,
    action              TEXT NOT NULL, -- quarantine | damaged | written_off | returned_to_supplier | reactivated
    quantity_before     INTEGER,
    quantity_after      INTEGER,
    quantity_adjusted   INTEGER,       -- কতটুকু স্টক থেকে সরানো হলো (write-off/return এর ক্ষেত্রে)
    value_impact        NUMERIC,       -- টাকার অঙ্কে ক্ষতি/প্রভাব (quantity_adjusted × unit_cost)
    reason              TEXT,
    expense_id          UUID REFERENCES expenses(id),
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_adjustments_batch_id  ON batch_adjustments(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_adjustments_tenant_id ON batch_adjustments(tenant_id);

COMMENT ON TABLE batch_adjustments IS
    'ব্যাচ ও মেয়াদ পেইজে ম্যানুয়াল স্ট্যাটাস পরিবর্তন (quarantine/damaged/write-off/return) এর অডিট ট্রেইল — কে, কখন, কেন, কত টাকার প্রভাব।';
