import { useEffect, useRef, useState, useCallback } from 'react'
import { FiMap, FiUser, FiCalendar, FiNavigation, FiClock, FiChevronRight, FiAlertCircle } from 'react-icons/fi'
import api from '../../api/axios'

// ============================================================
// TrailHistory — SR-এর দিনের movement map-এ দেখাও
// Manager যেকোনো SR ও যেকোনো দিন select করতে পারবে
// Map-এ polyline, start/end marker, মোট দূরত্ব দেখাবে
// ============================================================

const today = () => new Date().toISOString().split('T')[0]

const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })

export default function TrailHistory() {
    const mapRef       = useRef(null)
    const mapInstance  = useRef(null)
    const polylineRef  = useRef(null)
    const markersRef   = useRef([])

    const [mapsLoaded,  setMapsLoaded]  = useState(false)
    const [mapError,    setMapError]    = useState(false)
    const [workers,     setWorkers]     = useState([])
    const [selectedSR,  setSelectedSR]  = useState(null)
    const [date,        setDate]        = useState(today())
    const [trail,       setTrail]       = useState(null)
    const [loading,     setLoading]     = useState(false)
    const [error,       setError]       = useState(null)
    const [activePoint, setActivePoint] = useState(null)

    // ── ১. Team-এর SR list আনো ──────────────────────────────
    // /employee/ route-এ checkTeamAccess middleware আছে —
    // Manager শুধু নিজের team-এর worker দেখবে (teamFilter = manager.id)
    useEffect(() => {
        api.get('/employees/?role=worker&status=active')
            .then(res => {
                const list = (res.data?.data || []).filter(e => e.role === 'worker')
                setWorkers(list)
            })
            .catch(() => {})
    }, [])

    // ── ২. Maps API লোড করো ─────────────────────────────────
    useEffect(() => {
        if (window.google?.maps) { setMapsLoaded(true); return }

        api.get('/location/maps-key')
            .then(res => {
                const key = res.data?.key
                if (!key) { setMapError(true); return }

                const script    = document.createElement('script')
                script.src      = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker`
                script.async    = true
                script.onload   = () => setMapsLoaded(true)
                script.onerror  = () => setMapError(true)
                document.head.appendChild(script)
            })
            .catch(() => setMapError(true))
    }, [])

    // ── ৩. Map তৈরি করো ─────────────────────────────────────
    useEffect(() => {
        if (!mapsLoaded || !mapRef.current || mapInstance.current) return

        mapInstance.current = new window.google.maps.Map(mapRef.current, {
            center:             { lat: 23.8103, lng: 90.4125 },
            zoom:               12,
            mapId:              'NOVATECH_TRAIL',
            mapTypeControl:     false,
            fullscreenControl:  false,
            streetViewControl:  false,
            styles: [
                { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
            ],
        })
    }, [mapsLoaded])

    // ── ৪. Trail আনো ────────────────────────────────────────
    const fetchTrail = useCallback(async () => {
        if (!selectedSR || !date) return

        setLoading(true)
        setError(null)
        setTrail(null)
        setActivePoint(null)

        try {
            const res = await api.get(`/location/trail/${selectedSR.id}?date=${date}`)
            if (!res.data?.success) throw new Error('Trail আনা যায়নি')
            setTrail(res.data)
            drawTrail(res.data.points)
        } catch (err) {
            setError(err.response?.data?.message || 'Trail আনতে সমস্যা হয়েছে।')
        } finally {
            setLoading(false)
        }
    }, [selectedSR, date])

    // ── ৫. Map-এ Trail আঁকো ─────────────────────────────────
    const drawTrail = (points) => {
        if (!mapInstance.current || !points?.length) return

        // আগেরগুলো মুছো
        polylineRef.current?.setMap(null)
        markersRef.current.forEach(m => m.map = null)
        markersRef.current = []

        const path = points.map(p => ({ lat: p.latitude, lng: p.longitude }))

        // Polyline — SR-এর path
        polylineRef.current = new window.google.maps.Polyline({
            path,
            geodesic:     true,
            strokeColor:  '#3b82f6',
            strokeOpacity: 0.85,
            strokeWeight:  4,
            map:           mapInstance.current,
        })

        const { AdvancedMarkerElement } = window.google.maps.marker

        // Start marker — সবুজ
        const startPin = document.createElement('div')
        startPin.innerHTML = `
            <div style="background:#10b981;color:white;padding:4px 8px;border-radius:20px;
                        font-size:11px;font-weight:700;white-space:nowrap;
                        box-shadow:0 2px 6px rgba(0,0,0,0.3);">
                🚀 শুরু
            </div>`
        markersRef.current.push(new AdvancedMarkerElement({
            position: path[0],
            map:      mapInstance.current,
            content:  startPin,
            title:    'শুরু',
        }))

        // End marker — লাল
        const endPin = document.createElement('div')
        endPin.innerHTML = `
            <div style="background:#ef4444;color:white;padding:4px 8px;border-radius:20px;
                        font-size:11px;font-weight:700;white-space:nowrap;
                        box-shadow:0 2px 6px rgba(0,0,0,0.3);">
                🏁 শেষ
            </div>`
        markersRef.current.push(new AdvancedMarkerElement({
            position: path[path.length - 1],
            map:      mapInstance.current,
            content:  endPin,
            title:    'শেষ',
        }))

        // Map fit করো
        const bounds = new window.google.maps.LatLngBounds()
        path.forEach(p => bounds.extend(p))
        mapInstance.current.fitBounds(bounds, 60)
    }

    // Point click হলে map-এ focus
    const focusPoint = (point, idx) => {
        setActivePoint(idx)
        if (!mapInstance.current) return
        mapInstance.current.panTo({ lat: point.latitude, lng: point.longitude })
        mapInstance.current.setZoom(17)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#f8fafc' }}>

            {/* ── Header ── */}
            <div style={{
                background: '#fff', borderBottom: '1px solid #e2e8f0',
                padding: '12px 16px', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <FiMap style={{ color: '#3b82f6', fontSize: 18 }} />
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>GPS Trail History</span>
                </div>

                {/* SR ও Date selector */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

                    {/* SR Dropdown */}
                    <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>SR বেছে নিন</div>
                        <select
                            value={selectedSR?.id || ''}
                            onChange={e => {
                                const w = workers.find(w => String(w.id) === e.target.value)
                                setSelectedSR(w || null)
                                setTrail(null)
                            }}
                            style={{
                                width: '100%', padding: '8px 10px', borderRadius: 8,
                                border: '1px solid #e2e8f0', fontSize: 13,
                                background: '#f8fafc', color: '#1e293b', outline: 'none',
                            }}
                        >
                            <option value=''>-- SR select করুন --</option>
                            {workers.map(w => (
                                <option key={w.id} value={w.id}>
                                    {w.name_bn} ({w.employee_code})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Date picker */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>তারিখ</div>
                        <input
                            type='date'
                            value={date}
                            max={today()}
                            onChange={e => { setDate(e.target.value); setTrail(null) }}
                            style={{
                                width: '100%', padding: '8px 10px', borderRadius: 8,
                                border: '1px solid #e2e8f0', fontSize: 13,
                                background: '#f8fafc', color: '#1e293b', outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    {/* Search button */}
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                            onClick={fetchTrail}
                            disabled={!selectedSR || !date || loading}
                            style={{
                                padding: '8px 16px', borderRadius: 8, border: 'none',
                                background: selectedSR && date ? '#3b82f6' : '#e2e8f0',
                                color: selectedSR && date ? '#fff' : '#94a3b8',
                                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <FiNavigation style={{ fontSize: 13 }} />
                            {loading ? 'লোড হচ্ছে...' : 'দেখাও'}
                        </button>
                    </div>
                </div>

                {/* Stats bar */}
                {trail && (
                    <div style={{
                        display: 'flex', gap: 16, marginTop: 12,
                        padding: '10px 12px', background: '#eff6ff',
                        borderRadius: 8, flexWrap: 'wrap',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FiUser style={{ color: '#3b82f6', fontSize: 13 }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>
                                {trail.worker?.name_bn}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FiNavigation style={{ color: '#10b981', fontSize: 13 }} />
                            <span style={{ fontSize: 12, color: '#065f46', fontWeight: 700 }}>
                                {trail.totalKm} কিমি
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FiClock style={{ color: '#f59e0b', fontSize: 13 }} />
                            <span style={{ fontSize: 12, color: '#92400e' }}>
                                {trail.totalPoints} টি পয়েন্ট
                            </span>
                        </div>
                        {trail.points?.length > 0 && (
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                {formatTime(trail.points[0].timestamp)} — {formatTime(trail.points[trail.points.length - 1].timestamp)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Main: Map + List ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Map */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <div ref={mapRef} style={{ width: '100%', height: '100%', background: '#e2e8f0' }}>
                        {!mapsLoaded && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <div style={{ textAlign: 'center', color: '#64748b' }}>
                                    <div style={{
                                        width: 36, height: 36, border: '3px solid #e2e8f0',
                                        borderTopColor: '#3b82f6', borderRadius: '50%',
                                        animation: 'spin 0.8s linear infinite', margin: '0 auto 10px',
                                    }} />
                                    <p style={{ fontSize: 13 }}>ম্যাপ লোড হচ্ছে...</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* No trail placeholder */}
                    {mapsLoaded && !trail && !loading && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                        }}>
                            <div style={{
                                background: 'rgba(255,255,255,0.92)', borderRadius: 12,
                                padding: '20px 28px', textAlign: 'center',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                            }}>
                                <FiMap style={{ fontSize: 32, color: '#cbd5e1', marginBottom: 8 }} />
                                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                                    SR ও তারিখ বেছে Trail দেখুন
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                        }}>
                            <div style={{
                                background: '#fff1f2', border: '1px solid #fecdd3',
                                borderRadius: 12, padding: '16px 24px', textAlign: 'center',
                            }}>
                                <FiAlertCircle style={{ fontSize: 28, color: '#ef4444', marginBottom: 6 }} />
                                <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Point List Sidebar */}
                {trail?.points?.length > 0 && (
                    <div style={{
                        width: 190, background: '#fff',
                        borderLeft: '1px solid #e2e8f0',
                        overflowY: 'auto', flexShrink: 0,
                    }}>
                        <div style={{
                            padding: '10px 12px', fontSize: 11, fontWeight: 700,
                            color: '#64748b', borderBottom: '1px solid #f1f5f9',
                            background: '#f8fafc', position: 'sticky', top: 0,
                        }}>
                            সময়ক্রম ({trail.totalPoints} পয়েন্ট)
                        </div>

                        {trail.points.map((point, idx) => (
                            <div
                                key={idx}
                                onClick={() => focusPoint(point, idx)}
                                style={{
                                    padding: '10px 12px',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    background: activePoint === idx ? '#eff6ff' : '#fff',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    transition: 'background 0.15s',
                                }}
                            >
                                {/* Index dot */}
                                <div style={{
                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                    background: idx === 0 ? '#10b981' : idx === trail.points.length - 1 ? '#ef4444' : '#3b82f6',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 9, fontWeight: 700,
                                }}>
                                    {idx === 0 ? '▶' : idx === trail.points.length - 1 ? '■' : idx + 1}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', margin: 0 }}>
                                        {formatTime(point.timestamp)}
                                    </p>
                                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 0',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {point.latitude?.toFixed(4)}, {point.longitude?.toFixed(4)}
                                    </p>
                                </div>
                                <FiChevronRight style={{ color: '#cbd5e1', fontSize: 12, flexShrink: 0 }} />
                            </div>
                        ))}
                    </div>
                )}

                {/* No data */}
                {trail && trail.points?.length === 0 && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        pointerEvents: 'none',
                    }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.92)', borderRadius: 12,
                            padding: '20px 28px', textAlign: 'center',
                        }}>
                            <FiCalendar style={{ fontSize: 32, color: '#cbd5e1', marginBottom: 8 }} />
                            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                                এই দিনে কোনো GPS data নেই
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}
