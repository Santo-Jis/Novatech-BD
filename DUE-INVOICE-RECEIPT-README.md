# বাকি-সংক্রান্ত ৩টা সমস্যার সমাধান

## সমস্যা ও সমাধান

| # | সমস্যা | এখন যা হয় |
|---|---|---|
| ১ | বাকি ৫০০০; ১০০০ টাকার পণ্য নিয়ে ১৫০০ দিল — বাড়তি ৫০০ বাকি থেকে কাটা হতো না | SR বিক্রির স্ক্রিনে "মোট কত নগদ পেলেন" লেখে (`cash_given`)। সার্ভার (বিল ১০০০) বাড়তি ৫০০ বের করে → `collections` এন্ট্রি + `current_credit` −৫০০ + ইনভয়েসে FIFO বরাদ্দ। নতুন বাকি ৪৫০০ |
| ২ | বাকি ৫০০০ থাকা অবস্থায় ২০০০ নগদে কিনলে ইনভয়েসে আগের বাকির উল্লেখ থাকত না | প্রতিটা ইনভয়েসে (PDF, WhatsApp, Email, SR অ্যাপের কার্ড) "বাকির হিসাব": আগের বাকি, এই ইনভয়েসের বাকি, আজকের বাকি-আদায়, **এখনকার মোট বাকি** |
| ৩ | পণ্য না নিয়ে ২০০০ দিলে কাস্টমারের কাছে কিছু যেত না | আদায় রেকর্ড হলেই **মানি রিসিপ্ট (PDF)** যায়: WhatsApp-এ, না গেলে ইমেইলে। রসিদে নং, তারিখ, আদায়কারী, টাকা, আগের বাকি, এখনকার বাকি, কোন ইনভয়েস শোধ হলো |

## Deploy-এর ক্রম
1. **`migration_invoice_due_snapshot.sql` রান করুন** (Supabase SQL editor) — শুধু ৩টা কলাম যোগ, ডেটা বদলায় না।
2. backend + frontend deploy।

migration না চালালেও বিক্রি/আদায় আটকায় না (SAVEPOINT) — শুধু ইনভয়েসে বাকির অংশ আসবে না, লগে warning থাকবে।
পুরনো ইনভয়েসে বাকির অংশ দেখানো হয় না (অঙ্ক বানানো হয় না)।

## যা বদলেছে
- `migration_invoice_due_snapshot.sql` (নতুন) — `previous_due`, `due_payment`, `closing_due`
- `backend/src/services/invoiceDue.util.js` (নতুন) — বাকির সারি বানানোর একমাত্র জায়গা
- `backend/src/services/collectionReceipt.service.js` (নতুন) — রসিদ PDF + WhatsApp + ইমেইল fallback
- `controllers/sales.controller.js` — `cash_given` / `due_payment`, customer row সব পদ্ধতিতে lock, স্ন্যাপশট, রেসপন্সে `previous_due/due_payment/closing_due`
- `controllers/customer.controller.js` (`collectCredit`), `controllers/collection.controller.js` (`createCollection`) — রসিদ পাঠানো, রেসপন্সে `receipt_no`
- `services/invoice.service.js`, `services/email.service.js` — ইনভয়েসে বাকির হিসাব
- `frontend/.../SalesForm.jsx` — "বিলের বেশি দিলে মোট কত নগদ পেলেন" ঘর (অনলাইন ও অফলাইন কিউ দুই পথেই)
- `frontend/.../components/InvoiceCard.jsx` — বাকির হিসাব
- `tests/dueAndReceipt.test.js` (নতুন, ২২টা)

## নিয়মগুলো
- বাড়তি নগদ শুধু **নগদ** পদ্ধতিতে। কাস্টমারের মোট বাকির চেয়ে বেশি হলে 400।
- বিলের চেয়ে কম নগদ লিখলে 400 ("আংশিক" পদ্ধতি নিতে বলে)।
- বিক্রির `cash_received` বদলায় না — বাড়তি অংশ আলাদা `collections` এন্ট্রি, তাই settlement ও commission আগের নিয়মেই চলে।
- বিক্রি ব্যর্থ হলে বাকি-কাটাও rollback (একই transaction)।

## পরীক্ষা
- নতুন ২২টা পাস। পুরো unit suite: ৭৫৬ পাস, ৯ ফেল — **এই ৯টা আসল জিপেও একই ভাবে ফেল করে** (`createCustomer`, `selfOrAdmin` ইত্যাদি), কোনো রিগ্রেশন নেই।
- **সীমা:** আসল PostgreSQL-এ চালানো হয়নি (sandbox-এ DB নেই); `trg_sale_credit` ট্রিগারের আসল আচরণ মক করা। Supabase-এ একটা টেস্ট কাস্টমারে (বাকি ৫০০০, বিল ১০০০, নগদ ১৫০০) smoke-test করে নিন। ফ্রন্টএন্ড শুধু সিনট্যাক্স-যাচাই হয়েছে, ব্রাউজারে চালানো হয়নি।

## পরের ধাপে যোগ হয়েছে (patch ২)
- **কাস্টমার পোর্টালের ইনভয়েস কার্ড** ও **SR-এর SalesHistory ডিটেইল**-এ "বাকির হিসাব" সারি।
- **রসিদ আবার পাঠান:** কাস্টমারের হিস্ট্রির "পেমেন্ট" ট্যাবে প্রতিটা আদায়ের নিচে বাটন।
  `POST /api/collections/:source/:id/resend-receipt` (`source` = `collection` | `credit_payment`);
  worker (টিমের কাস্টমার), manager (নিজের রুট), admin/accountant। একই আদায়ে ৩০ সেকেন্ডে একবার।
  রসিদ নম্বর একই থাকে। রসিদে **আদায়ের সময়ের** বাকি দেখায় — এর জন্য নতুন migration
  `migration_receipt_snapshot.sql` (`collections` ও `credit_payments`-এ `due_before`, `due_after`)।
  যেসব আদায় migration-এর আগে হয়েছে, তাদের রসিদে "বর্তমান বাকি" দেখায় (আগের/পরের অঙ্ক বানানো হয় না)।
- নতুন টেস্ট: `tests/receiptResend.test.js` (১৫টা)।

## এখনো যা করা হয়নি
- ম্যানেজার/অ্যাডমিন প্যানেলে রসিদ resend বাটন নেই (API ম্যানেজার/অ্যাডমিনের জন্য প্রস্তুত, শুধু UI যোগ হয়নি)।
- অফলাইনে নেওয়া বিক্রিতে `cash_given` সিঙ্কের সময় যাচাই হয়; বাকি ইতোমধ্যে কমে গেলে ওই বিক্রি 400 পাবে।
