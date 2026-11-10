-- migration_receipt_snapshot.sql
--
-- বাকি আদায়ের রসিদ আবার পাঠালে (resend) রসিদে "আদায়ের সময়ের" বাকি দেখাতে হবে — আজকের নয়।
-- তাই আদায়ের মুহূর্তের হিসাব এই দুই টেবিলে স্ন্যাপশট রাখা হয়:
--   due_before : এই আদায়ের ঠিক আগে কাস্টমারের মোট বাকি
--   due_after  : এই আদায়ের পরে কাস্টমারের মোট বাকি
-- পুরনো আদায়ে দুটোই NULL — resend করলে রসিদে "বর্তমান বাকি" দেখায়, আগের/পরের অঙ্ক বানানো হয় না।
--
-- ⚠️ নিরাপদ: শুধু কলাম যোগ, ডেটা বদলায় না। বারবার চালানো যায়।
--    backend এই কলাম best-effort (SAVEPOINT) লেখে — migration না চললেও আদায় আটকায় না।

ALTER TABLE collections
    ADD COLUMN IF NOT EXISTS due_before NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS due_after  NUMERIC(12,2);

ALTER TABLE credit_payments
    ADD COLUMN IF NOT EXISTS due_before NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS due_after  NUMERIC(12,2);

COMMENT ON COLUMN collections.due_before      IS 'এই আদায়ের আগে কাস্টমারের মোট বাকি (স্ন্যাপশট); পুরনো আদায়ে NULL';
COMMENT ON COLUMN collections.due_after       IS 'এই আদায়ের পরে কাস্টমারের মোট বাকি (স্ন্যাপশট); পুরনো আদায়ে NULL';
COMMENT ON COLUMN credit_payments.due_before  IS 'এই আদায়ের আগে কাস্টমারের মোট বাকি (স্ন্যাপশট); পুরনো আদায়ে NULL';
COMMENT ON COLUMN credit_payments.due_after   IS 'এই আদায়ের পরে কাস্টমারের মোট বাকি (স্ন্যাপশট); পুরনো আদায়ে NULL';
