// frontend/src/pages/customer/components/ActiveDeliveryBanner.jsx
//
// Architecture-gap fix — customer_order_requests-এর কোনো specific
// deliveryId আগে থেকে জানা যায় না (দেখো getActiveDeliveries-এর কমেন্ট,
// backend/src/controllers/customerPortal.controller.js)। তাই এই
// কম্পোনেন্ট নিজেই জিজ্ঞেস করে "আমার কোনো active ডেলিভারি আছে কিনা",
// থাকলে DeliveryTracking-এ নিয়ে যায়।
//
// self-contained — কিছু না থাকলে নিজে থেকেই কিছু render করে না (null),
// তাই dashboard-এর যেকোনো জায়গায় নিশ্চিন্তে বসানো যায়, খালি জায়গা
// তৈরি করবে না।
//
// Usage: <ActiveDeliveryBanner /> (dashboard-এর উপরের দিকে কোথাও)

import { useState, useEffect } from 'react'
import { portalFetch } from '../utils/api'
import DeliveryTracking from './DeliveryTracking'

export default function ActiveDeliveryBanner() {
  const [deliveries, setDeliveries] = useState(null) // null = লোড হচ্ছে
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    let cancelled = false
    portalFetch('/portal/deliveries/active')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) setDeliveries(json.data)
      })
      .catch(() => {
        if (!cancelled) setDeliveries([])
      })
    return () => { cancelled = true }
  }, [])

  if (!deliveries || deliveries.length === 0) return null

  return (
    <div className="mb-4 space-y-2">
      {deliveries.map((d) => (
        <div key={d.id}>
          <button
            onClick={() => setOpenId(openId === d.id ? null : d.id)}
            className="w-full flex items-center justify-between p-3 rounded-xl
                       bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200
                       text-left"
          >
            <span className="flex items-center gap-2">
              <span className="text-xl">🛵</span>
              <span>
                <span className="block font-medium text-gray-800">
                  {d.status === 'arrived' ? 'রাইডার পৌঁছে গেছেন!' : 'একটি ডেলিভারি পথে আছে'}
                </span>
                <span className="block text-xs text-gray-500">{d.rider_name}</span>
              </span>
            </span>
            <span className="text-orange-600 text-sm font-medium">
              {openId === d.id ? 'বন্ধ করুন' : 'ট্র্যাক করুন'}
            </span>
          </button>
          {openId === d.id && (
            <div className="mt-2">
              <DeliveryTracking deliveryId={d.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
