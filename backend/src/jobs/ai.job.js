const cron      = require('node-cron');
const { query } = require('../config/db');
const {
    generateManagerInsight,
    generateAdminInsight,
    saveInsight
} = require('../services/ai.service');

// ============================================================
// AI Insights Background Job
// প্রতিদিন রাত ১:০০ তে চলবে
// ============================================================

const runAIInsightsJob = async () => {
    console.log('\n🤖 AI Insights Job শুরু...');

    try {
        const config = await query(
            "SELECT config_value FROM ai_config WHERE config_key = 'api_key'"
        );

        if (!config.rows[0]?.config_value) {
            console.log('⚠️ Claude API Key নেই। AI Job বাদ দেওয়া হলো।');
            return;
        }

        // ১. সব Active Manager এর জন্য Insight
        const managers = await query(
            "SELECT id, name_bn FROM users WHERE role = 'manager' AND status = 'active'"
        );

        console.log(`📊 Manager সংখ্যা: ${managers.rows.length}`);

        for (const manager of managers.rows) {
            try {
                console.log(`🔍 ${manager.name_bn} এর Insight তৈরি হচ্ছে...`);

                const insight = await generateManagerInsight(manager.id, manager.name_bn);
                if (!insight) continue;

                // সারসংক্ষেপ সেভ
                await saveInsight(
                    'daily_summary',
                    'manager',
                    manager.id,
                    `${manager.name_bn} এর দৈনিক সারসংক্ষেপ`,
                    insight.summary,
                    insight,
                    'info'
                );

                // Alerts সেভ
                if (insight.alerts?.length > 0) {
                    for (const alert of insight.alerts) {
                        await saveInsight(
                            alert.type === 'critical' ? 'critical_alert' : 'warning_alert',
                            'manager',
                            manager.id,
                            alert.title,
                            alert.message,
                            alert,
                            alert.type || 'warning'
                        );
                    }
                }

                console.log(`✅ ${manager.name_bn}: ${insight.alerts?.length || 0} টি alert`);

                // Rate limit এড়াতে একটু অপেক্ষা
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (managerError) {
                console.error(`❌ ${manager.name_bn} Insight Error:`, managerError.message);
            }
        }

        // ২. Admin এর জন্য Insight
        console.log('🔍 Admin এর Insight তৈরি হচ্ছে...');

        const adminInsight = await generateAdminInsight();
        if (adminInsight) {
            const admins = await query(
                "SELECT id FROM users WHERE role = 'admin' AND status = 'active'"
            );

            for (const admin of admins.rows) {
                await saveInsight(
                    'company_overview',
                    'admin',
                    admin.id,
                    'কোম্পানির দৈনিক সারসংক্ষেপ',
                    adminInsight.summary,
                    adminInsight,
                    'info'
                );

                if (adminInsight.alerts?.length > 0) {
                    for (const alert of adminInsight.alerts) {
                        await saveInsight(
                            'admin_alert',
                            'admin',
                            admin.id,
                            alert.title,
                            alert.message,
                            alert,
                            alert.type || 'warning'
                        );
                    }
                }
            }

            console.log(`✅ Admin Insight: ${adminInsight.alerts?.length || 0} টি alert`);
        }

        // ৩. পুরনো Insight মুছে দাও (৩০ দিনের বেশি পুরনো)
        const deleted = await query(
            `DELETE FROM ai_insights
             WHERE created_at < NOW() - INTERVAL '30 days'`
        );
        console.log(`🧹 ${deleted.rowCount} টি পুরনো insight মুছে দেওয়া হয়েছে।`);

        console.log('\n✅ AI Insights Job সম্পন্ন।');

    } catch (error) {
        console.error('❌ AI Job Error:', error.message);
    }
};

// ============================================================
// Job শুরু করো — প্রতিদিন রাত ১:০০
// ============================================================

const startAIJob = () => {
    console.log('⏰ AI Job নিবন্ধিত: প্রতিদিন রাত ১:০০');

    cron.schedule('0 1 * * *', async () => {
        console.log('🔔 AI Insights Job ট্রিগার হয়েছে');
        await runAIInsightsJob();
    }, {
        timezone: 'Asia/Dhaka'
    });
};

module.exports = { startAIJob, runAIInsightsJob };
