-- ============================================================
-- Migration Step 9: Promotions Phase 2 (Targeting Engine)
-- ============================================================
-- (নোট: এই ফাইলটা দুইবার renumber হয়েছে — মূলত step6, তারপর step7,
--  এখন step9। প্রতিবারই কারণ একই: অন্য এজেন্ট/টিমের কাজ ইতোমধ্যে সেই
--  নাম্বার নিয়ে নিয়েছিল (step6_batch_lifecycle, step7_warehouses,
--  step8_warehouse_stock)। লাইভ DB-তে ইতোমধ্যে প্রয়োগ করা আছে — এই
--  ফাইলটা শুধু রেকর্ড/অন্য environment-এ রিপ্লিকেট করার জন্য।)
-- ============================================================
-- Phase 1-এ কোনো schema change লাগেনি। Phase 2-এর জন্য নতুন কলাম দরকার:
--   - category_ids   : category-ভিত্তিক targeting (product_ids-এর পরিপূরক)
--   - promo_code     : redeemable code (NULL = automatic promotion, আগের মতোই)
--   - stackable      : অন্য promotion-এর সাথে একসাথে চলবে কিনা
--   - priority       : একাধিক non-stackable promo eligible হলে কোনটা জিতবে
--   - tiers          : slab/tiered discount rules
--   - budget_cap     : ক্যাম্পেইনের সর্বোচ্চ মোট ছাড় (টাকায়)
--   - budget_used    : এ পর্যন্ত কত খরচ হয়েছে (current_uses-এর মতোই pattern)
--
-- সব কলাম nullable/default-সহ যোগ হচ্ছে — বিদ্যমান কোনো রো ভাঙবে না।
-- (এই মুহূর্তে promotions টেবিলে ০ রো, তাই ঝুঁকি নেই, কিন্তু migration-টা
--  সব environment-এ (dev/staging) নিরাপদে re-runnable রাখা হয়েছে।)
-- ============================================================

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS category_ids JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS promo_code   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS stackable    BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiers        JSONB,
  ADD COLUMN IF NOT EXISTS budget_cap   NUMERIC,
  ADD COLUMN IF NOT EXISTS budget_used  NUMERIC DEFAULT 0;

-- promo_code তেনান্টের ভেতরে unique হতে হবে (case-insensitive), কিন্তু
-- একাধিক promotion-এর code NULL (automatic) থাকতে পারবে — তাই partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_code_unique
  ON promotions (tenant_id, UPPER(promo_code))
  WHERE promo_code IS NOT NULL;

-- নতুন promotion type: tiered_discount (slab-ভিত্তিক ছাড়)
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_type_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_type_check
  CHECK (type = ANY (ARRAY[
    'buy_x_get_y', 'percent_off', 'flat_off', 'bundle', 'min_order', 'tiered_discount'
  ]::character varying[]));
