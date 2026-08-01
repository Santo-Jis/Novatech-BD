// priceList.utils.js
// Step ৫: মাল্টিপল প্রাইস লিস্ট (পাইকারি/খুচরা/এলাকাভিত্তিক) রেজলিউশন হেল্পার।
//
// একটা অর্ডার/সেল-এর জন্য price list resolve হয় কাস্টমার + চ্যানেল অনুযায়ী,
// প্রোডাক্ট অনুযায়ী না — তাই পুরো অর্ডারে একবারই resolve করলেই চলে,
// তারপর সেই লিস্ট থেকে যে প্রোডাক্টগুলোর override দাম আছে সেগুলো bulk-এ আনা হয়।
//
// রেজলিউশন অগ্রাধিকার (উপর থেকে নিচে, প্রথমে যেটা মেলে সেটাই জেতে):
//   ১. কাস্টমার-নির্দিষ্ট override      (price_list_customers)
//   ২. এলাকা(route)-ভিত্তিক             (price_list_areas)
//   ৩. চ্যানেলের ডিফল্ট লিস্ট           (price_lists.is_default = true)
//   ৪. কিছুই না মিললে → বেস products.price (caller-এর দায়িত্ব, এই ফাইলে না)
//
// প্রতিটা ধাপে channel-নির্দিষ্ট এন্ট্রি 'all' এন্ট্রির চেয়ে অগ্রাধিকার পায়।
// একটা price list-এ কোনো নির্দিষ্ট প্রোডাক্টের এন্ট্রি না থাকলে সেই প্রোডাক্টের
// জন্য বেস দাম ব্যবহার হবে (পুরো লিস্ট বাতিল হয় না, per-product fallback)।

/**
 * @param {Function} dbQuery - query(sql, params) বা client.query.bind(client)
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} [opts.customerId]
 * @param {string} [opts.routeId]
 * @param {'van_sales'|'app_ecommerce'|'public_ecommerce'} opts.channel
 * @returns {Promise<string|null>} resolved price_list_id বা null
 */
async function resolvePriceListId(dbQuery, { tenantId, customerId, routeId, channel }) {
    if (customerId) {
        const r1 = await dbQuery(
            `SELECT pl.id FROM price_list_customers plc
             JOIN price_lists pl ON pl.id = plc.price_list_id
             WHERE plc.customer_id = $1 AND pl.tenant_id = $2 AND pl.is_active = true
               AND (pl.channel = $3 OR pl.channel = 'all')
             ORDER BY (pl.channel = $3) DESC
             LIMIT 1`,
            [customerId, tenantId, channel]
        );
        if (r1.rows.length) return r1.rows[0].id;
    }

    if (routeId) {
        const r2 = await dbQuery(
            `SELECT pl.id FROM price_list_areas pla
             JOIN price_lists pl ON pl.id = pla.price_list_id
             WHERE pla.route_id = $1 AND pl.tenant_id = $2 AND pl.is_active = true
               AND (pl.channel = $3 OR pl.channel = 'all')
             ORDER BY (pl.channel = $3) DESC
             LIMIT 1`,
            [routeId, tenantId, channel]
        );
        if (r2.rows.length) return r2.rows[0].id;
    }

    const r3 = await dbQuery(
        `SELECT id FROM price_lists
         WHERE tenant_id = $1 AND is_active = true AND is_default = true
           AND (channel = $2 OR channel = 'all')
         ORDER BY (channel = $2) DESC
         LIMIT 1`,
        [tenantId, channel]
    );
    return r3.rows.length ? r3.rows[0].id : null;
}

/**
 * একটা resolved price_list_id থেকে দেওয়া productIds-গুলোর override দাম বের করে।
 * @returns {Promise<Object<string, number>>} product_id → price (যাদের override আছে শুধু তারাই থাকবে)
 */
async function getPriceListPrices(dbQuery, { priceListId, productIds }) {
    if (!priceListId || !productIds || productIds.length === 0) return {};
    const r = await dbQuery(
        `SELECT product_id, price FROM price_list_items
         WHERE price_list_id = $1 AND product_id = ANY($2::uuid[])`,
        [priceListId, productIds]
    );
    const map = {};
    r.rows.forEach(row => { map[row.product_id] = parseFloat(row.price); });
    return map;
}

/**
 * সবচেয়ে বেশি ব্যবহৃত এন্ট্রি পয়েন্ট — resolve + fetch একসাথে।
 * @returns {Promise<{ priceListId: string|null, prices: Object<string, number> }>}
 */
async function getResolvedPrices(dbQuery, { tenantId, customerId, routeId, channel, productIds }) {
    const priceListId = await resolvePriceListId(dbQuery, { tenantId, customerId, routeId, channel });
    if (!priceListId) return { priceListId: null, prices: {} };
    const prices = await getPriceListPrices(dbQuery, { priceListId, productIds });
    return { priceListId, prices };
}

module.exports = { resolvePriceListId, getPriceListPrices, getResolvedPrices };
