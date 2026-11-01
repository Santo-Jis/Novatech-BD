# বাকি আদায় → ইনভয়েসে বরাদ্দ (payment allocation)

আদায় (`collections` এবং `credit_payments`) এখন FIFO নিয়মে নির্দিষ্ট ইনভয়েসে বসে।
ইনভয়েসের বাকি = `credit_used − SUM(payment_allocations.amount)` — stored কলাম নয়, সবসময় computed।
`customers.current_credit` কমানো আগের মতোই; `credit_payments`-এর DB ট্রিগার ছোঁয়া হয়নি।

## Deploy-এর ক্রম (এই ক্রমটা জরুরি)

1. **`migration_payment_allocations.sql` রান করুন** (Supabase SQL editor)। কোড টেবিল ধরে নিয়ে query করে,
   তাই কোডের আগে এটা। শুধু টেবিল + ফাংশন তৈরি হয়, কোনো ডেটা বদলায় না।
2. **backend + frontend deploy করুন।**
3. **ব্যাকফিল (ঐচ্ছিক, পুরনো আদায় ইনভয়েসে বসাতে)** — আগে dry-run:
   ```sql
   SELECT * FROM backfill_payment_allocations('<tenant-uuid>', true);   -- কিছু লেখে না
   SELECT * FROM backfill_payment_allocations('<tenant-uuid>', false);  -- আসলে লেখে
   ```
   বারবার চালানো নিরাপদ (বরাদ্দ হয়ে যাওয়া আদায় বাদ যায়)।
   migration ফাইলের নিচের মন্তব্যে reconciliation query আছে (`current_credit` বনাম ইনভয়েস-ভিত্তিক বাকি)।
   না মিললে বুঝবেন ইনভয়েস-বহির্ভূত পুরনো বাকি (opening balance) আছে — এটা তদন্তের সংকেত।

**ব্যাকফিল না চালালে:** আজ থেকে নতুন আদায়গুলো পুরনো ইনভয়েসে বসতে শুরু করবে, কিন্তু আগের আদায় না থাকায়
পুরনো ইনভয়েসগুলো "বাকি" দেখাবে যতক্ষণ না নতুন আদায় সেগুলোতে পৌঁছায়। তাই ব্যাকফিল চালানোই ভালো।

## আচরণ

- **FIFO:** সবচেয়ে পুরনো বাকি ইনভয়েস আগে শোধ। আদায় ইনভয়েসের চেয়ে বড় হলে পরেরটায় গড়ায়।
- **ইনভয়েসের চেয়ে বেশি আদায়:** বাড়তি অংশ কোনো ইনভয়েসে বসে না (opening-balance বাকি হতে পারে) — এটা এরর নয়।
- **`collections` পথে** বরাদ্দ হয় অ্যাডমিন **verify** করার মুহূর্তে (যখন `current_credit` কমে), `collectCredit` পথে ইনসার্টের সময়।
- **Best-effort:** বরাদ্দ ব্যর্থ হলে (যেমন migration বাকি) মূল আদায় আটকায় না — SAVEPOINT দিয়ে সুরক্ষিত, লগে
  `paymentAllocation → ইনভয়েসে বরাদ্দ ব্যর্থ` দেখা যাবে। পরে ব্যাকফিল ফাংশন মিটিয়ে দেবে।
- **Idempotent:** একই আদায় দুইবার বরাদ্দ হয় না (unique index + আগাম চেক)।
- **Concurrency:** বরাদ্দের সময় কাস্টমারের row `FOR UPDATE` লক হয়।

## যা বদলেছে

| ফাইল | পরিবর্তন |
|---|---|
| `migration_payment_allocations.sql` | নতুন টেবিল, ইনডেক্স, ব্যাকফিল ফাংশন |
| `backend/src/services/paymentAllocation.service.js` | নতুন — FIFO লজিক |
| `controllers/collection.controller.js` | verify-এ বরাদ্দ; `createCollection`-এর ভাঙা INSERT ঠিক |
| `controllers/customer.controller.js` | `collectCredit`-এ বরাদ্দ; credit-alert তালিকায় `paid_amount` / `remaining_amount` / `payment_status` |
| `controllers/customerPortal.controller.js` | ইনভয়েস তালিকায় স্ট্যাটাস; পেমেন্ট হিস্টোরি ও সামারিতে verified `collections` যোগ |
| `controllers/creditApproval.controller.js` | ভাঙা `NOW(,` ×২ এবং `requestApproval`-এর প্যারামিটার-সংখ্যা মিসম্যাচ ×২ ঠিক |
| `controllers/adminDevice.controller.js` | `audit_logs` INSERT ×২-এ `tenant_id` প্যারামিটার যোগ (আগে `.catch(() => {})`-এ এরর চাপা পড়ায় ডিভাইস-revoke অডিট লগ কখনো লেখা হতো না) |
| `services/planBooking.service.js` | `plan_booking_requests` INSERT-এ ২৬তম `$26` যোগ (২৬ কলাম, ২৫ placeholder ছিল — প্ল্যান বুকিং সবসময় ফেল করত) |
| `frontend/.../Badges.jsx`, `InvoiceCard.jsx` | পোর্টালে আদায়-স্ট্যাটাস badge ও লাইন |
| `frontend/.../SalesForm.jsx` | SR-এর বাকির তালিকায় paid/partial/বাকি |
| `tests/paymentAllocation.service.test.js` | নতুন (১৭টি) |
| `tests/customer.controller.test.js` | `collectCredit` টেস্টের মক নতুন INSERT ... RETURNING id অনুযায়ী |

## পরীক্ষা

- Unit: নতুন ১৭টা পাস; বিদ্যমান ১২টা ফেল আগের মতোই (এই কাজের সাথে সম্পর্কহীন), কোনো রিগ্রেশন নেই।
- আসল PostgreSQL 16-এ আসল কন্ট্রোলার দিয়ে ১০টা পরিস্থিতি পাস (verify, collectCredit + retry, SR-তালিকা,
  পোর্টাল ইনভয়েস ও পেমেন্ট হিস্টোরি, ৪টা parallel আদায়, টেবিল না থাকলেও আদায় সফল, creditApproval)।
  **সীমা:** `credit_payments`-এর আসল ট্রিগার repo-তে নেই, তাই পরীক্ষায় একটা সরল সমতুল্য ট্রিগার ব্যবহার করেছি।
  Supabase-এ আসল ডেটা, আসল স্কিমা ও আসল ট্রিগারে একবার smoke-test করে নেবেন।

## বাড়তি বাগ-ফিক্স যাচাই

backend-এর সব `query(...)` কল AST দিয়ে স্ক্যান করা হয়েছে (SQL-এর `$N` সংখ্যা বনাম params array): আসল জিপে ৫টা মিসম্যাচ ছিল,
এখন ০টা। (`planBooking` ও `adminDevice` ঠিকটা আসল DB-তে চালিয়ে দেখা হয়নি — সংখ্যা মিলিয়ে ও সিনট্যাক্স চেক করা হয়েছে।)

## এখনো যা করা হয়নি

- SR হাতে নির্দিষ্ট ইনভয়েস বেছে আদায় দিতে পারে না (শুধু FIFO)।
- পোর্টালের `getCreditOverview` ও মাসিক সামারি এখনো শুধু `credit_payments` ধরে — `collections`-এর টাকা সেখানে বাদ।
- ইনভয়েস PDF/WhatsApp বিক্রির সময়ের তথ্যই দেখায়, পরে আদায় হলে বদলায় না।
