# চ্যাট রিডিজাইন — Phase 1 (ফাউন্ডেশন), Session 1

**Agent:** chat-messaging-agent | **তারিখ:** 2026-08-17 | **স্ট্যাটাস:** কোড ডেলিভারড, মার্জ+ডিপ্লয় পেন্ডিং

এই সেশনে কী হয়েছে, কেন, আর মার্জ করার আগে কী জানা দরকার — সব একজায়গায়।

---

## ⚠️ শুরুতেই — একটা জিনিস আপনার সিদ্ধান্তের অপেক্ষায় (Supabase RLS)

কাজ শুরুর আগে (কনভেনশন অনুযায়ী `agent_communication_log` পড়ে) স্কিমা চেক করতে গিয়ে দেখা গেছে: **১৮টা টেবিলে এখনো RLS বন্ধ** — এর মধ্যে `chat_threads`, `baileys_auth_state` (WhatsApp সেশন), `whatsapp_verification_otps`, `customer_portal_login_events` সহ আরও কিছু। ২২ জুলাই আর ৩০ জুলাই দুইবার sweep হয়েছিল (৬০ + ৩ টেবিল), কিন্তু নতুন টেবিল তৈরি হলে RLS ডিফল্টে অন হয় না, তাই ফাঁক আবার তৈরি হয়েছে।

এর মানে: `anon` key দিয়ে (যেটা ফ্রন্টএন্ড বান্ডলে থাকে, কার্যত পাবলিক) সরাসরি Supabase-এর REST API দিয়ে এই টেবিলগুলো পড়া/লেখা সম্ভব — Node ব্যাকএন্ডের কোনো অথ-চেক বাইপাস করে।

**আমি এটা ফিক্স করিনি** — Supabase টুল স্পষ্ট করে বলেছে RLS zero-policy দিয়ে চালু করলে সেই টেবিলগুলোর সব অ্যাক্সেস বন্ধ হয়ে যেতে পারে (যদি কোথাও `anon` key দিয়ে বৈধ অ্যাক্সেস থাকে), তাই এটা আপনার সিদ্ধান্ত। ২২ জুলাইয়ের এজেন্ট যেভাবে ভেরিফাই করেছিল সেটাই এখনো সত্যি হওয়া উচিত (ব্যাকএন্ড `postgres` role দিয়ে কানেক্ট করে, যেটা RLS বাইপাস করে; ফ্রন্টএন্ড কোথাও `@supabase/supabase-js` সরাসরি ব্যবহার করে না) — কিন্তু আমি নিজে পুরো কোডবেস আবার স্ক্যান করে এটা re-verify করিনি এই সেশনে। রান করার আগে অন্তত `chat_threads`-এর জন্য quick grep করে নিশ্চিত হয়ে নিন।

```sql
ALTER TABLE public.daily_kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baileys_auth_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_return_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_password_reset_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_verification_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_support_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_login_events ENABLE ROW LEVEL SECURITY;
```

---

## ✅ যা যাচাই করে বাদ দিয়েছি (কাজ শুরুর আগে)

- **"Multi-company aggregation দরকার কিনা"** — সন্দেহ ছিল, চেক করে দেখা গেল `customerPortalChat.controller.js`/`migration_chat_threads.sql` আগে থেকেই `person_id` + `customer_company_connections` দিয়ে সঠিকভাবে বানানো (AI Chat-এর মতো রেট্রোফিট লাগেনি)। ফ্রন্টএন্ডও ইতিমধ্যেই `/portal/chat/all-threads` (aggregate) ব্যবহার করছিল। **কোনো ব্যাকএন্ড পরিবর্তন লাগেনি এখানে।**
- **Cloudinary vs Supabase Storage** — আগের এন্ট্রি থেকে শিখে, Session 2-এর ছবি-অ্যাটাচ ফিচারে বিদ্যমান `imageUpload.utils.js` (Cloudinary) ব্যবহার হবে, নতুন storage বানানো হবে না।

---

## এই সেশনে যা বানানো হয়েছে (নতুন)

```
frontend/src/chat/                          ← নতুন শেয়ার্ড মডিউল
├── firebaseApp.js                          — Firebase app singleton (আগে ২ জায়গায় ডুপ্লিকেট ছিল)
├── api/chatApi.js                          — staff (axios) vs customer (portalFetch) normalize করে
├── services/offlineQueue.js                — অফলাইন সেন্ড-কিউ (localStorage, pending/sending/failed)
├── utils/time.js                           — timeAgo/clockTime (আগে ২ জায়গায় ডুপ্লিকেট ছিল)
├── hooks/useChatIdentity.js                — Firebase custom-token সাইন-ইন
├── hooks/usePresence.js                    — অনলাইন-স্ট্যাটাস + থ্রেড-প্রেজেন্স
├── hooks/useChatEngine.js                  — মূল ইঞ্জিন: মেসেজ+টাইপিং+রিড-রিসিট+অফলাইন-কিউ
└── components/
    ├── MessageBubble.jsx                   — বাবল + রিড-টিক + pending/failed স্টেট
    ├── TypingDots.jsx                      — (CustomerAIChat.jsx-এর প্যাটার্ন থেকে সাধারণীকৃত)
    ├── Composer.jsx
    ├── ThreadHeader.jsx                    — অ্যাভাটার + প্রেজেন্স ডট + "টাইপ করছে..."
    └── ConversationPane.jsx                — উপরের সব ওয়্যার করা, staff+customer দুই পাশেই ব্যবহৃত
```

## যা বদলানো হয়েছে (রিপ্লেসড, `.orig` পাশে রাখা আছে)

- `frontend/src/pages/customer/hooks/useChat.js` — এখন শুধু per-company থ্রেড-লিস্ট + ensureThreads
- `frontend/src/pages/customer/components/MessagesTab.jsx` — কথোপকথন অংশ এখন `ConversationPane`
- `frontend/src/pages/shared/ChatInbox.jsx` — একই, প্লাস ভিজ্যুয়াল ভাষা flat primary/gray → cp-trust/cp-warmth

**কোনো ব্যাকএন্ড ফাইল বা DB মাইগ্রেশন এই সেশনে বদলায়নি** — যা কিছু নতুন (presence/typing/read-receipt) সবই বিদ্যমান RTDB প্যাটার্নের উপর ক্লায়েন্ট-সাইড থেকে যোগ হয়েছে।

## নতুন কী পাচ্ছেন

- **একই ভিজ্যুয়াল ভাষা** — staff আর customer চ্যাট এখন একই cp-trust/cp-warmth সিস্টেম শেয়ার করে (আগে ৩টা আলাদা ছিল, AI চ্যাট বাদে বাকি দুইটা এখন এক)
- **টাইপিং ইন্ডিকেটর**, **অনলাইন স্ট্যাটাস** (হেডারে সবুজ ডট), **রিড-রিসিট** (sent/seen টিক) — আগে কিছুই ছিল না
- **অফলাইন-সহনশীল পাঠানো** — নেট না থাকলেও মেসেজ কিউ-তে যায়, ফিরলে অটো-রিট্রাই, ব্যর্থ হলে ম্যানুয়াল রিট্রাই/ডিসকার্ড বাটন
- ChatBell.jsx-এর ৬০-সেকেন্ড পোলিং এখনো স্পর্শ করা হয়নি — Session 2-এ, ওটাকেও RTDB-লাইভ করা দরকার

## Open items (Session 2+)

1. ছবি-অ্যাটাচ (Cloudinary) + ভয়েস নোট
2. ChatBell পোলিং → RTDB সরাসরি
3. cp- টোকেনে ডার্ক-মোড ভ্যারিয়েন্ট নেই — staff চ্যাট এখন dark: সাপোর্ট করে না (আগে করত)
4. অফলাইন-ফ্লাশ শুধু "বর্তমানে খোলা" থ্রেডের জন্য সক্রিয় — অন্য থ্রেডের পেন্ডিং মেসেজ সেই থ্রেড পরের বার খোলা হলে ফ্লাশ হবে
5. ইনবক্স-লিস্ট রো-তে প্রেজেন্স ডট নেই (শুধু খোলা কনভারসেশনে) — স্কেল বিবেচনায় ইচ্ছাকৃতভাবে বাদ

## RTDB Security Rules — ম্যানুয়ালি যোগ করতে হবে

আমার কাছে Firebase Console/CLI অ্যাক্সেস নেই (শুধু Supabase/Render/Vercel MCP কানেক্টেড), তাই বিদ্যমান rules.json দেখতে পারিনি। নিচের প্যাটার্নটা `chatFirebase.service.js`-এর `participants` গেট থেকে অনুমান করে বানানো — আপনার বিদ্যমান rules-এর সাথে মার্জ করুন, ওভাররাইট না করে:

```json
{
  "rules": {
    "chats": {
      "$threadId": {
        "typing": {
          "$uid": { ".write": "$uid === auth.uid" }
        },
        "reads": {
          "$uid": { ".write": "$uid === auth.uid" }
        }
      }
    },
    "presence": {
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

`chats/$threadId/meta` ইতিমধ্যেই client-write-প্রুফ থাকার কথা (Admin SDK দিয়ে লেখা) — সেটা স্পর্শ করিনি।

## মার্জ করবেন কীভাবে

যথারীতি Termux-এ: নতুন ফাইলগুলো ঠিক এই zip-এর ফোল্ডার-স্ট্রাকচার অনুযায়ী কপি করুন, `.orig` ফাইলগুলো ইচ্ছেমতো রাখুন/মুছুন, তারপর `git add -A && git commit && git push`। ব্যাকএন্ড অপরিবর্তিত থাকায় Render-এ রিডিপ্লয় লাগবে না — শুধু Vercel ফ্রন্টএন্ড রিবিল্ড হলেই চলবে।

RTDB rules বাদে বাকি সবকিছু merge+push+deploy করলেই লাইভ কাজ করা উচিত। মার্জের পর রানটাইম-ভেরিফাই আগের সেশনগুলোর মতোই করে নেবেন।
