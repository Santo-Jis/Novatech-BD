import { useEffect, useRef, useState } from 'react'
import { db } from '../../firebase/config'
import { ref, onValue, off } from 'firebase/database'
import { FiMapPin, FiUsers, FiWifi, FiWifiOff, FiRefreshCw } from 'react-icons/fi'

// ============================================================
// Manager Live Tracking Page
// Firebase Realtime DB থেকে সব SR-এর লোকেশন লাইভ দেখায়
// Google Maps JS API — ফ্রি টায়ারেই চলে
// ============================================================

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

// SR-এর জন্য রঙ
const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16']

export default function LiveTracking() {
    const mapRef       = useRef(null)
    const mapInstance  = useRef(null)
    const markers      = useRef({})          // { userId: google.maps.Marker }
    const infoWindows  = useRef({})

    const [workers,    setWorkers]    = useState([])   // Firebase-এর লাইভ ডেটা
    const [selected,   setSelected]   = useState(null)
    const [mapsLoaded, setMapsLoaded] = useState(false)
    const [mapError,   setMapError]   = useState(false)

    // ── ১. Google Maps JS লোড ──────────────────────────────
    useEffect(() => {
        if (window.google?.maps) { setMapsLoaded(true); return }
        if (!MAPS_API_KEY) { setMapError(true); return }

        const script = document.createElement('script')
        script.src   = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}`
        script.async = true
        script.onload  = () => setMapsLoaded(true)
        script.onerror = () => setMapError(true)
        document.head.appendChild(script)

        return () => { document.head.removeChild(script) }
    }, [])

    // ── ২. ম্যাপ তৈরি করো ──────────────────────────────────
    useEffect(() => {
        if (!mapsLoaded || !mapRef.current || mapInstance.current) return

        mapInstance.current = new window.google.maps.Map(mapRef.current, {
            center: { lat: 23.8103, lng: 90.4125 }, // ঢাকা
            zoom: 12,
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
            ],
        })
    }, [mapsLoaded])

    // ── ৩. Firebase থেকে রিয়েলটাইম লোকেশন শোনো ──────────
    useEffect(() => {
        const locationRef = ref(db, 'liveLocations')

        const unsubscribe = onValue(locationRef, (snapshot) => {
            const data = snapshot.val() || {}
            const list = Object.entries(data).map(([userId, loc], i) => ({
                userId,
                ...loc,
                color: COLORS[i % COLORS.length],
            }))
            setWorkers(list)
            updateMarkers(list)
        })

        return () => off(locationRef, 'value', unsubscribe)
    }, [mapsLoaded])

    // ── ৪. Markers আপডেট করো ───────────────────────────────
    const updateMarkers = (list) => {
        if (!mapInstance.current) return

        // নতুন userId-গুলো
        const activeIds = new Set(list.map(w => w.userId))

        // পুরনো marker সরিয়ে দাও (SR অফলাইন হলে)
        Object.keys(markers.current).forEach(id => {
            if (!activeIds.has(id)) {
                markers.current[id].setMap(null)
                delete markers.current[id]
                if (infoWindows.current[id]) {
                    infoWindows.current[id].close()
                    delete infoWindows.current[id]
                }
            }
        })

        list.forEach((worker) => {
            const pos = { lat: worker.latitude, lng: worker.longitude }

            // Custom SVG marker
            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="44" height="54" viewBox="0 0 44 54">
                    <circle cx="22" cy="22" r="20" fill="${worker.color}" stroke="white" stroke-width="3"/>
                    <text x="22" y="27" font-size="14" font-weight="bold" fill="white"
                        text-anchor="middle" font-family="Arial">
                        ${(worker.name_bn || worker.employee_code || '?').charAt(0)}
                    </text>
                    <polygon points="22,46 15,36 29,36" fill="${worker.color}"/>
                </svg>
            `
            const icon = {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                scaledSize: new window.google.maps.Size(44, 54),
                anchor: new window.google.maps.Point(22, 54),
            }

            if (markers.current[worker.userId]) {
                // Existing marker — শুধু position আপডেট
                markers.current[worker.userId].setPosition(pos)
            } else {
                // নতুন marker তৈরি
                const marker = new window.google.maps.Marker({
                    position: pos,
                    map: mapInstance.current,
                    title: worker.name_bn,
                    icon,
                    animation: window.google.maps.Animation.DROP,
                })

                // InfoWindow (ক্লিক করলে দেখাবে)
                const iw = new window.google.maps.InfoWindow({
                    content: buildInfoContent(worker),
                })

                marker.addListener('click', () => {
                    Object.values(infoWindows.current).forEach(w => w.close())
                    iw.open(mapInstance.current, marker)
                    setSelected(worker.userId)
                })

                markers.current[worker.userId]  = marker
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
                ${w.updatedAt ? '🕐 ' + new Date(w.updatedAt).toLocaleTimeString('bn-BD', {hour:'2-digit',minute:'2-digit'}) : ''}
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
                <code>VITE_GOOGLE_MAPS_KEY</code> environment variable চেক করুন।
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
                                <FiWifi style={{ color: '#10b981', flexShrink: 0, fontSize: 13 }} />
                            </div>
                            {w.updatedAt && (
                                <p style={{ fontSize: 10, color: '#9ca3af', margin: '6px 0 0' }}>
                                    🕐 {new Date(w.updatedAt).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}
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
