// একবার চালানোর স্ক্রিপ্ট: tenantScopedDb-এর SET LOCAL বাগের কারণে যে দিনগুলোর কমিশন
// লেখা হয়নি, সেগুলো নতুন করে হিসাব করে commission টেবিলে বসায়।
//
// ব্যবহার (backend ফোল্ডার থেকে, production env var সহ):
//   node scripts/backfill-commission.js 2026-11-01 2026-11-15
//
// নিরাপদ: paid=true রেকর্ড ছোঁয়া হয় না; একই দিন বারবার চালালে duplicate হয় না।
require('dotenv').config();
const { runDailyCommissionJob } = require('../src/jobs/commission.job');

const [from, to] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
    console.error('ব্যবহার: node scripts/backfill-commission.js YYYY-MM-DD YYYY-MM-DD');
    process.exit(1);
}

(async () => {
    for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
        await runDailyCommissionJob(d.toISOString().split('T')[0]);
    }
    process.exit(0);
})();
