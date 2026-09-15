// hooks/useNextStop.js
//
// ⬇️ নতুন — Phase 1 (Architecture Refactor)
//
// Phase 0 audit-এ যা লেখা হয়েছিল ("frontend distance-calc সরিয়ে backend
// distance_meters ব্যবহার করা") — কোডটা ফিরে দেখে এটা একটু ঠিক করা দরকার:
// backend-এর distance_meters হলো fetch-এর মুহূর্তের এক-বারের স্ন্যাপশট।
// কিন্তু SR হাঁটতে হাঁটতে "next stop" (তারা-চিহ্নিত পিন) রিয়েল-টাইমে বদলানো
// উচিত — প্রতি কয়েক সেকেন্ডে নেটওয়ার্ক কল করে backend থেকে আবার distance
// আনা বাস্তবসম্মত না (এই অ্যাপের নেটওয়ার্ক পরিস্থিতি অনুযায়ী তো নয়ই)।
//
// তাই: initial fetch/list-order-এর জন্য backend distance_meters-ই ব্যবহার হয়
// (সেটা useCustomers.js-এ ইতিমধ্যে আছে, ঠিক আছে) — কিন্তু "next stop" স্টার
// পিন আর "distance" sort মোডের জন্য এই হালকা client-side Haversine
// (watchPosition-চালিত) থেকেই যাচ্ছে, ইচ্ছাকৃতভাবে। এটা ডুপ্লিকেশন না,
// আলাদা use-case (live client vs server-snapshot)।
import { useEffect, useState, useMemo } from 'react';

function haversineMeters(lat1, lng1, lat2, lng2) {
    if (!lat1 || !lng1 || !lat2 || !lng2) return null;
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function formatDistance(meters) {
    if (meters == null) return null;
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} কিমি`;
    return `${meters} মি`;
}

/**
 * SR-এর লাইভ GPS অবস্থান — CustomerList.jsx-এ আগে এই watchPosition সরাসরি
 * component-এর ভেতরেই ছিল, এখানে বের করে আনা হলো যাতে পুনর্ব্যবহারযোগ্য হয়।
 */
export function useWatchPosition() {
    const [userLocation, setUserLocation] = useState(null);

    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {},
            { enableHighAccuracy: true, maximumAge: 5000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    return userLocation;
}

/**
 * প্রতিটা কাস্টমারের জন্য SR-এর বর্তমান (লাইভ) অবস্থান থেকে দূরত্ব — { customerId: meters } ম্যাপ।
 */
export function useLiveDistances(customers, userLocation) {
    return useMemo(() => {
        const map = {};
        if (!userLocation) return map;
        customers.forEach(c => {
            const d = haversineMeters(userLocation.lat, userLocation.lng, parseFloat(c.latitude), parseFloat(c.longitude));
            if (d != null) map[c.id] = d;
        });
        return map;
    }, [customers, userLocation]);
}

/**
 * এখনো visit না-হওয়া কাস্টমারদের মধ্যে সবচেয়ে কাছেরটা — "Next Stop" পিন/ব্যাজে ব্যবহারের জন্য।
 */
export function useNextStop(customers, distanceMap) {
    return useMemo(() => {
        let closest = null;
        let minDist = Infinity;
        customers.forEach(c => {
            if (c.visited_today) return;
            const d = distanceMap[c.id];
            if (d != null && d < minDist) {
                minDist = d;
                closest = c;
            }
        });
        return closest ? { customer: closest, distanceMeters: minDist } : null;
    }, [customers, distanceMap]);
}
