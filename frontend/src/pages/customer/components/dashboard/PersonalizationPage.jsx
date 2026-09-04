// components/dashboard/PersonalizationPage.jsx
// AccountMenu → "পারসোনালাইজেশন" — fixed full-screen (z-50)।
//
// ✅ FIX — থিম এখন usePreferencesStore দিয়ে backend-এ persist হয়
// (GET/PUT /portal/profile/preferences)। আগে শুধু localStorage('cp_darkMode')
// ছিল, তাই নতুন ডিভাইসে লগইন করলেই সেটিং হারিয়ে যেত। dark ক্লাস প্রয়োগের
// দায়িত্ব এখন এই কম্পোনেন্টের না — CustomerLayout.jsx-এ, resolvedTheme
// অনুযায়ী <main>-এ scoped (কেন, দেখুন preferencesStore.js-এর কমেন্ট)।
// Light/Dark boolean টগলের বদলে Light/Dark/System — তিন-অপশন, ইনফ্রা
// এখন cp-* CSS ভ্যারিয়েবল দিয়ে সত্যিই কাজ করে (index.css দেখুন)।

import { FiMoon, FiSun, FiMonitor, FiGlobe } from 'react-icons/fi'
import MenuPageHeader from './MenuPageHeader'
import CpCard from '../ui/CpCard'
import { usePreferencesStore } from '../../../../store/preferencesStore'

const THEME_OPTIONS = [
  { value: 'system', label: 'সিস্টেম', icon: FiMonitor },
  { value: 'light',  label: 'লাইট',    icon: FiSun     },
  { value: 'dark',   label: 'ডার্ক',    icon: FiMoon    },
]

export default function PersonalizationPage({ onBack }) {
  const theme        = usePreferencesStore(s => s.theme)
  const resolvedDark = usePreferencesStore(s => s.resolvedTheme === 'dark')
  const language     = usePreferencesStore(s => s.language)
  const setTheme     = usePreferencesStore(s => s.setTheme)
  const setLanguage  = usePreferencesStore(s => s.setLanguage)

  return (
    <div className="fixed inset-0 z-50 bg-cp-bg-base flex flex-col">
      <MenuPageHeader title="পারসোনালাইজেশন" onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {/* থিম — Light / Dark / System */}
        <CpCard padding="md">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-cp-trust-100 text-cp-trust-500 flex items-center justify-center flex-shrink-0">
              {resolvedDark ? <FiMoon size={18} /> : <FiSun size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-cp-text-primary">থিম</p>
              <p className="text-[11px] text-cp-text-muted leading-snug">কম আলোতে চোখের আরামের জন্য গাঢ় থিম বেছে নাও</p>
            </div>
          </div>

          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = theme === value
              return (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  aria-pressed={active}
                  className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-colors"
                  style={active
                    ? { background: 'var(--cp-trust-500)', borderColor: 'var(--cp-trust-500)', color: '#fff' }
                    : { background: 'var(--cp-bg-alt)', borderColor: 'var(--cp-border)', color: 'var(--cp-text-secondary)' }}
                >
                  <Icon size={16} />
                  <span className="text-[11px] font-semibold">{label}</span>
                </button>
              )
            })}
          </div>
        </CpCard>

        {/* ভাষা — পছন্দ এখন সেভ হয়, পুরো অ্যাপ ট্রান্সলেশন এখনো শীঘ্রই আসছে */}
        <CpCard padding="md">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-cp-trust-100 text-cp-trust-500 flex items-center justify-center flex-shrink-0">
              <FiGlobe size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-cp-text-primary">ভাষা</p>
              <p className="text-[11px] text-cp-text-muted leading-snug">তোমার পছন্দ সেভ থাকবে</p>
            </div>
          </div>

          <div className="flex gap-2">
            {[
              { value: 'bn', label: 'বাংলা' },
              { value: 'en', label: 'English' },
            ].map(({ value, label }) => {
              const active = language === value
              return (
                <button
                  key={value}
                  onClick={() => setLanguage(value)}
                  aria-pressed={active}
                  className="flex-1 py-2.5 rounded-xl border text-[12.5px] font-semibold transition-colors"
                  style={active
                    ? { background: 'var(--cp-trust-500)', borderColor: 'var(--cp-trust-500)', color: '#fff' }
                    : { background: 'var(--cp-bg-alt)', borderColor: 'var(--cp-border)', color: 'var(--cp-text-secondary)' }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {language === 'en' && (
            <p className="text-[11px] text-cp-warmth-600 bg-cp-warmth-100 rounded-lg px-3 py-2 mt-2.5 leading-relaxed">
              পছন্দ সেভ হয়ে গেছে। পুরো পোর্টাল ইংরেজিতে দেখানোর ফিচার এখনো তৈরি হচ্ছে —
              এই মুহূর্তে বাকি সব লেখা বাংলাতেই থাকবে।
            </p>
          )}
        </CpCard>

        <p className="text-center text-[11px] text-cp-text-muted mt-1">
          আরও কাস্টমাইজেশন অপশন ধীরে ধীরে যোগ হবে ✨
        </p>
      </div>
    </div>
  )
}
