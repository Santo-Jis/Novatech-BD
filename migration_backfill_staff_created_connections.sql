-- ============================================================
-- migration_backfill_staff_created_connections.sql
--
-- সমস্যা: staff (SR/Manager/Admin) দিয়ে তৈরি কাস্টমারদের জন্য
-- persons ও customer_company_connections রো তৈরি হতো না
-- (customer.controller.js createCustomer শুধু customers রো বানাত)।
-- নতুন কাস্টমারদের জন্য এখন কোডই অটো-কানেক্ট করে
-- (customerConnection.service.js → autoConnectStaffCreatedCustomer);
-- এই স্ক্রিপ্ট আগে তৈরি হওয়া কাস্টমারদের জন্য একই কাজ একবার করে দেয়।
--
-- নিরাপদ/idempotent: বারবার চালালে ডুপ্লিকেট হয় না।
--   • শুধু is_active = true কাস্টমার
--   • persons: একই WhatsApp নম্বরের বিদ্যমান person থাকলে সেটাই reuse
--     (ensurePersonForCustomer-এর লজিকের হুবহু সমতুল্য)
--   • connection: (person_id, tenant_id) জোড়ায় যেকোনো স্ট্যাটাসের রো আগে
--     থেকে থাকলে ছোঁয়া হয় না — blocked/disconnected/rejected/pending
--     সিদ্ধান্ত override হয় না
--
-- ROLLBACK (শুধু এই স্ক্রিপ্টে তৈরি connection রো মুছতে):
--   DELETE FROM customer_company_connections
--   WHERE initiated_by = 'staff_created' AND requested_by_user_id IS NULL;
-- (persons রো রেখে দেওয়াই নিরাপদ — customers.person_id এখন সেগুলোকে ধরে আছে)
-- ============================================================

DO $$
DECLARE
    r   RECORD;
    pid UUID;
    wa  TEXT;
BEGIN
    -- ধাপ ১: person_id নেই এমন সক্রিয় কাস্টমারদের জন্য person লিংক/তৈরি
    FOR r IN
        SELECT id, owner_name, whatsapp, email, shop_name, business_type,
               date_of_birth, profile_photo, shop_photo, password_hash
        FROM customers
        WHERE person_id IS NULL AND is_active = true
        ORDER BY created_at
    LOOP
        pid := NULL;
        wa  := regexp_replace(coalesce(r.whatsapp, ''), '\D', '', 'g');

        IF wa <> '' THEN
            SELECT id INTO pid FROM persons
            WHERE regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') = wa
            ORDER BY created_at LIMIT 1;
        END IF;

        IF pid IS NULL THEN
            INSERT INTO persons (full_name, whatsapp, email, shop_name, business_type,
                                 date_of_birth, profile_photo, shop_photo, password_hash)
            VALUES (r.owner_name, r.whatsapp, r.email, r.shop_name, r.business_type,
                    r.date_of_birth, r.profile_photo, r.shop_photo, r.password_hash)
            RETURNING id INTO pid;
        END IF;

        UPDATE customers SET person_id = pid WHERE id = r.id;
    END LOOP;

    -- ধাপ ২: কোনো সম্পর্ক-রো নেই এমন (person, tenant) জোড়ার জন্য connected রো
    INSERT INTO customer_company_connections
        (person_id, tenant_id, customer_id, status, initiated_by, responded_at)
    SELECT c.person_id, c.tenant_id, c.id, 'connected', 'staff_created', NOW()
    FROM customers c
    WHERE c.person_id IS NOT NULL
      AND c.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM customer_company_connections x
          WHERE x.person_id = c.person_id AND x.tenant_id = c.tenant_id
      );

    -- ধাপ ৩: connected রো আছে কিন্তু customer_id ফাঁকা — বসাও
    UPDATE customer_company_connections x
    SET customer_id = c.id
    FROM customers c
    WHERE x.person_id = c.person_id AND x.tenant_id = c.tenant_id
      AND x.status = 'connected' AND x.customer_id IS NULL;
END $$;
