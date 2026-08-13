-- migration_settlement_return_receipts_resolution_fields.sql
-- Applied live to Supabase project javqvlntzcymqyivovhc on 2026-08-11.
--
-- Adds what's needed to safely charge (or waive) a return-receiving
-- discrepancy (see settlementReturns.controller.js -> resolveDiscrepancy):
--
--   price            snapshot of unit price at the moment the SR claimed
--                     the return (same pattern items_taken already uses in
--                     daily_settlements), so a later charge uses the
--                     settlement-time price rather than whatever
--                     products.price happens to be by the time it's
--                     resolved.
--   resolution        'charged' | 'waived' | NULL. NULL = unresolved.
--                     This is the idempotency guard: resolveDiscrepancy()
--                     refuses to run a second time once this is set, so a
--                     double-click (or any retry) cannot double-charge
--                     outstanding_dues — the same class of bug that
--                     migration_fix_settlement_dues_trigger.sql fixed.
--   resolved_by/at    who made the charge/waive decision, and when.
--   resolution_note   optional free-text reason.

ALTER TABLE settlement_return_receipts
    ADD COLUMN price NUMERIC,
    ADD COLUMN resolution TEXT CHECK (resolution IN ('charged','waived')),
    ADD COLUMN resolved_by UUID REFERENCES users(id),
    ADD COLUMN resolved_at TIMESTAMPTZ,
    ADD COLUMN resolution_note TEXT;

-- Rollback (if ever needed):
--
-- ALTER TABLE settlement_return_receipts
--     DROP COLUMN price,
--     DROP COLUMN resolution,
--     DROP COLUMN resolved_by,
--     DROP COLUMN resolved_at,
--     DROP COLUMN resolution_note;
