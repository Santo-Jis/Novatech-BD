// SR নিয়োগ ফর্মের default লেখা/সেটিংস।
//
// ⚠ backend/src/services/recruitmentFormConfig.js-এর DEFAULT_CONFIG-এর সাথে মিল রাখুন।
// সার্ভার সবসময় পূর্ণ config পাঠায়; এই ফাইল শুধু fallback (API ব্যর্থ হলে ফর্ম যেন চলে)
// এবং Admin এডিটরের "ডিফল্ট" তুলনার জন্য।

export const RECRUITMENT_LIMITS = {
  short: 80,
  medium: 200,
  long: 1200,
  termsMax: 8,
  termsText: 300,
  termsIcon: 8,
}

export const DEFAULT_FORM_CONFIG = {
  version: 1,
  accepting: true,
  closed_message: 'এই মুহূর্তে নতুন আবেদন নেওয়া হচ্ছে না। পরে আবার চেষ্টা করুন।',
  require_otp: true,
  header: {
    subtitle: 'SR নিয়োগ আবেদন ফর্ম',
    status_badge: 'নিয়োগ চলছে',
  },
  job: {
    show_banner: true,
    title: 'Sales Representative (SR)',
    company: '',
    work_area: 'বরিশাল',
    salary: 'আলোচনা সাপেক্ষে',
  },
  address_note: {
    enabled: true,
    text: 'কর্মএলাকা: বরিশাল সদর ও আশেপাশের জেলায় কাজ করতে আগ্রহী প্রার্থীরা অগ্রাধিকার পাবেন।',
  },
  terms: {
    enabled: true,
    title: 'চাকরির শর্তাবলী সারসংক্ষেপ',
    items: [
      { icon: '📅', text: 'প্রথম ৭ কর্মদিবস প্রশিক্ষণ পর্যায় — দৈনিক কমিশন ও TA/DA প্রযোজ্য' },
      { icon: '💼', text: 'গ্রেস পিরিয়ড শেষে স্থায়ী নিয়োগ — বেতন আলোচনা সাপেক্ষে নির্ধারিত হবে' },
      { icon: '📈', text: 'দৈনিক বিক্রয়ের উপর আকর্ষণীয় কমিশন সুবিধা' },
      { icon: '🏆', text: 'পারফরম্যান্স অনুযায়ী পদোন্নতি ও বোনাসের সুযোগ' },
    ],
  },
  declaration: {
    title: 'ঘোষণাপত্র',
    text:
      'আমি ঘোষণা করছি যে এই ফর্মে প্রদত্ত সকল তথ্য সঠিক ও পূর্ণাঙ্গ। কোম্পানির সকল নিয়ম ও নীতিমালা ' +
      'মেনে চলতে এবং প্রয়োজনে যেকোনো কর্মএলাকায় দায়িত্ব পালন করতে সম্মত। কোনো তথ্য মিথ্যা ' +
      'প্রমাণিত হলে নিয়োগ তাৎক্ষণিকভাবে বাতিলযোগ্য।',
  },
  success: {
    title: 'আবেদন সফলভাবে জমা হয়েছে!',
    message: 'আপনার আবেদন আমাদের নিয়োগ টিম পর্যালোচনা করবে। শীঘ্রই আপনার সাথে যোগাযোগ করা হবে।',
  },
}

export const cloneDefaultConfig = () => JSON.parse(JSON.stringify(DEFAULT_FORM_CONFIG))

// সার্ভার থেকে পাওয়া (আংশিক বা অনুপস্থিত) config-কে default-এর উপর বসায়।
// terms.items অ্যারে হিসেবে পুরো প্রতিস্থাপন হয়, বাকি অবজেক্ট গভীরভাবে মার্জ।
export function mergeFormConfig(partial) {
  const base = cloneDefaultConfig()
  if (!partial || typeof partial !== 'object') return base
  const out = { ...base }
  for (const k of Object.keys(base)) {
    const bv = base[k]
    const pv = partial[k]
    if (pv === undefined || pv === null) continue
    if (bv && typeof bv === 'object' && !Array.isArray(bv)) {
      if (typeof pv === 'object' && !Array.isArray(pv)) out[k] = { ...bv, ...pv }
    } else if (typeof pv === typeof bv) {
      out[k] = pv
    }
  }
  if (!Array.isArray(out.terms.items)) out.terms.items = base.terms.items
  return out
}
