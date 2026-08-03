-- সাপ্লায়ার সার্চ (ILIKE '%...%', leading-wildcard) দ্রুত করতে trigram GIN ইনডেক্স।
-- pg_trgm এক্সটেনশন এই প্রজেক্টে already ইনস্টলড আছে।
-- কারণ: PRAN-RFL Group টেস্টিং-এ সাপ্লায়ার সংখ্যা বড় আকারে বাড়বে বলে জানা গেছে —
-- normal btree leading-wildcard ILIKE-তে সাহায্য করে না, তাই আগে থেকেই বসানো হলো।
--
-- Supabase-এ ইতিমধ্যে apply করা হয়েছে (migration: add_supplier_search_trgm_indexes)।
-- এই ফাইলটা শুধু repo-তে ট্র্যাকিং/অন্য এনভায়রনমেন্টে রান করার জন্য।

CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm
    ON suppliers USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_suppliers_contact_person_trgm
    ON suppliers USING GIN (contact_person gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_suppliers_phone_trgm
    ON suppliers USING GIN (phone gin_trgm_ops);
