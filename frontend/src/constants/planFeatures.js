// ============================================================
// ফিচার কম্প্যারিজন ম্যাট্রিক্স — Pricing.jsx-এর "সব প্ল্যানে কী কী আছে"
// সেকশনে ব্যবহৃত হয়। মান: true (আছে) | false (নাই) | string (আংশিক/নোট)
// ক্যাটাগরিগুলো codebase-এর controller/route মডিউল অনুযায়ী সাজানো।
// ============================================================

export const FEATURE_CATEGORIES = [
  {
    id: 'sales',
    title: 'সেলস, অর্ডার ও ডেলিভারি',
    rows: [
      ['অর্ডার তৈরি/অনুমোদন/বাতিল', true, true, true, true],
      ['আজকের অর্ডার ও স্টক-স্ট্যাটাস চেক', true, true, true, true],
      ['ভিজিট-লিঙ্কড সেল এন্ট্রি', true, true, true, true],
      ['ইনভয়েস OTP ভেরিফিকেশন', true, true, true, true],
      ['Skip-OTP (বিশ্বস্ত কাস্টমার)', false, true, true, true],
      ['রিসিট আপলোড', true, true, true, true],
      ['মাসিক/টিম সেলস সামারি', 'সীমিত', true, true, true],
      ['ভিজিট স্ট্যাটস ও ভিজিট-স্ট্যাটাস', false, true, true, true],
      ['ডেলিভারি টাস্ক অ্যাসাইন/ট্র্যাক', false, true, true, true],
      ['রিজার্ভড-স্টক অটো-সিঙ্ক (ওভারসেল প্রুফ)', true, true, true, true],
    ],
  },
  {
    id: 'inventory',
    title: 'প্রোডাক্ট ও ইনভেন্টরি',
    rows: [
      ['প্রোডাক্ট CRUD', true, true, true, true],
      ['স্টক অ্যাডজাস্ট + মুভমেন্ট হিস্ট্রি', 'সীমিত', true, true, true],
      ['রিটার্ন সাবমিট/কমপ্লিট', true, true, true, true],
      ['রিটার্ন রিভিউ ওয়ার্কফ্লো (টিম-লেভেল)', false, true, true, true],
      ['মাল্টি-ওয়্যারহাউস/স্টোর', false, '২-৩টি', 'মাল্টিপল', 'আনলিমিটেড'],
      ['VAT/Tax ইঞ্জিন (প্রোডাক্ট-ভিত্তিক)', true, true, true, true],
    ],
  },
  {
    id: 'customer',
    title: 'কাস্টমার ম্যানেজমেন্ট',
    rows: [
      ['কাস্টমার CRUD + শপ-ফটো', true, true, true, true],
      ['কাস্টমার হিস্ট্রি', true, true, true, true],
      ['কাস্টমার এডিট-রিকোয়েস্ট/অনুমোদন', false, true, true, true],
      ['ক্রেডিট-লিমিট সেট + অ্যালার্ট', true, true, true, true],
      ['ক্রেডিট কালেকশন ট্র্যাকিং', true, true, true, true],
      ['QR-স্ক্যান কানেকশন', false, true, true, true],
      ['কোম্পানি/পারসন সার্চ-কানেক্ট', false, true, true, true],
      ['সেলফ-রেজিস্ট্রেশন + ভেরিফিকেশন ব্যাজ', false, false, true, true],
    ],
  },
  {
    id: 'portal',
    title: 'কাস্টমার সেলফ-সার্ভিস পোর্টাল',
    rows: [
      ['বেসিক ড্যাশবোর্ড, ইনভয়েস/পেমেন্ট হিস্ট্রি', true, true, true, true],
      ['Google/Device লগইন + মাল্টি-ডিভাইস ম্যানেজ', false, true, true, true],
      ['অর্ডার-রিকোয়েস্ট + ট্র্যাকিং', false, true, true, true],
      ['রিটার্ন-রিকোয়েস্ট, কমপ্লেইন সাবমিট', false, true, true, true],
      ['ক্রেডিট-লিমিট রিকোয়েস্ট', false, true, true, true],
      ['নোটিফিকেশন সেন্টার', false, true, true, true],
      ['মাল্টি-কোম্পানি কানেকশন (এক কাস্টমার একাধিক কোম্পানি)', false, false, false, true],
      ['কাস্টমার AI চ্যাট + হিস্ট্রি', false, false, true, true],
    ],
  },
  {
    id: 'route',
    title: 'রুট ও কভারেজ',
    rows: [
      ['রুট তৈরি/অ্যাসাইন', false, true, true, true],
      ['ওয়ার্কার রুট-রিকোয়েস্ট', false, true, true, true],
      ['লাইভ রুট স্ট্যাটাস', false, false, true, true],
      ['ভিজিট অর্ডার/সিকোয়েন্স + ভিজিট অ্যালার্ট', false, true, true, true],
      ['টিম কভারেজ সামারি', false, true, true, true],
    ],
  },
  {
    id: 'location',
    title: 'লোকেশন ও ট্র্যাকিং',
    rows: [
      ['চেক-ইন ভিত্তিক লোকেশন আপডেট', true, true, true, true],
      ['টিম লাইভ লোকেশন ম্যাপ', false, false, true, true],
      ['GPS ট্রেইল/হিস্ট্রি', false, false, true, true],
      ['প্রেজেন্স চেক-ইন + ব্যাটারি-লো অ্যালার্ট', false, true, true, true],
    ],
  },
  {
    id: 'credit',
    title: 'ক্রেডিট, লেজার ও সেটেলমেন্ট',
    rows: [
      ['ডেইলি/মাসিক লেজার', true, true, true, true],
      ['SR লেজার + লেজার রিপোর্ট', 'সীমিত', true, true, true],
      ['ক্রেডিট অ্যাপ্রুভাল ওয়ার্কফ্লো + সেটিংস', false, true, true, true],
      ['ডিউ লিডারবোর্ড', false, true, true, true],
      ['সেটেলমেন্ট (সাবমিট/অ্যাপ্রুভ/ডিসপিউট/শর্টেজ)', false, false, true, true],
      ['P&L স্টেটমেন্ট', false, false, true, true],
      ['মাসিক আর্কাইভ', false, true, true, true],
    ],
  },
  {
    id: 'wallet',
    title: 'ওয়ালেট ও বিলিং ইনফ্রা',
    rows: [
      ['প্রিপেইড ওয়ালেট (পয়সা-লেজার)', true, true, true, true],
      ['ইমিউটেবল ট্রানজেকশন লগ', true, true, true, true],
      ['রিচার্জ/রিফান্ড/অ্যাডজাস্টমেন্ট', true, true, true, true],
      ['সিট-লিমিট এনফোর্সমেন্ট + রেট-লক', true, true, true, true],
      ['কাস্টম SMS গেটওয়ে (নিজস্ব নাম্বার/API)', false, false, false, true],
    ],
  },
  {
    id: 'hr',
    title: 'HR, অ্যাটেন্ডেন্স ও পে-রোল',
    rows: [
      ['চেক-ইন/আউট + অ্যাটেন্ডেন্স কারেকশন', true, true, true, true],
      ['লিভ অ্যাপ্লাই/অ্যাপ্রুভ/ব্যালেন্স', true, true, true, true],
      ['এমপ্লয়ি CRUD + অ্যাপ্রুভাল/সাসপেন্ড', true, true, true, true],
      ['স্যালারি শিট/পে/স্লিপ', true, true, true, true],
      ['কমিশন (বেসিক)', 'সীমিত', true, true, true],
      ['লাইভ কমিশন + বোনাস অটো-জব', false, false, true, true],
      ['রিক্রুটমেন্ট মডিউল (অ্যাপ্লাই→রিভিউ→হায়ার)', false, false, false, true],
      ['মাসিক অ্যাটেন্ডেন্স-বোনাস অটো-জব', false, true, true, true],
    ],
  },
  {
    id: 'promo',
    title: 'প্রমোশন, টার্গেট ও গেমিফিকেশন',
    rows: [
      ['অ্যাক্টিভ প্রমোশন + ক্যালকুলেট', false, true, true, true],
      ['প্রমোশন CRUD + রিপোর্ট', false, true, true, true],
      ['লিডারবোর্ড (র‍্যাঙ্ক/টিম)', false, true, true, true],
      ['ইনভয়েস টার্গেট সেট/প্রোগ্রেস', false, true, true, true],
    ],
  },
  {
    id: 'ai',
    title: 'AI ফিচার',
    rows: [
      ['জেনারেল AI চ্যাট', false, 'সীমিত', true, true],
      ['AI ইনসাইট (অ্যাডমিন/ম্যানেজার)', false, false, true, true],
      ['কাস্টমার-ফেসিং AI চ্যাট', false, false, true, true],
      ['AI মডেল কনফিগ/সুইচ', false, false, false, true],
      ['কাস্টম AI জব শিডিউলিং/ট্রিগার', false, false, false, true],
    ],
  },
  {
    id: 'reports',
    title: 'রিপোর্ট ও অ্যানালিটিক্স',
    rows: [
      ['KPI ড্যাশবোর্ড, সেলস/অ্যাটেন্ডেন্স রিপোর্ট', true, true, true, true],
      ['কমিশন/ক্রেডিট/এক্সপেন্স/রিটার্ন রিপোর্ট', 'সীমিত', true, true, true],
      ['টপ প্রোডাক্টস, টপ শপস', false, true, true, true],
      ['এমপ্লয়ি PDF রিপোর্ট', false, true, true, true],
      ['কাস্টম/এক্সপোর্ট রিপোর্ট বিল্ডার', false, false, false, true],
    ],
  },
  {
    id: 'comm',
    title: 'নোটিশ ও কমিউনিকেশন',
    rows: [
      ['নোটিস বোর্ড', true, true, true, true],
      ['ব্রডকাস্ট ইমেইল', false, true, true, true],
      ['SMS (ডিফল্ট গেটওয়ে)', true, true, true, true],
      ['SMS গেটওয়ে চয়েস (মাল্টি-প্রোভাইডার)', false, false, true, true],
      ['WhatsApp ইনভয়েস ডেলিভারি', false, true, true, true],
    ],
  },
  {
    id: 'invoice',
    title: 'ইনভয়েসিং',
    rows: [
      ['PDF ইনভয়েস অটো-জেনারেট', true, true, true, true],
      ['অটো ইনভয়েস নাম্বারিং', true, true, true, true],
      ['ইমেইল/SMS ইনভয়েস সেন্ড', true, true, true, true],
      ['WhatsApp ইনভয়েস + ভেরিফাই-লিঙ্ক', false, true, true, true],
    ],
  },
  {
    id: 'pwa',
    title: 'PWA, অফলাইন ও নেটিভ অ্যাপ',
    rows: [
      ['ইনস্টলযোগ্য PWA', true, true, true, true],
      ['অফলাইন কিউ (IndexedDB) + অটো-সিঙ্ক', true, true, true, true],
      ['অ্যাপ-আপডেট ডিটেক্ট ডায়ালগ', true, true, true, true],
      ['নেটিভ অ্যান্ড্রয়েড APK (স্টাফ)', false, true, true, true],
      ['নেটিভ কাস্টমার APK', false, false, true, true],
    ],
  },
  {
    id: 'push',
    title: 'পুশ নোটিফিকেশন',
    rows: [
      ['ব্যাকগ্রাউন্ড পুশ (Firebase)', true, true, true, true],
      ['অনলাইন/টিম প্রেজেন্স ট্র্যাকিং', false, true, true, true],
      ['প্রায়োরিটি পুশ ডেলিভারি', false, false, true, true],
    ],
  },
  {
    id: 'security',
    title: 'সিকিউরিটি ও পারমিশন',
    rows: [
      ['রোল-ভিত্তিক লোকেশন/ক্যামেরা/নোটিফিকেশন পারমিশন', true, true, true, true],
      ['সেলফি ক্যামেরা ক্যাপচার (চেক-ইন)', true, true, true, true],
      ['ফিঙ্গারপ্রিন্ট/প্রেস-হোল্ড চেক-ইন', true, true, true, true],
      ['2FA (TOTP) + রিকভারি কোড', false, false, false, true],
      ['অডিট লগ (ফুল সিস্টেম)', false, false, 'সীমিত', true],
    ],
  },
  {
    id: 'admin',
    title: 'অ্যাডমিন ও মাল্টি-টেন্যান্ট',
    rows: [
      ['সেটিংস, সিস্টেম স্ট্যাটস', true, true, true, true],
      ['পোর্টাল ডিভাইস ম্যানেজমেন্ট', false, true, true, true],
      ['বাল্ক পোর্টাল-রিটার্ন রিভিউ', false, false, true, true],
      ['টিম ম্যানেজমেন্ট + SR রিঅ্যাসাইন', true, true, true, true],
      ['কোম্পানি অনবোর্ডিং + সাবডোমেইন/স্লাগ', false, false, false, true],
      ['সুপার অ্যাডমিন/টেন্যান্ট কন্ট্রোল প্যানেল', false, false, false, true],
    ],
  },
]
