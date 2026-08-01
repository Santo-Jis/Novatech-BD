const cron      = require('node-cron');
const logger = require('../config/logger');
const { query } = require('../config/db');
const {
    generateManagerInsight,
    generateAdminInsight,
    saveInsight
} = require('../services/ai.service');

// ============================================================
// AI Insights Background Job
// প্রতিদিন রাত ১:০০ তে চলবে
//
// ⚠️ ৩১ জুলাই ২০২৬ ফিক্স: আগে এই জব সব tenant-এর manager/admin একসাথে
// প্রসেস করতো, আর collectDailyData()/generateAdminInsight()-এ কোনো
// tenant_id filter ছিল না — ফলে Admin Insight একবার *পুরো প্ল্যাটফর্মের*
// সব tenant মিলিয়ে generate হতো, আর সেই একই insight প্রতিটা tenant-এর
// প্রতিটা admin-কে "আপনার কোম্পানির সারসংক্ষেপ" বলে দেখানো হতো — মানে এক
// tenant-এর admin আরেক tenant-এর sales/credit/attendance ডাটা (aggregate
// আকারে) দেখতে পেতো। এখন পুরো জব tenant-ভিত্তিক loop-এ চলে, প্রতিটা ধাপে
// tenant_id pass হয়, আর ai_insights টেবিলেও এখন tenant_id কলাম আছে।
// ============================================================

const runForTenant = async (tenantId, tenantName) => {
    // ১. এই tenant-এর সব Active Manager এর জন্য Insight
    const managers = await query(
        "SELECT id, name_bn FROM users WHERE role = 'manager' AND status = 'active' AND tenant_id = $1",
        [tenantId]
    );

    for (const manager of managers.rows) {
        try {
            logger.info(`🔍 [${tenantName}] ${manager.name_bn} এর Insight তৈরি হচ্ছে...`);

            const insight = await generateManagerInsight(manager.id, manager.name_bn, tenantId);
            if (!insight) continue;

            await saveInsight(
                'daily_summary', 'manager', manager.id,
                `${manager.name_bn} এর দৈনিক সারসংক্ষেপ`,
                insight.summary, insight, 'info', tenantId
            );

            if (insight.alerts?.length > 0) {
                for (const alert of insight.alerts) {
                    await saveInsight(
                        alert.type === 'critical' ? 'critical_alert' : 'warning_alert',
                        'manager', manager.id, alert.title, alert.message, alert,
                        alert.type || 'warning', tenantId
                    );
                }
            }

            logger.info(`✅ [${tenantName}] ${manager.name_bn}: ${insight.alerts?.length || 0} টি alert`);
            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (managerError) {
            logger.error(`❌ [${tenantName}] ${manager.name_bn} Insight Error:`, managerError.message);
        }
    }

    // ২. এই tenant-এর Admin(দের) জন্য Insight (একটাই তৈরি হয়, সব admin-কে দেওয়া হয়)
    const adminInsight = await generateAdminInsight(tenantId);
    if (adminInsight) {
        const admins = await query(
            "SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND tenant_id = $1",
            [tenantId]
        );

        for (const admin of admins.rows) {
            await saveInsight(
                'company_overview', 'admin', admin.id,
                'কোম্পানির দৈনিক সারসংক্ষেপ', adminInsight.summary, adminInsight, 'info', tenantId
            );

            if (adminInsight.alerts?.length > 0) {
                for (const alert of adminInsight.alerts) {
                    await saveInsight(
                        'admin_alert', 'admin', admin.id, alert.title, alert.message, alert,
                        alert.type || 'warning', tenantId
                    );
                }
            }
        }

        logger.info(`✅ [${tenantName}] Admin Insight: ${adminInsight.alerts?.length || 0} টি alert`);
    }
};

const runAIInsightsJob = async () => {
    logger.info('\n🤖 AI Insights Job শুরু...');

    try {
        const tenants = await query(
            "SELECT id, company_name FROM tenants WHERE status = 'active'"
        );
        logger.info(`🏢 Tenant সংখ্যা: ${tenants.rows.length}`);

        for (const tenant of tenants.rows) {
            try {
                await runForTenant(tenant.id, tenant.company_name || tenant.id);
            } catch (tenantError) {
                // একটা tenant fail করলে (blocked AI, key নেই, balance শেষ ইত্যাদি)
                // বাকি tenant-দের প্রসেসিং যেন থেমে না যায়
                logger.error(`❌ Tenant ${tenant.company_name || tenant.id} Insight Job Error:`, tenantError.message);
            }
        }

        // ৩. পুরনো Insight মুছে দাও (৩০ দিনের বেশি পুরনো)
        const deleted = await query(
            `DELETE FROM ai_insights
             WHERE created_at < NOW() - INTERVAL '30 days'`
        );
        logger.info(`🧹 ${deleted.rowCount} টি পুরনো insight মুছে দেওয়া হয়েছে।`);

        logger.info('\n✅ AI Insights Job সম্পন্ন।');

    } catch (error) {
        logger.error('❌ AI Job Error:', error.message);
    }
};

// ============================================================
// Job শুরু করো — প্রতিদিন রাত ১:০০
// ============================================================

const startAIJob = () => {
    logger.info('⏰ AI Job নিবন্ধিত: প্রতিদিন রাত ১:০০');

    cron.schedule('0 1 * * *', async () => {
        logger.info('🔔 AI Insights Job ট্রিগার হয়েছে');
        await runAIInsightsJob();
    }, {
        timezone: 'Asia/Dhaka'
    });
};

module.exports = { startAIJob, runAIInsightsJob };
