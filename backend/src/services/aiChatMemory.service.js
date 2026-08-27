// ============================================================
// AI Chat Memory Service (ধাপ ১, শেষ অংশ)
//
// server-side conversation থ্রেড ম্যানেজমেন্ট — migration_ai_chat_messages.sql
// দেখো বিস্তারিত ব্যাখ্যার জন্য।
//
// ইচ্ছাকৃতভাবে customerAiChat.service.js থেকে আলাদা ফাইল — এটা
// persistence-এর দায়িত্ব (কোথায়/কীভাবে সেভ থাকে), orchestration-এর না
// (কোন tool কল হবে)। এই আলাদা করাটা ভবিষ্যতে ধাপ ২-এ (shared engine)
// স্টাফ চ্যাটেও এই একই memory layer পুনর্ব্যবহার সহজ করবে।
// ============================================================

const { query } = require('../config/db');
const logger = require('../config/logger');
const crypto = require('crypto');

const THREAD_IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000; // ৬ ঘণ্টা নিষ্ক্রিয় থাকলে পরের মেসেজ নতুন থ্রেড শুরু করে
const MAX_HISTORY_MESSAGES  = 20; // client-truncated ৬-turn/৩০০-char থেকে অনেক বেশি, কিন্তু এখনো bounded

/**
 * getOrCreateThreadId(customerId, forceNew)
 *
 * সাম্প্রতিক থ্রেড থাকলে ও IDLE_TIMEOUT-এর মধ্যে হলে সেটাই ফেরত দেয়
 * (কথোপকথন চালিয়ে যায়) — নাহলে (কোনো থ্রেড নেই, অনেকক্ষণ চুপ ছিল, বা
 * forceNew=true) নতুন UUID।
 *
 * forceNew=true হয় যখন client history:[] (খালি) পাঠায় — "নতুন চ্যাট"
 * বাটনের ঠিক আচরণ নিয়ে কিছু অস্পষ্টতা পাওয়া গেছে (নিচে README-তে
 * বিস্তারিত), তাই আপাতত idle-timeout-ই মূল rotation মেকানিজম; new_thread
 * flag (request body-তে) দিয়ে ভবিষ্যতে frontend থেকে explicit trigger
 * করার সুযোগ রাখা হলো, এই ডেলিভারিতে frontend থেকে এখনো পাঠানো হয় না।
 */
const getOrCreateThreadId = async (customerId, forceNew = false) => {
    if (!forceNew) {
        try {
            const r = await query(
                `SELECT thread_id, created_at FROM ai_chat_messages
                 WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [customerId]
            );
            if (r.rows.length > 0) {
                const lastMsgTime = new Date(r.rows[0].created_at).getTime();
                if (Date.now() - lastMsgTime < THREAD_IDLE_TIMEOUT_MS) {
                    return { threadId: r.rows[0].thread_id, isNewThread: false };
                }
            }
        } catch (err) {
            logger.error('❌ getOrCreateThreadId lookup ব্যর্থ, নতুন থ্রেড দিয়ে চালিয়ে যাচ্ছি:', err.message);
        }
    }
    return { threadId: crypto.randomUUID(), isNewThread: true };
};

/**
 * getThreadHistory(customerId, threadId, limit)
 * → [{role, content}, ...] পুরনো→নতুন ক্রমে (chatHistory হিসেবে সরাসরি ব্যবহারযোগ্য)
 *
 * ব্যর্থ হলে খালি array — history না পাওয়া মানে conversation বন্ধ হয়ে
 * যাওয়া উচিত না, শুধু context ছাড়া উত্তর দেবে (আগের client-history
 * ব্যর্থ/খালি হলেও ঠিক এই আচরণই ছিল)।
 */
const getThreadHistory = async (customerId, threadId, limit = MAX_HISTORY_MESSAGES) => {
    try {
        const r = await query(
            `SELECT role, content FROM ai_chat_messages
             WHERE customer_id = $1 AND thread_id = $2
             ORDER BY created_at DESC
             LIMIT $3`,
            [customerId, threadId, limit]
        );
        // DESC+LIMIT দিয়ে সাম্প্রতিক N-টা পেলাম, কিন্তু chatHistory-র জন্য
        // পুরনো→নতুন ক্রম লাগে (conversation flow ঠিক রাখতে)
        return r.rows.reverse().map(row => ({ role: row.role, content: row.content }));
    } catch (err) {
        logger.error('❌ getThreadHistory ব্যর্থ (non-critical, context ছাড়াই চলবে):', err.message);
        return [];
    }
};

/**
 * appendMessages(tenantId, customerId, threadId, messages)
 * messages: [{role, content}, ...]
 *
 * Fire-and-forget (non-blocking) — ai_chat_quality_logs-এর মতোই প্যাটার্ন।
 * ব্যর্থ হলে শুধু warn, response আটকায় না — memory হারানো critical bug
 * না (conversation চলবে, শুধু পরের মেসেজে এই turn-টা context-এ থাকবে না)।
 */
const appendMessages = (tenantId, customerId, threadId, messages) => {
    if (!messages || messages.length === 0) return;

    const values = [];
    const placeholders = [];
    messages.forEach((m, i) => {
        const base = i * 5;
        placeholders.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
        values.push(tenantId, customerId, threadId, m.role, m.content);
    });

    query(
        `INSERT INTO ai_chat_messages (tenant_id, customer_id, thread_id, role, content)
         VALUES ${placeholders.join(',')}`,
        values
    ).catch(err => logger.warn('⚠️ ai_chat_messages insert ব্যর্থ (non-critical):', err.message));
};

module.exports = {
    getOrCreateThreadId,
    getThreadHistory,
    appendMessages,
    THREAD_IDLE_TIMEOUT_MS,
    MAX_HISTORY_MESSAGES,
};
