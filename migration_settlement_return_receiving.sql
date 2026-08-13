-- migration_settlement_return_receiving.sql
-- Applied live to Supabase project javqvlntzcymqyivovhc on 2026-08-11.
--
-- PHASE 2: split "SR claims a return" from "warehouse confirms receipt".
--
-- Previously, when an SR marked units as returned_qty in a settlement
-- (settlement.controller.js -> createSettlement), the code only removed
-- those units from the SR's personal sr_stock_ledger. It never credited
-- products.stock back — so the warehouse's recorded stock silently drifted
-- lower than physical reality over time, and there was no independent
-- verification of the SR's claim.
--
-- This table is the missing link: every declared return now first lands
-- here as 'pending'. A manager/warehouse role must physically count and
-- confirm (POST /api/settlement-returns/:id/receive) before
-- products.stock is actually incremented — and only by the confirmed
-- qty_received, not the SR's original qty_claimed.
--
-- Verified against live data before applying: 0 of the 6 existing
-- daily_settlements rows had any returned_qty > 0, so no backfill of
-- historical data was needed.

CREATE TYPE return_receipt_status AS ENUM ('pending', 'received', 'discrepancy');

CREATE TABLE settlement_return_receipts (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    settlement_id     UUID NOT NULL REFERENCES daily_settlements(id) ON DELETE CASCADE,
    worker_id         UUID NOT NULL REFERENCES users(id),
    product_id        UUID NOT NULL REFERENCES products(id),
    product_name      TEXT,
    qty_claimed       INTEGER NOT NULL CHECK (qty_claimed > 0),
    qty_received      INTEGER,
    status            return_receipt_status NOT NULL DEFAULT 'pending',
    received_by       UUID REFERENCES users(id),
    received_at       TIMESTAMPTZ,
    discrepancy_note  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_srr_status     ON settlement_return_receipts(tenant_id, status);
CREATE INDEX idx_srr_settlement ON settlement_return_receipts(settlement_id);
CREATE INDEX idx_srr_worker     ON settlement_return_receipts(worker_id);

-- Rollback (if ever needed):
--
-- DROP TABLE IF EXISTS settlement_return_receipts;
-- DROP TYPE IF EXISTS return_receipt_status;
--
-- ...and revert the corresponding INSERT block added to
-- settlement.controller.js -> createSettlement().
