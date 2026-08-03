-- Phase 2: সাপ্লায়ার প্রোফাইল সম্প্রসারণ — ব্যবসায়িক তথ্য, কমপ্লায়েন্স, পেমেন্ট শর্ত, স্ট্রাকচার্ড ঠিকানা
-- নেমিং/টাইপ কনভেনশন persons টেবিলের division_id/district_id প্যাটার্ন থেকে নেওয়া,
-- আর payment_terms/supplier_type-এর জন্য CHECK constraint স্টাইল purchase_orders.status থেকে নেওয়া।
--
-- Supabase-এ ইতিমধ্যে apply করা হয়েছে (migration: add_supplier_profile_fields)।
-- এই ফাইলটা শুধু repo-তে ট্র্যাকিং/অন্য এনভায়রনমেন্টে রান করার জন্য।

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS supplier_type VARCHAR(20) NOT NULL DEFAULT 'other'
        CHECK (supplier_type IN ('raw_material', 'finished_goods', 'service', 'other')),

    ADD COLUMN IF NOT EXISTS tin_number VARCHAR(30),
    ADD COLUMN IF NOT EXISTS bin_number VARCHAR(30),
    ADD COLUMN IF NOT EXISTS trade_license_no VARCHAR(50),
    ADD COLUMN IF NOT EXISTS trade_license_expiry DATE,

    ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(20) NOT NULL DEFAULT 'net_30'
        CHECK (payment_terms IN ('cod', 'net_15', 'net_30', 'net_45', 'net_60')),

    ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bank_account_no VARCHAR(50),
    ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(100),
    ADD COLUMN IF NOT EXISTS mfs_provider VARCHAR(20)
        CHECK (mfs_provider IS NULL OR mfs_provider IN ('bkash', 'nagad', 'rocket', 'upay', 'other')),
    ADD COLUMN IF NOT EXISTS mfs_number VARCHAR(20),

    ADD COLUMN IF NOT EXISTS division_id INTEGER REFERENCES bd_divisions(id),
    ADD COLUMN IF NOT EXISTS district_id INTEGER REFERENCES bd_districts(id);

CREATE INDEX IF NOT EXISTS idx_suppliers_type     ON suppliers(tenant_id, supplier_type);
CREATE INDEX IF NOT EXISTS idx_suppliers_district ON suppliers(district_id);
