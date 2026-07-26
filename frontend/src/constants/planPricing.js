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

// বছর-ভিত্তিক ছাড় প্রয়োগ করে প্রতি-মাস কার্যকর রেট বের করে
export function applyDiscount(monthlyPrice, years) {
  const tier = COMMITMENT_DISCOUNTS.find(d => d.years === years)
  if (!tier) return monthlyPrice
  return Math.round(monthlyPrice * (1 - tier.discountPct / 100))
}
