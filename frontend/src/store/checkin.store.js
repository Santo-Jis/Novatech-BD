import { create } from 'zustand'
import api from '../api/axios'

// ============================================================
// Checkin Store — Zustand
// আজকের checkin status — WorkerLayout, CustomerList, Settlement —
// সবাই এই একই store শেয়ার করে। একই দিনে একবারই API call হয়
// (date-based cache), তারপর সবাই cache থেকে পড়ে।
//
// আগে এই cache শুধু WorkerLayout.jsx-এর ভেতরে local ছিল
// (useRef + component state) — অন্য পেজ থেকে পড়া যেত না।
// এখন module-level store বলে যেকোনো পেজ থেকে read/subscribe করা যায়।
//
// ✅ markCheckedIn(): Attendance.jsx-এ checkin সফল হলে সরাসরি call
// করলে আর নতুন API call ছাড়াই সব জায়গায় (header popup, customer
// list banner, settlement banner) সাথে সাথে আপডেট হয়ে যায়।
// (আগে window.__refreshCheckin() হুক এর জন্য বানানো হয়েছিল কিন্তু
// Attendance.jsx থেকে কখনো call করা হতো না — এটা সেই bug-ও ফিক্স করে।)
// ============================================================

const getTodayDate = () => new Date().toISOString().slice(0, 10)

export const useCheckinStore = create((set, get) => ({
  checkedIn:       null,  // null = এখনো জানা নেই/লোডিং, true/false = জানা আছে
  lastFetchedDate: null,

  // Cache-aware fetch — একই দিনে বারবার call হলেও নতুন API hit হবে না,
  // যদি না force=true দেওয়া হয়।
  fetchStatus: async (force = false) => {
    const today = getTodayDate()
    const { lastFetchedDate, checkedIn } = get()

    if (!force && lastFetchedDate === today && checkedIn !== null) {
      return checkedIn // cache hit
    }

    try {
      const res   = await api.get('/sales/today-summary')
      const value = res.data.data?.checked_in ?? false
      set({ checkedIn: value, lastFetchedDate: today })
      return value
    } catch {
      // নেটওয়ার্ক/সার্ভার এরর হলে নিরাপদ ধরে নিই: checked_in = false
      // (action button disabled থাকবে, কিন্তু ভুল করে enable হয়ে যাবে না)
      set({ checkedIn: false, lastFetchedDate: today })
      return false
    }
  },

  // Attendance.jsx-এ checkin সফল হওয়ার সাথে সাথে call করো (optimistic update)
  markCheckedIn: () => set({ checkedIn: true, lastFetchedDate: getTodayDate() }),
}))
