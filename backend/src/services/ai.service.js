const axios     = require('axios');
const { query } = require('../config/db');
const { decrypt } = require('../config/encryption');

// ============================================================
// AI Service — Claude API Integration
// NovaTechBD Management System
// ============================================================

// ============================================================
// AI Config পড়া
// ============================================================

const getAIConfig = async () => {
    const result = await query('SELECT config_key, config_value FROM ai_config');
    const config = {};
    result.rows.forEach(row => { config[row.config_key] = row.config_value; });

    // API Key ডিক্রিপ্ট করো
    if (config.api_key) {
        try {
            config.api_key_decrypted = decrypt(config.api_key);
        } catch {
            config.api_key_decrypted = config.api_key; // এনক্রিপ্ট না থাকলে সরাসরি
        }
    }

    return config;
};

// ============================================================
// মডেল নির্বাচন
// দৈনিক → haiku, পিরিয়ডিক → sonnet
// ============================================================

const selectModel = (config, taskType = 'daily') => {
    const complexTasks = (config.complex_tasks_list || '').split(',').map(t => t.trim());

    if (complexTasks.includes(taskType)) {
        return config.periodic_model || 'claude-sonnet-4-6';
    }
    return config.daily_model || 'claude-haiku-4-5-20251001';
};

// ============================================================
// Claude API কল
// ============================================================

const callClaudeAPI = async (prompt, taskType = 'daily', systemPrompt = null) => {
    const config = await getAIConfig();

    if (!config.api_key_decrypted) {
        throw new Error('Claude API Key সেট করা নেই।');
    }

    const model     = selectModel(config, taskType);
    const maxTokens = parseInt(config.max_tokens || '1000');

    const messages = [{ role: 'user', content: prompt }];

    const body = {
        model,
        max_tokens: maxTokens,
        messages
    };

    if (systemPrompt) {
        body.system = systemPrompt;
    }

    const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        body,
        {
            headers: {
                'x-api-key':         config.api_key_decrypted,
                'anthropic-version': '2023-06-01',
                'content-type':      'application/json'
            },
            timeout: 60000
        }
    );

    return response.data?.content?.[0]?.text || '';
};

// ============================================================
// ডেইলি ডাটা সংগ্রহ
// ============================================================

const collectDailyData = async (managerId = null) => {
    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let workerFilter     = '';
    let workerFilterParams = [];

    if (managerId) {
        workerFilter = 'AND u.manager_id = $1';
        workerFilterParams = [managerId];
    }

    // হাজিরা ডাটা
    const attendance = await query(
        `SELECT u.name_bn, a.status, a.late_minutes, a.salary_deduction
         FROM attendance a
         JOIN users u ON a.user_id = u.id
         WHERE a.date = $${managerId ? '2' : '1'} ${workerFilter}`,
        managerId ? [today, ...workerFilterParams] : [today]
    );

    // বিক্রয় ডাটা
    const sales = await query(
        `SELECT u.name_bn,
                SUM(st.total_amount)  AS total_sales,
                COUNT(st.id)          AS invoice_count,
                SUM(st.credit_used)   AS credit_given
         FROM sales_transactions st
         JOIN users u ON st.worker_id = u.id
         WHERE st.date = $${managerId ? '2' : '1'} ${workerFilter}
         GROUP BY u.id, u.name_bn`,
        managerId ? [today, ...workerFilterParams] : [today]
    );

    // গত ৭ দিনের বিক্রয় ট্রেন্ড
    const trend = await query(
        `SELECT st.date, SUM(st.total_amount) AS total
         FROM sales_transactions st
         JOIN users u ON st.worker_id = u.id
         WHERE st.date >= $${managerId ? '2' : '1'}::date - INTERVAL '7 days'
           AND st.date <= $${managerId ? '2' : '1'} ${workerFilter}
         GROUP BY st.date
         ORDER BY st.date`,
        managerId ? [today, ...workerFilterParams] : [today]
    );

    // বেশি বাকি কাস্টমার
    const highCredit = await query(
        `SELECT c.shop_name, c.current_credit, c.credit_limit,
                ROUND((c.current_credit / NULLIF(c.credit_limit,0) * 100)::numeric, 1) AS usage_pct
         FROM customers c
         LEFT JOIN routes r ON c.route_id = r.id
         WHERE c.current_credit > 0
           ${managerId ? 'AND r.manager_id = $1' : ''}
         ORDER BY usage_pct DESC NULLS LAST
         LIMIT 5`,
        managerId ? [managerId] : []
    );

    return {
        date:        today,
        attendance:  attendance.rows,
        sales:       sales.rows,
        trend:       trend.rows,
        high_credit: highCredit.rows
    };
};

// ============================================================
// Manager এর জন্য Insight তৈরি
// ============================================================

const generateManagerInsight = async (managerId, managerName) => {
    try {
        const data = await collectDailyData(managerId);

        const prompt = `
তুমি NovaTech BD কোম্পানির একজন AI Business Analyst।
নিচের ডাটা বিশ্লেষণ করে ${managerName} ম্যানেজারের জন্য একটি সংক্ষিপ্ত বাংলা রিপোর্ট তৈরি করো।

তারিখ: ${data.date}

হাজিরা:
${JSON.stringify(data.attendance, null, 2)}

আজকের বিক্রয়:
${JSON.stringify(data.sales, null, 2)}

গত ৭ দিনের ট্রেন্ড:
${JSON.stringify(data.trend, null, 2)}

উচ্চ ক্রেডিট ঝুঁকি:
${JSON.stringify(data.high_credit, null, 2)}

নিচের JSON ফরম্যাটে উত্তর দাও (অন্য কিছু লিখবে না):
{
  "summary": "সংক্ষিপ্ত সারসংক্ষেপ (২-৩ বাক্য)",
  "alerts": [
    {"type": "warning/critical/info", "title": "শিরোনাম", "message": "বিস্তারিত"}
  ],
  "recommendations": ["সুপারিশ ১", "সুপারিশ ২"]
}`;

        const response = await callClaudeAPI(prompt, 'daily');

        // JSON পার্স
        const cleanJson = response.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);

    } catch (error) {
        console.error(`❌ Manager Insight Error (${managerId}):`, error.message);
        return null;
    }
};

// ============================================================
// Admin এর জন্য Insight তৈরি
// ============================================================

const generateAdminInsight = async () => {
    try {
        const data = await collectDailyData(null);

        // মোট KPI
        const kpi = await query(
            `SELECT
                COUNT(DISTINCT st.worker_id) AS active_sellers,
                SUM(st.total_amount)         AS total_sales,
                SUM(st.credit_used)          AS total_credit,
                COUNT(a.id) FILTER (WHERE a.status = 'late') AS late_count
             FROM sales_transactions st
             LEFT JOIN attendance a ON a.user_id = st.worker_id AND a.date = CURRENT_DATE
             WHERE st.date = CURRENT_DATE`
        );

        const prompt = `
তুমি NovaTech BD কোম্পানির AI Business Analyst।
নিচের কোম্পানির সামগ্রিক ডাটা বিশ্লেষণ করে Admin এর জন্য রিপোর্ট তৈরি করো।

তারিখ: ${data.date}

KPI:
${JSON.stringify(kpi.rows[0], null, 2)}

বিক্রয় (SR ভিত্তিক):
${JSON.stringify(data.sales, null, 2)}

ক্রেডিট ঝুঁকি:
${JSON.stringify(data.high_credit, null, 2)}

নিচের JSON ফরম্যাটে উত্তর দাও:
{
  "summary": "কোম্পানির সামগ্রিক অবস্থা (৩-৪ বাক্য)",
  "kpi_highlights": ["মূল পয়েন্ট ১", "মূল পয়েন্ট ২"],
  "alerts": [
    {"type": "warning/critical/info", "title": "শিরোনাম", "message": "বিস্তারিত"}
  ],
  "recommendations": ["সুপারিশ ১", "সুপারিশ ২"]
}`;

        const response = await callClaudeAPI(prompt, 'daily');
        const cleanJson = response.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson);

    } catch (error) {
        console.error('❌ Admin Insight Error:', error.message);
        return null;
    }
};

// ============================================================
// Insight DB তে সেভ করা
// ============================================================

const saveInsight = async (insightType, targetRole, targetUserId, title, description, data, severity) => {
    await query(
        `INSERT INTO ai_insights
         (insight_type, target_role, target_user_id, title, description, data, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [insightType, targetRole, targetUserId || null, title, description, JSON.stringify(data || {}), severity || 'info']
    );
};

module.exports = {
    getAIConfig,
    callClaudeAPI,
    collectDailyData,
    generateManagerInsight,
    generateAdminInsight,
    saveInsight
};
