import { FiTrendingUp, FiMessageCircle, FiPackage, FiGlobe, FiPieChart } from 'react-icons/fi'

// ============================================================
// BrandVisuals — হিরো স্লাইডার ও ব্লগ কভারের জন্য ব্র্যান্ডেড ভিজ্যুয়াল
// ============================================================
// এখানে কোনো এক্সটার্নাল ছবি/স্টক ফটো ব্যবহার করা হয়নি — সম্পূর্ণ CSS +
// SVG দিয়ে তৈরি প্যানেল, যা LandingPage.jsx-এর ডিজাইন সিস্টেম (cream base /
// deep-navy primary / bronze accent, হ্যান্ড-ড্রন আন্ডারলাইন মোটিফ) থেকে
// সরাসরি নেওয়া রং ও স্টাইল ব্যবহার করে। ফলে —
//   ১) কোনো ছবি ফাইল মিসিং/ব্রোকেন পাথ হওয়ার ঝুঁকি নেই
//   ২) স্টক ফটোর লাইসেন্স/কপিরাইট সমস্যা নেই
//   ৩) পুরো সাইটের সাথে ভিজ্যুয়াল স্টাইল ১০০% সামঞ্জস্যপূর্ণ
// পরে চাইলে নিজের ব্যবসার আসল ছবি দিয়ে সহজেই রিপ্লেস করা যাবে —
// শুধু BrandVisualPanel-এর বদলে <img src="..." /> বসালেই হবে।
// ============================================================

const T = {
  primary900: '#0F1B2E',
  primary700: '#16253D',
  primary500: '#2C4870',
  primary300: '#6B85A8',
  accent600: '#9C6B2E',
  accent300: '#C99B5A',
  fontHead: "'Source Serif 4','Noto Sans Bengali',Georgia,serif",
  fontMono: "'IBM Plex Mono',monospace",
}

export const VISUALS = [
  {
    id: 'marketing',
    icon: FiTrendingUp,
    eyebrow: 'বিক্রয় বৃদ্ধি',
    caption: 'সঠিক বিজ্ঞাপনে পৌঁছান আরও বেশি কাস্টমারের কাছে',
    from: T.primary900,
    to: T.primary500,
  },
  {
    id: 'messaging',
    icon: FiMessageCircle,
    eyebrow: 'টিম যোগাযোগ',
    caption: 'SR ও ম্যানেজারের মধ্যে তাৎক্ষণিক আপডেট আদান-প্রদান',
    from: T.accent600,
    to: T.accent300,
  },
  {
    id: 'ecommerce',
    icon: FiPackage,
    eyebrow: 'অর্ডার থেকে ডেলিভারি',
    caption: 'অর্ডার নেওয়া থেকে পণ্য পৌঁছানো পর্যন্ত পুরো প্রক্রিয়া ট্র্যাক করুন',
    from: T.primary700,
    to: T.primary300,
  },
  {
    id: 'network',
    icon: FiGlobe,
    eyebrow: 'বিস্তৃত নেটওয়ার্ক',
    caption: 'একাধিক জেলা ও ডিস্ট্রিবিউটর একসাথে পরিচালনা করুন',
    from: T.primary900,
    to: T.accent600,
  },
  {
    id: 'dashboard',
    icon: FiPieChart,
    eyebrow: 'রিয়েল-টাইম রিপোর্ট',
    caption: 'প্রতিদিনের বিক্রয়, স্টক ও কমিশনের হিসাব একনজরে',
    from: T.accent600,
    to: T.primary700,
  },
]

export function BrandVisualPanel({ visual, compact = false }) {
  const Icon = visual.icon
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: compact ? '140px' : '220px',
        background: `linear-gradient(135deg, ${visual.from}, ${visual.to})`,
        overflow: 'hidden',
        borderRadius: compact ? '14px' : '20px',
      }}
    >
      {/* ডট-গ্রিড টেক্সচার */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.16) 1.5px, transparent 1.5px)',
          backgroundSize: '18px 18px',
          opacity: 0.5,
        }}
      />
      {/* সফট গ্লো সার্কেল */}
      <div style={{
        position: 'absolute', width: compact ? '90px' : '190px', height: compact ? '90px' : '190px',
        borderRadius: '50%', background: 'rgba(255,255,255,0.10)', top: '-30px', right: '-30px',
      }} />
      <div style={{
        position: 'absolute', width: compact ? '70px' : '150px', height: compact ? '70px' : '150px',
        borderRadius: '50%', background: 'rgba(255,255,255,0.08)', bottom: '-25px', left: '-25px',
      }} />

      {/* হিরো সেকশনের হ্যান্ড-ড্রন আন্ডারলাইনের মতো ড্যাশড আর্ক — সিগনেচার মোটিফ */}
      <svg viewBox="0 0 200 200" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.4 }}>
        <path d="M -10 58 Q 100 8 210 52" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeDasharray="5 6" fill="none" strokeLinecap="round" />
        <path d="M -10 152 Q 100 194 210 146" stroke="rgba(255,255,255,0.35)" strokeWidth="1.6" strokeDasharray="5 6" fill="none" strokeLinecap="round" />
      </svg>

      {/* কনটেন্ট */}
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: compact ? '16px' : '32px',
          textAlign: 'center',
          gap: compact ? '9px' : '16px',
        }}
      >
        <div
          style={{
            width: compact ? '42px' : '72px',
            height: compact ? '42px' : '72px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.16)',
            border: '1px solid rgba(255,255,255,0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: compact ? '18px' : '30px',
            backdropFilter: 'blur(6px)',
            flexShrink: 0,
          }}
        >
          <Icon />
        </div>
        {!compact && (
          <div style={{ fontFamily: T.fontMono, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)' }}>
            {visual.eyebrow}
          </div>
        )}
        <div
          style={{
            fontFamily: T.fontHead,
            fontWeight: 600,
            color: '#fff',
            fontSize: compact ? '12.5px' : '18px',
            lineHeight: 1.5,
            maxWidth: compact ? '210px' : '320px',
          }}
        >
          {compact ? visual.eyebrow : visual.caption}
        </div>
      </div>
    </div>
  )
}
