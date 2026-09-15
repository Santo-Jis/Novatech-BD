# Commission RLS — deploy করার আগে এই ৪টা ধাপ

DB-এর অংশ (role, grants, policies, `commission_ledger`-এর immutability trigger) ইতিমধ্যে Supabase-এ (project: novatechbd) সরাসরি apply করা হয়েছে এবং verify করা হয়েছে (role attributes, policy expressions, grants — সব metadata query দিয়ে মিলিয়ে দেখা হয়েছে)। কোডের প্যাচ (`commission-rls.patch`) merge করার আগে এই ৪টা ধাপ করতে হবে, নাহলে backend চালুই হবে না (`tenantScopedDb.js` ইচ্ছাকৃতভাবে env var না থাকলে throw করে, silently fallback করে না)।

## ১. পাসওয়ার্ড রোটেট করুন (আপনি নিজে, এখনই)

আমি `app_backend` role বানানোর সময় একটা temporary পাসওয়ার্ড দিয়েছিলাম যাতে migration history-তে থাকা ছাড়া উপায় ছিল না। এটা এখনই বদলে ফেলুন — Supabase SQL editor-এ গিয়ে:

```sql
ALTER ROLE app_backend WITH PASSWORD 'আপনার-নিজের-স্ট্রং-পাসওয়ার্ড';
```

আসল পাসওয়ার্ডটা এভাবে কখনো chat/migration file-এ থাকবে না।

## ২. Render-এ ২টা নতুন env var যোগ করুন

বাকি সব (host, port, db name, SSL CA) বিদ্যমান `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_SSL_CA`-ই পুনর্ব্যবহার করে — নতুন লাগবে শুধু:

```
COMMISSION_DB_USER=app_backend
COMMISSION_DB_PASSWORD=<ধাপ ১-এ যা সেট করলেন>
```

## ৩. প্যাচ apply করুন, deploy করুন

`commission-rls.patch` — ৭টা ফাইল (১টা নতুন `config/tenantScopedDb.js`, বাকিগুলো `commission.service.js`/`commissionLedger.service.js`/`commission.job.js` আর তাদের টেস্ট)।

## ৪. Deploy-এর পর নিজে যাচাই করুন

আমি এই RLS policy-গুলো সরাসরি একটা role হিসেবে assume করে টেস্ট করতে পারিনি (Supabase-এর management API থেকে `SET ROLE` করার permission নেই) — শুধু metadata (role attributes, policy expressions, grants) মিলিয়ে দেখেছি। তাই deploy করার পর অন্তত একটা real sale/collection ঘটিয়ে দেখে নিন commission ঠিকভাবে হিসাব হচ্ছে কিনা, আর server log-এ `tenantScopedDb` সংক্রান্ত কোনো error আসছে কিনা।

## এই ধাপে কী কভার হয়নি (ইচ্ছাকৃত সীমা)

- `commission.controller.js` (getSettings, getLiveCommission, updateSettings, getMyCommission, payCommission), `salary.controller.js`, `bonus.job.js`-এর direct commission-টেবিল queries, আর `getDailyCommissionableSales`-এর sales_transactions/collections/credit_payments queries — এখনো পুরনো pool-এই। এই ফাইলগুলোতে app-level tenant_id filter আগে থেকেই ঠিক আছে (Phase 0), কিন্তু DB-level backstop এখনো নেই।
- Reconciliation job (`commissionReconciliation.job.js`) ইচ্ছাকৃতভাবে পুরনো pool-এই থেকে গেছে — ওটার কাজই cross-tenant visibility চাওয়া, tenant-scoped করলে ভেঙে যাবে।
