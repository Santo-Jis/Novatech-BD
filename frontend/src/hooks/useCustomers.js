// hooks/useCustomers.js
//
// ⬇️ নতুন — Phase 1 (Architecture Refactor)
// CustomerList.jsx-এর ভেতরে থাকা loadCustomers() (৭৫ লাইন — fetch + GPS +
// offline cache + pending-credit-reduction merge + toast, সব একসাথে) এখানে
// সরানো হলো। আচরণ অবিকল আগের মতো — Phase 1 রিফ্যাক্টর, UX পরিবর্তন Phase 2/3-এ।
//
// ⚠️ এই হুক শুধু "স্ন্যাপশট" distance_meters দেয় (fetch-এর মুহূর্তের GPS দিয়ে
// backend-এ হিসাব করা)। SR হাঁটতে হাঁটতে "next stop"/লাইভ দূরত্ব রিয়েল-টাইমে
// বদলানোর জন্য আলাদা useNextStop.js (watchPosition-ভিত্তিক) ব্যবহার হয় —
// এই দুটো ইচ্ছাকৃতভাবে আলাদা রাখা হয়েছে, ডুপ্লিকেশন না (Phase 0 audit-এ যা
// মনে হয়েছিল তার চেয়ে সূক্ষ্ম পার্থক্য, বিস্তারিত useNextStop.js-এ)।
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api, { isNetworkError } from '../api/axios';
import { saveCache, getCache } from '../api/offlineQueue';

const OFFLINE_NO_DATA_MSG = 'আজকের ডেটা নেই। WiFi বা ইন্টারনেটে গিয়ে sync করুন।';
const STALE_FALLBACK_MSG = 'নেটওয়ার্ক ধীর — আজকের সংরক্ষিত তালিকা দেখানো হচ্ছে';

// ✅ FIX (Phase 0 audit): backend default limit=50, আর কোনো total/has_more
// ফেরত না দেওয়ায় ৫০+ কাস্টমারের route নিঃশব্দে truncate হতো। ১০০-তে বাড়ানো হলো
// (একজন SR-এর একদিনের route বাস্তবে এর কাছাকাছি), আর নিচে has_more সত্যি হলে
// অন্তত console warning দেখানো হচ্ছে — সম্পূর্ণ pagination/virtualization Phase 3-এ।
const FETCH_LIMIT = 100;

function cacheKeyFor(routeId) {
    return `customers_route_${routeId || 'all'}`;
}

// getCurrentPosition callback API-কে Promise বানানো — কখনো reject করে না,
// GPS না পাওয়া গেলেও কাস্টমার লিস্ট লোড হওয়া উচিত (আগের কোডের আচরণই এটা)।
function getPositionOnce() {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000 }
        );
    });
}

// Admin verify করার আগে SR-এর optimistic credit-reduction আপডেট টিকিয়ে রাখে।
function applyPendingCreditReductions(customers) {
    try {
        const pending = JSON.parse(localStorage.getItem('pending_credit_reductions') || '{}');
        if (Object.keys(pending).length === 0) return customers;

        let changed = false;
        const merged = customers.map(c => {
            const p = pending[String(c.id)];
            if (p === undefined) return c;
            const apiCredit = parseFloat(c.current_credit || 0);
            const pendingCredit = parseFloat(p);
            if (pendingCredit < apiCredit) {
                return { ...c, current_credit: pendingCredit }; // server এখনো পুরনো, optimistic দেখাও
            }
            delete pending[String(c.id)]; // server verify করে ফেলেছে
            changed = true;
            return c;
        });
        if (changed) localStorage.setItem('pending_credit_reductions', JSON.stringify(pending));
        return merged;
    } catch {
        return customers;
    }
}

async function fetchCustomers(routeId) {
    const cacheKey = cacheKeyFor(routeId);

    if (!navigator.onLine) {
        const cached = await getCache(cacheKey);
        if (cached?.isToday) {
            // ⚠️ ইচ্ছাকৃতভাবে applyPendingCreditReductions() ব্যবহার হচ্ছে না এখানে।
            // VisitPage.jsx-এর handleCollectionSuccess() কালেকশনের পরপরই এই একই
            // cache key-তে সরাসরি সঠিক current_credit বসিয়ে দেয় (দ্র. VisitPage.jsx)।
            // এখানে আবার merge করলে pending entry অকালে delete হয়ে যেত — অনলাইনে
            // ফিরে পরের বার live fetch করার সময় backend সত্যিই sync না হয়ে থাকলে
            // সেই protection হারিয়ে যেত। মূল কোডও এই পথে merge করত না।
            return { customers: cached.data, totalCount: null, hasMore: false };
        }
        toast.error(OFFLINE_NO_DATA_MSG, { duration: 5000 });
        return { customers: [], totalCount: null, hasMore: false };
    }

    const position = await getPositionOnce();
    const params = new URLSearchParams();
    if (routeId) params.append('route_id', routeId);
    params.append('limit', String(FETCH_LIMIT));
    if (position) {
        params.append('lat', String(position.lat));
        params.append('lng', String(position.lng));
    }

    try {
        const res = await api.get(`/customers?${params}`);
        const data = res.data.data || [];
        const meta = res.data.meta || {};
        const merged = applyPendingCreditReductions(data);
        saveCache(cacheKey, merged);

        if (meta.has_more) {
            console.warn(
                `[useCustomers] route ${routeId || 'all'}: ${meta.total_count}-এর মধ্যে ${data.length} জন দেখানো হচ্ছে (limit=${FETCH_LIMIT})। পূর্ণ pagination/virtualization Phase 3-এ আসবে।`
            );
        }

        return { customers: merged, totalCount: meta.total_count ?? data.length, hasMore: !!meta.has_more };
    } catch (err) {
        if (isNetworkError(err)) {
            const cached = await getCache(cacheKey);
            if (cached?.isToday) {
                toast(STALE_FALLBACK_MSG, { icon: '📶', duration: 3000 });
                // ⚠️ এখানেও উপরের একই কারণে applyPendingCreditReductions() ব্যবহার হচ্ছে না।
                return { customers: cached.data, totalCount: null, hasMore: false };
            }
            toast.error(OFFLINE_NO_DATA_MSG, { duration: 5000 });
            return { customers: [], totalCount: null, hasMore: false };
        }
        throw err;
    }
}

/**
 * @param {string|number|null} routeId - selectedRoute?.id। null হলে ('all') সব কাস্টমার।
 */
export function useCustomers(routeId) {
    const query = useQuery({
        queryKey: ['customers', routeId ?? 'all'],
        queryFn: () => fetchCustomers(routeId),
    });

    return {
        customers: query.data?.customers ?? [],
        totalCount: query.data?.totalCount ?? null,
        hasMore: query.data?.hasMore ?? false,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
    };
}

/**
 * VisitPage থেকে ফিরলে (location.key বদলালে) fresh ডেটা দরকার — আগে এটা
 * একটা useEffect dependency দিয়ে হতো (দ্র. CustomerList.jsx-এর পুরনো কমেন্ট
 * "location.key যোগ করা হয়েছে — stale cache দেখাবে না")। এখন consuming
 * component নিজে location.key বদলালে এই invalidate কল করবে — হুক নিজে
 * router-aware না রেখে reusable রাখা হলো।
 */
export function useInvalidateCustomers() {
    const queryClient = useQueryClient();
    return (routeId) => queryClient.invalidateQueries({ queryKey: ['customers', routeId ?? 'all'] });
}
