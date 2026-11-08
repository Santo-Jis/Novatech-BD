-- ============================================================
-- Step 4: বিক্রয়ের items JSON-এ unit_cost (বিক্রয়কালীন ক্রয়মূল্য) বসানো
-- (Supabase-এ ইতিমধ্যে প্রয়োগ করা হয়েছে — idempotent, আবার চালালে ক্ষতি নেই)
-- ============================================================
UPDATE sales_transactions st
SET items = (
    SELECT COALESCE(jsonb_agg(
        CASE
            WHEN e ? 'unit_cost' THEN e
            ELSE e || jsonb_build_object('unit_cost', COALESCE(p.cost_price, 0))
        END
        ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(st.items) WITH ORDINALITY AS t(e, ord)
    LEFT JOIN products p ON p.id::text = e->>'product_id' AND p.tenant_id = st.tenant_id
)
WHERE jsonb_typeof(st.items) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(st.items) x WHERE NOT (x ? 'unit_cost'));
