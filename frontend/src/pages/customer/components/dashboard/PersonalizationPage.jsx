// components/dashboard/PersonalizationPage.jsx
// AccountMenu → "পারসোনালাইজেশন" — fixed full-screen (z-50)।
// ডার্ক মোড টগল: localStorage 'cp_darkMode', document.documentElement.classList।
// (ইনফ্রা রেডি; cp-* কম্পোনেন্টে dark: ভ্যারিয়েন্ট পরে যোগ করতে হবে)

import { useState, useEffect } from 'react'
import { FiMoon, FiSun, FiGlobe } from 'react-icons/fi'
import MenuPageHeader from './MenuPageHeader'
import CpCard from '../ui/CpCard'

function getInitialDark() {
  try {
    const saved = window.localStorage.getItem('cp_darkMode')
    if (saved !== null) return saved === 'true'
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
  } catch { return false }
}

export default function PersonalizationPage({ onBack }) {
  const [dark, setDark] = useState(getInitialDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { window.localStorage.setItem('cp_darkMode', String(dark)) } catch { /* ignore */ }
  }, [dark])

  return (
    <div className="fixed inset-0 z-50 bg-cp-bg-base flex flex-col">
      <MenuPageHeader title="পারসোনালাইজেশন" onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {/* ডার্ক মোড */}
        <CpCard padding="md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cp-trust-100 text-cp-trust-500 flex items-center justify-center flex-shrink-0">
              {dark ? <FiMoon size={18} /> : <FiSun size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-cp-text-primary">ডার্ক মোড</p>
              <p className="text-[11px] text-cp-text-muted leading-snug">কম আলোতে চোখের আরামের জন্য গাঢ় থিম</p>
            </div>
            {/* ProfileTab-এর discoverable টগলের মতো একই pill-switch প্যাটার্ন */}
            <button
              onClick={() => setDark(v => !v)}
              aria-label="ডার্ক মোড টগল"
              className="flex-shrink-0 w-12 h-7 rounded-full relative transition-colors"
              style={{ background: dark ? '#2E7BD6' : '#CBD5E1' }}
            >
              <span
                className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all duration-200"
                style={{ left: dark ? 22 : 2 }}
              />
            </button>
          </div>
        </CpCard>

        {/* ভাষা — শীঘ্রই আসছে */}
        <div>
          <p className="text-[11px] font-bold text-cp-text-muted uppercase tracking-wide mb-2 px-1">ভাষা</p>
          <div
            className="rounded-2xl px-4 py-5 flex flex-col items-center text-center gap-1.5"
            style={{ border: '1px dashed #C0D2E3', background: '#EAF2FA99' }}
          >
            <div className="w-11 h-11 rounded-full bg-cp-trust-100 text-cp-trust-500 flex items-center justify-center">
              <FiGlobe size={19} />
            </div>
            <p className="text-[12.5px] font-bold text-cp-text-primary">বাংলা / English</p>
            <p className="text-[11px] text-cp-text-muted leading-relaxed max-w-[240px]">
              পুরো পোর্টাল ইংরেজিতেও ব্যবহারের অপশন — খুব শীঘ্রই আসছে।
            </p>
            <span className="mt-1 text-[9.5px] font-bold text-cp-warmth-600 bg-cp-warmth-100 px-2.5 py-1 rounded-full">
              শীঘ্রই আসছে
            </span>
          </div>
        </div>

        <p className="text-center text-[11px] text-cp-text-muted mt-1">
          আরও কাস্টমাইজেশন অপশন ধীরে ধীরে যোগ হবে ✨
        </p>
      </div>
    </div>
  )
}
