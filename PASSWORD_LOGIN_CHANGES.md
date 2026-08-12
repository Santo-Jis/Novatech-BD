# কাস্টমার পোর্টাল — Password Login যোগ করা হয়েছে

Google login-এর পাশাপাশি এখন কাস্টমাররা **ইমেইল/মোবাইল নম্বর + পাসওয়ার্ড** দিয়েও
`/customer-login` পেজে ঢুকতে পারবেন। নিচে ঠিক কী কী পরিবর্তন হয়েছে তার তালিকা।

## 🆕 আপডেট (দ্বিতীয় ধাপ) — WhatsApp OTP + বাধ্যতামূলক রেজিস্ট্রেশন ভেরিফিকেশন

- **Forgot-password** এখন **Email এবং WhatsApp** — দুই চ্যানেলেই কাজ করে। identifier ইমেইল দিলে ইমেইলে, মোবাইল নম্বর দিলে WhatsApp-এ OTP যায় (backend স্বয়ংক্রিয়ভাবে ঠিক করে)।
- WhatsApp OTP পাঠানো হয় **প্ল্যাটফর্মের নিজস্ব Baileys গেটওয়ে** দিয়ে (ইনভয়েসে ব্যবহৃত একই ইনফ্রা) — **কোনো SaaS কোম্পানির ওয়ালেট/ক্রেডিট থেকে কাটে না**, `sms.service.js` (যেটা tenant wallet থেকে টাকা কাটে) ইচ্ছাকৃতভাবে ব্যবহার করা হয়নি।
- কাস্টমার **সেলফ-রেজিস্ট্রেশনে এখন WhatsApp নম্বর OTP verification বাধ্যতামূলক** — নম্বর যাচাই না করলে রেজিস্ট্রেশন সাবমিট হবে না।

## ✅ ডাটাবেস (ইতিমধ্যে Supabase project "novatechbd"-তে সরাসরি apply করা হয়েছে)

- `persons.password_hash`, `customers.password_hash` কলাম
- `customer_password_reset_otps` টেবিল (forgot-password OTP, owner-keyed)
- `whatsapp_verification_otps` টেবিল (**নতুন** — রেজিস্ট্রেশন OTP, phone-keyed, কোনো owner FK লাগে না যেহেতু রেজিস্ট্রেশনের আগে owner-ই তৈরি হয়নি)
- ইনডেক্স
- ফাইল: `migration_customer_password_auth.sql`, `migration_whatsapp_registration_verification.sql`

**⚠️ কোনো নতুন env variable লাগবে না** — `JWT_PORTAL_SECRET`, `ENCRYPTION_KEY`, `BAILEYS_URL`, `API_SECRET` — সবগুলোই ইতিমধ্যে ইনভয়েস/WhatsApp ফিচারে ব্যবহৃত হচ্ছে বলে ধরে নেওয়া হয়েছে।

## ✅ Backend

**নতুন ফাইল `backend/src/services/portalWhatsapp.service.js`**
- `sendPortalOTPWhatsApp(phone, otp, purpose)` — Baileys `/send-message` দিয়ে OTP পাঠায় (প্ল্যাটফর্ম-লেভেল, কোনো tenant_id নেই)
- `formatPhoneForWhatsApp(phone)` — BD নম্বর → WhatsApp আন্তর্জাতিক ফরম্যাট

**`backend/src/controllers/customerPortal.controller.js`**
- নতুন: `passwordLogin` — POST `/api/portal/login`
- নতুন: `resolvePortalOwner(identifier)` — শেয়ার্ড হেল্পার, email/phone দুটো দিয়েই customer/person খোঁজে (forgot-password ফ্লো-এর ৩টা ধাপই এটা ব্যবহার করে)
- নতুন: `portalForgotPassword` / `portalVerifyResetOtp` / `portalResetPassword` — এখন identifier email হোক বা WhatsApp নম্বর, দুটোতেই কাজ করে
- নতুন: `sendRegisterOtp` / `verifyRegisterOtp` — রেজিস্ট্রেশনের আগে WhatsApp নম্বর যাচাই
- `selfRegisterCustomer` আপডেট — `password`/`confirm_password` আবশ্যক + `whatsapp_verify_token` ছাড়া রেজিস্ট্রেশন হবে না (আগে `/send-register-otp` → `/verify-register-otp` দিয়ে token পেতে হবে)

**`backend/src/routes/customerPortal.routes.js`**
- নতুন রুট: `/login`, `/forgot-password`, `/verify-reset-otp`, `/reset-password`, `/send-register-otp`, `/verify-register-otp` — সবগুলোতেই rate-limit আছে (login: ৮/১৫মিন, reset flow: ৫/১৫মিন, register-otp: ৫/১৫মিন — WhatsApp স্প্যামে প্ল্যাটফর্মের নম্বর ব্যান হওয়ার ঝুঁকি এড়াতে কড়া রাখা হয়েছে)

**JWT shape অপরিবর্তিত** — password login ঠিক Google login-এর মতোই টোকেন ইস্যু করে, dashboard/refresh/logout সব already-existing কোড অপরিবর্তিত থাকে।

## ✅ Frontend

- **`hooks/usePortalAuth.js`** — `identifier`, `password`, `passwordLogin()`
- **`components/views/WelcomeView.jsx`** — ইমেইল/মোবাইল + পাসওয়ার্ড ফর্ম উপরে, Google বাটন সেকেন্ডারি
- **`components/ui/CpInput.jsx`** — নতুন ঐচ্ছিক `rightElement` prop
- **`CustomerSelfRegister.jsx`** —
  - ধাপ ৩-এ পাসওয়ার্ড + কনফার্ম পাসওয়ার্ড (আবশ্যক)
  - **নতুন:** WhatsApp নম্বরের পাশে "OTP পাঠান" বাটন → ইনলাইন OTP ইনপুট → "যাচাই করুন" → ✓ যাচাই হয়েছে ব্যাজ। নম্বর বদলালে ভেরিফিকেশন রিসেট হয়ে যায়। যাচাই না হলে পরের ধাপে যাওয়া যাবে না।
- **`CustomerForgotPassword.jsx`** — এখন ইমেইল অথবা WhatsApp নম্বর দুটোই গ্রহণ করে, চ্যানেল অনুযায়ী মেসেজ/আইকন বদলায়
- **`App.jsx`** — route: `/customer-forgot-password`

## 🔍 End-to-end QA পাস (তৃতীয় ধাপ)

সম্পূর্ণ সিস্টেম ম্যানুয়ালি ট্রেস করে চেক করা হয়েছে (কোনো live server ছাড়াই — এই environment-এ network/npm install নেই, তাই কোড-লেভেলে প্রতিটা কল-চেইন যাচাই করা হয়েছে):

- সব ফাইল সিনট্যাক্স ভ্যালিডেশন পাস (TypeScript transpiler দিয়ে JSX সহ)
- লাইভ Supabase schema-র বিরুদ্ধে প্রতিটা query-র কলাম নাম যাচাই করা হয়েছে
- প্রতিটা নতুন এন্ডপয়েন্টের request/response shape frontend↔backend দুই দিক থেকেই মিলিয়ে দেখা হয়েছে
- JWT payload shape password vs Google login-এ হুবহু এক তা নিশ্চিত করা হয়েছে (dashboard/refresh/logout প্রভাবিত হয়নি)
- `CpInput`-এর নতুন prop অন্য ৭টা জায়গায় (ProfileTab, CreditTab, ইত্যাদি) ব্যবহারে কোনো visual পরিবর্তন আনেনি তা CSS ক্লাস লেভেলে যাচাই করা হয়েছে
- `/api/portal`-এর উপর একটা গ্লোবাল rate-limiter (`loginLimiter`, 50/১৫মিন) আগে থেকেই আছে জানা গেছে — আমার নিজস্ব limiter-গুলো (৫-৮/১৫মিন) এর চেয়ে কড়া বলে কোনো conflict নেই

**এই পাসে যা ঠিক করা হয়েছে:**
1. "এই নম্বরে আগে থেকেই প্রোফাইল আছে" এররটা আগে শুধু Google-এর কথা বলত — এখন পাসওয়ার্ড/ফরগট-পাসওয়ার্ড অপশনও উল্লেখ করে
2. WhatsApp duplicate-registration চেক আগে শুধু **শেষ ধাপে** (সব ছবি আপলোড শেষে) হতো — এখন **OTP পাঠানোর আগেই** হয়, যাতে কেউ পুরো ৬-ধাপ wizard শেষ করে শেষমুহূর্তে "already registered" এরর না পায়
3. Staff-এর পাঠানো WhatsApp পোর্টাল-লিংক মেসেজেও এখন পাসওয়ার্ড অপশনের কথা উল্লেখ আছে (আগে শুধু "Google দিয়ে লগইন করুন" বলত)

**যা পাওয়া গেছে কিন্তু ইচ্ছাকৃতভাবে হাত দেওয়া হয়নি (স্কোপের বাইরে):**
- `invoice.service.js`/`invoiceWhatsapp.service.js`-এর বিদ্যমান `formatPhoneForWA`/`formatPhone` ফাংশনে সম্ভবত একটা phone-formatting বাগ আছে (leading 0 ঠিকমতো বাদ যাচ্ছে না বলে মনে হচ্ছে) — এটা ইনভয়েস WhatsApp পাঠানোর পুরনো কোড, আমার কাজের অংশ না, তাই স্পর্শ করিনি। আমার নিজের `portalWhatsapp.service.js`-এ আলাদা, সঠিক ফরম্যাটার লিখেছি।
- যদি কোনো legacy (staff-added) কাস্টমার রেকর্ড কোনো person-এর সাথে link করা না থাকে (`person_id = NULL`) এবং সেই একই ফোন/ইমেইল দিয়ে কেউ নতুন করে self-register করে, password login lookup Google login-এর মতোই আগে customers টেবিল চেক করবে — এটা বিদ্যমান আর্কিটেকচারের বৈশিষ্ট্য, আমার নতুন কোনো bug না, কিন্তু জানা থাকা ভালো।
- WhatsApp OTP ডেলিভারি সম্পূর্ণভাবে Baileys সেশন লাইভ থাকার উপর নির্ভরশীল — ডাউন থাকলে স্পষ্ট এরর দেখাবে (crash করবে না)।
- অসম্পূর্ণ রেজিস্ট্রেশনের (OTP ভেরিফাই করেছে কিন্তু ফর্ম শেষ করেনি) পুরনো `whatsapp_verification_otps` সারি এখন কোনো cron দিয়ে পরিষ্কার হয় না — শুধু storage-এ জমা হতে থাকবে, কার্যকারিতায় প্রভাব ফেলবে না।

## ⚠️ জানা সীমাবদ্ধতা

1. পুরনো কাস্টমার যারা Google দিয়ে রেজিস্টার করেছেন (password_hash নেই): "পাসওয়ার্ড ভুলে গেছেন?" ফ্লো দিয়েই প্রথমবার পাসওয়ার্ড সেট করতে পারবেন — নতুন কোনো আলাদা UI বানানো হয়নি।
2. প্রোফাইল/সেটিংস ট্যাব থেকে পাসওয়ার্ড পরিবর্তনের UI নেই — শুধু লগইন-কেন্দ্রিক কাজ করা হয়েছে।
3. WhatsApp OTP ডেলিভারি নির্ভর করে Baileys সেশন লাইভ/কানেক্টেড থাকার উপর — সেশন ডিসকানেক্ট থাকলে `sendRegisterOtp`/forgot-password (WhatsApp channel) 503 রিটার্ন করবে সেই সময়।

## 🧪 ডিপ্লয়ের আগে টেস্ট করার চেকলিস্ট

- [ ] রেজিস্ট্রেশনে WhatsApp নম্বর দিয়ে OTP পাঠানো ও যাচাই কাজ করছে (verify_token ছাড়া সাবমিট ব্লক হচ্ছে)
- [ ] নতুন self-register → পাসওয়ার্ড সেট → `/customer-login`-এ redirect হয়ে সেই পাসওয়ার্ড দিয়ে লগইন
- [ ] Forgot-password: ইমেইল দিলে ইমেইলে, WhatsApp নম্বর দিলে WhatsApp-এ OTP আসছে
- [ ] ভুল পাসওয়ার্ডে সঠিক এরর মেসেজ দেখায় (session-expired না বলে)
- [ ] Password login করার পর dashboard/invoices স্বাভাবিকভাবে লোড হচ্ছে
- [ ] Rate limiter কাজ করছে
- [ ] Baileys সেশন ডাউন থাকা অবস্থায় WhatsApp OTP পাঠানোর চেষ্টা করলে ইউজার-ফ্রেন্ডলি এরর দেখাচ্ছে (crash না করে)

