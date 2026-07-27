// ============================================================
// ৪টা পেইড প্ল্যানের পার-রোল প্রাইসিং — Pricing.jsx পেইজে ব্যবহৃত হয়।
// ⚠️ এই রেট গুলো ফ্রি ট্রায়াল ক্যালকুলেটরে ব্যবহৃত constants/pricing.js
//    (SEAT_RATES) থেকে আলাদা — ওটা ট্রায়াল-সাইনআপ সিট ক্যালকুলেটরের জন্য,
//    এটা মূল পাবলিক প্রাইসিং পেইজের ৪-টায়ার তুলনার জন্য।
// সোর্স: NovaTechBD Pricing Policy খসড়া, ২৭ জুলাই ২০২৬
// ============================================================

export const PLAN_ORDER = ['standard', 'pro', 'max', 'erp']

export const PLANS = {
  standard: {
    key: 'standard',
    name: 'Standard',
    tagline: 'ছোট দোকান ও শুরু করা টিমের জন্য',
    maxCustomers: 2000,
    maxCustomersLabel: '২,০০০ কাস্টমার কানেকশন',
    freeCreditTk: 100,
    freeAiCreditM: 0.5,
    payAsYouGo: { emailSms: 0.60, sms: 0.65 },
    highlight: false,
    roles: [
      { key: 'sr',      label: 'SR (সেলস রিপ্রেজেন্টেটিভ)', price: 299 },
      { key: 'manager', label: 'ম্যানেজার',                  price: 599 },
      { key: 'stock',   label: 'স্টক কিপার',                 price: 299 },
      { key: 'shop',    label: 'শপ কিপার',                   price: 299 },
      { key: 'admin',   label: 'অ্যাডমিন / মালিক',           price: 999 },
    ],
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    tagline: 'বাড়তে থাকা ডিস্ট্রিবিউশন ব্যবসার জন্য',
    maxCustomers: 5000,
    maxCustomersLabel: '৫,০০০ কাস্টমার কানেকশন',
    freeCreditTk: 300,
    freeAiCreditM: 1,
    payAsYouGo: { emailSms: 0.55, sms: 0.60 },
    highlight: true,
    roles: [
      { key: 'sr',      label: 'SR (সেলস রিপ্রেজেন্টেটিভ)', price: 499 },
      { key: 'manager', label: 'ম্যানেজার',                  price: 799 },
      { key: 'stock',   label: 'স্টক কিপার',                 price: 449 },
      { key: 'shop',    label: 'শপ কিপার',                   price: 449 },
      { key: 'admin',   label: 'অ্যাডমিন / মালিক',           price: 1299 },
    ],
  },
  max: {
    key: 'max',
    name: 'Max',
    tagline: 'মাল্টি-লেভেল টিম ও বড় অপারেশনের জন্য',
    maxCustomers: 10000,
    maxCustomersLabel: '১০,০০০ কাস্টমার কানেকশন',
    freeCreditTk: 800,
    freeAiCreditM: 1.5,
    payAsYouGo: { emailSms: 0.50, sms: 0.55 },
    highlight: false,
    roles: [
      { key: 'sr',      label: 'SR (সেলস রিপ্রেজেন্টেটিভ)', price: 699 },
      { key: 'asm',     label: 'ASM',                        price: 899 },
      { key: 'manager', label: 'ম্যানেজার',                  price: 999 },
      { key: 'stock',   label: 'স্টক কিপার',                 price: 599 },
      { key: 'shop',    label: 'শপ কিপার',                   price: 599 },
      { key: 'admin',   label: 'অ্যাডমিন / মালিক',           price: 1699 },
    ],
  },
  erp: {
    key: 'erp',
    name: 'ERP',
    tagline: 'পুরো ব্যবসা এক প্ল্যাটফর্মে — কোনো লিমিট নেই',
    maxCustomers: null,
    maxCustomersLabel: 'আনলিমিটেড কাস্টমার কানেকশন',
    freeCreditTk: 1000,
    freeAiCreditM: 2,
    payAsYouGo: { emailSms: 0.45, sms: 0.50 },
    highlight: false,
    roles: [
      { key: 'sr',      label: 'SR (সেলস রিপ্রেজেন্টেটিভ)', price: 899 },
      { key: 'asm',     label: 'ASM',                        price: 999 },
      { key: 'manager', label: 'ম্যানেজার',                  price: 1299 },
      { key: 'stock',   label: 'স্টক কিপার',                 price: 699 },
      { key: 'shop',    label: 'শপ কিপার',                   price: 699 },
      { key: 'admin',   label: 'অ্যাডমিন (নন-ওনার)',         price: 1999 },
      { key: 'owner',   label: 'মালিক',                      price: 0, note: 'Free' },
    ],
  },
}

// AI মডেল ভেদে পে-অ্যাজ-ইউ-গো রেঞ্জ, সব প্ল্যানেই সমান
export const AI_PAY_AS_YOU_GO = { min: 3, max: 80, unit: 'USD / M tokens' }

// দীর্ঘমেয়াদী কমিটমেন্টে ছাড়
export const COMMITMENT_DISCOUNTS = [
  { years: 1, discountPct: 15, label: '১ বছরের লাইসেন্সে ১৫% ছাড়' },
  { years: 2, discountPct: 25, label: '২ বছরের লাইসেন্সে ২৫% ছাড়' },
]

export function formatTaka(amount) {
  if (amount === 0) return 'ফ্রি'
  return `৳${Number(amount).toLocaleString('bn-BD')}`
}

// বিলিং পেইজের FAQ (Claude-এর pricing FAQ প্যাটার্ন অনুসরণ করে)
export const PRICING_FAQ = [
  {
    q: 'ইউজার সংখ্যার কোনো লিমিট আছে কি?',
    a: 'না। প্রতিটা প্ল্যানে যত ইচ্ছা SR, ম্যানেজার, স্টক/শপ কিপার বা অ্যাডমিন যোগ করা যায় — প্রতিটার জন্য শুধু ওই রোলের প্রতি-ইউজার রেট অনুযায়ী বিল হবে। প্ল্যান আলাদা হয় ফিচার আর সর্বোচ্চ কাস্টমার-কানেকশন সংখ্যা দিয়ে, ইউজার সংখ্যা দিয়ে না।',
  },
  {
    q: 'ফ্রি Email/SMS ও AI ক্রেডিট শেষ হয়ে গেলে কী হবে?',
    a: 'প্রতি মাসে ফ্রি কোটা রিসেট হয়। মাসের মধ্যে কোটা শেষ হয়ে গেলে সার্ভিস বন্ধ হবে না — pay-as-you-go রেটে (প্ল্যান-ভেদে Email/SMS প্রতি পিস এবং AI প্রতি M-টোকেন) ওয়ালেট থেকে কেটে নেওয়া হবে। ওয়ালেটে ব্যালেন্স না থাকলে শুধু সেই নির্দিষ্ট সার্ভিস (যেমন SMS পাঠানো) সাময়িক বন্ধ থাকবে, বাকি সব ফিচার স্বাভাবিকভাবে চলবে।',
  },
  {
    q: 'কাস্টমার-কানেকশন লিমিট শেষ হয়ে গেলে কী হয়?',
    a: 'লিমিটের বেশি নতুন কাস্টমার কানেক্ট করতে চাইলে সিস্টেম আপগ্রেড করার সাজেশন দেখাবে। বিদ্যমান কাস্টমার ডেটা বা অর্ডার-হিস্ট্রি কখনো ব্লক হয় না — শুধু নতুন কানেকশনের জন্য পরের টায়ারে আপগ্রেড করতে হবে।',
  },
  {
    q: 'প্ল্যান পরে আপগ্রেড/ডাউনগ্রেড করা যাবে?',
    a: 'হ্যাঁ, যেকোনো সময় প্ল্যান পরিবর্তন করা যায়। আপগ্রেড করলে পরের বিলিং সাইকেল থেকে নতুন রেট কার্যকর হয়; কোনো ডেটা হারানোর ঝুঁকি নেই।',
  },
  {
    q: 'বার্ষিক ছাড় ও রেট-লক কীভাবে কাজ করে?',
    a: '১ বছরের কমিটমেন্টে ১৫% এবং ২ বছরে ২৫% ছাড় পাওয়া যায়। এছাড়া সাইনআপের সময়ের রেট লক হয়ে যায় — ভবিষ্যতে প্ল্যাটফর্মের দাম বাড়লেও, আপনার লাইসেন্স চলাকালীন পুরনো রেটেই বিল হবে।',
  },
  {
    q: '৩ মাসের ফ্রি ট্রায়াল শেষে কী হবে?',
    a: 'ট্রায়াল পিরিয়ডে পুরো ফিচার-সেট (ERP-লেভেল) ফ্রি ব্যবহার করা যায়, সর্বোচ্চ ৪ SR + ১ ম্যানেজার + ১ অ্যাডমিন + ২ শপ কিপার + ২ স্টক কিপার এবং ২,০০০ কাস্টমার পর্যন্ত। ট্রায়াল শেষে যেকোনো একটা পেইড প্ল্যান বেছে নিতে হবে; ডেটা সংরক্ষিত থাকে, হারায় না।',
  },
]

// বছর-ভিত্তিক ছাড় প্রয়োগ করে প্রতি-মাস কার্যকর রেট বের করে
export function applyDiscount(monthlyPrice, years) {
  const tier = COMMITMENT_DISCOUNTS.find(d => d.years === years)
  if (!tier) return monthlyPrice
  return Math.round(monthlyPrice * (1 - tier.discountPct / 100))
}

