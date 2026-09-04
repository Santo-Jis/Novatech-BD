// frontend/src/store/preferencesStore.js
// ✅ NEW — কাস্টমার পোর্টালের থিম/ভাষা/নোটিফিকেশন পছন্দ। আগে
// PersonalizationPage.jsx-এ শুধু localStorage('cp_darkMode') ছিল, backend-এ
// persist হতো না। এখন GET/PUT /portal/profile/preferences দিয়ে সিঙ্ক হয়।
//
// ⚠️ স্টাফ-সাইড app.store.js-এর darkMode থেকে ইচ্ছাকৃতভাবে আলাদা রাখা হলো —
// ওটা document.documentElement-এ 'dark' ক্লাস বসায় (global, root-level)।
// এই স্টোর সেই একই DOM নোড ছোঁয় না; dark class প্রয়োগের দায়িত্ব
// CustomerLayout.jsx-এর <main id="cl-main">-এ, resolvedTheme অনুযায়ী।
// দুটো সম্পূর্ণ স্বাধীন সিস্টেম, একে অপরের ওপর প্রভাব ফেলে না।
//
// (পুরনো কোডে document.documentElement.classList.toggle('dark', dark)
// সরাসরি PersonalizationPage.jsx থেকে কল হতো — সেই একই root element যেটা
// app.store.js-ও টগল করে। আজ পর্যন্ত bug দেখা দেয়নি শুধু এই কারণে যে
// cp-* টোকেন dark ক্লাসে কিছুই react করতো না; এখন করবে, তাই scope আলাদা
// করাটা এখন থেকে জরুরি — নাহলে দুই independent state একই ক্লাস নিয়ে
// একে অপরকে override করে ফেলত।)

import { create } from 'zustand'
import toast from 'react-hot-toast'
import { portalFetch } from '../pages/customer/utils/api'

// 'system' হলে OS/ব্রাউজার প্রেফারেন্স অনুযায়ী light/dark রেজল্ভ হয়
function resolveTheme(theme) {
  if (theme === 'system') {
    try {
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
    } catch { return 'light' }
  }
  return theme
}

// পুরনো localStorage key থেকে এক-বারের migration — backend-এ এখনো row না
// থাকলে ব্যবহারকারীর আগে থেকে বেছে নেওয়া থিম হারিয়ে না যায়
function getLegacyLocalTheme() {
  try {
    const saved = window.localStorage.getItem('cp_darkMode')
    if (saved === null) return null
    return saved === 'true' ? 'dark' : 'light'
  } catch { return null }
}

export const usePreferencesStore = create((set, get) => ({
  theme:              'system',   // 'light' | 'dark' | 'system'
  resolvedTheme:      'light',    // 'system' রেজল্ভ হওয়ার পর — এটাই UI ব্যবহার করবে
  language:           'bn',       // 'bn' | 'en'
  notification_prefs: null,
  loaded:             false,
  loading:            false,

  // CustomerLayout mount হওয়ার সময় একবার কল হয়
  load: async () => {
    if (get().loading || get().loaded) return
    set({ loading: true })
    try {
      const res  = await portalFetch('/portal/profile/preferences')
      const data = res.data || {}

      let theme = data.theme || 'system'
      // updated_at===null মানে backend-এ কোনো row নেই — legacy localStorage
      // ভ্যালু থাকলে সেটাই আসল পছন্দ হিসেবে ধরে নেওয়া হচ্ছে
      const isFirstLoad = !data.updated_at
      if (isFirstLoad) {
        const legacy = getLegacyLocalTheme()
        if (legacy) theme = legacy
      }

      set({
        theme,
        resolvedTheme:      resolveTheme(theme),
        language:           data.language || 'bn',
        notification_prefs: data.notification_prefs || null,
        loaded:             true,
        loading:            false,
      })

      // legacy মান দিয়ে backend-এ প্রথমবার সেভ — best-effort, UI ব্লক করে না
      if (isFirstLoad && theme !== 'system') {
        portalFetch('/portal/profile/preferences', {
          method: 'PUT',
          body:   JSON.stringify({ theme }),
        }).catch(() => {})
      }
    } catch {
      // অফলাইন/এরর হলেও ডিফল্ট ('system') দিয়ে UI চলবে, ব্লক করবে না
      set({ loaded: true, loading: false })
    }
  },

  setTheme: (theme) => {
    const prev = { theme: get().theme, resolvedTheme: get().resolvedTheme }
    set({ theme, resolvedTheme: resolveTheme(theme) }) // optimistic — সাথে সাথে UI বদলায়
    portalFetch('/portal/profile/preferences', {
      method: 'PUT',
      body:   JSON.stringify({ theme }),
    }).catch(() => {
      set(prev)
      toast.error('থিম সংরক্ষণ করা যায়নি, আবার চেষ্টা করুন।')
    })
  },

  setLanguage: (language) => {
    const prev = get().language
    set({ language }) // optimistic
    portalFetch('/portal/profile/preferences', {
      method: 'PUT',
      body:   JSON.stringify({ language }),
    }).catch(() => {
      set({ language: prev })
      toast.error('ভাষা সংরক্ষণ করা যায়নি, আবার চেষ্টা করুন।')
    })
  },

  setNotificationPref: (category, channel, value) => {
    const prevPrefs = get().notification_prefs
    const nextPrefs = {
      ...prevPrefs,
      [category]: { ...(prevPrefs?.[category] || {}), [channel]: value },
    }
    set({ notification_prefs: nextPrefs }) // optimistic
    portalFetch('/portal/profile/preferences', {
      method: 'PUT',
      body:   JSON.stringify({ notification_prefs: { [category]: nextPrefs[category] } }),
    }).then(res => {
      // ✅ সার্ভার security ক্যাটাগরির জন্য কমপক্ষে push=true force করে দিতে
      // পারে — response দিয়ে সিঙ্ক করে নেওয়া, শুধু optimistic ভ্যালুতে ভরসা না করে
      if (res?.data?.notification_prefs) set({ notification_prefs: res.data.notification_prefs })
    }).catch(() => {
      set({ notification_prefs: prevPrefs })
      toast.error('পছন্দ সংরক্ষণ করা যায়নি, আবার চেষ্টা করুন।')
    })
  },
}))
