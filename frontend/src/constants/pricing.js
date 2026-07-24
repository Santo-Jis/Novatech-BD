// ============================================================
// Per-seat pricing — উৎস: NovaTechBD_Pricing_Policy.docx (সংস্করণ ১.০, খসড়া)
// ⚠️ Draft/internal নীতিমালা — বাজার-যাচাই ও আর্থিক পর্যালোচনা সাপেক্ষে,
//    চূড়ান্ত না। backend/src/controllers/onboarding.controller.js-এ এই
//    একই রেট আলাদাভাবে রাখা আছে (backend/frontend আলাদা runtime,
//    তাই এখন duplicate — ভবিষ্যতে GET /api/pricing এন্ডপয়েন্ট দিয়ে
//    একটাই source of truth-এ আনা উচিত)। এখানে বদলালে ওখানেও বদলাতে হবে।
//
// এই ফাইল StartTrial.jsx-এ ব্যবহৃত হচ্ছে সিট-নির্বাচন calculator-এর
// জন্য, পরে ল্যান্ডিং পেইজের pricing section-ও এখান থেকেই রেট নেবে।
// ============================================================

export const SEAT_RATES = {
  admin: {
    role: 'admin',
    labelBn: 'অ্যাডমিন / মালিক',
    labelEn: 'Admin / Owner',
    price: 1699,
    comingSoon: false,
    fixed: true, // trial সাইনআপে সবসময় ১ — যে সাইনআপ করছে সে নিজেই, adjustable না
  },
  manager: {
    role: 'manager',
    labelBn: 'ম্যানেজার',
    labelEn: 'Manager',
    price: 1299,
    comingSoon: false,
    fixed: false,
  },
  worker: {
    role: 'worker',
    labelBn: 'এসআর (SR)',
    labelEn: 'Sales Representative (SR)',
    price: 899,
    comingSoon: false,
    fixed: false,
  },
  shop_keeper: {
    role: 'shop_keeper',
    labelBn: 'শপ কিপার',
    labelEn: 'Shop Keeper',
    price: 799,
    comingSoon: true, // এখনো কোডে role হিসেবে নেই — সিট বুক করা যায়, ব্যবহার এখনো না
    fixed: false,
  },
  stock_keeper: {
    role: 'stock_keeper',
    labelBn: 'স্টক কিপার',
    labelEn: 'Stock Keeper',
    price: 499,
    comingSoon: true,
    fixed: false,
  },
};

export const MAX_SEATS_PER_ROLE = 50;

// { manager: 1, worker: 4, ... } → মোট মাসিক টাকা (৳)
export function calculateMonthlyTotal(seatCounts) {
  return Object.entries(seatCounts).reduce((sum, [role, count]) => {
    const rate = SEAT_RATES[role]?.price || 0;
    return sum + rate * (Number(count) || 0);
  }, 0);
}

export function formatTaka(amount) {
  return `৳${Number(amount).toLocaleString('bn-BD')}`;
}
