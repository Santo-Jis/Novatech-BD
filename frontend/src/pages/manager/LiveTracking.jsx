import { useEffect, useRef, useState, useCallback } from 'react'
import { db } from '../../firebase/config'
import { ref, onValue, off } from 'firebase/database'
import { FiMapPin, FiUsers, FiWifi, FiWifiOff, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi'
import api from '../../api/axios'

// ============================================================
// Manager Live Tracking Page
// Firebase Realtime DB trigger করে, Backend থেকে filtered
// লোকেশন আনে — Manager শুধু নিজের SR দেখবে
// ============================================================

// userId থেকে consistent color বের করো
// index-ভিত্তিক হলে SR অফলাইন হলে সবার color বদলে যায়
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16']
const getColorForUser = (userId) => {
    let hash = 0
    const str = String(userId)
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    return COLORS[Math.abs(hash) % COLORS.length]
}

// কতক্ষণ আগে আপডেট হয়েছে — human readable
const timeAgo = (timestamp) => {
    if (!timestamp) return 'অজানা'
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60)  return `${seconds} সেকেন্ড আগে`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60)  return `${minutes} মিনিট আগে`
    const hours = Math.floor(minutes / 60)
    return `${hours} ঘন্টা আগে`
}

// ৫ মিনিটের বেশি পুরনো হলে stale ধরবো
const isStale = (timestamp) => !timestamp || (Date.now() - timestamp) > 5 * 60 * 1000

export default function LiveTracking() {
    const mapRef        = useRef(null)
    const mapInstance   = useRef(null)
    const markers       = useRef({})
    const infoWindows   = useRef({})
    const mapReadyRef   = useRef(false)   // ✅ map ready কিনা track করতে ref ব্যবহার

    const [workers,    setWorkers]    = useState([])
    const [selected,   setSelected]   = useState(null)
    const [mapsLoaded, setMapsLoaded] = useState(false)
    const [mapError,   setMapError]   = useState(false)
    const [now,        setNow]        = useState(Date.now())

    // প্রতি ৩০ সেকেন্ডে "কতক্ষণ আগে" text আপডেট করো
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(timer)
    }, [])

    // ── ১. Backend থেকে Maps Key আনো, তারপর লোড করো ──────
    useEffect(() => {
        if (window.google?.maps) { setMapsLoaded(true); return }

        api.get('/location/maps-key')
            .then(res => {
                const key = res.data?.key
                if (!key) { setMapError(true); return }

                const script = document.createElement('script')
                script.src   = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker`
                script.async = true
                script.onload  = () => setMapsLoaded(true)
                script.onerror = () => setMapError(true)
                document.head.appendChild(script)
            })
            .catch(() => setMapError(true))
    }, [])

    // ── ২. ম্যাপ তৈরি করো ──────────────────────────────────
    useEffect(() => {
        if (!mapsLoaded || !mapRef.current || mapInstance.current) return

        mapInstance.current = new window.google.maps.Map(mapRef.current, {
            center: { lat: 23.8103, lng: 90.4125 },
            zoom: 12,
            mapId: 'NOVATECH_MAP',
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
            ],
        })
        mapReadyRef.current = true

        // ✅ KEY FIX: Map তৈরি হওয়ার পর আবার location আনো।
        // Firebase data আগেই এসেছিল কিন্তু map null ছিল তাই markers হয়নি।
        fetchLocations()
    }, [mapsLoaded, fetchLocations])

    // ── ৩. Backend থেকে filtered লোকেশন আনো ──────────────
    // ✅ FIX: আগে Firebase সরাসরি listen করত — সব SR দেখাত।
    // এখন Firebase শুধু trigger হিসেবে কাজ করে।
    // Actual data আসে Backend API থেকে — Manager শুধু
    // নিজের team-এর SR দেখবে, অন্যের SR নয়।
    const fetchLocations = useCallback(async () => {
        try {
            const res = await api.get('/location/team')
            if (!res.data?.success) return

            const list = (res.data.data || []).map(loc => ({
                ...loc,
                color: getColorForUser(loc.userId),  // ✅ userId hash থেকে consistent color
            }))
            setWorkers(list)
            updateMarkers(list)
        } catch (err) {
            console.error('Location fetch error:', err)
        }
    }, [])

    // ── ৪. Firebase change হলে Backend থেকে fresh data আনো ─
    useEffect(() => {
        const locationRef = ref(db, 'liveLocations')

        // প্রথমবার data আনো
        fetchLocations()

        // Firebase-এ যেকোনো change হলে Backend থেকে আবার আনো
        const unsubscribe = onValue(locationRef, () => {
            fetchLocations()
        })

        return () => off(locationRef, 'value', unsubscribe)
    }, [fetchLocations])

    // ── ৪. Markers আপডেট করো (AdvancedMarkerElement) ────────
    // ✅ FIX: পুরনো google.maps.Marker deprecated (v3.58+)
    //         নতুন AdvancedMarkerElement ব্যবহার করা হচ্ছে।
    //         SVG icon এখন DOM element হিসেবে দেওয়া হয় — আরও flexible।
    const updateMarkers = (list) => {
        if (!mapInstance.current) return

        const { AdvancedMarkerElement } = window.google.maps.marker
        const activeIds = new Set(list.map(w => w.userId))

        // অফলাইন SR-এর marker সরিয়ে দাও
        Object.keys(markers.current).forEach(id => {
            if (!activeIds.has(id)) {
                markers.current[id].map = null   // AdvancedMarker এভাবে remove করে
                delete markers.current[id]
                if (infoWindows.current[id]) {
                    infoWindows.current[id].close()
                    delete infoWindows.current[id]
                }
            }
        })

        list.forEach((worker) => {
            const pos = { lat: worker.latitude, lng: worker.longitude }

            // SVG DOM element — AdvancedMarkerElement-এ content হিসেবে দেওয়া হয়
            const makePinElement = () => {
                const div = document.createElement('div')
                div.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="54" viewBox="0 0 44 54"
                         style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); cursor: pointer;">
                        <circle cx="22" cy="22" r="20" fill="${worker.color}" stroke="white" stroke-width="3"/>
                        <text x="22" y="27" font-size="14" font-weight="bold" fill="white"
                            text-anchor="middle" font-family="Arial">
                            ${(worker.name_bn || worker.employee_code || '?').charAt(0)}
                        </text>
                        <polygon points="22,46 15,36 29,36" fill="${worker.color}"/>
                    </svg>
                `
                return div
            }

            if (markers.current[worker.userId]) {
                // Existing marker — position আপডেট
                markers.current[worker.userId].position = pos
            } else {
                // নতুন AdvancedMarkerElement তৈরি
                const marker = new AdvancedMarkerElement({
                    position: pos,
                    map: mapInstance.current,
                    title: worker.name_bn,
                    content: makePinElement(),
                })

                // InfoWindow
                const iw = new window.google.maps.InfoWindow({
                    content: buildInfoContent(worker),
                })

                marker.addListener('click', () => {
                    Object.values(infoWindows.current).forEach(w => w.close())
                    iw.open(mapInstance.current, marker)
                    setSelected(worker.userId)
                })

                markers.current[worker.userId]     = marker
                infoWindows.current[worker.userId] = iw
            }

            // InfoWindow content রিফ্রেশ
            if (infoWindows.current[worker.userId]) {
                infoWindows.current[worker.userId].setContent(buildInfoContent(worker))
            }
        })
    }

    const buildInfoContent = (w) => `
        <div style="font-family:sans-serif;padding:4px 2px;min-width:160px">
            <p style="font-weight:700;font-size:14px;margin:0 0 4px">${w.name_bn || ''}</p>
            <p style="font-size:12px;color:#6b7280;margin:0 0 2px">${w.employee_code || ''}</p>
            <p style="font-size:11px;color:#9ca3af;margin:0">
                ${w.latitude?.toFixed(5)}, ${w.longitude?.toFixed(5)}
            </p>
            <p style="font-size:11px;color:#9ca3af;margin:4px 0 0">
                ${w.updatedAt ? `🕐 ${timeAgo(w.updatedAt)}${isStale(w.updatedAt) ? ' ⚠️ পুরনো' : ''}` : ''}
            </p>
        </div>
    `

    // একটি SR-এর উপর ক্যামেরা নিয়ে যাও
    const focusWorker = (worker) => {
        if (!mapInstance.current) return
        mapInstance.current.panTo({ lat: worker.latitude, lng: worker.longitude })
        mapInstance.current.setZoom(16)
        Object.values(infoWindows.current).forEach(w => w.close())
        infoWindows.current[worker.userId]?.open(
            mapInstance.current,
            markers.current[worker.userId]
        )
        setSelected(worker.userId)
    }

    // সব SR একসাথে দেখানোর জন্য ম্যাপ fit করো
    const fitAll = () => {
        if (!mapInstance.current || workers.length === 0) return
        const bounds = new window.google.maps.LatLngBounds()
        workers.forEach(w => bounds.extend({ lat: w.latitude, lng: w.longitude }))
        mapInstance.current.fitBounds(bounds, 80)
    }

    // ── UI ──────────────────────────────────────────────────
    if (mapError) return (
        <div style={{ padding: 24, textAlign: 'center' }}>
            <FiMapPin style={{ fontSize: 48, color: '#ef4444', marginBottom: 12 }} />
            <h2 style={{ color: '#1f2937', marginBottom: 8 }}>Google Maps লোড হয়নি</h2>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
                Backend-এ <code>GOOGLE_MAPS_KEY</code> environment variable চেক করুন।
            </p>
        </div>
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>

            {/* ── Header bar ── */}
            <div style={{
                background: '#fff', borderBottom: '1px solid #e5e7eb',
                padding: '10px 16px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiUsers style={{ color: '#3b82f6' }} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>লাইভ ট্র্যাকিং</span>
                    <span style={{
                        background: workers.length > 0 ? '#dcfce7' : '#f3f4f6',
                        color: workers.length > 0 ? '#16a34a' : '#6b7280',
                        fontSize: 12, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 20,
                    }}>
                        {workers.length} জন অনলাইন
                    </span>
                </div>
                <button
                    onClick={fitAll}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: '#eff6ff', color: '#3b82f6', border: 'none',
                        padding: '6px 12px', borderRadius: 8, fontSize: 13,
                        fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    <FiRefreshCw style={{ fontSize: 13 }} />
                    সবাইকে দেখাও
                </button>
            </div>

            {/* ── Main area: Map + Sidebar ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Google Map */}
                <div ref={mapRef} style={{ flex: 1, background: '#e5e7eb' }}>
                    {!mapsLoaded && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <div style={{ textAlign: 'center', color: '#6b7280' }}>
                                <div style={{
                                    width: 40, height: 40, border: '4px solid #e5e7eb',
                                    borderTopColor: '#3b82f6', borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
                                }} />
                                <p style={{ fontSize: 14 }}>ম্যাপ লোড হচ্ছে...</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* SR List Sidebar */}
                <div style={{
                    width: 200, background: '#f9fafb',
                    borderLeft: '1px solid #e5e7eb',
                    overflowY: 'auto', flexShrink: 0,
                }}>
                    {workers.length === 0 ? (
                        <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                            <FiWifiOff style={{ fontSize: 28, marginBottom: 8, display: 'block', margin: '16px auto 8px' }} />
                            কোনো SR অনলাইন নেই
                        </div>
                    ) : workers.map(w => (
                        <div
                            key={w.userId}
                            onClick={() => focusWorker(w)}
                            style={{
                                padding: '12px 14px',
                                borderBottom: '1px solid #e5e7eb',
                                cursor: 'pointer',
                                background: selected === w.userId ? '#eff6ff' : '#fff',
                                transition: 'background 0.15s',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {/* Color dot */}
                                <div style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    background: w.color, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
                                }}>
                                    {(w.name_bn || '?').charAt(0)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {w.name_bn}
                                    </p>
                                    <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>
                                        {w.employee_code}
                                    </p>
                                </div>
                                {w.gpsError
                                    ? <FiAlertTriangle style={{ color: '#ef4444', flexShrink: 0, fontSize: 13 }} />
                                    : <FiWifi style={{ color: isStale(w.updatedAt) ? '#f59e0b' : '#10b981', flexShrink: 0, fontSize: 13 }} />
                                }
                            </div>
                            {w.gpsError && (
                                <p style={{ fontSize: 10, color: '#ef4444', margin: '6px 0 0', fontWeight: 600 }}>
                                    ⚠️ GPS বন্ধ
                                </p>
                            )}
                            {!w.gpsError && w.updatedAt && (
                                <p style={{ fontSize: 10, color: isStale(w.updatedAt) ? '#f59e0b' : '#9ca3af', margin: '6px 0 0' }}>
                                    🕐 {timeAgo(w.updatedAt)}
                                </p>
                            )}
                            
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    )
}
