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

    // ── Phase 2: বিজনেস কার্ড (staff-only এই সেশনে) ──
    async getDueCard(customerId) {
      const res = await api.get(`/chat/cards/due/${customerId}`)
      return res.data.data
    },
    async getDeliveries(customerId) {
      // বিদ্যমান এন্ডপয়েন্ট রিইউজ — নতুন ব্যাকএন্ড লাগেনি (দেখুন README-এর tenant-check নোট)
      const res = await api.get(`/deliveries/customer/${customerId}`)
      return res.data.data
    },

    // ── Phase 3: ইন্টারনাল নোট (staff-only, RTDB-এর সম্পূর্ণ বাইরে) ──
    async listNotes(threadId) {
      const res = await api.get(`/chat/threads/${threadId}/notes`)
      return res.data.data
    },
    async addNote(threadId, text, mentionedUserIds = []) {
      const res = await api.post(`/chat/threads/${threadId}/notes`, { text, mentionedUserIds })
      return res.data.data
    },
    async listTeamMembers() {
      const res = await api.get('/chat/team-members')
      return res.data.data
    },

    // ── Phase 3, Session 2: SLA + অডিট ──
    async flagMessage(threadId, clientId, flagType, text) {
      const res = await api.post(`/chat/threads/${threadId}/flag`, { clientId, flagType, text })
      return res.data.data
    },
    async getSlaStats(days = 7) {
      const res = await api.get('/chat/sla/stats', { params: { days } })
      return res.data.data
    },
    async listFlaggedMessages(days = 30) {
      const res = await api.get('/chat/flagged', { params: { days } })
      return res.data.data
    },

    // ── Phase 3, Session 3: ব্রডকাস্ট ──
    async listRoutes() {
      const res = await api.get('/routes')
      return res.data.data
    },
    async listRouteCustomers(routeId) {
      const res = await api.get(`/routes/${routeId}/customers`)
      return res.data.data
    },
    async resolveBroadcastRecipients(customerIds) {
      const res = await api.post('/chat/broadcast/resolve', { customerIds })
      return res.data.data
    },
    async logBroadcast(text, totalRecipients, successCount) {
      const res = await api.post('/chat/broadcast/log', { text, totalRecipients, successCount })
      return res.data.data
    },

    // ── Phase 4: AI কোপাইলট (on-demand) ──
    async draftReply(recentMessages, customerName) {
      const res = await api.post('/chat/ai/draft-reply', { recentMessages, customerName })
      return res.data.data
    },
    async summarizeThread(recentMessages, customerName) {
      const res = await api.post('/chat/ai/summarize', { recentMessages, customerName })
      return res.data.data
    },
    async checkRisk(recentMessages, customerName) {
      const res = await api.post('/chat/ai/risk-check', { recentMessages, customerName })
      return res.data.data
    },

    // ── Phase 1 (দেরিতে): ভয়েস নোট ──
    async uploadVoice(threadId, blob, durationSeconds) {
      const formData = new FormData()
      formData.append('audio', blob, 'voice.webm')
      formData.append('durationSeconds', String(durationSeconds))
      const res = await api.post(`/chat/threads/${threadId}/voice`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data.data
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

    // ── Phase 1 (দেরিতে): ভয়েস নোট — portalFetch এখন FormData সঠিকভাবে
    // হ্যান্ডল করে (Content-Type জোর করে বসায় না FormData body-তে) ──
    async uploadVoice(threadId, blob, durationSeconds) {
      const formData = new FormData()
      formData.append('audio', blob, 'voice.webm')
      formData.append('durationSeconds', String(durationSeconds))
      const res = await portalFetch(`/portal/chat/threads/${threadId}/voice`, {
        method: 'POST',
        body: formData,
      })
      return res.data
    },
  }
}

export function createChatApi(role) {
  if (role === 'staff') return createStaffChatApi()
  if (role === 'customer') return createCustomerChatApi()
  throw new Error(`[chatApi] অজানা role: ${role}`)
}
