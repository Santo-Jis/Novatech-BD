// frontend/src/pages/customer/components/DeliveryTracking.jsx
//
// Live rider tracking for an in-transit delivery — customer side.
// Polls every 15s (simple, auditable; a direct Firebase client listener
// would be lower-latency but needs careful per-customer security-rule
// scoping in database.rules.json first — worth doing later, not now).
//
// Usage: <DeliveryTracking deliveryId={someDeliveryId} />
// Drop this into wherever the customer currently sees "your order is on
// the way" (order detail / dashboard) — it's self-contained.

import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { portalFetch } from '../utils/api'

// Leaflet-এর default marker icon Vite build-এ ঠিকমতো bundle হয় না
// (এটা একটা পরিচিত react-leaflet সমস্যা) — নিজেরাই icon বসিয়ে দিচ্ছি
const riderIcon = new L.DivIcon({
  html: '🛵',
  className: 'text-2xl',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})
const homeIcon = new L.DivIcon({
  html: '🏠',
  className: 'text-2xl',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const POLL_MS = 15000

export default function DeliveryTracking({ deliveryId }) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const timerRef = useRef(null)

  const fetchTracking = useCallback(async () => {
    try {
      const res = await portalFetch(`/portal/deliveries/${deliveryId}/tracking`)
      const json = await res.json()
      if (!json.success) throw new Error(json.message || 'ব্যর্থ')
      setState({ loading: false, error: null, data: json })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }))
    }
  }, [deliveryId])

  useEffect(() => {
    fetchTracking()
    timerRef.current = setInterval(fetchTracking, POLL_MS)
    return () => clearInterval(timerRef.current)
  }, [fetchTracking])

  if (state.loading) {
    return <div className="p-4 text-center text-gray-500">লোকেশন লোড হচ্ছে...</div>
  }

  if (state.error) {
    return (
      <div className="p-4 text-center text-red-600 bg-red-50 rounded-lg">
        {state.error}
      </div>
    )
  }

  const { trackable, status, message, rider, destination, distance_km, eta_minutes_estimate } = state.data

  if (!trackable) {
    return (
      <div className="p-4 text-center text-gray-600 bg-gray-50 rounded-lg">
        {message || 'এই মুহূর্তে ট্র্যাকিং তথ্য নেই।'}
      </div>
    )
  }

  const center = [rider.latitude, rider.longitude]
  const updatedAgoText =
    rider.updated_seconds_ago == null
      ? ''
      : rider.updated_seconds_ago < 60
        ? 'কয়েক সেকেন্ড আগে'
        : `${Math.round(rider.updated_seconds_ago / 60)} মিনিট আগে`

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200">
      <div className="h-64 w-full">
        <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          <Marker position={center} icon={riderIcon}>
            <Popup>{rider.name} ({rider.code})</Popup>
          </Marker>
          {destination && (
            <Marker position={[destination.latitude, destination.longitude]} icon={homeIcon}>
              <Popup>আপনার ঠিকানা</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <div className="p-3 bg-white space-y-1">
        <p className="font-medium text-gray-800">
          {status === 'arrived' ? '🎉 রাইডার পৌঁছে গেছেন' : '🛵 রাইডার আসছেন'}
        </p>
        {eta_minutes_estimate != null && (
          <p className="text-sm text-gray-600">
            আনুমানিক <span className="font-semibold">{eta_minutes_estimate} মিনিট</span> দূরে
            {distance_km != null && ` (~${distance_km} কিমি)`}
            <span className="text-xs text-gray-400"> — সরাসরি দূরত্ব, রাস্তা/ট্রাফিক ধরে না</span>
          </p>
        )}
        {updatedAgoText && (
          <p className="text-xs text-gray-400">লোকেশন আপডেট: {updatedAgoText}</p>
        )}
      </div>
    </div>
  )
}
