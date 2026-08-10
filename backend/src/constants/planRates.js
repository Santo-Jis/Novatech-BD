// ============================================================
// PLAN RATES — backend fallback, ৬ আগস্ট ২০২৬
// ------------------------------------------------------------
// ⚠️⚠️ এই ফাইলটা frontend/src/constants/planPricing.js-এর একটা
// আংশিক ডুপ্লিকেট। এটা ইচ্ছাকৃতভাবে এড়াতে চেয়েছিলাম (দেখো
// billing.service.js-এর হেডার কমেন্ট), কিন্তু jobs/tenantInvoice.job.js-এ
// admin/owner সিট আর rate_locked=NULL সিট বাদ পড়ে যাচ্ছিল বলে এখন
// দরকার হলো — ব্যাকএন্ডের constants/planPricing.js (ফ্রন্টএন্ড-অনলি
// ES module) অ্যাক্সেস নেই।
//
// শুধু fallback হিসেবে ব্যবহৃত হয় — যেখানে tenant_seats.rate_locked
// থাকে (বেশিরভাগ ক্ষেত্রে), সেটাই আসল/প্রেফারড সোর্স, এই ফাইল না।
//
// 🔴 planPricing.js-এ দাম বদলালে এখানেও ম্যানুয়ালি বদলাতে হবে —
// এটা automatic sync হয় না। দুই ফাইল এক রাখতে দায়িত্ব নিয়ে মনে
// রাখতে হবে (বা ভবিষ্যতে দুই দিক থেকেই import করা যায় এমন কোনো
// shared/ ফোল্ডারে সরানো, যেটা এখন করা হয়নি — বিল্ড-পাইপলাইন না
// দেখে সেটা ঝুঁকিপূর্ণ মনে হয়েছে)।
//
// সোর্স মিলিয়ে দেখা তারিখ: ৬ আগস্ট ২০২৬, frontend/src/constants/planPricing.js
// ============================================================

// tenant_seats.role ↔ planPricing.js-এর roles[].key — Billing.jsx-এর
// SEAT_ROLE_TO_PRICING_KEY-র সাথে হুবহু মিলিয়ে রাখা হয়েছে।
// ⚠️ admin এখন এখানে আছে — আগে ভুল ধরে নিয়েছিলাম tenant_seats-এ
// admin-এর row নেই, আসলে onboarding.controller.js ট্রায়াল সাইনআপেই
// বসিয়ে দেয় (rate_locked=৳১৬৯৯ ফিক্সড, upgrade-এ কখনো রিফ্রেশ হয় না
// — upsertSeats()-এর BOOKABLE_ROLES-এ admin নেই)।
const SEAT_ROLE_TO_PRICING_KEY = {
  worker:       'sr',
  manager:      'manager',
  shop_keeper:  'shop',
  stock_keeper: 'stock',
  admin:        'admin',
};

// শুধু role→price (৳/মাস) — planPricing.js-এর বাকি ফিল্ড (label,
// tagline, maxCustomers...) এই ফাইলে দরকার নেই।
const PLAN_ROLE_RATES = {
  standard: { sr: 299, manager: 599, stock: 299, shop: 299, admin: 999 },
  pro:      { sr: 499, manager: 799, stock: 449, shop: 449, admin: 1299 },
  max:      { sr: 699, manager: 999, stock: 599, shop: 599, admin: 1699, asm: 899 },
  erp:      { sr: 899, manager: 1299, stock: 699, shop: 699, admin: 1999, asm: 999, owner: 0 },
};

// rate_locked NULL হলে এইটা fallback হিসেবে দেয় (এখন admin-সহ, স্বাভাবিক
// role হিসেবে)। plan অচেনা হলে (trial placeholder 'basic', পুরনো legacy
// 'enterprise' ইত্যাদি) null — invoice job সেই role বাদ দেবে, ভুল রেট বসাবে না।
const getFallbackRate = (plan, seatRole) => {
  const pricingKey = SEAT_ROLE_TO_PRICING_KEY[seatRole];
  return PLAN_ROLE_RATES[plan]?.[pricingKey] ?? null;
};

module.exports = { SEAT_ROLE_TO_PRICING_KEY, PLAN_ROLE_RATES, getFallbackRate };
