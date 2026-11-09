-- migration_invoice_due_snapshot.sql
--
-- ইনভয়েসে "আগের বাকি / এই বিক্রিতে বাকি আদায় / এখনকার মোট বাকি" দেখানোর জন্য
-- প্রতিটি বিক্রির মুহূর্তের হিসাবের স্ন্যাপশট।
--
-- কেন স্ন্যাপশট (stored)? customers.current_credit সবসময় "এখনকার" বাকি — ইনভয়েস পরে
-- আবার পাঠালে/প্রিন্ট করলে সেটা বদলে যাবে। ইনভয়েসে সেই সময়ের অঙ্কই থাকতে হবে।
--
--   previous_due : বিক্রির ঠিক আগে কাস্টমারের মোট বাকি
--   due_payment  : এই বিক্রির সাথে একই সময়ে নেওয়া বাড়তি নগদ, যেটা পুরনো বাকি থেকে কাটা হয়েছে
--   closing_due  : বিক্রি + বাকি-কাটার পরে কাস্টমারের মোট বাকি
--
-- পুরনো ইনভয়েসে তিনটাই NULL (previous_due / closing_due) — ইনভয়েস তখন বাকির অংশ দেখায় না,
-- কোনো অঙ্ক বানিয়ে বসানো হয় না।
--
-- ⚠️ নিরাপদ: ফাইলটা শুধু কলাম যোগ করে, কোনো ডেটা বদলায় না। বারবার চালানো যায়।
--    backend কোড এই কলামগুলো best-effort লেখে (SAVEPOINT) — migration না চালালেও বিক্রি আটকায় না,
--    কিন্তু ইনভয়েসে বাকির অংশ আসবে না। তাই backend deploy-এর আগে এটা চালান।

ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS previous_due NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS due_payment  NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS closing_due  NUMERIC(12,2);

COMMENT ON COLUMN sales_transactions.previous_due IS 'বিক্রির আগে কাস্টমারের মোট বাকি (স্ন্যাপশট); পুরনো ইনভয়েসে NULL';
COMMENT ON COLUMN sales_transactions.due_payment  IS 'এই বিক্রির সাথে নেওয়া বাড়তি নগদ, যা পুরনো বাকি থেকে কাটা হয়েছে';
COMMENT ON COLUMN sales_transactions.closing_due  IS 'বিক্রি ও বাকি-কাটার পরে কাস্টমারের মোট বাকি (স্ন্যাপশট); পুরনো ইনভয়েসে NULL';
