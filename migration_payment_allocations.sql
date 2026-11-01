-- migration_payment_allocations.sql
--
-- বাকি আদায় → নির্দিষ্ট ইনভয়েসে বরাদ্দ (per-invoice allocation)
--
-- সমস্যা: collections (SR → admin verify) আর credit_payments (collectCredit) —
-- দুটোই শুধু customers.current_credit কমাত; কোন ইনভয়েসের টাকা শোধ হলো তা
-- কোথাও রেকর্ড হতো না।
--
-- ডিজাইন সিদ্ধান্ত (supplier_payments-এর মতোই "computed", stored নয়):
--   * sales_transactions-এ কোনো paid/due কলাম যোগ করা হচ্ছে না।
--     ইনভয়েসের বাকি = credit_used − SUM(payment_allocations.amount)
--   * credit_payments-এর বিদ্যমান DB ট্রিগার (current_credit কমায়) একদম ছোঁয়া হচ্ছে না।
--   * collections / credit_payments টেবিলে কলাম যোগ নেই — একটা আদায় একাধিক
--     ইনভয়েসে ভাগ হতে পারে, তাই আলাদা join টেবিল।
--
-- ⚠️ অনুমান: id কলামগুলো UUID (supplier_payments / users-এর মতো)। যদি
--    sales_transactions.id অন্য টাইপের হয়, রান করার আগে নিচের sale_id টাইপ মিলিয়ে নিন।
-- ⚠️ এই ফাইল রান করার পরেই নতুন backend কোড deploy করুন (কোড টেবিল ধরে নিয়ে query করে)।
--    ব্যাকফিল (পুরনো আদায় ইনভয়েসে বসানো) এই ফাইলে অটো-রান হয় না — নিচের
--    ফাংশন আলাদাভাবে, প্রথমে dry-run দেখে চালাতে হবে।

CREATE TABLE IF NOT EXISTS payment_allocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sale_id         UUID NOT NULL REFERENCES sales_transactions(id) ON DELETE CASCADE,
    -- polymorphic রেফারেন্স: কোন টেবিলের কোন row — তাই payment_id-তে FK নেই
    payment_source  VARCHAR(20) NOT NULL CHECK (payment_source IN ('collection', 'credit_payment')),
    payment_id      UUID NOT NULL,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- একই আদায়-row একই ইনভয়েসে দুইবার বসবে না (idempotency / double-submit রক্ষা)
CREATE UNIQUE INDEX IF NOT EXISTS payment_allocations_unique_idx
    ON payment_allocations (payment_source, payment_id, sale_id);

-- ইনভয়েস-প্রতি SUM — সবচেয়ে বেশি চলা query
CREATE INDEX IF NOT EXISTS idx_payment_allocations_sale
    ON payment_allocations (sale_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_customer
    ON payment_allocations (customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_tenant
    ON payment_allocations (tenant_id);

-- ─────────────────────────────────────────────────────────────
-- ব্যাকফিল ফাংশন — পুরনো আদায়গুলো সময়ের ক্রমে FIFO-তে ইনভয়েসে বসায়।
-- এই ফাইল লোড করলে ফাংশন শুধু তৈরি হয়, চলে না।
--
--   -- ১) dry-run (কিছু লেখে না, শুধু কী হতো তা দেখায়):
--   SELECT * FROM backfill_payment_allocations('<tenant-uuid>', true);
--
--   -- ২) আসলে চালাতে:
--   SELECT * FROM backfill_payment_allocations('<tenant-uuid>', false);
--
-- নিয়ম:
--   * verified collections + সব credit_payments একসাথে সময়ের ক্রমে সাজানো হয়
--   * একটা আদায় শুধু সেই ইনভয়েসগুলোতে বসে যেগুলো আদায়ের সময়ের আগে বা সমান সময়ে তৈরি
--   * ইনভয়েসের সব বাকি শোধ হয়ে গেলে বাকি টাকা "unallocated" থাকে (পুরনো
--     opening-balance বা ইনভয়েস-বহির্ভূত বাকি) — এটা এরর নয়
--   * ইতিমধ্যে বরাদ্দ হওয়া আদায় বাদ যায়, তাই বারবার চালানো নিরাপদ
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION backfill_payment_allocations(p_tenant UUID, p_dry_run BOOLEAN DEFAULT TRUE)
RETURNS TABLE (
    r_customer_id       UUID,
    r_payments_seen     INT,
    r_allocated_total   NUMERIC,
    r_unallocated_total NUMERIC
) AS $$
DECLARE
    pay        RECORD;
    inv        RECORD;
    v_left     NUMERIC;
    v_take     NUMERIC;
    v_cust     UUID;
    v_seen     INT;
    v_alloc    NUMERIC;
    v_unalloc  NUMERIC;
BEGIN
    -- dry-run-এও সঠিক "remaining" হিসাব রাখতে সেশন-লোকাল temp টেবিলে নতুন বরাদ্দ জমাই
    CREATE TEMP TABLE IF NOT EXISTS _bf_alloc (
        sale_id UUID, payment_source TEXT, payment_id UUID, customer_id UUID, amount NUMERIC
    ) ON COMMIT DROP;
    TRUNCATE _bf_alloc;

    FOR v_cust IN
        SELECT DISTINCT c.id FROM customers c
        WHERE c.tenant_id = p_tenant
          AND (EXISTS (SELECT 1 FROM collections col WHERE col.customer_id = c.id AND col.status = 'verified')
            OR EXISTS (SELECT 1 FROM credit_payments cp WHERE cp.customer_id = c.id))
    LOOP
        v_seen := 0; v_alloc := 0; v_unalloc := 0;

        FOR pay IN
            SELECT * FROM (
                SELECT 'collection'::text AS src, col.id AS pid, col.amount AS amt,
                       COALESCE(col.verified_at, col.created_at) AS at
                FROM collections col
                WHERE col.customer_id = v_cust AND col.tenant_id = p_tenant AND col.status = 'verified'
                UNION ALL
                SELECT 'credit_payment', cp.id, cp.amount, cp.created_at
                FROM credit_payments cp
                WHERE cp.customer_id = v_cust AND cp.tenant_id = p_tenant
            ) p
            -- ইতিমধ্যে বরাদ্দ হওয়া আদায় বাদ
            WHERE NOT EXISTS (
                SELECT 1 FROM payment_allocations pa
                WHERE pa.payment_source = p.src AND pa.payment_id = p.pid
            )
            ORDER BY p.at ASC, p.pid ASC
        LOOP
            v_seen := v_seen + 1;
            v_left := pay.amt;

            FOR inv IN
                SELECT st.id,
                       st.credit_used
                         - COALESCE((SELECT SUM(pa.amount) FROM payment_allocations pa WHERE pa.sale_id = st.id), 0)
                         - COALESCE((SELECT SUM(b.amount)  FROM _bf_alloc b            WHERE b.sale_id  = st.id), 0)
                         AS remaining
                FROM sales_transactions st
                WHERE st.customer_id = v_cust
                  AND st.tenant_id   = p_tenant
                  AND st.payment_method = 'credit'
                  AND st.credit_used > 0
                  AND st.created_at <= pay.at
                ORDER BY st.created_at ASC, st.id ASC
            LOOP
                EXIT WHEN v_left <= 0;
                CONTINUE WHEN inv.remaining <= 0;

                v_take := LEAST(v_left, inv.remaining);
                -- ⚠️ দুই জায়গায় একসাথে লেখা যাবে না: "remaining" হিসাব payment_allocations
                -- আর _bf_alloc দুটোই বাদ দেয়, দুটোতে লিখলে একই টাকা দুইবার কাটা যায়।
                IF p_dry_run THEN
                    INSERT INTO _bf_alloc VALUES (inv.id, pay.src, pay.pid, v_cust, v_take);
                ELSE
                    INSERT INTO payment_allocations
                        (tenant_id, customer_id, sale_id, payment_source, payment_id, amount)
                    VALUES (p_tenant, v_cust, inv.id, pay.src, pay.pid, v_take)
                    ON CONFLICT DO NOTHING;
                END IF;

                v_left  := v_left  - v_take;
                v_alloc := v_alloc + v_take;
            END LOOP;

            v_unalloc := v_unalloc + GREATEST(v_left, 0);
        END LOOP;

        r_customer_id       := v_cust;
        r_payments_seen     := v_seen;
        r_allocated_total   := v_alloc;
        r_unallocated_total := v_unalloc;
        IF v_seen > 0 THEN RETURN NEXT; END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- ব্যাকফিলের পর মিলিয়ে দেখার query (প্রতি কাস্টমারে):
--   ইনভয়েস-ভিত্তিক বাকি  vs  customers.current_credit
-- সংখ্যা না মিললে পুরনো opening-balance বা ইনভয়েস-বহির্ভূত বাকি আছে — এটা তদন্তের সংকেত, ব্যর্থতা নয়।
--
--   SELECT c.shop_name, c.current_credit,
--          COALESCE(SUM(st.credit_used), 0) - COALESCE(SUM(a.paid), 0) AS invoice_based_due
--   FROM customers c
--   LEFT JOIN sales_transactions st
--          ON st.customer_id = c.id AND st.payment_method = 'credit' AND st.credit_used > 0
--   LEFT JOIN (SELECT sale_id, SUM(amount) AS paid FROM payment_allocations GROUP BY sale_id) a
--          ON a.sale_id = st.id
--   WHERE c.tenant_id = '<tenant-uuid>'
--   GROUP BY c.id, c.shop_name, c.current_credit
--   HAVING c.current_credit <> COALESCE(SUM(st.credit_used), 0) - COALESCE(SUM(a.paid), 0);
-- ─────────────────────────────────────────────────────────────
