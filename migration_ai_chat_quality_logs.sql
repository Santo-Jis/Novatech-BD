-- ============================================================
-- Novatech BD — Customer AI Chat: Quality/Observability Logs (ধাপ ০)
-- ১৭ আগস্ট ২০২৬
--
-- উদ্দেশ্য:
--  ১. AI চ্যাট রি-ডিজাইনের আগে বেসলাইন মাপা — এখনকার সিস্টেম আসলে
--     কেমন করছে সেটা সংখ্যা দিয়ে জানা, অনুমান দিয়ে না।
--  ২. প্রতিটা customer AI চ্যাট রিকোয়েস্টে কোন tool বাছা হলো, fallback
--     model লাগলো কিনা, প্রতিটা pass-এর latency কত, আর কত %
--     কথোপকথন "SR-কে জিজ্ঞেস করুন" দিয়ে শেষ হয় — এই মেট্রিকগুলো ধরার জন্য।
--  ৩. ai_usage_logs (billing/audit) থেকে ইচ্ছাকৃতভাবে আলাদা টেবিল —
--     ওইটা financial audit trail, এইটা disposable telemetry। তাই
--     customer_id/person_id-তে hard FK constraint রাখা হয়নি —
--     টেলিমেট্রি টেবিল কখনো customer delete/archive আটকাবে না।
--  ৪. source কলাম দিয়ে চ্যাট-সার্ফেস আলাদা করা (এখন শুধু 'customer_chat')
--     — ধাপ ২-এ staff চ্যাট shared engine-এ migrate হলে এই একই টেবিল
--     পুনর্ব্যবহার করা যাবে, নতুন migration লাগবে না।
--
-- IF NOT EXISTS দিয়ে করা — production-এ রান করলে কিছু ভাঙবে না।
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_chat_quality_logs (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id              UUID,   -- staff চ্যাটে (ধাপ ২) NULL থাকবে; ইচ্ছাকৃতভাবে FK নেই
    person_id                UUID,   -- multi-company correlation; ইচ্ছাকৃতভাবে FK নেই

    source                   VARCHAR(30) NOT NULL DEFAULT 'customer_chat',
                             -- 'customer_chat' | 'admin_chat' (ভবিষ্যতে, ধাপ ২)

    -- ── Pass ১: Tool selection ───────────────────────────────
    tool_selected            VARCHAR(60),   -- NULL = কোনো tool লাগেনি
    tool_had_error           BOOLEAN NOT NULL DEFAULT false,
    ended_in_sr_referral     BOOLEAN NOT NULL DEFAULT false,

    -- ── Model / fallback reliability ─────────────────────────
    intent_model_requested   VARCHAR(100),
    intent_model_used        VARCHAR(100),
    intent_used_fallback     BOOLEAN NOT NULL DEFAULT false,
    final_model_requested    VARCHAR(100),
    final_model_used         VARCHAR(100),
    final_used_fallback      BOOLEAN NOT NULL DEFAULT false,

    -- ── Latency (ms) ──────────────────────────────────────────
    intent_latency_ms        INTEGER,
    final_latency_ms         INTEGER,
    total_latency_ms         INTEGER,

    -- ── request ব্যর্থ হলে ────────────────────────────────────
    request_failed           BOOLEAN NOT NULL DEFAULT false,
    failure_reason           VARCHAR(50),   -- 'rate_limited' | 'access_blocked' | 'provider_error' ইত্যাদি

    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_quality_logs_tenant_created
    ON ai_chat_quality_logs(tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_chat_quality_logs_source_created
    ON ai_chat_quality_logs(source, created_at);

-- RLS enable — ২২ জুলাই থেকে established convention (backend `postgres`
-- role bypassrls=true দিয়ে connect করে, তাই কোনো প্রভাব পড়বে না, শুধু
-- anon/authenticated key দিয়ে সরাসরি এক্সেস বন্ধ থাকবে)
ALTER TABLE ai_chat_quality_logs ENABLE ROW LEVEL SECURITY;
