/**
 * promotion.utils.js
 * ─────────────────────────────────────────────────────────────
 * Promotion eligibility, discount calculation ও usage-recording — এক জায়গায়।
 *
 * কেন আলাদা ফাইল?
 * আগে POST /promotions/calculate নিজের ভেতরেই সব হিসাব করত, কিন্তু সেই
 * হিসাব বিক্রয় (createSale) কখনো call-ই করত না — ফলে "প্রমোশন" ছিল
 * স্রেফ একটা প্রিভিউ, আসল বিক্রয়ে প্রভাব ফেলত না।
 *
 * এখন calculatePromotions (preview, sales.controller.js-এর createSale
 * (আসল বিক্রয়) — দুটোই getEligiblePromotions() ব্যবহার করে, তাই
 * প্রিভিউ আর real charge কখনো আলাদা হবে না।
 *
 * নিরাপত্তা নোট: item.price কখনো client থেকে বিশ্বাস করা হয় না —
 * সবসময় DB থেকে fresh products.price আনা হয়, যাতে কেউ client-side
 * price manipulate করে বড় discount আদায় করতে না পারে।
 * ─────────────────────────────────────────────────────────────
 */

/**
 * কার্ট (items) ও কাস্টমার দিয়ে কোন কোন promotion apply হবে এবং কত
 * discount হবে — বের করে। এটা সম্পূর্ণ read-only, কোনো DB write করে না।
 *
 * Phase 2 (targeting engine): promo code, route/customer/category targeting,
 * tiered discount, budget cap, margin guard, stacking — সবকিছু এখানে।
 *
 * @param {object}   params
 * @param {function} params.queryFn    - query(text, params) অথবা withTransaction-এর client.query
 * @param {string}   params.tenantId
 * @param {Array}    params.items      - [{ product_id, qty }]
 * @param {string}   [params.customerId]
 * @param {string}   [params.routeId]    - জানা থাকলে দিন (createSale-এ cust.route_id আগে থেকেই লোড থাকে,
 *                                         তাই এক্সট্রা query লাগে না); না দিলে route-targeted promo থাকলে lazy lookup হবে
 * @param {string}   [params.promoCode]  - SR/কাস্টমার যে কোড দিয়েছে (code-based promotion redeem করতে)
 *
 * @returns {Promise<{
 *   applicable: Array<{ promotion: object, discountAmount: number, reducesPayable: boolean, freeItems: Array, message: string }>,
 *   totalDiscount: number,    - সব promo-র true value (ফ্রি-গিফটের দাম সহ) — admin/promotion_uses reporting-এর জন্য
 *   payableDiscount: number,  - কাস্টমারের বিল আসলে যতটা কমবে (buy_x_get_y বাদে) — checkout/netAmount-এ ব্যবহার করুন
 *   freeItems: Array<{ product_id, name, price, qty }>,
 * }>}
 */
async function getEligiblePromotions({
    queryFn, tenantId, items = [], customerId = null, routeId = null, promoCode = null,
}) {
    if (!items.length) {
        return { applicable: [], totalDiscount: 0, payableDiscount: 0, freeItems: [] };
    }

    const today = new Date().toISOString().slice(0, 10);

    const promoRes = await queryFn(
        `SELECT * FROM promotions
         WHERE is_active = true AND start_date <= $1 AND end_date >= $1
           AND tenant_id = $2`,
        [today, tenantId]
    );

    if (!promoRes.rows.length) {
        return { applicable: [], totalDiscount: 0, payableDiscount: 0, freeItems: [] };
    }

    // কার্টের প্রতিটি প্রোডাক্টের real price + category_id + cost_price আনো
    // (category_id → category-targeting, cost_price → margin guard)
    const productIds = [...new Set(items.map(i => i.product_id))];
    const prodRes = await queryFn(
        `SELECT id, price, category_id, cost_price FROM products WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
        [productIds, tenantId]
    );
    const productInfo = Object.fromEntries(prodRes.rows.map(p => [p.id, {
        price:      parseFloat(p.price) || 0,
        categoryId: p.category_id,
        costPrice:  parseFloat(p.cost_price) || 0,
    }]));

    // route-targeted promo থাকলেই শুধু customer-এর route lookup করো (অকারণ query এড়াতে)
    let customerRouteId = routeId;
    const needsRouteInfo = !customerRouteId && customerId &&
        promoRes.rows.some(p => p.apply_to === 'specific_routes');
    if (needsRouteInfo) {
        const custRes = await queryFn(
            `SELECT route_id FROM customers WHERE id = $1 AND tenant_id = $2`,
            [customerId, tenantId]
        );
        customerRouteId = custRes.rows[0]?.route_id || null;
    }

    const applicable = [];

    for (const promo of promoRes.rows) {
        // ── এলিজিবিলিটি গেট — যেকোনো একটা ব্যর্থ হলে promo সম্পূর্ণ বাদ ──

        if (promo.max_uses && promo.current_uses >= promo.max_uses) continue;

        // ✅ NEW: বাজেট ক্যাপ শেষ হয়ে গেলে promo আর দেখাবে না
        if (promo.budget_cap != null &&
            parseFloat(promo.budget_used || 0) >= parseFloat(promo.budget_cap)) continue;

        if (promo.max_per_customer && customerId) {
            const usedRes = await queryFn(
                `SELECT COUNT(*)::INTEGER AS cnt FROM promotion_uses
                 WHERE promotion_id = $1 AND customer_id = $2`,
                [promo.id, customerId]
            );
            if (usedRes.rows[0].cnt >= promo.max_per_customer) continue;
        }

        // ✅ NEW: promo_code — কোড থাকলে সঠিক কোড ছাড়া এই promo চোখেই পড়বে না
        // (case-insensitive; কোড না থাকা promotion আগের মতোই automatic)
        if (promo.promo_code) {
            if (!promoCode || promoCode.trim().toUpperCase() !== promo.promo_code.toUpperCase()) continue;
        }

        // ✅ NEW: route targeting
        if (promo.apply_to === 'specific_routes') {
            const promoRouteIds = (promo.route_ids || []).map(String);
            if (!customerRouteId || !promoRouteIds.includes(String(customerRouteId))) continue;
        }

        // ✅ NEW: customer targeting
        if (promo.apply_to === 'specific_customers') {
            const promoCustomerIds = (promo.customer_ids || []).map(String);
            if (!customerId || !promoCustomerIds.includes(String(customerId))) continue;
        }

        // ✅ FIX: product/category targeting হলে শুধু মিলে যাওয়া আইটেম নিয়েই
        // (scopedItems) হিসাব হবে, পুরো কার্ট না। এটা আগেও ভুল ছিল, কিন্তু
        // apply_to='specific_products' UI থেকে বানানোই যেত না বলে ধরা পড়েনি —
        // Phase 2-এ real targeting আসায় এটা এখন আসল সমস্যা হতো (যেমন: "শুধু
        // Snacks ক্যাটাগরিতে ১০% ছাড়"-এ যদি non-Snacks আইটেমও গণনায় ঢুকে যায়)।
        let scopedItems = items;
        if (promo.apply_to === 'specific_products') {
            const promoProductIds  = (promo.product_ids  || []).map(String);
            const promoCategoryIds = (promo.category_ids || []).map(String);
            scopedItems = items.filter(i => {
                const info = productInfo[i.product_id];
                return promoProductIds.includes(String(i.product_id)) ||
                       (info?.categoryId && promoCategoryIds.includes(String(info.categoryId)));
            });
            if (!scopedItems.length) continue; // টার্গেটেড কোনো আইটেমই কার্টে নেই
        }

        const scopedTotal = scopedItems.reduce((s, i) => s + (productInfo[i.product_id]?.price ?? 0) * (i.qty || 0), 0);
        const scopedQty   = scopedItems.reduce((s, i) => s + (i.qty || 0), 0);
        const scopedCost  = scopedItems.reduce((s, i) => s + (productInfo[i.product_id]?.costPrice ?? 0) * (i.qty || 0), 0);

        let discountAmount = 0;
        let message        = '';
        let promoFreeItems = [];

        switch (promo.type) {
            case 'percent_off':
                if (scopedTotal >= (promo.min_order_amount || 0)) {
                    discountAmount = scopedTotal * (promo.discount_value / 100);
                    message = `${promo.name}: ${promo.discount_value}% ছাড়`;
                }
                break;

            case 'flat_off':
                if (scopedTotal >= (promo.min_order_amount || 0)) {
                    discountAmount = Math.min(promo.discount_value, scopedTotal);
                    message = `${promo.name}: ৳${promo.discount_value} ছাড়`;
                }
                break;

            case 'buy_x_get_y':
                if (promo.buy_quantity && promo.free_product_id && scopedQty >= promo.buy_quantity) {
                    const freeQty = Math.floor(scopedQty / promo.buy_quantity) * (promo.free_quantity || 0);
                    if (freeQty > 0) {
                        const freeProdRes = await queryFn(
                            `SELECT id, name, price, stock, reserved_stock
                             FROM products WHERE id = $1 AND tenant_id = $2`,
                            [promo.free_product_id, tenantId]
                        );
                        if (freeProdRes.rows.length) {
                            const freeProd = freeProdRes.rows[0];
                            const availableStock = (freeProd.stock || 0) - (freeProd.reserved_stock || 0);
                            if (availableStock >= freeQty) {
                                discountAmount = parseFloat(freeProd.price || 0) * freeQty;
                                promoFreeItems = [{
                                    product_id: freeProd.id,
                                    name:       freeProd.name,
                                    price:      parseFloat(freeProd.price || 0),
                                    qty:        freeQty,
                                }];
                                message = `${promo.name}: ${freeQty}টা ${freeProd.name} ফ্রি 🎁`;
                            }
                        }
                    }
                }
                break;

            case 'min_order':
                if (scopedTotal >= promo.min_order_amount) {
                    discountAmount = promo.discount_value || 0;
                    message = `${promo.name}: ন্যূনতম অর্ডারে বিশেষ সুবিধা`;
                }
                break;

            // ✅ NEW: slab/tiered discount — tiers: [{min_qty, discount_value, discount_type}]
            case 'tiered_discount': {
                const tiers = Array.isArray(promo.tiers) ? promo.tiers : [];
                const eligibleTiers = tiers
                    .filter(t => scopedQty >= (t.min_qty || 0))
                    .sort((a, b) => (b.min_qty || 0) - (a.min_qty || 0)); // সবচেয়ে উঁচু যোগ্য স্ল্যাব
                if (eligibleTiers.length) {
                    const tier = eligibleTiers[0];
                    discountAmount = tier.discount_type === 'flat'
                        ? Math.min(tier.discount_value || 0, scopedTotal)
                        : scopedTotal * ((tier.discount_value || 0) / 100);
                    message = `${promo.name}: ${scopedQty} পিসে ${tier.discount_value}${tier.discount_type === 'flat' ? '৳' : '%'} ছাড় (স্ল্যাব)`;
                }
                break;
            }
        }

        // ✅ NEW: margin guard — discount যেন scopedTotal-কে scopedCost-এর নিচে না
        // নামায় (buy_x_get_y বাদ — সেটা price-cut না, physical free item)
        if (discountAmount > 0 && promo.type !== 'buy_x_get_y' && scopedCost > 0) {
            const maxAllowedDiscount = Math.max(0, scopedTotal - scopedCost);
            if (discountAmount > maxAllowedDiscount) {
                discountAmount = maxAllowedDiscount;
                message += ' (মার্জিন-সুরক্ষায় সীমিত)';
            }
        }

        // ✅ NEW: বাজেট ক্যাপের অবশিষ্ট অংশে discount সীমিত করো
        if (discountAmount > 0 && promo.budget_cap != null) {
            const remainingBudget = Math.max(0, parseFloat(promo.budget_cap) - parseFloat(promo.budget_used || 0));
            if (discountAmount > remainingBudget) discountAmount = remainingBudget;
        }

        if (discountAmount > 0 || promoFreeItems.length) {
            applicable.push({
                promotion:      promo,
                discountAmount: Math.round(discountAmount * 100) / 100,
                reducesPayable: promo.type !== 'buy_x_get_y',
                freeItems:      promoFreeItems,
                message,
            });
        }
    }

    // ✅ NEW: Stacking resolution — non-stackable promo eligible থাকলে তাদের
    // মধ্যে সবচেয়ে বেশি priority (টাই হলে সবচেয়ে বড় discount) জিতবে, এবং
    // সেটাই একমাত্র apply হবে (stackable সহ বাকি সব বাদ)। কোনো non-stackable
    // eligible না থাকলে সব stackable promo আগের মতোই একসাথে যোগ হবে।
    let finalApplicable = applicable;
    const nonStackable = applicable.filter(a => a.promotion.stackable === false);
    if (nonStackable.length) {
        nonStackable.sort((a, b) =>
            (b.promotion.priority || 0) - (a.promotion.priority || 0) || b.discountAmount - a.discountAmount
        );
        finalApplicable = [nonStackable[0]];
    }

    const freeItems = [];
    let   totalDiscount   = 0;
    let   payableDiscount = 0;
    for (const a of finalApplicable) {
        totalDiscount += a.discountAmount;
        if (a.reducesPayable) payableDiscount += a.discountAmount;
        freeItems.push(...a.freeItems);
    }

    return {
        applicable: finalApplicable,
        totalDiscount:   Math.round(totalDiscount * 100) / 100,   // true cost সহ ফ্রি-গিফট (admin reporting)
        payableDiscount: Math.round(payableDiscount * 100) / 100, // কাস্টমারের বিল যতটা কমবে (checkout-এ ব্যবহার্য)
        freeItems,
    };
}

/**
 * একটা promotion-এর ব্যবহার রেকর্ড করে। withTransaction()-এর client দিয়ে,
 * বিক্রয় INSERT-এর মতো একই transaction-এর ভেতরে call করতে হবে — যাতে
 * sale rollback হলে promotion usage-ও rollback হয় (আর উল্টোটাও)।
 *
 * FOR UPDATE লক দিয়ে max_uses/max_per_customer শেষবারের মতো verify করে
 * (preview-এর read আর এই commit-এর মাঝে অন্য কেউ শেষ slot নিয়ে থাকতে পারে)।
 * invalid হলে গোটা sale transaction rollback হয়ে যাবে — এই ফাইলের
 * order-lock/credit-limit-check-এর মতোই established pattern।
 *
 * @param {object} params
 * @param {object} params.client         - withTransaction থেকে পাওয়া pg client
 * @param {string} params.tenantId
 * @param {string} params.promotionId
 * @param {string} params.saleId
 * @param {string} params.workerId
 * @param {string} [params.customerId]
 * @param {number} params.discountGiven
 * @param {number} [params.freeQtyGiven]
 */
async function recordPromotionUsage({
    client, tenantId, promotionId, saleId, workerId,
    customerId, discountGiven, freeQtyGiven = 0,
}) {
    const lockRes = await client.query(
        `SELECT id, max_uses, current_uses, max_per_customer, budget_cap, budget_used
         FROM promotions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [promotionId, tenantId]
    );
    if (!lockRes.rows.length) return; // promotion ইতোমধ্যে মুছে গেছে — silently skip

    const promo = lockRes.rows[0];

    if (promo.max_uses && promo.current_uses >= promo.max_uses) {
        throw Object.assign(
            new Error('PROMOTION_UNAVAILABLE'),
            { statusCode: 409, clientMessage: 'একটি প্রমোশনের সর্বোচ্চ ব্যবহারসীমা শেষ হয়ে গেছে — আবার চেষ্টা করুন।' }
        );
    }

    if (promo.max_per_customer && customerId) {
        const usedRes = await client.query(
            `SELECT COUNT(*)::INTEGER AS cnt FROM promotion_uses
             WHERE promotion_id = $1 AND customer_id = $2`,
            [promotionId, customerId]
        );
        if (usedRes.rows[0].cnt >= promo.max_per_customer) {
            throw Object.assign(
                new Error('PROMOTION_UNAVAILABLE'),
                { statusCode: 409, clientMessage: 'এই কাস্টমার এই প্রমোশনের সর্বোচ্চ ব্যবহারসীমায় পৌঁছে গেছেন।' }
            );
        }
    }

    // ✅ NEW: বাজেট ক্যাপ — শেষবারের মতো lock-সহ verify (preview-এর read আর
    // এই commit-এর মাঝে অন্য কেউ বাজেট শেষ করে ফেলতে পারে)। ছোট্ট ০.০১
    // tolerance রাখা হয়েছে floating-point রাউন্ডিং-এর কারণে false-reject এড়াতে।
    if (promo.budget_cap != null) {
        const wouldBeUsed = parseFloat(promo.budget_used || 0) + parseFloat(discountGiven || 0);
        if (wouldBeUsed > parseFloat(promo.budget_cap) + 0.01) {
            throw Object.assign(
                new Error('PROMOTION_UNAVAILABLE'),
                { statusCode: 409, clientMessage: 'এই প্রমোশনের বাজেট শেষ হয়ে গেছে — আবার চেষ্টা করুন।' }
            );
        }
    }

    await client.query(
        `INSERT INTO promotion_uses
            (promotion_id, sale_id, worker_id, customer_id, discount_given, free_qty_given, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [promotionId, saleId, workerId, customerId || null, discountGiven, freeQtyGiven, tenantId]
    );

    await client.query(
        `UPDATE promotions
         SET current_uses = current_uses + 1,
             budget_used   = COALESCE(budget_used, 0) + $3
         WHERE id = $1 AND tenant_id = $2`,
        [promotionId, tenantId, discountGiven]
    );
}

/**
 * Buy X Get Y-এর ফ্রি আইটেম stock থেকে lock করে বাদ দেয়।
 *
 * এই stock অন্য কোথাও reserve হয় না — createOrder()/approveOrder()
 * (stock reservation ধাপ) promotion সম্পর্কে কিছু জানে না, কারণ SR
 * অর্ডার করার সময় কোন promotion trigger হবে তা নিশ্চিত না। তাই
 * regular item-এর মতো (যেখানে approveOrder()-এ আগেই stock কমেছে,
 * এখানে শুধু audit trail) — ফ্রি আইটেমের জন্য এখানেই আসল deduct করা হয়।
 *
 * @param {object} params
 * @param {object} params.client
 * @param {string} params.tenantId
 * @param {string} params.productId
 * @param {number} params.qty
 * @param {string} params.productName
 */
async function deductFreeGiftStock({ client, tenantId, productId, qty, productName }) {
    const stockRes = await client.query(
        `SELECT stock, reserved_stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [productId, tenantId]
    );
    const available = stockRes.rows.length
        ? (stockRes.rows[0].stock || 0) - (stockRes.rows[0].reserved_stock || 0)
        : 0;

    if (available < qty) {
        throw Object.assign(
            new Error('PROMOTION_UNAVAILABLE'),
            { statusCode: 409, clientMessage: `"${productName}" ফ্রি আইটেমের স্টক শেষ হয়ে গেছে — আবার চেষ্টা করুন।` }
        );
    }

    await client.query(
        `UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
        [qty, productId, tenantId]
    );
}

/**
 * Phase ৩ (Governance): এই promotion-টা কি সরাসরি live করা যাবে, নাকি
 * আগে দ্বিতীয় একজন admin-এর approval লাগবে? বড় ছাড়/সীমাহীন বাজেট
 * fat-finger ভুল বা অতিরিক্ত ক্ষমতা ব্যবহার থেকে সুরক্ষা দেয়।
 *
 * থ্রেশহোল্ড নিচে APPROVAL_THRESHOLDS-এ — ব্যবসার প্রয়োজনে সহজেই বদলানো যাবে।
 *
 * @returns {string|null} - approval লাগলে কারণ (বাংলায়, UI-তে দেখানোর জন্য); না লাগলে null
 */
function needsApproval({ type, discount_value, budget_cap, tiers }) {
    const t = APPROVAL_THRESHOLDS;

    if (type === 'percent_off' && discount_value > t.maxAutoPercent) {
        return `% ছাড় ${t.maxAutoPercent}%-এর বেশি (${discount_value}%) — বড় ছাড়ে দ্বিতীয় admin-এর অনুমোদন লাগবে।`;
    }
    if (type === 'flat_off' && discount_value > t.maxAutoFlatAmount) {
        return `৳ ছাড় ৳${t.maxAutoFlatAmount}-এর বেশি (৳${discount_value}) — বড় ছাড়ে দ্বিতীয় admin-এর অনুমোদন লাগবে।`;
    }
    if (type === 'tiered_discount' && Array.isArray(tiers)) {
        const worst = tiers.reduce((max, tr) => Math.max(max, tr.discount_value || 0), 0);
        if (worst > t.maxAutoPercent) {
            return `স্ল্যাবের কোনো একটায় ছাড় ${t.maxAutoPercent}%-এর বেশি (${worst}%) — অনুমোদন লাগবে।`;
        }
    }
    if (budget_cap == null) {
        return 'কোনো বাজেট ক্যাপ সেট করা হয়নি — সীমাহীন খরচের ঝুঁকি এড়াতে অনুমোদন লাগবে (অথবা একটা বাজেট ক্যাপ দিন)।';
    }
    if (budget_cap > t.maxAutoBudget) {
        return `বাজেট ক্যাপ ৳${t.maxAutoBudget}-এর বেশি (৳${budget_cap}) — বড় বাজেটে দ্বিতীয় admin-এর অনুমোদন লাগবে।`;
    }
    return null;
}

// এই সংখ্যাগুলো ব্যবসার নীতি অনুযায়ী বদলানো যাবে — কোথাও hardcode ছড়িয়ে
// নেই, শুধু এখানেই। buy_x_get_y/min_order ইচ্ছাকৃতভাবে থ্রেশহোল্ডের বাইরে
// রাখা হয়েছে (এগুলোর "ছাড়" সরাসরি টাকার অঙ্ক না, তুলনামূলক কম ঝুঁকিপূর্ণ)।
const APPROVAL_THRESHOLDS = {
    maxAutoPercent:    25,     // ২৫%-এর বেশি percent_off/tiered হলে অনুমোদন লাগবে
    maxAutoFlatAmount: 500,    // ৳৫০০-এর বেশি flat_off হলে অনুমোদন লাগবে
    maxAutoBudget:     50000,  // ৳৫০,০০০-এর বেশি বাজেট ক্যাপ হলে অনুমোদন লাগবে
};

module.exports = { getEligiblePromotions, recordPromotionUsage, deductFreeGiftStock, needsApproval, APPROVAL_THRESHOLDS };
