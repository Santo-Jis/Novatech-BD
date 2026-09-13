# ZovoriX — Multi-Tenant Distribution & Sales Management System

> B2B distribution ব্যবসার (FMCG/pharma-style) জন্য একটা full-stack SaaS
> platform — Sales Force Automation (SFA), Distribution Management (DMS),
> Inventory, আর Finance একসাথে।

---

## এটা কী

ZovoriX এমন একটা কোম্পানির জন্য বানানো, যাদের একটা field sales force
(SR — Sales Representative) দোকানে দোকানে গিয়ে order নেয়, টাকা তোলে, আর
ডেলিভারি হয় warehouse থেকে। পুরো hierarchy (RSM → ASM → Supervisor → SR)
আর প্রতিটা customer-এর নিজস্ব self-service portal — একই platform-এ।

Multi-tenant SaaS হিসেবে বানানো — একাধিক কোম্পানি (tenant) আলাদা ডেটা নিয়ে
একই কোডবেস ব্যবহার করে, `platform`/`superadmin` role দিয়ে tenant-গুলো
কেন্দ্রীয়ভাবে ম্যানেজ হয়।

## মূল ফিচার

- **Sales & Field Force** — order, route/coverage planning, GPS attendance
  ও trail tracking, commission, gamified leaderboard
- **Inventory** — batch/expiry (FEFO) tracking, multi-warehouse, purchase
  orders, supplier management
- **Finance** — ledger, monthly ledger, settlement, collection, credit
  approval workflow, salary, expense
- **Customer Portal** — browsing/order, wishlist, return/settlement request,
  in-app chat (SLA সহ), AI চ্যাট
- **Multi-tenant Platform Layer** — tenant onboarding, plan/seat/billing,
  trial expiry, platform staff + 2FA, support panel
- **Notifications** — push (FCM), SMS, email, WhatsApp — সব একসাথে
- **AI** — Claude-চালিত চ্যাট ও insight, tenant-ভিত্তিক token/cost metering

## রোল

| Role | কাজ |
|---|---|
| SR (worker) | ফিল্ডে order নেওয়া, কালেকশন, attendance |
| Supervisor / ASM / RSM | টিম ও area-ভিত্তিক তদারকি |
| Manager | অপারেশনাল ওভারসাইট |
| Admin | কোম্পানি-ওয়াইড কনফিগ ও অ্যাপ্রুভাল |
| Customer | self-service portal (আলাদা ওয়েব + APK) |
| Platform / SuperAdmin | ZovoriX-এর নিজস্ব SaaS অপারেশন — tenant ম্যানেজমেন্ট |

## টেক স্ট্যাক

**Backend** — Node.js + Express (CommonJS, no ORM — raw `pg`), PostgreSQL
(Supabase), Redis + BullMQ, Firebase Admin (push + realtime), JWT auth।
Hosted on **Render**.

**Frontend** — React 18 + Vite + Tailwind + Zustand + React Hook Form।
Capacitor দিয়ে Android APK build হয় (SR আর Customer app আলাদা, একই
কোডবেস থেকে — দেখুন `SR-APK-CHANGES.md`)। Hosted on **Vercel**.

**Database** — Supabase PostgreSQL। Migration `backend/migrations/` এ
sequential numbered `.sql` ফাইল হিসেবে।

## শুরু করা (Getting Started)

```bash
# Backend
cd backend
cp backend.env.example .env     # env var ভরুন — নিচে দেখুন
npm install
npm run dev                     # nodemon, http://localhost:5000

# Frontend
cd frontend
cp frontend.env.example .env
npm install
npm run dev                     # vite, http://localhost:5173
```

### প্রয়োজনীয় env var (সারসংক্ষেপ — সম্পূর্ণ তালিকা `.env.example` ফাইলে)

Database connection (Supabase), Redis URL, JWT secret (employee ও customer
portal আলাদা), Firebase service account, SMTP (Brevo — Render SMTP port
block করে), SMS gateway key, Cloudinary, Google OAuth (customer portal),
`CLAUDE_API_KEY` (AI ফিচারের জন্য)।

### টেস্ট

```bash
cd backend
npm test                # সব টেস্ট
npm run test:unit       # শুধু unit
npm run test:integration
```

Frontend-এ এখনো কোনো টেস্ট সেটআপ নেই — এটা backlog-এ আছে।

## API ডকুমেন্টেশন

`backend/openapi.json` — সব route-এর একটা auto-generated OpenAPI 3.0 spec।
লোকালি দেখতে:

```bash
cd backend
npm run dev
# তারপর ব্রাউজারে: http://localhost:5000/api-docs
```

Route-এ নতুন endpoint যোগ হলে `npm run docs:generate` চালিয়ে spec
রিফ্রেশ করুন (দেখুন `scripts/generate-openapi.js`)।

## ডকুমেন্টেশন

এই ধরনের প্রজেক্টে "কেন এভাবে করা হলো" জানাটা "কী করা হলো" জানার চেয়ে
জরুরি। শুরু করার আগে এগুলো পড়ুন:

- **[`DECISIONS.md`](./DECISIONS.md)** — architecture-এর অ-স্পষ্ট
  সিদ্ধান্তগুলোর কারণ (কেন কিছু table deliberately link করা হয়নি, Redis
  fallback pattern, ইত্যাদি) — নতুন কাজ শুরুর আগে অবশ্যই পড়ুন
- **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** — branch/PR flow, CI, high-risk
  PR review নিয়ম, branch protection checklist
- অন্যান্য `*_CHANGES.md` / `*_README.md` — নির্দিষ্ট feature-এর ইতিহাস

## Contributing

সরাসরি `main`-এ push না — branch থেকে PR, CI pass করতে হবে। বিস্তারিত
[`CONTRIBUTING.md`](./CONTRIBUTING.md)-এ।
