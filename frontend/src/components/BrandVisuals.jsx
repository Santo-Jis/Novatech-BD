import marketingImg from '../assets/blog/marketing.png'
import messagingImg from '../assets/blog/messaging.png'
import ecommerceImg from '../assets/blog/ecommerce.jpg'
import networkImg from '../assets/blog/network.jpg'
import dashboardImg from '../assets/blog/dashboard.jpg'

// ============================================================
// BrandVisuals — হিরো স্লাইডার ও ব্লগ কভারের জন্য ছবি + ক্যাপশন প্যানেল
// ============================================================
// লাইসেন্সকৃত ছবি ব্যবহার করা হয়েছে (src/assets/blog/-এ রাখা)। প্রতিটা
// ছবির নিচের দিকে একটা গাঢ় gradient overlay (scrim) বসানো আছে যাতে
// ছবির রং/কনট্রাস্ট যাই হোক, ক্যাপশন টেক্সট সবসময় স্পষ্ট পড়া যায়।
//
// নতুন/অন্য ছবি বসাতে চাইলে:
//   ১) নতুন ছবিটা এই ফোল্ডারে (src/assets/blog/) রাখুন
//   ২) উপরের import লাইন ও নিচের VISUALS অ্যারেতে সেই ফাইলনেম বসান
// HeroImageSlider.jsx, BlogPostCard.jsx, BlogPost.jsx — এই তিনটার
// কোনোটাতেই হাত দিতে হবে না, সবগুলো এখান থেকেই ছবি টেনে নেয়।
// ============================================================

const T = {
  fontHead: "'Source Serif 4','Noto Sans Bengali',Georgia,serif",
  fontMono: "'IBM Plex Mono',monospace",
}

export const VISUALS = [
  {
    id: 'marketing',
    image: marketingImg,
    eyebrow: 'বিক্রয় বৃদ্ধি',
    caption: 'সঠিক বিজ্ঞাপনে পৌঁছান আরও বেশি কাস্টমারের কাছে',
  },
  {
    id: 'messaging',
    image: messagingImg,
    eyebrow: 'টিম যোগাযোগ',
    caption: 'SR ও ম্যানেজারের মধ্যে তাৎক্ষণিক আপডেট আদান-প্রদান',
  },
  {
    id: 'ecommerce',
    image: ecommerceImg,
    eyebrow: 'অর্ডার থেকে ডেলিভারি',
    caption: 'অর্ডার নেওয়া থেকে পণ্য পৌঁছানো পর্যন্ত পুরো প্রক্রিয়া ট্র্যাক করুন',
  },
  {
    id: 'network',
    image: networkImg,
    eyebrow: 'বিস্তৃত নেটওয়ার্ক',
    caption: 'একাধিক জেলা ও ডিস্ট্রিবিউটর একসাথে পরিচালনা করুন',
  },
  {
    id: 'dashboard',
    image: dashboardImg,
    eyebrow: 'রিয়েল-টাইম রিপোর্ট',
    caption: 'প্রতিদিনের বিক্রয়, স্টক ও কমিশনের হিসাব একনজরে',
  },
]

export function BrandVisualPanel({ visual, compact = false }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: compact ? '140px' : '220px',
        overflow: 'hidden',
        borderRadius: compact ? '14px' : '20px',
        background: '#0F1B2E',
      }}
    >
      <img
        src={visual.image}
        alt={visual.caption}
        loading="lazy"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />

      {/* নিচে গাঢ় স্ক্রিম — যেকোনো ছবির উপর ক্যাপশন যেন স্পষ্ট পড়া যায় */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(15,27,46,0.88) 0%, rgba(15,27,46,0.45) 42%, rgba(15,27,46,0) 68%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: compact ? '12px 14px' : '20px 26px',
        }}
      >
        {!compact && (
          <div style={{ fontFamily: T.fontMono, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>
            {visual.eyebrow}
          </div>
        )}
        <div
          style={{
            fontFamily: T.fontHead,
            fontWeight: 600,
            color: '#fff',
            fontSize: compact ? '12.5px' : '17px',
            lineHeight: 1.45,
            maxWidth: compact ? '220px' : '440px',
          }}
        >
          {compact ? visual.eyebrow : visual.caption}
        </div>
      </div>
    </div>
  )
}
