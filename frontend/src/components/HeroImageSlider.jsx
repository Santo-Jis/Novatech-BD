import { useState, useEffect, useRef } from 'react'
import { VISUALS, BrandVisualPanel } from './BrandVisuals'

// ============================================================
// HeroImageSlider — ল্যান্ডিং পেইজের হিরো সেকশনের জন্য অটো-স্লাইডিং ব্যানার
// ============================================================
// ৫টি ছবি/প্যানেল নির্দিষ্ট সময় পর পর (ডিফল্ট ৪.৫ সেকেন্ড) অটোমেটিক
// পরেরটায় স্লাইড হয়, নিচে ডট দিয়ে ম্যানুয়ালিও পাল্টানো যায়, এবং
// মাউস হোভার করলে অটো-প্লে সাময়িক বন্ধ থাকে।
// ============================================================

export default function HeroImageSlider({ intervalMs = 4500 }) {
  const [current, setCurrent] = useState(0)
  const timerRef = useRef(null)

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startTimer = () => {
    stopTimer()
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % VISUALS.length)
    }, intervalMs)
  }

  useEffect(() => {
    startTimer()
    return stopTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goTo = (i) => {
    setCurrent(i)
    startTimer() // ম্যানুয়ালি পাল্টালে টাইমার রিসেট হবে, যেন হুট করে আবার পরের স্লাইডে চলে না যায়
  }

  return (
    <div
      className="zx-hero-slider"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '720px',
        aspectRatio: '16 / 9',
        margin: '40px auto 0',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(15,27,46,0.20)',
      }}
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
    >
      <style>{`
        /* মোবাইলে হিরো ব্যানারটা 16:9 রেশিওতে বেশি "মোটা"/লম্বা দেখায় —
           ছোট স্ক্রিনে চ্যাপ্টা রেশিও ও কম মার্জিন দিয়ে হালকা করা হয়েছে। */
        @media (max-width: 640px) {
          .zx-hero-slider { aspect-ratio: 16 / 8 !important; margin: 26px auto 0 !important; border-radius: 14px !important; }
        }
        @media (max-width: 420px) {
          .zx-hero-slider { aspect-ratio: 16 / 7.6 !important; }
        }
      `}</style>
      {VISUALS.map((v, i) => (
        <div
          key={v.id}
          aria-hidden={current !== i}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: current === i ? 1 : 0,
            transition: 'opacity 0.8s ease-in-out',
            pointerEvents: current === i ? 'auto' : 'none',
          }}
        >
          <BrandVisualPanel visual={v} />
        </div>
      ))}

      {/* ডট ইন্ডিকেটর */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: '7px',
        }}
      >
        {VISUALS.map((v, i) => (
          <button
            key={v.id}
            aria-label={`স্লাইড ${i + 1}: ${v.eyebrow}`}
            onClick={() => goTo(i)}
            style={{
              width: current === i ? '22px' : '7px',
              height: '7px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: current === i ? '#fff' : 'rgba(255,255,255,0.5)',
              transition: 'width 0.25s ease, background 0.25s ease',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}
