-- Phase 4: Payable Ledger — সাপ্লায়ারকে করা প্রতিটা পেমেন্ট এখানে রেকর্ড হবে।
--
-- ডিজাইন সিদ্ধান্ত: customers.current_credit-এর মতো stored+trigger কলাম না রেখে
-- ইচ্ছাকৃতভাবে "computed" রাখা হলো — বকেয়া = SUM(counted PO) - SUM(payments),
-- সবসময় সার্ভার-সাইডে freshly হিসাব হয়। কারণ PO-র multi-status lifecycle
-- (draft→ordered→partial/received/cancelled) থাকায় sales_transactions-এর মতো
-- simple "AFTER INSERT" ট্রিগার দিয়ে নির্ভরযোগ্যভাবে ব্যালেন্স মেইনটেইন করা কঠিন।
--
-- idempotency_key প্যাটার্ন credit_payments থেকে হুবহু নেওয়া (partial unique index)।
--
-- Supabase-এ ইতিমধ্যে apply করা হয়েছে (migration: create_supplier_payments_table)।
-- এই ফাইলটা শুধু repo-তে ট্র্যাকিং/অন্য এনভায়রনমেন্টে রান করার জন্য।

CREATE TABLE IF NOT EXISTS supplier_payments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method   VARCHAR(20) NOT NULL DEFAULT 'cash'
        CHECK (payment_method IN ('cash','bank_transfer','cheque','bkash','nagad','other')),
    reference_no     VARCHAR(100),
    notes            TEXT,
    recorded_by      UUID REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key  TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_payments_idempotency_key_idx
    ON supplier_payments (idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_date
    ON supplier_payments(supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant
    ON supplier_payments(tenant_id);
