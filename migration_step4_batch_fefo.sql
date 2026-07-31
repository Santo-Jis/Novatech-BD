-- Step ৪: Batch/Expiry + FEFO সাপোর্ট
-- product_batches টেবিল আগে থেকেই আছে (migration add_product_batches, 2026-07-27)
-- এখানে শুধু FEFO consumption ট্র্যাক করার জন্য দরকারি কলাম/ইনডেক্স যোগ করা হচ্ছে
--
-- ⚠️ এই ফাইলটা রেফারেন্সের জন্য — ইতিমধ্যে Supabase MCP দিয়ে সরাসরি
-- প্রোডাকশন DB-তে চালানো হয়ে গেছে (project: javqvlntzcymqyivovhc)।
-- ফের ম্যানুয়ালি চালানোর দরকার নেই, কিন্তু IF NOT EXISTS দিয়ে idempotent
-- রাখা হয়েছে অন্য এনভায়রনমেন্টে (staging ইত্যাদি) দরকার হলে।

-- stock_movements-এ batch_id — কোন ব্যাচ থেকে স্টক আউট/ইন হলো তার ট্রেসেবিলিটি
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL;

-- FEFO কুয়েরির জন্য ইনডেক্স: একটা প্রোডাক্টের ব্যাচগুলো expiry অনুযায়ী সাজানো (nearest first)
CREATE INDEX IF NOT EXISTS idx_product_batches_product_expiry ON product_batches(product_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_product_batches_tenant ON product_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);

-- quantity ঋণাত্মক না হওয়া নিশ্চিত করা (সেফটি নেট — idempotent DO block দিয়ে)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_batches_qty_nonneg'
    ) THEN
        ALTER TABLE product_batches ADD CONSTRAINT chk_product_batches_qty_nonneg CHECK (quantity >= 0);
    END IF;
END $$;
