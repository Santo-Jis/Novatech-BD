-- ============================================================
-- Migration: Notification / Announcement Management Module
-- (Phase 2 — ইতিমধ্যে Supabase project-এ apply করা হয়েছে;
--  এই ফাইলটা repo-তে রাখা হলো অন্য environment/রেকর্ডের জন্য)
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id             BIGSERIAL PRIMARY KEY,
    tenant_id      UUID NOT NULL,
    sender_id      UUID NOT NULL REFERENCES users(id),
    title          TEXT NOT NULL,
    body           TEXT NOT NULL,
    category       VARCHAR(30) NOT NULL DEFAULT 'general'
                   CHECK (category IN ('general','policy','hr','attendance','order_sales','route_delivery')),
    is_urgent      BOOLEAN NOT NULL DEFAULT false,
    audience       VARCHAR(10) NOT NULL
                   CHECK (audience IN ('staff','customer')),
    target_type    VARCHAR(20) NOT NULL
                   CHECK (target_type IN ('all_staff','role','team','individual','all_customers','customer_area')),
    target_value   JSONB,
    recipient_count INTEGER NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    expires_at     TIMESTAMPTZ NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_sender ON notifications(sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL,
    user_type        VARCHAR(10) NOT NULL CHECK (user_type IN ('staff','customer')),
    read_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (notification_id, user_id, user_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id, user_type);
