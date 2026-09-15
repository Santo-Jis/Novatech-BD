// hooks/useRoutes.js
//
// ⬇️ নতুন — Phase 1 (Architecture Refactor)
// আগে RouteSelect.jsx-এর ভেতরেই manual useState + useEffect দিয়ে
// /routes/worker-list ফেচ, offline cache fallback, আর toast — সব একসাথে
// লেখা ছিল। এই হুক সেই লজিকটাকে বের করে আনলো, যাতে:
//   ১) CustomerList.jsx-এর "রুট বদলান" ড্রপডাউনও একই হুক পুনর্ব্যবহার করতে পারে
//      (আগে দুই জায়গায় প্রায় একই fetch কোড আলাদা করে লেখা ছিল)
//   ২) React Query caching/staleTime free পাওয়া যায় — বারবার একই ডেটা আনতে হয় না
//
// ⚠️ আচরণ অপরিবর্তিত রাখা হয়েছে (এটা Phase 1 = রিফ্যাক্টর, Phase 2 = UX redesign):
// একই টোস্ট মেসেজ, একই offline fallback শর্ত, একই cache key।
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api, { isNetworkError } from '../api/axios';
import { saveCache, getCache } from '../api/offlineQueue';

const CACHE_KEY = 'routes_list';
const OFFLINE_NO_DATA_MSG = 'আজকের ডেটা নেই। WiFi বা ইন্টারনেটে গিয়ে sync করুন।';
const STALE_FALLBACK_MSG = 'নেটওয়ার্ক ধীর — আজকের সংরক্ষিত রুট দেখানো হচ্ছে';

async function fetchWorkerRoutes() {
    if (!navigator.onLine) {
        const cached = await getCache(CACHE_KEY);
        if (cached?.isToday) {
            return { routes: cached.data, isOffline: true };
        }
        toast.error(OFFLINE_NO_DATA_MSG, { duration: 5000 });
        return { routes: [], isOffline: true };
    }

    try {
        const res = await api.get('/routes/worker-list');
        const data = res.data.data || [];
        saveCache(CACHE_KEY, data);
        return { routes: data, isOffline: false };
    } catch (err) {
        if (isNetworkError(err)) {
            const cached = await getCache(CACHE_KEY);
            if (cached?.isToday) {
                toast(STALE_FALLBACK_MSG, { icon: '📶', duration: 3000 });
                return { routes: cached.data, isOffline: true };
            }
            toast.error(OFFLINE_NO_DATA_MSG, { duration: 5000 });
            return { routes: [], isOffline: true };
        }
        // নেটওয়ার্ক-জনিত না এমন এরর (৪xx/৫xx) React Query-র error state-এ বুদবুদ করে উঠুক —
        // এটা silently গিলে ফেলা ঠিক হবে না, caller চাইলে query.error দেখাতে পারবে।
        throw err;
    }
}

/**
 * SR-এর route তালিকা (আজকে যে রুটগুলো বেছে নেওয়া যায়)।
 * Offline হলে বা নেটওয়ার্ক ধীর হলে আজকের cached ডেটা দেখায় — একদম আগের মতোই।
 */
export function useRoutes() {
    const query = useQuery({
        queryKey: ['worker-routes'],
        queryFn: fetchWorkerRoutes,
    });

    return {
        routes: query.data?.routes ?? [],
        isOffline: query.data?.isOffline ?? !navigator.onLine,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
    };
}

/**
 * SR নিজে নতুন রুট তৈরির যে আবেদন করেছে, তার status ('pending'/'approved'/'rejected')।
 * এটা অফলাইন cache-এর দরকার নেই (informational badge মাত্র), তাই সহজ রাখা হলো।
 */
export function useMyRouteRequests() {
    const { isOffline } = useRoutes();

    return useQuery({
        queryKey: ['my-route-requests'],
        queryFn: async () => {
            const res = await api.get('/routes/my-requests');
            return res.data.data || [];
        },
        enabled: !isOffline,
        retry: false,
    });
}

/**
 * নতুন কাস্টমার যোগ করার সময় "কোন রুটে যোগ হবে" ড্রপডাউনে ব্যবহারের জন্য।
 * useRoutes-এর wrapper মাত্র — নামটা আলাদা রাখা হলো যাতে ব্যবহারের জায়গায় (CustomerList
 * form-এর ভেতরে) উদ্দেশ্যটা স্পষ্ট বোঝা যায়, ডেটা একই query cache থেকেই আসে (ডুপ্লিকেট ফেচ না)।
 */
export function useRouteOptions() {
    const { routes, isLoading } = useRoutes();
    return { routeOptions: routes, isLoading };
}

export function useInvalidateRoutes() {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: ['worker-routes'] });
}
