import React, { useEffect, useRef, useState } from 'react'
import { ref, onValue, off, set, serverTimestamp } from 'firebase/database'
import { db, firebaseReady } from './config'
import { useFCMToken } from './useFCMToken'
import { useAuthStore } from '../store/auth.store'
import { useAppStore }  from '../store/app.store'
import toast from 'react-hot-toast'

// ============================================================
// Firebase Realtime Notification System
// NovaTechBD Management System
// ============================================================

export function useFirebaseNotifications() {
  const { user }          = useAuthStore()
  const { addNotification, setAIInsights } = useAppStore()
  const listenersRef      = useRef([])

  useEffect(() => {
    if (!user?.id) return
    if (!firebaseReady || !db) return  // ⚠️ Firebase env vars নেই — skip

    // সব পুরনো listener বন্ধ করো
    listenersRef.current.forEach(({ ref: r, handler }) => off(r, 'value', handler))
    listenersRef.current = []

    // ── ১. অর্ডার নোটিফিকেশন (Manager এর জন্য) ──
    if (['manager', 'supervisor', 'admin'].includes(user.role)) {
      const ordersRef = ref(db, `notifications/${user.id}/orders`)
      const orderHandler = (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data || data.read) return

          addNotification({
            id:      child.key,
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

          set(child.ref, { ...data, read: true })
        })
      }

      // ✅ FIX: onlyOnce সরানো হয়েছে — persistent listener, নতুন order এলে real-time পাবে
      const unsubOrders = onValue(ordersRef, orderHandler)
      listenersRef.current.push({ ref: ordersRef, handler: orderHandler, unsub: unsubOrders })
    }

    // ── ২. Settlement নোটিফিকেশন (Manager এর জন্য) ──
    if (['manager', 'supervisor', 'admin'].includes(user.role)) {
      const settlementsRef = ref(db, `notifications/${user.id}/settlements`)
      const settlementHandler = (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data || data.read) return

          addNotification({
            id:      child.key,
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

          set(child.ref, { ...data, read: true })
        })
      }
      // ✅ FIX: persistent listener
      const unsubSettlements = onValue(settlementsRef, settlementHandler)
      listenersRef.current.push({ ref: settlementsRef, handler: settlementHandler, unsub: unsubSettlements })
    }

    // ── ৩. Approval নোটিফিকেশন (Worker এর জন্য) ──
    // ✅ FIX: onlyOnce ছিল — approve/reject real-time আসত না।
    // এখন persistent listener। নতুন approval এলেই store + toast + dashboard badge update হবে।
    if (user.role === 'worker') {
      const approvalsRef = ref(db, `notifications/${user.id}/approvals`)
      const approvalHandler = (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data || data.read) return

          addNotification({
            id:      child.key,
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

          set(child.ref, { ...data, read: true })
        })
      }
      const unsubApprovals = onValue(approvalsRef, approvalHandler)
      listenersRef.current.push({ ref: approvalsRef, handler: approvalHandler, unsub: unsubApprovals })
    }

    // ── ৪. Settlement approval (Worker এর জন্য) ──
    if (user.role === 'worker') {
      const settlementRef = ref(db, `notifications/${user.id}/settlement`)
      const settlWorkerHandler = (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data || data.read) return

          addNotification({
            id:      child.key,
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

          set(child.ref, { ...data, read: true })
        })
      }
      // ✅ FIX: persistent listener
      const unsubSettlWorker = onValue(settlementRef, settlWorkerHandler)
      listenersRef.current.push({ ref: settlementRef, handler: settlWorkerHandler, unsub: unsubSettlWorker })
    }

    // ── ৫. Bonus নোটিফিকেশন (Worker এর জন্য) ──
    if (user.role === 'worker') {
      const bonusRef = ref(db, `notifications/${user.id}/bonus`)
      const bonusHandler = (snapshot) => {
        snapshot.forEach(child => {
          const data = child.val()
          if (!data || data.read) return

          addNotification({
            id:      child.key,
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

          set(child.ref, { ...data, read: true })
        })
      }
      // ✅ FIX: persistent listener
      const unsubBonus = onValue(bonusRef, bonusHandler)
      listenersRef.current.push({ ref: bonusRef, handler: bonusHandler, unsub: unsubBonus })
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
      const unsubLiveAtt = onValue(liveAttRef, liveAttHandler)
      listenersRef.current.push({ ref: liveAttRef, handler: liveAttHandler, unsub: unsubLiveAtt })
    }

    // ✅ FIX: সব listener এখন persistent — unsub() দিয়ে cleanup
    return () => {
      listenersRef.current.forEach(({ unsub, ref: r, handler }) => {
        try {
          if (typeof unsub === 'function') unsub()
          else off(r, 'value', handler)
        } catch {}
      })
      listenersRef.current = []
    }
  }, [user?.id])
}

// ============================================================
// useOnlinePresence Hook
// ============================================================

export function useOnlinePresence() {
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user?.id) return
    if (!firebaseReady || !db) return  // ⚠️ Firebase env vars নেই — skip

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
// ============================================================

export function useTeamPresence(workerIds = []) {
  const [presence, setPresence] = useState({})

  useEffect(() => {
    if (!workerIds.length) return
    if (!firebaseReady || !db) return  // ⚠️ Firebase guard

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
// ============================================================

export function FirebaseProvider({ children }) {
  useFirebaseNotifications()
  useOnlinePresence()
  useFCMToken()
  return React.createElement(React.Fragment, null, children)
}
