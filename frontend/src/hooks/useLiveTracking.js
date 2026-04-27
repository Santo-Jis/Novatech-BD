import { useEffect, useRef } from 'react'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'

const INTERVAL_MS = 30_000  // ৩০ সেকেন্ড

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
        if (!isWorker || !token) return

        // Presence: অনলাইন
        api.post('/location/presence', { online: true }).catch(() => {})

        // প্রথমবার সাথে সাথে পাঠাও
        sendLocation()

        // প্রতি ৩০ সেকেন্ডে — স্থির থাকলেও পাঠাও
        intervalRef.current = setInterval(sendLocation, INTERVAL_MS)

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
            api.post('/location/presence', { online: false }).catch(() => {})
        }
    }, [isWorker, token])
}
