// ============================================================
// অফলাইন প্রমোশন ক্যালকুলেটর
// backend/src/services/promotion.utils.js → getEligiblePromotions()-এর হুবহু
// ক্লায়েন্ট-সাইড সংস্করণ (শুধু ডেটা আসে ক্যাশ করা snapshot থেকে)।
// এখানে ফল শুধু প্রিভিউ — চূড়ান্ত ছাড় সিঙ্কের সময় সার্ভার নিজে হিসাব করে।
// backend-এর নিয়ম বদলালে এই ফাইলও মিলিয়ে বদলাতে হবে।
// ============================================================
import api from '../api/axios'
import { saveCache, getCache } from '../api/offlineQueue'

const r2 = n => Math.round(n * 100) / 100
const snapKey = customerId => (customerId ? `promo_snapshot_${customerId}` : 'promo_snapshot_all')

// ── অনলাইনে snapshot এনে ক্যাশ করা ───────────────────────────
export async function fetchAndCachePromoSnapshot(customerId) {
  if (!navigator.onLine) return null
  try {
    const res  = await api.get('/promotions/offline-snapshot', { params: customerId ? { customer_id: customerId } : {} })
    const data = res.data.data
    await saveCache(snapKey(customerId), data)
    return data
  } catch { return null }
}

// ── অফলাইনে ক্যাশ থেকে snapshot পড়া (কাস্টমার-ভিত্তিক না থাকলে সাধারণটা) ──
export async function loadPromoSnapshot(customerId) {
  const specific = customerId ? await getCache(snapKey(customerId)) : null
  if (specific?.data) return specific.data
  const generic = await getCache(snapKey(null))
  return generic?.data || null
}

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) return null
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// মেয়াদ: তারিখের টাইমজোন গোলমাল এড়াতে শুধু স্পষ্টভাবে শেষ হওয়া (>৩৬ ঘণ্টা আগে) অফার বাদ
function isExpired(promo) {
  if (!promo.end_date) return false
  const end = new Date(promo.end_date).getTime()
  return Number.isFinite(end) && Date.now() - end > 36 * 60 * 60 * 1000
}

/**
 * @param {object} p
 * @param {object} p.snapshot   - loadPromoSnapshot() এর ফল
 * @param {Array}  p.products   - ক্যাশ করা পণ্য তালিকা (price, cost_price, category_id, stock, reserved_stock)
 * @param {Array}  p.items      - [{ product_id, qty }]
 * @param {object} p.customer   - ক্যাশ করা কাস্টমার (route_id থাকলে কাজে লাগে)
 * @param {string} p.customerId
 * @param {string} p.promoCode
 * @returns server-এর /promotions/calculate এর data-র মতো একই শেপ + _offline, code_status
 */
export async function calculateOfflinePromotions({ snapshot, products, items, customer, customerId, promoCode }) {
  const empty = { applicable_promotions: [], total_discount: 0, free_items: [], target_progress: [], _offline: true, code_status: 'none' }
  if (!snapshot?.promotions?.length || !items.length) return { ...empty, _noSnapshot: !snapshot }

  const productMap = Object.fromEntries((products || []).map(pr => [String(pr.id), pr]))
  const info = id => {
    const pr = productMap[String(id)]
    return {
      price:      parseFloat(pr?.price) || 0,
      categoryId: pr?.category_id,
      costPrice:  parseFloat(pr?.cost_price) || 0,
    }
  }

  const ctx        = snapshot.customer || { route_id: null, uses: {}, targets: {} }
  const routeId    = ctx.route_id || customer?.route_id || null
  const typedCode  = (promoCode || '').trim().toUpperCase()
  const typedHash  = typedCode ? await sha256Hex(typedCode) : null
  let   codeStatus = typedCode ? (typedHash ? 'invalid' : 'unverifiable') : 'none'

  const applicable = []
  const progress   = []

  for (const promo of snapshot.promotions) {
    if (isExpired(promo)) continue
    if (promo.max_uses && promo.current_uses >= promo.max_uses) continue
    if (promo.budget_cap != null && parseFloat(promo.budget_used || 0) >= parseFloat(promo.budget_cap)) continue
    if (promo.max_per_customer && customerId && (ctx.uses?.[promo.id] || 0) >= promo.max_per_customer) continue

    if (promo.has_code) {
      if (!typedHash || typedHash !== promo.promo_code_hash) continue
      codeStatus = 'matched'
    }

    if (promo.apply_to === 'specific_routes') {
      const ids = (promo.route_ids || []).map(String)
      if (!routeId || !ids.includes(String(routeId))) continue
    }
    if (promo.apply_to === 'specific_customers') {
      const ids = (promo.customer_ids || []).map(String)
      if (!customerId || !ids.includes(String(customerId))) continue
    }

    let scopedItems = items
    if (promo.apply_to === 'specific_products') {
      const pIds = (promo.product_ids  || []).map(String)
      const cIds = (promo.category_ids || []).map(String)
      scopedItems = items.filter(i => {
        const inf = info(i.product_id)
        return pIds.includes(String(i.product_id)) || (inf.categoryId && cIds.includes(String(inf.categoryId)))
      })
      if (!scopedItems.length) continue
    }

    const scopedTotal = scopedItems.reduce((s, i) => s + info(i.product_id).price     * (i.qty || 0), 0)
    const scopedQty   = scopedItems.reduce((s, i) => s + (i.qty || 0), 0)
    const scopedCost  = scopedItems.reduce((s, i) => s + info(i.product_id).costPrice * (i.qty || 0), 0)

    let discountAmount = 0
    let message        = ''
    let freeItems      = []

    const freeProductAvail = (id) => {
      const fp = productMap[String(id)]
      return fp ? { fp, available: (fp.stock || 0) - (fp.reserved_stock || 0) } : null
    }

    switch (promo.type) {
      case 'percent_off':
        if (scopedTotal >= (promo.min_order_amount || 0)) {
          discountAmount = scopedTotal * (promo.discount_value / 100)
          message = `${promo.name}: ${promo.discount_value}% ছাড়`
        }
        break

      case 'flat_off':
        if (scopedTotal >= (promo.min_order_amount || 0)) {
          discountAmount = Math.min(promo.discount_value, scopedTotal)
          message = `${promo.name}: ৳${promo.discount_value} ছাড়`
        }
        break

      case 'buy_x_get_y': {
        const amountMode = !promo.buy_quantity && Number(promo.min_order_amount) > 0
        let freeQty = 0
        if (promo.free_product_id) {
          if (amountMode) {
            if (scopedTotal >= Number(promo.min_order_amount)) freeQty = Number(promo.free_quantity || 0)
          } else if (promo.buy_quantity && scopedQty >= promo.buy_quantity) {
            freeQty = Math.floor(scopedQty / promo.buy_quantity) * (promo.free_quantity || 0)
          }
        }
        if (freeQty > 0) {
          const f = freeProductAvail(promo.free_product_id)
          if (f && f.available >= freeQty) {
            const price = parseFloat(f.fp.price || 0)
            discountAmount = price * freeQty
            freeItems = [{ product_id: f.fp.id, name: f.fp.name, price, qty: freeQty }]
            message = `${promo.name}: ${freeQty}টা ${f.fp.name} ফ্রি 🎁`
          }
        }
        break
      }

      case 'min_order':
        if (scopedTotal >= promo.min_order_amount) {
          discountAmount = promo.discount_value || 0
          message = `${promo.name}: ন্যূনতম অর্ডারে বিশেষ সুবিধা`
        }
        break

      case 'target_gift': {
        const target = Number(promo.min_order_amount) || 0
        if (!customerId || target <= 0 || !promo.free_product_id || !(Number(promo.free_quantity) > 0)) break
        const period = ctx.targets?.[promo.id]
        if (!period || period.alreadyGiven) break          // কাস্টমার-snapshot না থাকলে নিরাপদে বাদ

        const achieved = (period.pastTotal || 0) + scopedTotal
        const giftQty  = Number(promo.free_quantity)
        const f = freeProductAvail(promo.free_product_id)
        if (!f) break

        progress.push({
          promotion_id: promo.id, name: promo.name, target,
          achieved:  r2(achieved),
          remaining: Math.max(0, r2(target - achieved)),
          reached:   achieved >= target,
          gift_name: f.fp.name, gift_qty: giftQty,
          period_mode: promo.period_mode, period_start: period.periodStart, period_end: period.periodEnd,
        })

        if (achieved >= target && f.available >= giftQty) {
          const price = parseFloat(f.fp.price || 0)
          discountAmount = price * giftQty
          freeItems = [{ product_id: f.fp.id, name: f.fp.name, price, qty: giftQty }]
          message = `${promo.name}: ৳${target} টার্গেট পূর্ণ! ${giftQty}টা ${f.fp.name} গিফট 🎁`
        }
        break
      }

      case 'tiered_discount': {
        const tiers = Array.isArray(promo.tiers) ? promo.tiers : []
        const eligible = tiers
          .filter(t => scopedQty >= (t.min_qty || 0))
          .sort((a, b) => (b.min_qty || 0) - (a.min_qty || 0))
        if (eligible.length) {
          const tier = eligible[0]
          discountAmount = tier.discount_type === 'flat'
            ? Math.min(tier.discount_value || 0, scopedTotal)
            : scopedTotal * ((tier.discount_value || 0) / 100)
          message = `${promo.name}: ${scopedQty} পিসে ${tier.discount_value}${tier.discount_type === 'flat' ? '৳' : '%'} ছাড় (স্ল্যাব)`
        }
        break
      }
      default: break
    }

    // মার্জিন গার্ড
    if (discountAmount > 0 && promo.type !== 'buy_x_get_y' && promo.type !== 'target_gift' && scopedCost > 0) {
      const maxAllowed = Math.max(0, scopedTotal - scopedCost)
      if (discountAmount > maxAllowed) { discountAmount = maxAllowed; message += ' (মার্জিন-সুরক্ষায় সীমিত)' }
    }
    // বাজেট ক্যাপ
    if (discountAmount > 0 && promo.budget_cap != null) {
      const remaining = Math.max(0, parseFloat(promo.budget_cap) - parseFloat(promo.budget_used || 0))
      if (discountAmount > remaining) discountAmount = remaining
    }

    if (discountAmount > 0 || freeItems.length) {
      applicable.push({
        promotion: promo,
        discountAmount: r2(discountAmount),
        reducesPayable: promo.type !== 'buy_x_get_y' && promo.type !== 'target_gift',
        freeItems, message,
      })
    }
  }

  // স্ট্যাকিং
  let final = applicable
  const nonStackable = applicable.filter(a => a.promotion.stackable === false)
  if (nonStackable.length) {
    nonStackable.sort((a, b) =>
      (b.promotion.priority || 0) - (a.promotion.priority || 0) || b.discountAmount - a.discountAmount)
    final = [nonStackable[0]]
  }

  let payable = 0
  const freeOut = []
  for (const a of final) {
    if (a.reducesPayable) payable += a.discountAmount
    freeOut.push(...a.freeItems)
  }

  return {
    applicable_promotions: final.map(a => ({
      promotion_id: a.promotion.id, name: a.promotion.name, type: a.promotion.type,
      discount_amount: a.discountAmount, reduces_payable: a.reducesPayable, message: a.message,
    })),
    total_discount:  r2(payable),
    free_items:      freeOut,
    target_progress: progress,
    _offline:        true,
    code_status:     codeStatus,
  }
}
