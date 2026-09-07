# Contributing — ZovoriX / Novatech-BD

## এটা কেন লেখা হলো

এতদিন patch আসতো zip আকারে — কেউ একটা `.zip` extract করে ফেলে দিতো,
কখনো নির্দিষ্ট ফাইল হাতে delete করতে হতো, আর `FIXES-README.md` টাইপ নোট
রাখা হতো যাতে *"অন্য কোনো এজেন্টের কাজ হারানোর ঝুঁকি নেই"* — মানে একাধিক
AI session সমান্তরালে একই কোডবেসে কাজ করছিল, কোনো central history ছাড়াই।

এটা কাজ করেছে, কিন্তু ঝুঁকিটা বাস্তব: দুইটা agent একই ফাইলে ভিন্ন
অ্যাসাম্পশন নিয়ে কাজ করলে, কেউ conflict ধরবে না। কোনো review gate নেই।
Migration history-ও একই কারণে repo-র বাইরে চলে গিয়েছিল (আগের ফিক্সে
সেটা ধরা পড়েছে)।

## নতুন নিয়ম — সংক্ষেপে

1. **সরাসরি `main`-এ push না** — সবসময় branch থেকে PR
2. **Branch নাম**: `fix/customer-otp-rls`, `feat/return-flow`, `chore/deps` — কী এবং কোন ধরনের কাজ, দুটোই বোঝা যায় এমন নাম
3. **PR খুলুন**, template পূরণ করুন (risk level সহ)
4. **CI পাস করতে হবে** — `.github/workflows/backend-test.yml` এখন থেকে আসলেই চলবে (আগে `npm run test:unit`/`test:integration` script package.json-এ ছিলই না, workflow silently ভাঙা ছিল — এই PR-এই সেটা ঠিক করা হয়েছে)
5. **High-risk PR** (auth, payment/credit, RLS, migration) — নিজে merge না করে অন্তত একজনকে (মানুষ বা আলাদা agent session) review করতে বলুন

## AI agent দিয়ে কাজ করালে

- এজেন্টকে branch-এ কাজ করতে বলুন, `main`-এ না
- যা কিছু agent-টা assume করেছে (schema shape, existing behavior, কোন
  table-এ RLS আছে/নেই) সেটা PR description-এ explicit লিখতে বলুন —
  এটাই আগের `agent_communication_log`-এর কাজ করবে, কিন্তু review-able
  আকারে, ভবিষ্যতের agent session-এর জন্য প্রাসঙ্গিক প্রশ্নবিহীন প্রমাণ হিসেবে
- একটা session-এর কাজ শেষ না করেই আরেকটা session একই ফাইলে হাত দিলে —
  branch আলাদা থাকলে সেটা PR-এ merge conflict হিসেবে ধরা পড়বে, silently
  ওভাররাইট হবে না

## Branch protection চালু করা (GitHub-এ manually করতে হবে, আমি remotely পারি না)

GitHub repo → **Settings → Branches → Add branch protection rule**:
- Branch name pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging → select **Backend Tests** (both `unit-tests` ও `integration-tests` job)
- ✅ Require branches to be up to date before merging
- (Team বড় হলে) ✅ Require approvals — কমপক্ষে ১

এটা না করলে উপরের সবকিছু শুধু "সুপারিশ" থেকে যাবে, বাধ্যতামূলক হবে না —
কেউ চাইলে এখনও সরাসরি `main`-এ push করতে পারবে।

## এখনো যা বাকি (স্কোপের বাইরে রাখা হয়েছে এই পাসে)

- ESLint/Prettier — কোনো lint config নেই এখনো; যোগ করলে প্রথমবার অনেক
  existing-code warning আসবে, তাই আলাদা, ইচ্ছাকৃত কাজ হিসেবে করা ভালো
- CODEOWNERS — টিম ছোট থাকা পর্যন্ত দরকার নেই, বড় হলে যোগ করুন
