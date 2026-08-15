-- ============================================================
-- Migration: Customer ↔ Company Chat — Thread Metadata (Part 1/5)
-- REVISED — personal (assigned SR) + support (company-wide) দুই থ্রেড-টাইপ
--
-- এই টেবিলটা শুধু metadata/authorization/listing-এর জন্য।
-- আসল মেসেজ কনটেন্ট এখানে থাকবে না — সেটা Firebase Realtime
-- Database-এ থাকবে (chats/{threadId}/messages/{messageId}),
-- ঠিক aiChatLogs-এর মতো একই প্যাটার্নে (দেখুন config/firebase.js)।
--
-- দুই ধরনের থ্রেড, একই connection-এ দুটোই আলাদাভাবে থাকতে পারে:
--   • personal — কাস্টমারের assigned SR-এর সাথে, WhatsApp-এর মতো
--     ব্যক্তিগত ফিলিং। customer_assignments জয়েন করে dynamically
--     resolve হয় — worker_id এখানে ফ্রিজ করা হচ্ছে না, তাই SR বদলালেও
--     থ্রেড/হিস্টোরি connection-এর সাথেই থেকে যাবে, নতুন SR-এর কাছে
--     resolve হবে।
--   • support — কোম্পানির অফিসিয়াল সাপোর্ট/ফিডব্যাক লাইন।
--     tenant_support_agents টেবিলে Admin যাদের access দেবে তারাই দেখবে।
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_threads (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- tenant_id connection_id থেকেই পাওয়া যায়, কিন্তু tenant-scoped
    -- query সহজ ও দ্রুত রাখতে এখানেও রাখা হচ্ছে (বাকি টেবিলগুলোর মতোই)
    tenant_id             UUID NOT NULL,
    connection_id         UUID NOT NULL REFERENCES customer_company_connections(id) ON DELETE CASCADE,
    customer_id           UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    person_id             UUID NOT NULL REFERENCES persons(id),

    thread_type           VARCHAR(10) NOT NULL DEFAULT 'personal'
                          CHECK (thread_type IN ('personal', 'support')),

    status                VARCHAR(10) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),

    -- inbox list sort/preview-এর জন্য (RTDB write-এর পর Part 2 backend
    -- এগুলো আপডেট করবে — client সরাসরি এই টেবিলে লিখবে না)
    last_message_at       TIMESTAMPTZ NULL,
    last_message_preview  TEXT NULL,
    last_sender_type      VARCHAR(10) NULL CHECK (last_sender_type IN ('customer', 'staff')),

    -- unread badge গোনার বদলে "শেষ কবে পড়েছে" রাখা হচ্ছে — সহজ, drift-প্রুফ
    last_read_by_customer_at TIMESTAMPTZ NULL,
    last_read_by_staff_at    TIMESTAMPTZ NULL,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- প্রতি connection-এ personal ১টা + support ১টা — দুটোই একসাথে থাকতে পারবে
    UNIQUE (connection_id, thread_type)
);

-- Admin/staff ইনবক্স: এই tenant-এর সব থ্রেড (টাইপ অনুযায়ী ফিল্টার), সাম্প্রতিক আগে
CREATE INDEX IF NOT EXISTS idx_chat_threads_tenant
    ON chat_threads(tenant_id, thread_type, last_message_at DESC NULLS LAST);

-- Customer পোর্টাল: এই person-এর সব কোম্পানির থ্রেড (all-* aggregate রুটের জন্য)
CREATE INDEX IF NOT EXISTS idx_chat_threads_person
    ON chat_threads(person_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_chat_threads_customer
    ON chat_threads(customer_id);


-- ============================================================
-- support থ্রেডে কে কে access পাবে — Admin ম্যানেজ করবে (add/remove)
-- admin রোল সবসময় implicit access পাবে কোড-লেভেলে; admin নিজেকে
-- এই টেবিলে আলাদাভাবে যোগ করা লাগবে না।
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_support_agents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by    UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_support_agents_tenant
    ON tenant_support_agents(tenant_id);
