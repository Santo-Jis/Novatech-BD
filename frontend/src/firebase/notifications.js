import React, { useEffect, useRef, useState } from 'react'
import { ref, onValue, off, set, serverTimestamp } from 'firebase/database'
import { db } from './config'
import { useFCMToken } from './useFCMToken'           // ← NEW
import { useAuthStore } from '../store/auth.store'
import { useAppStore }  from '../store/app.store'
import toast from 'react-hot-toast'

// ============================================================
// Firebase Realtime Notification System
// NovaTechBD Management System
// ============================================================

// ============================================================
// useFirebaseNotifications Hook
// App.jsx এ একবার mount করলে সব নোটিফিকেশন পাওয়া যাবে
// ============================================================

export function useFirebaseNotifications() {
  const { user }          = useAuthStore()
  const { addNotification, setAIInsights } = useAppStore()
  const listenersRef      = useRef([])

  useEffect(() => {
    if (!user?.id) return

    // সব পুরনো listener বন্ধ করো
    // ✅ FIX: subscribe হয়েছে 'value' event-এ, তাই off() ও 'value' দিয়ে।
    // আগে 'child_added' লেখা ছিল — wrong event, listener detach হত না।
    listenersRef.current.forEach(({ ref: r, handler }) => off(r, 'value', handler))
    listenersRef.current = []

    // ── ১. অর্ডার নোটিফিকেশন (Manager এর জন্য) ──
    if (['manager', 'supervisor', 'admin'].includes(user.role)) {
      const ordersRef = ref(db, `notifications/${user.id}/orders`)
      const orderHandler = (snapshot) => {
        const data = snapshot.val()
        if (!data) return

        addNotification({
          id:      snapshot.key,
          type:    'order',
          title:   'নতুন অর্ডার',
          message: data.message || `নতুন অর্ডার এসেছে`,
          time:    new Date().toISOString(),
          read:    false,
          data
        })

        toast(`📦 ${data.message}`, {
          duration: 5000,
          style: { background: '#1e3a8a', color: '#fff' }
        })

        // নোটিফিকেশন পড়া হয়েছে চিহ্নিত করো
        set(snapshot.ref, { ...data, read: true })
      }

      onValue(ordersRef, (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data?.read) orderHandler(child)
        })
      }, { onlyOnce: true })

      listenersRef.current.push({ ref: ordersRef, handler: orderHandler })
    }

    // ── ২. Settlement নোটিফিকেশন (Manager এর জন্য) ──
    if (['manager', 'supervisor', 'admin'].includes(user.role)) {
      const settlementsRef = ref(db, `notifications/${user.id}/settlements`)
      const settlementHandler = (snapshot) => {
        const data = snapshot.val()
        if (!data || data.read) return

        addNotification({
          id:      snapshot.key,
          type:    'settlement',
          title:   'হিসাব জমা',
          message: data.message,
          time:    new Date().toISOString(),
          read:    false,
          data
        })

        const toastStyle = data.hasShortage
          ? { background: '#991b1b', color: '#fff' }
          : { background: '#065f46', color: '#fff' }

        toast(data.hasShortage ? `⚠️ ${data.message}` : `✅ ${data.message}`, {
          duration: 5000,
          style: toastStyle
        })

        set(snapshot.ref, { ...data, read: true })
      }
      onValue(settlementsRef, (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data?.read) settlementHandler(child)
        })
      }, { onlyOnce: true })
      listenersRef.current.push({ ref: settlementsRef, handler: settlementHandler })
    }

    // ── ৩. Approval নোটিফিকেশন (Worker এর জন্য) ──
    if (user.role === 'worker') {
      const approvalsRef = ref(db, `notifications/${user.id}/approvals`)
      const approvalHandler = (snapshot) => {
        const data = snapshot.val()
        if (!data || data.read) return

        addNotification({
          id:      snapshot.key,
          type:    'approval',
          title:   data.status === 'approved' ? '✅ অনুমোদন' : '❌ বাতিল',
          message: data.message,
          time:    new Date().toISOString(),
          read:    false,
          data
        })

        toast(data.message, {
          duration: 6000,
          style: {
            background: data.status === 'approved' ? '#065f46' : '#991b1b',
            color: '#fff'
          }
        })

        set(snapshot.ref, { ...data, read: true })
      }
      onValue(approvalsRef, (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data?.read) approvalHandler(child)
        })
      }, { onlyOnce: true })
      listenersRef.current.push({ ref: approvalsRef, handler: approvalHandler })
    }

    // ── ৪. Settlement approval (Worker এর জন্য) ──
    if (user.role === 'worker') {
      const settlementRef = ref(db, `notifications/${user.id}/settlement`)
      const settlWorkerHandler = (snapshot) => {
        const data = snapshot.val()
        if (!data || data.read) return

        addNotification({
          id:      snapshot.key,
          type:    'settlement_result',
          title:   'হিসাব আপডেট',
          message: data.message,
          time:    new Date().toISOString(),
          read:    false,
          data
        })

        toast(data.message, {
          duration: 6000,
          style: {
            background: data.status === 'approved' ? '#065f46' : '#d97706',
            color: '#fff'
          }
        })

        set(snapshot.ref, { ...data, read: true })
      }
      onValue(settlementRef, (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data?.read) settlWorkerHandler(child)
        })
      }, { onlyOnce: true })
      listenersRef.current.push({ ref: settlementRef, handler: settlWorkerHandler })
    }

    // ── ৫. Bonus নোটিফিকেশন (Worker এর জন্য) ──
    if (user.role === 'worker') {
      const bonusRef = ref(db, `notifications/${user.id}/bonus`)
      const bonusHandler = (snapshot) => {
        const data = snapshot.val()
        if (!data || data.read) return

        addNotification({
          id:      snapshot.key,
          type:    'bonus',
          title:   '🎉 বোনাস পেয়েছেন!',
          message: data.message,
          time:    new Date().toISOString(),
          read:    false,
          data
        })

        toast(`🎉 ${data.message}`, {
          duration: 8000,
          style: { background: '#d97706', color: '#fff' }
        })

        set(snapshot.ref, { ...data, read: true })
      }
      onValue(bonusRef, (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data?.read) bonusHandler(child)
        })
      }, { onlyOnce: true })
      listenersRef.current.push({ ref: bonusRef, handler: bonusHandler })
    }

    // ── ৬. লাইভ হাজিরা আপডেট (Manager এর জন্য) ──
    if (['manager', 'supervisor', 'admin'].includes(user.role)) {
      const today       = new Date().toISOString().split('T')[0]
      const liveAttRef  = ref(db, `live/attendance/${today}`)

      const liveAttHandler = (snapshot) => {
        const data = snapshot.val()
        if (data) {
          addNotification({
            id:      `live_att_${Date.now()}`,
            type:    'live_attendance',
            title:   'হাজিরা আপডেট',
            message: `${data.name} ${data.status === 'present' ? 'চেক-ইন' : 'চেক-আউট'} করেছে`,
            time:    new Date().toISOString(),
            read:    true,
            data
          })
        }
      }
      onValue(liveAttRef, liveAttHandler)
      listenersRef.current.push({ ref: liveAttRef, handler: liveAttHandler })
    }

    // Cleanup
    // ✅ FIX: onlyOnce listener গুলো (orders/settlements/approvals/bonus)
    // একবার fire করেই auto-detach হয় — এদের off() করার দরকার নেই।
    // listenersRef-এ শুধু persistent listener (liveAttHandler) থাকে।
    // সেটার জন্য off(r, 'value', handler) সঠিক।
    return () => {
      listenersRef.current.forEach(({ ref: r, handler }) => {
        try { off(r, 'value', handler) } catch {}
      })
      listenersRef.current = []
    }
  }, [user?.id])
}

// ============================================================
// useOnlinePresence Hook
// ইউজার অনলাইন/অফলাইন ট্র্যাকিং
// ============================================================

export function useOnlinePresence() {
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user?.id) return

    const presenceRef    = ref(db, `presence/${user.id}`)
    const connectedRef   = ref(db, '.info/connected')

    const unsubscribe = onValue(connectedRef, async (snapshot) => {
      if (snapshot.val() === true) {
        try {
          await set(presenceRef, {
            online:    true,
            name:      user.name_bn,
            role:      user.role,
            lastSeen:  serverTimestamp()
          })

          const { onDisconnect } = await import('firebase/database')
          await onDisconnect(presenceRef).set({
            online:   false,
            name:     user.name_bn,
            role:     user.role,
            lastSeen: serverTimestamp()
          })
        } catch (e) {
          // Firebase presence write failed (permission_denied) — non-critical
        }
      }
    })

    return () => {
      // ✅ FIX: onValue() একটি unsubscribe function return করে।
      // off(ref, event, fn) এ সেটাকে handler হিসেবে দেওয়া ভুল —
      // listener detach হয় না, memory leak হয়।
      // সঠিক পদ্ধতি: unsubscribe() সরাসরি call করো।
      unsubscribe()
      set(presenceRef, {
        online:   false,
        name:     user.name_bn,
        role:     user.role,
        lastSeen: serverTimestamp()
      }).catch(() => {})
    }
  }, [user?.id])
}

// ============================================================
// useTeamPresence Hook
// Manager এর টিম অনলাইন কিনা দেখা
// ============================================================

export function useTeamPresence(workerIds = []) {
  const [presence, setPresence] = useState({})

  useEffect(() => {
    if (!workerIds.length) return

    const listeners = workerIds.map(id => {
      const presRef = ref(db, `presence/${id}`)
      const handler = (snapshot) => {
        setPresence(prev => ({ ...prev, [id]: snapshot.val() }))
      }
      onValue(presRef, handler)
      return { ref: presRef, handler }
    })

    return () => {
      listeners.forEach(({ ref: r, handler }) => off(r, 'value', handler))
    }
  }, [workerIds.join(',')])

  return presence
}

// ============================================================
// Firebase নোটিফিকেশন Provider Component
// App.jsx এ wrap করতে হবে
// ── পরিবর্তন: useFCMToken() এখানে যোগ করা হয়েছে ──
// ============================================================

export function FirebaseProvider({ children }) {
  useFirebaseNotifications()
  useOnlinePresence()
  useFCMToken()                    // ← NEW: FCM token register + foreground handler
  return React.createElement(React.Fragment, null, children)
}
