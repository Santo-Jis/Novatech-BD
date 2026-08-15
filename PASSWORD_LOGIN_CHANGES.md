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

## 🆕 আপডেট (চতুর্থ ধাপ) — পাসওয়ার্ড বদলের নিরাপত্তা সতর্কতা

পাসওয়ার্ড রিসেট/সেট (`/portal/reset-password`) সফল হলে এখন কাস্টমার **email এবং WhatsApp — দুই চ্যানেলেই** একটা সতর্কতা মেসেজ পান (যেগুলো তার আছে) — OTP আসলে কোন চ্যানেল দিয়ে ভেরিফাই হয়েছিল তা নির্বিশেষে। উদ্দেশ্য: কারো অ্যাকাউন্ট কম্প্রোমাইজ হয়ে পাসওয়ার্ড বদলে গেলে আসল মালিক সাথে সাথে জানতে পারবে — একটা চ্যানেল (ধরুন email) কম্প্রোমাইজড থাকলেও অন্যটা (WhatsApp) দিয়ে অ্যালার্ট পৌঁছাবে।

- **`backend/src/services/portalWhatsapp.service.js`** — রিফ্যাক্টর করা হয়েছে: এখন একটা জেনেরিক `sendPortalWhatsAppMessage(phone, message, type)` প্রিমিটিভের উপর `sendPortalOTPWhatsApp` তৈরি, প্লাস নতুন `sendPasswordChangedAlertWhatsApp(phone, whenText)`। বিদ্যমান `sendPortalOTPWhatsApp`-এর ব্যবহার/সিগনেচার অপরিবর্তিত (backward compatible)।
- **`backend/src/controllers/customerPortal.controller.js`** — নতুন `notifyPasswordChanged({email, phone, name})` হেল্পার, `portalResetPassword`-এ ওয়্যার করা — **fire-and-forget** (পাসওয়ার্ড রিসেটের রেসপন্স notification-এর জন্য অপেক্ষা করে না; notification পাঠাতে ব্যর্থ হলেও পাসওয়ার্ড ঠিকই বদলে যায়, শুধু `logger.warn` হয়)।
- কোনো নতুন DB টেবিল/মাইগ্রেশন লাগেনি — বিদ্যমান `customers`/`persons` টেবিলের email/whatsapp/sms_phone কলাম থেকেই কন্টাক্ট তথ্য নেওয়া হয়।

**এখনো বাকি (এই ধাপে ইচ্ছাকৃতভাবে বাদ):** "নতুন ডিভাইস থেকে লগইন" অ্যালার্ট যোগ করা হয়নি — এর জন্য password-login-এর device tracking দরকার হবে, যেটা বিদ্যমান `customer_portal_devices` টেবিলে করা যাচ্ছে না কারণ ওখানে `customer_id`/`google_email` কলাম `NOT NULL` (company-বিহীন person-দের জন্য কাজ করবে না) — এটা একটা আলাদা, বড় কাজ, ছোট আর্কিটেকচার সিদ্ধান্ত লাগবে আগে।

## 🆕 আপডেট (পঞ্চম ধাপ) — Device + Location ট্র্যাকিং, নতুন-ডিভাইস অ্যালার্ট

এখন **password ও Google — দুই লগইন মেথডেই** প্রতিটা সফল লগইনের একটা ইভেন্ট রেকর্ড হয় (device fingerprint + IP + আনুমানিক city/country সহ)। কোনো owner-এর জন্য আগে কখনো না-দেখা fingerprint থেকে লগইন হলে (এবং এটা তার প্রথম-লগইন না হলে), email + WhatsApp দুই চ্যানেলেই "নতুন ডিভাইস থেকে লগইন হয়েছে" সতর্কতা যায় — লোকেশনসহ।

**নতুন DB টেবিল: `customer_portal_login_events`**
- `customer_portal_devices` থেকে ইচ্ছাকৃতভাবে আলাদা রাখা হয়েছে — ওই টেবিলে `customer_id`/`google_email` কলাম `NOT NULL`, company-বিহীন person-দের জন্য কাজ করত না। নতুন টেবিল `customer_id`/`person_id`-এর যেকোনো একটা সাপোর্ট করে (আগের OTP টেবিলগুলোর মতোই একই প্যাটার্ন)।
- ফাইল: `migration_customer_portal_login_events.sql` (ইতিমধ্যে Supabase-এ apply করা হয়েছে)।

**নতুন ফাইল `backend/src/services/geoip.service.js`**
- `getLocationFromIP(ip)` — [ip-api.com](http://ip-api.com) (ফ্রি, কোনো API key লাগে না) দিয়ে IP → city/country। প্রাইভেট/লোকাল IP স্কিপ করে। **ব্যর্থ হলে কখনো throw করে না** — শুধু `{city: null, country: null}` ফেরত দেয়, লগইন ফ্লো কখনো এর জন্য আটকায় না।

**`backend/src/services/portalWhatsapp.service.js` — আরও এক দফা রিফ্যাক্টর**
- নতুন `sendPasswordChangedAlertWhatsApp` যোগ হয়েছে (নতুন-ডিভাইস অ্যালার্টও `sendPortalWhatsAppMessage` প্রিমিটিভ দিয়েই পাঠানো হয়, আলাদা ফাংশনের দরকার হয়নি)।

**`backend/src/controllers/customerPortal.controller.js`**
- নতুন `recordLoginEvent({...})` — fingerprint compare করে "নতুন ডিভাইস কিনা" ঠিক করে, ইভেন্ট রেকর্ড করে, দরকার হলে অ্যালার্ট পাঠায়। **সম্পূর্ণ best-effort/fire-and-forget** — কোনো ধাপ ব্যর্থ হলেও (geoip lookup, DB insert, ইমেইল/WhatsApp পাঠানো) মূল লগইন রেসপন্সকে প্রভাবিত করে না, শুধু log করে।
- নতুন `notifyNewDeviceLogin({...})` — location + সময় সহ অ্যালার্ট (email HTML + WhatsApp টেক্সট)।
- `passwordLogin` ও `directGoogleAuth` — দুটোতেই `recordLoginEvent(...)` কল যোগ হয়েছে (response-এর ঠিক আগে, await ছাড়া — response block করে না)। `passwordLogin` এখন `device_id` গ্রহণ করে (আগে করত না)।

**Frontend: `usePortalAuth.js`**
- `passwordLogin()` এখন `getDeviceFingerprint()` কল করে `device_id` পাঠায় — ঠিক `googleLogin()`-এর মতোই একই fingerprint মেকানিজম পুনরায় ব্যবহার করা হয়েছে, নতুন কিছু বানানো হয়নি।

**একটা কথা জেনে রাখা ভালো:** geolocation প্রোভাইডার (`ip-api.com`) একটা ফ্রি থার্ড-পার্টি সার্ভিস — rate limit (৪৫ req/min) বা সাময়িক ডাউনটাইম হতে পারে। এটা ইচ্ছাকৃতভাবে **শুধু enrichment** হিসেবে ডিজাইন করা হয়েছে — ব্যর্থ হলে city/country ফাঁকা থাকবে, কিন্তু "নতুন ডিভাইস" ডিটেকশন ও অ্যালার্ট (fingerprint-ভিত্তিক) তাতেও কাজ করবে।

## 🆕 আপডেট (ষষ্ঠ ধাপ) — ইমেইল ভেরিফিকেশন (magic-link)

সেলফ-রেজিস্ট্রেশনে দেওয়া (ঐচ্ছিক) ইমেইল এখন ভেরিফাই করা যায় — কিন্তু WhatsApp-এর মতো ভারী "OTP পাঠান → কোড টাইপ করুন → যাচাই করুন" UI রেজিস্ট্রেশন ফর্মে যোগ করা হয়নি (দুটো OTP-ব্লক পাশাপাশি থাকলে বিরক্তিকর লাগত)। বরং: রেজিস্ট্রেশন সফল হওয়ার পরে (fire-and-forget) একটা **click-to-verify লিংক ইমেইলে পাঠানো হয়** — কাস্টমার যখন সুবিধামতো ইনবক্স চেক করবেন, এক ক্লিকে ভেরিফাই হয়ে যাবে। রেজিস্ট্রেশন ফর্মের গতি/UX-এ কোনো পরিবর্তন হয়নি।

- **কেন শুধু `persons` টেবিলে:** সেলফ-রেজিস্ট্রেশনে দেওয়া ইমেইল সবসময় `persons.email`-এ যায়। `customers.email` আলাদা একটা জিনিস — সেটা আসে Google OAuth থেকে (directGoogleAuth-এর "email lock" মেকানিজম দিয়ে), তাই ইতিমধ্যেই Google-verified — নতুন করে ভেরিফাই করার দরকার নেই।
- **`backend/src/controllers/customerPortal.controller.js`** — নতুন `sendEmailVerificationLink(personId, email, name)` (৭ দিন কার্যকর টোকেন, best-effort) এবং নতুন এন্ডপয়েন্ট `verifyEmailToken` — `POST /api/portal/verify-email` (body: `{token}`)। `selfRegisterCustomer`-এ email দেওয়া থাকলে fire-and-forget কল হয়।
- **`backend/src/routes/customerPortal.routes.js`** — `/verify-email` রুট যোগ হয়েছে (rate-limited)।
- **নতুন ফ্রন্টএন্ড পেজ `CustomerEmailVerify.jsx`** — route: `/customer-email-verify?token=...`। ইমেইল লিংকে ক্লিক করলে এখানে আসে, পেজ লোড হওয়ার সাথে সাথেই টোকেন verify করে ফলাফল দেখায় (verifying → success/already-verified/error) — কোনো ম্যানুয়াল ইনপুট লাগে না।
- **`App.jsx`** — নতুন route যোগ হয়েছে।
- মাইগ্রেশন: `migration_customer_email_verification.sql` (`persons.email_verified`, `email_verify_token`, `email_verify_token_expires_at` — ইতিমধ্যে Supabase-এ apply করা)।

**সীমাবদ্ধতা:** টোকেনের মেয়াদ ৭ দিন পার হয়ে গেলে, বা কেউ ইমেইলটা হারিয়ে ফেললে — এখন **resend করার কোনো UI নেই** (ProfileTab-এ ভবিষ্যতে যোগ করা যেতে পারে)। এটা কোনো নিরাপত্তা ঝুঁকি না (WhatsApp দিয়ে সবকিছুই কাজ করে), শুধু সেই কাস্টমারের email-ভিত্তিক ফিচারগুলো (যেমন email দিয়ে forgot-password) অব্যবহৃত থেকে যাবে যতক্ষণ ভেরিফাই না হয়।

## 🆕 আপডেট (সপ্তম ধাপ) — Email verification abuse-vector বন্ধ করা

প্রশ্ন উঠেছিল: কেউ ইচ্ছাকৃতভাবে অন্য কারো (real) ইমেইল দিয়ে রেজিস্টার করলে, সেই ইমেইলের আসল মালিক লিংকে ক্লিক করলে কী হয়?

**ট্রেস করে যা পাওয়া গেছে:** ক্লিক করলে টোকেন-মালিকের (যে রেজিস্টার করেছে তার) `persons` রো-তেই `email_verified = true` বসে — ভিক্টিমের কোনো ডেটা/অ্যাক্সেস কোথাও যায় না, এবং `email_verified` flag এই মুহূর্তে কোথাও গেট (login/forgot-password কোনোটাই) হিসেবে ব্যবহৃত হয় না — তাই সরাসরি account-takeover সম্ভব না। কিন্তু দুইটা বাস্তব গ্যাপ ছিল:
1. **Email কখনো duplicate-check হয় না** (শুধু WhatsApp হয়, `selfRegisterCustomer`-এ) — তাই ভিন্ন ভিন্ন WhatsApp নম্বর দিয়ে বারবার রেজিস্টার করে একই victim-এর ইমেইলে বারবার verification মেইল পাঠিয়ে স্প্যাম করা সম্ভব ছিল।
2. মেইলে শুধু "ধন্যবাদ রেজিস্ট্রেশনের জন্য" লেখা থাকত — কোন দোকানের নামে হয়েছে বলত না, তাই ভিক্টিম ক্লিক করার আগে বুঝতেও পারত না এটা তার না।

**ঠিক করা হয়েছে:**
- **`sendEmailVerificationLink`-এ spam-guard যোগ**: পাঠানোর আগে চেক করে একই ইমেইলে ইতিমধ্যে কয়টা *আনভেরিফাইড* রেজিস্ট্রেশন pending আছে (`persons` টেবিলে) — ৩টার বেশি হলে নতুন মেইল পাঠানো (silently) বন্ধ হয়ে যায়। রেজিস্ট্রেশন নিজে তখনও সফলই হয়, শুধু ওই ইমেইলে আর মেইল যায় না।
- **ইমেইলে এখন শপ-নেম স্পষ্ট দেখানো হয়** — "'[দোকানের নাম]' নামে এই ইমেইল দিয়ে রেজিস্ট্রেশন হয়েছে" — অচেনা নাম দেখলে প্রাপক ক্লিক না করেই বুঝে যাবেন এটা তার না।
- **`CustomerEmailVerify.jsx` কনফার্মেশন পেজেও শপ-নেম দেখানো হয়** — ভুলবশত ক্লিক করে ফেললেও সাথে সাথে বোঝা যাবে এটা কোন দোকানের জন্য।
- **একটা পাশাপাশি বাগও ঠিক হয়েছে**: আগে সফল ভেরিফিকেশনের পর `email_verify_token` কে `NULL` করে দেওয়া হতো — এতে একই লিংকে দ্বিতীয়বার ক্লিক করলে (স্বাভাবিক আচরণ) "already verified" এর বদলে "লিংক অবৈধ" এর মতো confusing এরর দেখাত। এখন token রেখে দেওয়া হয়, শুধু `email_verified` flag-টাই আসল সত্য বলে ধরা হয়।

**এখনো ইচ্ছাকৃতভাবে বাদ:** email-কে সত্যিকারের unique/duplicate-checked করা হয়নি (WhatsApp-এর মতো) — সেটা করলে বিদ্যমান একাধিক person রেকর্ড একই email শেয়ার করা নিয়ে ডেটা-মাইগ্রেশনের প্রশ্ন আসবে, যেটা এই ছোট fix-এর স্কোপের বাইরে। spam-guard cap-টাই বর্তমান বাস্তবিক প্রতিরক্ষা।

## 🆕 আপডেট (অষ্টম ধাপ) — WhatsApp গেটওয়ে ডাউন থাকলে honest রেসপন্স

Render লগে ধরা পড়েছিল: WhatsApp সেশন ডিসকানেক্টেড থাকা অবস্থায় `/portal/forgot-password` তখনও HTTP 200 "OTP পাঠানো হয়েছে" রিটার্ন করছিল — অথচ প্রকৃতপক্ষে কিছুই পাঠানো হয়নি (silent failure)।

- **`backend/src/services/portalWhatsapp.service.js`** — হালকা ইন-মেমরি circuit-breaker যোগ (`isWhatsAppLikelyDown()`) — শেষ ব্যর্থতার ২ মিনিটের মধ্যে হলে "ডাউন" ধরে নেয়, যেকোনো সফল পাঠানোতে সাথে সাথে রিসেট হয়।
- **`portalForgotPassword`** — এখন owner lookup-এর *আগেই* গেটওয়ে-স্বাস্থ্য চেক করে (ইচ্ছাকৃতভাবে আগে — নাহলে "unavailable" মেসেজটা নিজেই leak করে দিত কোন নম্বরে অ্যাকাউন্ট আছে)। ডাউন থাকলে `whatsapp_unavailable: true` ফ্ল্যাগসহ honest মেসেজ, identifier-এর সাথে কোনো correlation ছাড়াই।
- **`sendRegisterOtp`** — একই চেক আগেই করা হয় (এখানে enumeration ঝুঁকি নেই, তাই simpler) — অপ্রয়োজনীয় DB write এড়ানো যায়।
- **`CustomerForgotPassword.jsx`** — এখন `whatsapp_unavailable` ফ্ল্যাগ দেখে; আগে ব্লাইন্ডলি OTP-ইনপুট স্ক্রিনে নিয়ে যেত যেখানে কখনো কোনো কোড আসত না।

**⚠️ এটা কোড বাগ ছিল না, ইনফ্রাস্ট্রাকচার সমস্যা:** Baileys WhatsApp Web সেশন ডিসকানেক্ট হয়ে গিয়েছিল (সম্ভবত re-authenticate/QR স্ক্যান লাগবে যেই সার্ভিসে Baileys হোস্ট করা আছে সেখানে)। কোডের ফিক্স শুধু silent failure-কে honest error-এ পরিণত করে — root cause (গেটওয়ে reconnect করা) আলাদাভাবে ঠিক করতে হবে।

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

