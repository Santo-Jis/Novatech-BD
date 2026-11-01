// অনলাইনে থাকলেই পণ্য তালিকা cache করে রাখে — যাতে অফলাইনে SalesForm/OrderForm এ পণ্য দেখা যায়
import api from './axios'
import { saveCache } from './offlineQueue'
import { fetchAndCachePromoSnapshot } from '../utils/offlinePromotions'

export async function prefetchProducts() {
  if (!navigator.onLine) return
  try {
    const res  = await api.get('/products?is_active=true')
    const data = res.data.data || []
    if (data.length) {
      await saveCache('products_active',  data)
      await saveCache('products_catalog', data)
    }
  } catch { /* নীরবে ignore */ }
  // অফারের সাধারণ snapshot (কাস্টমার-নির্দিষ্ট না) — যে কাস্টমারের পেজ অনলাইনে খোলা হয়নি তাদের জন্য fallback
  fetchAndCachePromoSnapshot(null)
}
