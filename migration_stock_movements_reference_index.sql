-- Phase 5: পারফরম্যান্স ট্র্যাকিং সাপোর্ট — অন-টাইম ডেলিভারি % ও গড় লিড টাইম গণনায়
-- stock_movements-কে (reference_type, reference_id) দিয়ে ফিল্টার করা হয় (কোন PO থেকে
-- কবে মাল এসেছে বের করতে)। stock_movements বড় টেবিল হতে পারে (সব ধরনের স্টক ইন/আউট
-- এখানে লগ হয়), তাই এই ইনডেক্স ছাড়া প্রতিবার seq scan হতো।
--
-- Supabase-এ ইতিমধ্যে apply করা হয়েছে (migration: add_stock_movements_reference_index)।
-- এই ফাইলটা শুধু repo-তে ট্র্যাকিং/অন্য এনভায়রনমেন্টে রান করার জন্য।

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
    ON stock_movements(reference_type, reference_id);
