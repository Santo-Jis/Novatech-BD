-- ============================================================
-- Novatech BD — ai_chat_quality_logs: ধাপ ১ (native tool-calling)
-- কলাম সংযোজন
-- ১৭ আগস্ট ২০২৬
--
-- প্রেক্ষাপট: ধাপ ০-এর ai_chat_quality_logs টেবিল ২-pass আর্কিটেকচার
-- (fixed "intent pass" + "final pass") ধরে বানানো হয়েছিল। ধাপ ১-এ
-- native tool-calling দিয়ে একটা variable-length loop হয় (১টা call
-- যথেষ্ট হতে পারে, আবার একাধিক tool রাউন্ডও লাগতে পারে) — তাই নতুন
-- বাস্তবতা ধরার জন্য কলাম যোগ করা হলো।
--
-- backward compatibility:
--   • intent_*/final_* কলাম রাখা হয়েছে (মুছে ফেলা হয়নি) — নতুন কোডে
--     এগুলো এখন "প্রথম LLM call" / "শেষ LLM call" বোঝায়, তাই ধাপ ০-এর
--     বেসলাইন সংখ্যার সাথে latency/model তুলনা চালিয়ে যাওয়া যাবে।
--   • orchestration_mode কলামের DEFAULT '2pass_regex' — তাই এই
--     migration চালানোর আগে জমা হওয়া সব পুরনো রো নিজে থেকেই
--     '2pass_regex' হয়ে যাবে। নতুন কোড থেকে সবসময় explicit
--     'native_tools' লেখা হয়। এই একটা কলাম দিয়েই before/after আলাদা
--     করে তুলনা করা যাবে (যেমন: fallback rate বা latency আগে vs পরে)।
--
-- IF NOT EXISTS/ADD COLUMN IF NOT EXISTS দিয়ে করা — production-এ
-- দুবার রান করলেও নিরাপদ।
-- ============================================================

ALTER TABLE ai_chat_quality_logs
    ADD COLUMN IF NOT EXISTS orchestration_mode VARCHAR(20) NOT NULL DEFAULT '2pass_regex',
    ADD COLUMN IF NOT EXISTS llm_call_count      INTEGER,      -- এই turn-এ মোট round-trip (agentic loop-এ কতবার call হলো)
    ADD COLUMN IF NOT EXISTS tools_called        TEXT,         -- comma-separated tool নাম, একাধিক হতে পারে (আগে tool_selected-এ সর্বোচ্চ ১টা)
    ADD COLUMN IF NOT EXISTS any_used_fallback   BOOLEAN NOT NULL DEFAULT false, -- OR — loop-এর যেকোনো call fallback হলে true
    ADD COLUMN IF NOT EXISTS hit_loop_limit      BOOLEAN NOT NULL DEFAULT false; -- MAX_TOOL_LOOPS ছুঁয়ে গেলে true (স্বাভাবিক ব্যবহারে ০% থাকার কথা)

CREATE INDEX IF NOT EXISTS idx_ai_chat_quality_logs_orchestration
    ON ai_chat_quality_logs(orchestration_mode, created_at);
