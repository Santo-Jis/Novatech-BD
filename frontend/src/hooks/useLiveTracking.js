import { useEffect, useRef, useState } from 'react'
import { db } from '../firebase/config'
import { ref, onDisconnect, set, remove } from 'firebase/database'
import api from '../api/axios'
import { useAuthStore } from '../store/auth.store'
import toast from 'react-hot-toast'

const INTERVAL_MS = 30_000  // ৩০ সেকেন্ড

// GPS error code → বাংলা বার্তা
const GPS_ERRORS = {
    1: 'GPS Permission নেই। Settings থেকে Location চালু করুন।',  // PERMISSION_DENIED
    2: 'GPS সিগন্যাল পাওয়া যাচ্ছে না।',                          // POSITION_UNAVAILABLE
    3: 'GPS timeout হয়েছে। নেটওয়ার্ক চেক করুন।',                 // TIMEOUT
}

// ============================================================
// useLiveTracking — Worker GPS ট্র্যাকিং Hook
// GPS error হলে:
//   ১. SR-এর ফোনে toast notification দেখাবে
//   ২. Firebase-এ gpsError status রাখবে — Manager দেখতে পাবে
//   ৩. Error ঠিক হলে নিজেই আবার normal হবে
// ============================================================

export function useLiveTracking() {
    const { user, token }   = useAuthStore()
    const intervalRef       = useRef(null)
    const gpsErrorRef       = useRef(null)   // চলমান error code track করতে
    const isWorker          = user?.role === 'worker'

    const handleGpsError = async (err, userId) => {
        const code    = err.code  // 1, 2, বা 3
        const message = GPS_ERRORS[code] || 'GPS সমস্যা হয়েছে।'

        // একই error বারবার toast না দেখাতে
        if (gpsErrorRef.current !== code) {
            gpsErrorRef.current = code
            toast.error(message, { duration: 6000, id: 'gps-error' })
        }

        // Firebase-এ error status রাখো — Manager দেখবে
        try {
            await set(ref(db, `liveLocations/${userId}`), {
                gpsError: true,
                gpsErrorCode: code,
                gpsErrorMessage: message,
                updatedAt: Date.now(),
            })
        } catch { /* silent */ }
    }

    const sendLocation = (userId) => {
        if (!token || !isWorker) return

        if (!navigator.geolocation) {
            toast.error('এই ডিভাইসে GPS নেই।', { id: 'gps-error' })
            return
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                // ✅ Error ঠিক হয়েছে — error flag reset করো
                if (gpsErrorRef.current !== null) {
                    gpsErrorRef.current = null
                    toast.success('GPS আবার চালু হয়েছে।', { id: 'gps-error' })
                }

                const { latitude, longitude, accuracy } = pos.coords
                try {
                    await api.post('/location/update', { latitude, longitude, accuracy })
                } catch { /* silent */ }
            },
            (err) => handleGpsError(err, userId),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        )
    }

    useEffect(() => {
        if (!isWorker || !token || !user?.id) return

        const userId = user.id

        const liveLocationRef = ref(db, `liveLocations/${userId}`)
        const presenceRef     = ref(db, `presence/${userId}`)

        onDisconnect(liveLocationRef).remove()
        onDisconnect(presenceRef).set({ online: false, lastSeen: Date.now() })

        set(presenceRef, { online: true, lastSeen: Date.now() }).catch(() => {})
        api.post('/location/presence', { online: true }).catch(() => {})

        sendLocation(userId)
        intervalRef.current = setInterval(() => sendLocation(userId), INTERVAL_MS)

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
            onDisconnect(liveLocationRef).cancel()
            onDisconnect(presenceRef).cancel()
            remove(liveLocationRef).catch(() => {})
            set(presenceRef, { online: false, lastSeen: Date.now() }).catch(() => {})
            api.post('/location/presence', { online: false }).catch(() => {})
        }
    }, [isWorker, token, user?.id])
}
