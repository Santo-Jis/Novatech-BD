import { useEffect, useRef } from 'react'
import { db } from '../firebase/config'
import { ref, onDisconnect, set, remove } from 'firebase/database'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'

const INTERVAL_MS = 30_000  // ৩০ সেকেন্ড

// ============================================================
// useLiveTracking — Worker GPS ট্র্যাকিং Hook
//
// ✅ FIX: Firebase Client SDK-এর onDisconnect() যোগ করা হয়েছে।
//
// আগের সমস্যা:
//   শুধু beforeunload event ছিল। Browser crash বা network cut
//   হলে event fire হতো না — Firebase-এ পুরনো location থেকে
//   যেত এবং Manager stale data দেখত।
//
// এখন কীভাবে কাজ করে:
//   Firebase server-কে আগেই বলে রাখা হয় — "আমি disconnect
//   হলে liveLocations এবং presence আপনি নিজে মুছে দিও।"
//   Browser crash বা network cut যাই হোক, Firebase server
//   disconnect বুঝলেই automatically cleanup করবে।
// ============================================================

export function useLiveTracking() {
    const { user, token } = useAuthStore()
    const intervalRef     = useRef(null)
    const isWorker        = user?.role === 'worker'

    const sendLocation = () => {
        if (!token || !isWorker) return
        if (!navigator.geolocation) return

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude, accuracy } = pos.coords
                try {
                    await api.post('/location/update', { latitude, longitude, accuracy })
                } catch {
                    // Silent fail
                }
            },
            (err) => {
                console.warn('GPS error:', err.message)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }

    useEffect(() => {
        if (!isWorker || !token || !user?.id) return

        const userId = user.id

        // ── Firebase onDisconnect() setup ─────────────────────
        // Server-কে আগেই instruction দেওয়া হচ্ছে:
        // disconnect হলে এই দুটো node নিজে মুছে দাও
        const liveLocationRef = ref(db, `liveLocations/${userId}`)
        const presenceRef     = ref(db, `presence/${userId}`)

        // Disconnect হলে Firebase server নিজে এটা করবে
        onDisconnect(liveLocationRef).remove()
        onDisconnect(presenceRef).set({ online: false, lastSeen: Date.now() })

        // Presence: অনলাইন
        set(presenceRef, { online: true, lastSeen: Date.now() }).catch(() => {})
        api.post('/location/presence', { online: true }).catch(() => {})

        // প্রথমবার সাথে সাথে পাঠাও
        sendLocation()

        // প্রতি ৩০ সেকেন্ডে পাঠাও
        intervalRef.current = setInterval(sendLocation, INTERVAL_MS)

        // beforeunload — normal close/refresh-এ clean exit
        const handleUnload = () => {
            const data = JSON.stringify({ online: false })
            if (navigator.sendBeacon) {
                const blob = new Blob([data], { type: 'application/json' })
                navigator.sendBeacon(
                    `${import.meta.env.VITE_API_URL || ''}/api/location/presence`,
                    blob
                )
            }
        }

        window.addEventListener('beforeunload', handleUnload)

        return () => {
            clearInterval(intervalRef.current)
            window.removeEventListener('beforeunload', handleUnload)

            // Normal logout/unmount — onDisconnect cancel করো
            // কারণ আমরা নিজেই clean করছি, server-এর দরকার নেই
            onDisconnect(liveLocationRef).cancel()
            onDisconnect(presenceRef).cancel()

            remove(liveLocationRef).catch(() => {})
            set(presenceRef, { online: false, lastSeen: Date.now() }).catch(() => {})
            api.post('/location/presence', { online: false }).catch(() => {})
        }
    }, [isWorker, token, user?.id])
}
