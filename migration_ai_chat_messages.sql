-- ============================================================
-- Novatech BD — AI Chat: Server-side Conversation Memory (ধাপ ১, শেষ অংশ)
-- ১৭ আগস্ট ২০২৬
--
-- উদ্দেশ্য:
--  ১. এখন প্রতি মেসেজে client শেষ ৬টা turn (৩০০ ক্যারেক্টার কাটা) পাঠায়
--     — refresh করলে বা অন্য ডিভাইসে গেলে context হারায়। এই টেবিল
--     conversation-কে server-side করে, "থ্রেড" ধারণা দিয়ে — customer
--     "নতুন চ্যাট" শুরু না করা পর্যন্ত (বা অনেকক্ষণ চুপ থাকলে) একই
--     থ্রেডে কথোপকথন চলতে থাকে, যেকোনো ডিভাইস/refresh-এ ধারাবাহিক থাকে।
--  ২. thread_id দিয়ে conversation-কে "সেশনে" ভাগ করা — কোনো আলাদা
--     "threads" টেবিল নেই ইচ্ছাকৃতভাবে (AI চ্যাটে human chat-এর মতো
--     personal/support প্যারালাল থ্রেড নেই, একটা customer-এর জন্য
--     একটা সময়ে একটাই সক্রিয় থ্রেড) — thread rotation লজিক
--     (idle-timeout / explicit new_thread flag) অ্যাপ্লিকেশন-লেভেলে
--     (aiChatMemory.service.js), শুধু "সর্বশেষ মেসেজের thread_id" আর
--     "কতক্ষণ আগে" query করেই যথেষ্ট।
--  ৩. শুধু collapsed role/content (user/assistant, plain text) রাখা
--     হচ্ছে — মাঝের tool_calls/tool_result বিস্তারিত না (আগের
--     client-truncated history-ও কখনো এসব রাখেনি, তাই এইটুকুতেই
--     continuity-র মূল সমস্যা সমাধান হয়; পুরনো turn-এর tool-calling
--     মেকানিক্স ফিরিয়ে আনার প্রয়োজন কম, প্রতিটা নতুন প্রশ্নে যা লাগে তা
--     আবার fresh tool call দিয়েই আসে)।
--  ৪. ai_chat_quality_logs-এর বিপরীতে (disposable telemetry, তাই FK
--     নেই) — এখানে customer_id/tenant_id-তে FK CASCADE আছে, কারণ এটা
--     আসল conversation content, customer delete হলে এটাও যাওয়াই ঠিক।
--
-- IF NOT EXISTS দিয়ে করা — production-এ রান করলে কিছু ভাঙবে না।
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id   UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    thread_id   UUID NOT NULL, -- আলাদা "threads" টেবিল নেই, উপরে ব্যাখ্যা দেখো

    role        VARCHAR(20) NOT NULL, -- 'user' | 'assistant'
    content     TEXT NOT NULL,

    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- সবচেয়ে বেশি ব্যবহৃত query প্যাটার্ন: "এই thread-এর সাম্প্রতিক N-টা মেসেজ"
-- এবং "এই customer-এর সর্বশেষ মেসেজ কখন" (thread rotation নির্ণয় করতে)
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_thread
    ON ai_chat_messages(customer_id, thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_customer_latest
    ON ai_chat_messages(customer_id, created_at DESC);

-- RLS enable — ২২ জুলাই থেকে established convention (backend `postgres`
-- role bypassrls=true দিয়ে connect করে, তাই কোনো প্রভাব পড়বে না, শুধু
-- anon/authenticated key দিয়ে সরাসরি এক্সেস বন্ধ থাকবে)
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;
