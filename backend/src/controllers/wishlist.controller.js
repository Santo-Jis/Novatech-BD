// ============================================================
// wishlist.controller.js
// ✅ NEW (ফেজ ৩ — উইশলিস্ট/সেভড আইটেম)
// ============================================================
// শুধু customer portal-এর জন্য (customer-নির্দিষ্ট ডেটা)। enrichment
// getPortalProducts-এর মতোই (price_lists resolve করে), তাই ফ্রন্টএন্ডে
// একই ProductCard সরাসরি রিইউজ করা যায়।
// ============================================================

const logger = require('../config/logger');
const { query } = require('../config/db');
const { getResolvedPrices } = require('../services/priceList.utils');
const { calcFinalPrice } = require('../services/price.utils');

// ============================================================
// GET /api/portal/wishlist
// ============================================================

const getWishlist = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const custResult = await query(`SELECT route_id FROM customers WHERE id = $1`, [customer_id]);
        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        const { route_id: routeId } = custResult.rows[0];

        const { rows } = await query(
            `SELECT p.id, p.name, p.price, p.vat, p.tax, p.unit, p.image_url,
                    p.tenant_id, t.company_name, t.company_name_bn, t.logo_url,
                    (p.stock - COALESCE(p.reserved_stock, 0)) AS available_stock,
                    w.created_at AS saved_at
             FROM wishlist_items w
             JOIN products p ON p.id = w.product_id
             JOIN tenants  t ON t.id = p.tenant_id
             WHERE w.customer_id = $1
               AND p.is_active = true
             ORDER BY w.created_at DESC`,
            [customer_id]
        );

        if (rows.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // getPortalProducts-এর মতোই tenant-group করে price_list resolve
        const byTenant = {};
        rows.forEach(p => { (byTenant[p.tenant_id] ??= []).push(p); });

        const priceMaps = {};
        await Promise.all(Object.keys(byTenant).map(async (tId) => {
            const { prices } = await getResolvedPrices(query, {
                tenantId: tId, customerId: customer_id, routeId, channel: 'app_ecommerce',
                productIds: byTenant[tId].map(p => p.id),
            });
            priceMaps[tId] = prices;
        }));

        const enriched = rows.map(p => {
            const listPrice = parseFloat(p.price);
            const basePrice = priceMaps[p.tenant_id]?.[p.id] ?? listPrice;
            const { vatAmount, taxAmount, finalPrice } = calcFinalPrice(basePrice, p.vat, p.tax);
            const { finalPrice: listFinalPrice } = calcFinalPrice(listPrice, p.vat, p.tax);
            return {
                id:                p.id,
                name:              p.name,
                unit:              p.unit,
                image_url:         p.image_url,
                available_stock:   p.available_stock,
                tenant_id:         p.tenant_id,
                company_name:      p.company_name,
                company_name_bn:   p.company_name_bn,
                logo_url:          p.logo_url,
                base_price:        basePrice,
                vat_amount:        vatAmount,
                tax_amount:        taxAmount,
                final_price:       finalPrice,
                has_extra:         vatAmount > 0 || taxAmount > 0,
                list_price:        listFinalPrice,
                has_special_price: basePrice < listPrice,
                saved_at:          p.saved_at,
            };
        });

        return res.json({ success: true, data: enriched });

    } catch (error) {
        logger.error('❌ getWishlist Error:', error.message);
        return res.status(500).json({ success: false, message: 'সেভড তালিকা আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/wishlist  { product_id }
// ============================================================

const addToWishlist = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { product_id } = req.body;
        if (!product_id) {
            return res.status(400).json({ success: false, message: 'product_id দিন।' });
        }
        await query(
            `INSERT INTO wishlist_items (customer_id, product_id)
             VALUES ($1, $2)
             ON CONFLICT (customer_id, product_id) DO NOTHING`,
            [customer_id, product_id]
        );
        return res.status(201).json({ success: true, message: 'সেভ করা হয়েছে।' });
    } catch (error) {
        logger.error('❌ addToWishlist Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// DELETE /api/portal/wishlist/:productId
// ============================================================

const removeFromWishlist = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        await query(
            `DELETE FROM wishlist_items WHERE customer_id = $1 AND product_id = $2`,
            [customer_id, req.params.productId]
        );
        return res.json({ success: true, message: 'সরানো হয়েছে।' });
    } catch (error) {
        logger.error('❌ removeFromWishlist Error:', error.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
