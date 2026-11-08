-- ============================================================
-- Step 3: expenses.source — খরচ কোথা থেকে এসেছে
--   manual          → Admin/Accountant নিজে যোগ করেছেন (edit/delete করা যাবে)
--   sr_report       → SR খরচ রিপোর্ট approve হয়ে এসেছে
--   batch_writeoff  → ব্যাচ রাইট-অফ থেকে এসেছে
-- আগে migration_expenses_link_reports.sql চালাতে হবে।
-- ============================================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

UPDATE expenses SET source = 'sr_report'
 WHERE expense_report_id IS NOT NULL AND source = 'manual';

UPDATE expenses SET source = 'batch_writeoff'
 WHERE expense_type LIKE 'ব্যাচ রাইট-অফ%' AND source = 'manual';

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses (tenant_id, date DESC);
