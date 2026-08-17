// chat/api/chatApi.js
//
// Staff আর Customer পোর্টাল দুটো সম্পূর্ণ আলাদা REST ক্লায়েন্ট ব্যবহার করে
// (axios `api` ইনস্ট্যান্স vs fetch-বেসড `portalFetch`) এবং আলাদা এন্ডপয়েন্ট
// নেমস্পেস (/api/chat vs /api/portal/chat)। এই adapter দুটোকেই একই শেপে
// normalize করে, যাতে useChatEngine/usePresence হুকগুলো role-agnostic
// থাকতে পারে — একই হুক staff আর customer দুই পাশেই চলবে, ডুপ্লিকেট
// ইমপ্লিমেন্টেশন লাগবে না।
//
// ⚠️ ইচ্ছাকৃতভাবে normalize করা হয়নি: থ্রেড-লিস্ট। staff পায় flat personal/
// support লিস্ট (তার কাস্টমাররা), customer পায় per-company সারি (তার
// কোম্পানিগুলো, প্রতিটায় personal+support সাব-থ্রেড নেস্টেড) — এটা সত্যিকারের
// আলাদা mental model (দেখুন customerPortalChat.controller.js-এর
// listAllThreads), জোর করে এক শেপে গুঁজলে UX-ই খারাপ হতো। তাই লিস্ট-লোডিং
// এখনো role-নির্দিষ্ট মেথড হিসেবেই থাকছে; কনভারসেশন-সাইড (মেসেজ/প্রেজেন্স/
// টাইপিং/রিড — যেটা আসল জটিলতা) পুরোপুরি শেয়ার্ড।

import api from '../../api/axios'
import { portalFetch } from '../../pages/customer/utils/api'

function createStaffChatApi() {
  return {
    role: 'staff',

    async getFirebaseToken() {
      const res = await api.get('/chat/firebase-token')
      return res.data.data.token
    },

    async listThreads(type) {
      const res = await api.get('/chat/threads', { params: { type } })
      return res.data.data || []
    },

    async markRead(threadId) {
      await api.patch(`/chat/threads/${threadId}/read`)
    },

    async notify(threadId, preview) {
      await api.post(`/chat/threads/${threadId}/notify`, { preview })
    },
  }
}

function createCustomerChatApi() {
  return {
    role: 'customer',

    async getFirebaseToken() {
      const res = await portalFetch('/portal/chat/firebase-token')
      return res.data.token
    },

    async listAllThreads() {
      const res = await portalFetch('/portal/chat/all-threads')
      return res.data || []
    },

    async ensureThreads(connectionId) {
      const res = await portalFetch('/portal/chat/threads/ensure', {
        method: 'POST',
        body: JSON.stringify({ connectionId }),
      })
      return res.data
    },

    async markRead(threadId) {
      await portalFetch(`/portal/chat/threads/${threadId}/read`, { method: 'PATCH' })
    },

    async notify(threadId, preview) {
      await portalFetch(`/portal/chat/threads/${threadId}/notify`, {
        method: 'POST',
        body: JSON.stringify({ preview }),
      })
    },
  }
}

export function createChatApi(role) {
  if (role === 'staff') return createStaffChatApi()
  if (role === 'customer') return createCustomerChatApi()
  throw new Error(`[chatApi] অজানা role: ${role}`)
}
