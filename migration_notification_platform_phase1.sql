-- ============================================================
-- Migration: Notification Platform — Phase 1 core schema
-- notification_events + notification_deliveries
--
-- এটা আমাদের notification redesign প্রস্তাবের Phase 1 (এই repo-র নিজের
-- চলমান "Phase N" কমিট-লেবেলিং থেকে আলাদা একটা numbering — বিভ্রান্তি
-- এড়াতে কোডে এটাকে "Notification Platform Phase 1" বলা হয়েছে)।
--
-- notification_events = "কিছু একটা ঘটেছে" এর রেকর্ড (event_type,
-- recipient, payload)। notification_deliveries = প্রতিটা channel-এ
-- আসলে কী হলো তার audit trail (sent/failed/skipped, কেন)।
--
-- recipient_id ইচ্ছাকৃতভাবে polymorphic (recipient_type অনুযায়ী
-- customers.id বা ভবিষ্যতে users.id) — তাই কোনো FK নেই ওই কলামে,
-- application-level integrity।
--
-- channel/status CHECK-এ এখনই ব্যবহার না-হওয়া মান (sms, whatsapp,
-- queued, delivered, read) ইচ্ছাকৃতভাবে রাখা হয়েছে — Phase 2/3-এ এগুলো
-- চালু হলে যেন ALTER TABLE লাগবে না।
--
-- idempotency_key কলাম যোগ করা হলো (future-proofing), কিন্তু এই Phase
-- 1-এর dispatch()-এ এখনো enforce করা হয়নি — কোনো caller প্রথম যখন এটা
-- ব্যবহার করবে, dispatch()-এ ON CONFLICT DO NOTHING যোগ করে নিতে হবে।
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NULL REFERENCES tenants(id),
    event_type      VARCHAR(50) NOT NULL,
    recipient_type  VARCHAR(20) NOT NULL,
    recipient_id    UUID NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    idempotency_key VARCHAR(255) NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_events_recipient ON notification_events(recipient_type, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_events_tenant     ON notification_events(tenant_id, created_at DESC);

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE notification_events IS
    'notification.service.js-এর dispatch()-এ INSERT হয় — "এই ইভেন্টটা ঘটেছে, এই recipient-কে জানানো দরকার" এর রেকর্ড। রেন্ডার/পাঠানো হয় processNotificationEvent()-এ, সরাসরি (Redis না থাকলে) বা BullMQ worker দিয়ে (queue.js: isQueueAvailable())।';


CREATE TABLE IF NOT EXISTS notification_deliveries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id       UUID NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
    tenant_id      UUID NULL REFERENCES tenants(id),
    channel        VARCHAR(20) NOT NULL
                   CHECK (channel IN ('in_app','push','email','sms','whatsapp')),
    status         VARCHAR(20) NOT NULL
                   CHECK (status IN ('queued','sent','delivered','read','failed','skipped')),
    provider       VARCHAR(30) NULL,
    error_message  TEXT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_event           ON notification_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_tenant           ON notification_deliveries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_channel_status   ON notification_deliveries(channel, status);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE notification_deliveries IS
    'প্রতিটা event-এর প্রতিটা channel-attempt-এর রেকর্ড — sent/failed/skipped, কেন (error_message: no_token, preference_off, push_succeeded ইত্যাদি)। এখান থেকেই ভবিষ্যতে Phase 3-এর delivery dashboard/webhook-tracking বানানো যাবে।';
