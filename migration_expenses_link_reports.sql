-- ============================================================
-- Step 1: SR খরচ রিপোর্ট (expense_reports) → expenses টেবিলে সংযোগ
-- ============================================================
-- Approve হলে expense_reports থেকে expenses-এ entry যাবে।
-- expense_report_id দিয়ে একই রিপোর্ট দুবার ঢোকা আটকানো হয়েছে।
-- ============================================================

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS expense_report_id UUID;

-- একটি expense_report থেকে সর্বোচ্চ একটি expenses row
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_expense_report_id
    ON expenses (expense_report_id)
    WHERE expense_report_id IS NOT NULL;

-- ── আগে approve হওয়া রিপোর্টগুলো backfill ─────────────────────
INSERT INTO expenses (user_id, expense_type, amount, date, note, created_by, tenant_id, expense_report_id)
SELECT er.worker_id,
       'SR খরচ (যাতায়াত/খাবার/বিবিধ)',
       COALESCE(er.transport_cost,0) + COALESCE(er.food_cost,0) + COALESCE(er.misc_cost,0),
       er.report_date,
       CONCAT_WS(' | ',
           NULLIF('যাতায়াত: ' || COALESCE(er.transport_cost,0), 'যাতায়াত: 0'),
           NULLIF('খাবার: '   || COALESCE(er.food_cost,0),      'খাবার: 0'),
           NULLIF('বিবিধ: '   || COALESCE(er.misc_cost,0),      'বিবিধ: 0'),
           er.misc_note),
       COALESCE(er.reviewed_by, er.worker_id),
       er.tenant_id,
       er.id
FROM expense_reports er
WHERE er.status = 'approved'
  AND COALESCE(er.transport_cost,0) + COALESCE(er.food_cost,0) + COALESCE(er.misc_cost,0) > 0
  AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.expense_report_id = er.id);
