const logger = require('../config/logger');
const { query } = require('../config/db');

// ============================================================
// GET /api/coverage/my-customers
// SR-এর প্রতিটা দোকানে product coverage দেখাবে
// ============================================================

const getMyCustomerCoverage = async (req, res) => {
    try {
        const workerId = req.user.id;

        // SR-এর assigned customers
        const custRes = await query(
            `SELECT c.id, c.shop_name, c.customer_code, ca.route_id
             FROM customer_assignments ca
             JOIN customers c ON c.id = ca.customer_id
             WHERE ca.worker_id = $1 AND c.status = 'active'
             AND ca.tenant_id = $2
             ORDER BY c.shop_name`,
            [workerId, req.tenantId]
        );

        if (!custRes.rows.length) {
            return res.json({ success: true, data: [] });
        }

        // active products
        const prodRes = await query(
            `SELECT id, name, sku FROM products WHERE is_active = true ORDER BY name`
        );
        const products = prodRes.rows;
        const totalProducts = products.length;

        if (!totalProducts) {
            return res.json({ success: true, data: [] });
        }

        const customerIds = custRes.rows.map(c => c.id);

        // প্রতিটা customer × product-এ শেষ sale কবে হয়েছে
        const salesRes = await query(
            `SELECT
                st.customer_id,
                (si->>'product_id')::uuid AS product_id,
                MAX(st.created_at)     AS last_sold_at,
                COUNT(*)::INTEGER      AS times_sold
             FROM sales_transactions st,
                  jsonb_array_elements(st.items) AS si
             WHERE st.customer_id = ANY($1::uuid[])
               AND st.status = 'verified'
               AND (si->>'product_id') IS NOT NULL
             AND st.tenant_id = $2
             GROUP BY st.customer_id, si->>'product_id'`,
            [customerIds, req.tenantId]
        );

        // Map: customer_id → { product_id → { last_sold_at, times_sold } }
        const salesMap = {};
        for (const row of salesRes.rows) {
            if (!salesMap[row.customer_id]) salesMap[row.customer_id] = {};
            salesMap[row.customer_id][row.product_id] = {
                last_sold_at: row.last_sold_at,
                times_sold  : row.times_sold,
            };
        }

        const now = new Date();

        const data = custRes.rows.map(customer => {
            const cSales     = salesMap[customer.id] || {};
            let coveredCount = 0;
            const missing    = [];

            for (const prod of products) {
                const sale = cSales[prod.id];
                if (sale) {
                    coveredCount++;
                } else {
                    const daysSince = sale
                        ? Math.floor((now - new Date(sale.last_sold_at)) / 86400000)
                        : null;
                    missing.push({
                        product_id  : prod.id,
                        product_name: prod.name,
                        sku         : prod.sku,
                        last_sold_at: sale?.last_sold_at || null,
                        days_since  : daysSince,
                    });
                }
            }

            const coveragePct = Math.round(coveredCount / totalProducts * 100);

            return {
                customer_id    : customer.id,
                shop_name      : customer.shop_name,
                customer_code  : customer.customer_code,
                total_products : totalProducts,
                covered_products: coveredCount,
                coverage_pct   : coveragePct,
                coverage_level : coveragePct >= 80 ? 'high' : coveragePct >= 50 ? 'medium' : 'low',
                missing_products: missing,
            };
        });

        return res.json({ success: true, data });

    } catch (err) {
        logger.error('[Coverage] getMyCustomerCoverage error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/coverage/visit-alert/:customer_id
// Visit শুরুর আগে SR-কে missing products দেখাবে
// ============================================================

const getVisitAlert = async (req, res) => {
    try {
        const workerId   = req.user.id;
        const customerId = req.params.customer_id;

        // Verify assignment
        const assignRes = await query(
            `SELECT id FROM customer_assignments WHERE worker_id=$1 AND customer_id=$2
             AND tenant_id = $3`,
            [workerId, customerId, req.tenantId]
        );
        if (!assignRes.rows.length) {
            return res.status(403).json({ success: false, message: 'এই দোকান আপনার নয়।' });
        }

        // active products
        const prodRes = await query(
            `SELECT id, name FROM products WHERE is_active = true`
        );

        // এই দোকানে কোন products কখনো বিক্রি হয়েছে
        const soldRes = await query(
            `SELECT DISTINCT (si->>'product_id')::uuid AS product_id
             FROM sales_transactions st,
                  jsonb_array_elements(st.items) AS si
             WHERE st.customer_id = $1 AND st.status = 'verified'
             AND st.tenant_id = $2`,
            [customerId, req.tenantId]
        );

        const soldIds    = new Set(soldRes.rows.map(r => r.product_id));
        const neverSold  = prodRes.rows.filter(p => !soldIds.has(p.id));

        // ৩০+ দিন আগে বিক্রি হয়েছে এমন products
        const staleRes = await query(
            `SELECT
                (si->>'product_id')::uuid AS product_id,
                MAX(st.created_at) AS last_sold_at
             FROM sales_transactions st,
                  jsonb_array_elements(st.items) AS si
             WHERE st.customer_id = $1
               AND st.status = 'verified'
               AND st.created_at < NOW() - INTERVAL '30 days'
             AND st.tenant_id = $2
             GROUP BY si->>'product_id'`,
            [customerId, req.tenantId]
        );

        return res.json({
            success: true,
            data: {
                never_sold    : neverSold.map(p => ({ product_id: p.id, name: p.name })),
                stale_products: staleRes.rows,
                has_alert     : neverSold.length > 0 || staleRes.rows.length > 0,
            }
        });

    } catch (err) {
        logger.error('[Coverage] getVisitAlert error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/coverage/team-summary
// Manager-এর team-এর overall product coverage
// ============================================================

const getTeamCoverageSummary = async (req, res) => {
    try {
        const managerId = req.user.id;

        const teamRes = await query(
            `SELECT t.id FROM teams t WHERE t.manager_id = $1
             AND t.tenant_id = $2
             LIMIT 1`,
            [managerId, req.tenantId]
        );
        if (!teamRes.rows.length) {
            return res.json({ success: true, data: { by_product: [], summary: {} } });
        }
        const teamId = teamRes.rows[0].id;

        // Team-এর সব customers
        const custRes = await query(
            `SELECT DISTINCT ca.customer_id
             FROM customer_assignments ca
             JOIN users u ON u.id = ca.worker_id
             WHERE u.team_id = $1 AND u.role = 'worker'
             AND ca.tenant_id = $2`,
            [teamId, req.tenantId]
        );
        const totalCustomers = custRes.rows.length;
        if (!totalCustomers) {
            return res.json({ success: true, data: { by_product: [], summary: { total_customers: 0 } } });
        }

        const customerIds = custRes.rows.map(r => r.customer_id);

        // Product-wise coverage
        const prodRes = await query(`SELECT id, name FROM products WHERE is_active=true
             AND tenant_id = $1
             ORDER BY name`, [req.tenantId]);

        const byProduct = [];
        for (const prod of prodRes.rows) {
            const covRes = await query(
                `SELECT COUNT(DISTINCT st.customer_id)::INTEGER AS covered
                 FROM sales_transactions st,
                      jsonb_array_elements(st.items) AS si
                 WHERE st.customer_id = ANY($1::uuid[])
                   AND (si->>'product_id')::uuid = $2
                   AND st.status = 'verified'
             AND st.tenant_id = $3`,
                [customerIds, prod.id, req.tenantId]
            );
            const covered = covRes.rows[0]?.covered || 0;
            byProduct.push({
                product_id  : prod.id,
                product_name: prod.name,
                covered,
                total       : totalCustomers,
                pct         : Math.round(covered / totalCustomers * 100),
            });
        }

        byProduct.sort((a, b) => b.pct - a.pct);

        return res.json({
            success: true,
            data   : {
                summary    : { total_customers: totalCustomers },
                by_product : byProduct,
            }
        });

    } catch (err) {
        logger.error('[Coverage] getTeamCoverageSummary error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = { getMyCustomerCoverage, getVisitAlert, getTeamCoverageSummary };
