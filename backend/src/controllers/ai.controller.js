const { query }   = require('../config/db');
const { encrypt, decrypt, maskApiKey } = require('../config/encryption');
const { runAIInsightsJob } = require('../jobs/ai.job');

// ============================================================
// GET INSIGHTS
// GET /api/ai/insights
// ============================================================

const getInsights = async (req, res) => {
    try {
        const { unread_only, limit = 20 } = req.query;
        const userId = req.user.id;
        const role   = req.user.role;

        let conditions = [
            `(target_user_id = $1 OR target_user_id IS NULL)`,
            `target_role = $2`
        ];
        let params     = [userId, role === 'admin' ? 'admin' : 'manager'];
        let paramCount = 2;

        if (unread_only === 'true') {
            conditions.push('is_read = false');
        }

        paramCount++;
        params.push(limit);

        const result = await query(
            `SELECT id, insight_type, title, description,
                    data, severity, is_read, created_at
             FROM ai_insights
             WHERE ${conditions.join(' AND ')}
             ORDER BY created_at DESC
             LIMIT $${paramCount}`,
            params
        );

        const unreadCount = await query(
            `SELECT COUNT(*) AS count
             FROM ai_insights
             WHERE (target_user_id = $1 OR target_user_id IS NULL)
               AND target_role = $2
               AND is_read = false`,
            [userId, role === 'admin' ? 'admin' : 'manager']
        );

        return res.status(200).json({
            success: true,
            data: {
                insights:     result.rows,
                unread_count: parseInt(unreadCount.rows[0].count)
            }
        });

    } catch (error) {
        console.error('❌ Get Insights Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// MARK INSIGHT READ
// PUT /api/ai/insights/:id/read
// ============================================================

const markInsightRead = async (req, res) => {
    try {
        await query(
            'UPDATE ai_insights SET is_read = true WHERE id = $1',
            [req.params.id]
        );
        return res.status(200).json({ success: true, message: 'পড়া হয়েছে হিসেবে চিহ্নিত।' });
    } catch (error) {
        console.error('❌ Mark Read Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET AI CONFIG
// GET /api/ai/config
// ============================================================

const getAIConfig = async (req, res) => {
    try {
        const result = await query('SELECT config_key, config_value, description FROM ai_config');

        const config = {};
        result.rows.forEach(row => {
            // API Key মাস্ক করে দেখাও
            if (row.config_key === 'api_key' && row.config_value) {
                try {
                    const decrypted = decrypt(row.config_value);
                    config[row.config_key] = maskApiKey(decrypted);
                } catch {
                    config[row.config_key] = maskApiKey(row.config_value);
                }
            } else {
                config[row.config_key] = row.config_value;
            }
        });

        return res.status(200).json({ success: true, data: config });

    } catch (error) {
        console.error('❌ Get AI Config Error:', error.message);
        return res.status(500).json({ success: false, message: 'Config আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// UPDATE AI CONFIG
// PUT /api/ai/config
// ============================================================

const updateAIConfig = async (req, res) => {
    try {
        const {
            api_key,
            daily_model,
            periodic_model,
            max_tokens,
            periodic_review_months,
            complex_tasks_list
        } = req.body;

        const updates = {};

        if (api_key) {
            // API Key এনক্রিপ্ট করো
            updates.api_key = encrypt(api_key);
        }
        if (daily_model)            updates.daily_model = daily_model;
        if (periodic_model)         updates.periodic_model = periodic_model;
        if (max_tokens)             updates.max_tokens = String(max_tokens);
        if (periodic_review_months) updates.periodic_review_months = String(periodic_review_months);
        if (complex_tasks_list)     updates.complex_tasks_list = complex_tasks_list;

        for (const [key, value] of Object.entries(updates)) {
            await query(
                `UPDATE ai_config
                 SET config_value = $1, updated_by = $2, updated_at = NOW()
                 WHERE config_key = $3`,
                [value, req.user.id, key]
            );
        }

        // Audit log
        await query(
            `INSERT INTO audit_logs (user_id, action, table_name, new_value)
             VALUES ($1, 'UPDATE_AI_CONFIG', 'ai_config', $2)`,
            [req.user.id, JSON.stringify({ ...updates, api_key: api_key ? '***' : undefined })]
        );

        return res.status(200).json({
            success: true,
            message: 'AI Config আপডেট সফল।'
        });

    } catch (error) {
        console.error('❌ Update AI Config Error:', error.message);
        return res.status(500).json({ success: false, message: 'Config আপডেটে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// TRIGGER AI JOB (Manual — Admin টেস্টিংয়ের জন্য)
// POST /api/ai/trigger
// ============================================================

const triggerAIJob = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            message: 'AI Job শুরু হয়েছে। ব্যাকগ্রাউন্ডে চলছে।'
        });

        // ব্যাকগ্রাউন্ডে রান করো
        setImmediate(async () => {
            await runAIInsightsJob();
        });

    } catch (error) {
        console.error('❌ Trigger AI Job Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

// ============================================================
// AI CHAT
// POST /api/ai/chat
// Manager/Admin যেকোনো প্রশ্ন করতে পারবে
// ============================================================

const axios = require('axios');

const aiChat = async (req, res) => {
    try {
        const { message, history = [] } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({ success: false, message: 'বার্তা দিন।' });
        }

        // AI Config থেকে API Key নাও
        const configRes = await query(`SELECT config_key, config_value FROM ai_config`);
        const config = {};
        configRes.rows.forEach(r => { config[r.config_key] = r.config_value; });

        if (!config.api_key) {
            return res.status(400).json({ success: false, message: 'AI API Key সেট করা নেই। সেটিংস থেকে যোগ করুন।' });
        }

        let apiKey;
        try { apiKey = decrypt(config.api_key); } catch { apiKey = config.api_key; }

        // ব্যবসার তথ্য context হিসেবে দাও
        const today = new Date().toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

        const [salesCtx, attendCtx, creditCtx] = await Promise.all([
            query(`SELECT COALESCE(SUM(total_amount),0) AS today_sales, COUNT(id) AS invoices
                   FROM sales_transactions WHERE date = $1`, [today]),
            query(`SELECT COUNT(CASE WHEN status IN ('present','late') THEN 1 END) AS present,
                          COUNT(CASE WHEN status = 'absent' THEN 1 END) AS absent
                   FROM attendance WHERE date = $1`, [today]),
            query(`SELECT COALESCE(SUM(current_credit),0) AS total_due FROM customers WHERE is_active = true`)
        ]);

        const systemPrompt = `তুমি NovaTech BD কোম্পানির AI ম্যানেজার। বাংলায় উত্তর দাও।

আজকের তথ্য (${today}):
- বিক্রয়: ৳${parseInt(salesCtx.rows[0].today_sales).toLocaleString()} (${salesCtx.rows[0].invoices}টি invoice)
- উপস্থিত: ${attendCtx.rows[0].present} জন, অনুপস্থিত: ${attendCtx.rows[0].absent} জন
- মোট বকেয়া: ৳${parseInt(creditCtx.rows[0].total_due).toLocaleString()}

সংক্ষেপে ও বাস্তবসম্মত পরামর্শ দাও। ডেটা না থাকলে সৎভাবে বলো।`;

        // Chat history তৈরি
        const messages = [
            ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message }
        ];

        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model:      config.daily_model || 'claude-haiku-4-5-20251001',
                max_tokens: 800,
                system:     systemPrompt,
                messages
            },
            {
                headers: {
                    'x-api-key':         apiKey,
                    'anthropic-version':  '2023-06-01',
                    'content-type':      'application/json'
                },
                timeout: 30000
            }
        );

        const reply = response.data.content[0]?.text || 'উত্তর পাওয়া যায়নি।';

        return res.status(200).json({
            success: true,
            data: { reply, model: config.daily_model || 'claude-haiku-4-5-20251001' }
        });

    } catch (error) {
        console.error('❌ AI Chat Error:', error.response?.data || error.message);
        const msg = error.response?.status === 401
            ? 'API Key সঠিক নয়।'
            : error.response?.status === 429
            ? 'API limit পার হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।'
            : 'AI চ্যাটে সমস্যা হয়েছে।';
        return res.status(500).json({ success: false, message: msg });
    }
};
module.exports = {
    getInsights,
    markInsightRead,
    getAIConfig,
    updateAIConfig,
    triggerAIJob,
    aiChat
};
