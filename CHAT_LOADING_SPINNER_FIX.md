# ফিক্স: চ্যাটে অনন্ত-লোডিং স্পিনার + পাঠানো মেসেজ না দেখানো

## সমস্যা যা রিপোর্ট হয়েছিল
- মেসেজ এরিয়ার উপরে লোডিং স্পিনার ঘুরতেই থাকে, কখনো থামে না
- মেসেজ পাঠালে (কম্পোজার বক্স খালি হয়ে যায়) কিন্তু সেটা চ্যাট উইন্ডোতে দেখা যায় না

## Root cause (২টা bug, একসাথে মিলে এই symptom তৈরি করেছে)

**১. `useChatEngine.js`** — RTDB-র `onValue()` কলগুলোতে কোনো error/cancel
callback ছিল না। থ্রেড খোলার সময় `messagesLoading = true` সেট হয়, RTDB read
সফল হলে `false` হওয়ার কথা। কিন্তু read ব্যর্থ হলে (permission-denied, ভুল
সংযোগ, নেটওয়ার্ক) — success callback আর কখনো ডাকা হয় না, তাই
`messagesLoading` চিরকাল `true` থেকে যায়। কোনো error visible হয় না বলে
ডিবাগ করাও কঠিন ছিল।

**২. `ConversationPane.jsx`** — মেসেজ-লিস্ট রেন্ডার হতো
`messagesLoading ? স্পিনার : মেসেজ` — অর্থাৎ `messagesLoading` স্টাক হয়ে
গেলে গোটা মেসেজ-এরিয়াই স্পিনারের পেছনে আটকে থাকত, এমনকি অফলাইন-কিউতে
সফলভাবে জমা-হওয়া (আপনার সদ্য-পাঠানো) মেসেজও দেখানো হতো না।

## যা বদলানো হয়েছে

- `useChatEngine.js`: প্রতিটা `onValue()`-এ error callback যোগ, যা ব্যর্থ
  হলে `messagesLoading` কে `false` করে আর একটা নতুন `messagesError` স্টেট
  সেট করে।
- `useChatEngine.js`: `send()` এখন `true`/`false` রিটার্ন করে (আগে কিছুই
  রিটার্ন করত না), যাতে caller বুঝতে পারে মেসেজ সত্যিই কিউ হয়েছে কিনা।
- `ConversationPane.jsx`: শর্ত এখন `messages.length === 0 && messagesLoading`
  — অর্থাৎ ইতিমধ্যে কোনো মেসেজ (RTDB বা pending) থাকলে সেটা সবসময় দেখানো
  হবে, `messagesLoading` যা-ই হোক না কেন। `messagesError` থাকলে বন্ধুত্বপূর্ণ
  বাংলা এরর টেক্সট দেখায় (স্পিনারের বদলে), আর মেসেজ থাকা অবস্থায় error হলে
  উপরে একটা ছোট সতর্কবার্তা দেখায়।
- `ConversationPane.jsx`: `handleSend()` এখন `send()`-এর রেজাল্ট চেক করে
  তবেই কম্পোজার বক্স খালি করে — ব্যর্থ পাঠানোতে বক্স খালি হয়ে বিভ্রান্তি
  তৈরি করবে না।

## আপনার এখনো যা চেক করা দরকার (কোড দিয়ে ফিক্স করা যায়নি)

`CHAT_PHASE1_README.md`-তে আগেই উল্লেখ ছিল যে RTDB security rules ম্যানুয়ালি
আপডেট করা হয়নি। এই ফিক্সের পর যদি স্পিনারের বদলে "মেসেজ লোড করা যায়নি" এরর
দেখায়, সেটাই কনফার্ম করবে যে RTDB read আসলেই ব্যর্থ হচ্ছে — তখন Firebase
Console → Realtime Database → Rules-এ গিয়ে `chats/$threadId/messages`
পাথে authenticated ইউজারদের জন্য `.read`/`.write` আছে কিনা যাচাই করুন।

## মার্জ করবেন কীভাবে

এই zip-এর ফোল্ডার-স্ট্রাকচার অনুযায়ী দুইটা ফাইল আপনার রিপোতে কপি করুন
(দুটোই বিদ্যমান ফাইল ওভাররাইট করবে):

```
frontend/src/chat/hooks/useChatEngine.js
frontend/src/chat/components/ConversationPane.jsx
```

তারপর:
```
git add -A
git commit -m "fix: chat messagesLoading stuck spinner + sent message not rendering"
git push
```

Vercel অটো-ডিপ্লয় ট্রিগার হবে।
