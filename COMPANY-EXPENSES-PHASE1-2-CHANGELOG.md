# কোম্পানির খরচ — ধাপ ১ + ২

## ধাপ ১
- ক্যাটাগরি তালিকা (প্রতি tenant নিজে যোগ / নাম বদল / বন্ধ করতে পারে; নাম বদলালে আগের খরচেও বদলায়)
- নির্দিষ্ট মাসিক খরচ — প্রতিদিন ভোর ৪টায় job নিজে জমা করে (missed-run catch-up সহ)
- পেমেন্ট পদ্ধতি, কাকে দেওয়া হলো, রসিদের ছবি

## ধাপ ২
- অগ্রিম খরচ — মোট টাকা N মাসে সমান ভাগ, প্রতি মাসের ১ তারিখে কিস্তি (শেষ কিস্তিতে অবশিষ্ট)
- ক্যাটাগরি অনুযায়ী মাসিক বাজেট বনাম আসল খরচ (ডিফল্ট + নির্দিষ্ট মাসের ব্যতিক্রম)

## ডাটাবেস
- migration_company_expense_categories_recurring.sql
- migration_company_expense_prepaid_budgets.sql (RLS সহ)
- ⚠️ Supabase-এ দুটোই আগেই প্রয়োগ করা হয়েছে — আবার চালানো লাগবে না (চালালেও ক্ষতি নেই)।

## পরিবর্তিত/নতুন ফাইল
backend: companyExpense.controller.js, expense.routes.js, server.js,
         services/recurringExpense.service.js, jobs/recurringExpense.job.js,
         tests/recurringExpense.service.test.js
frontend: pages/admin/CompanyExpenses.jsx,
          components/expenses/{expenseConstants.js, ExpenseCategoriesTab, RecurringExpensesTab, PrepaidExpensesTab, BudgetTab}.jsx
