import { useEffect, useRef } from 'react'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'

// ============================================================
// useLiveTracking — Worker-এর ব্যাকগ্রাউন্ড GPS Tracker
//
// WorkerLayout-এ একবার mount হয়, সারাদিন চলে।
// চেক-ইন করলে শুরু হয়, চেক-আউট / লগআউটে বন্ধ হয়।
// প্রতি ৩০ সেকেন্ডে একবার লোকেশন পাঠায়।
// ডিভাইস স্থির থাকলে (৫০মি এর কম নড়লে) পাঠায় না।
// ============================================================

const INTERVAL_MS     = 30_000  // ৩০ সেকেন্ড
const MIN_DISTANCE_M  = 20      // ২০ মিটারের কম নড়লে skip

// দুটো GPS পয়েন্টের দূরত্ব মিটারে হিসাব করো (Haversine)
function getDistanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function useLiveTracking() {
    const { user, token } = useAuthStore()
    const lastPos         = useRef(null)
    const intervalRef     = useRef(null)
    const isWorker        = user?.role === 'worker'

    const sendLocation = () => {
        if (!token || !isWorker) return
        if (!navigator.geolocation)  return

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude, accuracy } = pos.coords

                // স্থির থাকলে skip করো (ব্যাটারি + API বাঁচাও)
                if (lastPos.current) {
                    const dist = getDistanceM(
                        lastPos.current.lat, lastPos.current.lon,
                        latitude, longitude
                    )
                    if (dist < MIN_DISTANCE_M) return
                }

                try {
                    await api.post('/location/update', { latitude, longitude, accuracy })
                    lastPos.current = { lat: latitude, lon: longitude }
                } catch {
                    // Silent fail — offline হলে সমস্যা নেই
                }
            },
            () => {}, // GPS error — silent
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
        )
    }

    useEffect(() => {
        if (!isWorker || !token) return

        // Presence: অনলাইন
        api.post('/location/presence', { online: true }).catch(() => {})

        // প্রথম পাঠাও
        sendLocation()

        // প্রতি ৩০ সেকেন্ডে
        intervalRef.current = setInterval(sendLocation, INTERVAL_MS)

        // Page/Tab বন্ধ হলে অফলাইন সেট করো
        const handleUnload = () => {
            // Beacon API — async কিন্তু page close-এও কাজ করে
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
            api.post('/location/presence', { online: false }).catch(() => {})
        }
    }, [isWorker, token])
}
