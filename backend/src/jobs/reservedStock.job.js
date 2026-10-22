const logger = require('../config/logger');
const { withTransaction } = require('../config/db');

// ============================================================
// RESERVED STOCK SYNC JOB
// প্রতি ৫ মিনিটে products.reserved_stock recalculate করে
// যাতে stale data থেকে available_stock ভুল না দেখায়
//
// পারফরম্যান্স ফিক্স:
//   আগে: প্রতিটা product-এর জন্য আলাদা করে সব orders স্ক্যান করে
//        jsonb items expand করা হতো (products × orders) →
//        "canceling statement due to statement timeout" (57014),
//        আর লম্বা query DB connection আটকে রেখে pool starve করতো।
//   এখন: orders একবারই স্ক্যান করে product-ভিত্তিক যোগফল (CTE) বের করা হয়,
//        তারপর শুধু যেসব product-এর মান আসলেই বদলেছে সেগুলো UPDATE হয়।
// ============================================================

const SYNC_TIMEOUT_MS       = 60 * 1000;      // এই job-এর query সর্বোচ্চ ৬০ সেকেন্ড
const SYNC_INTERVAL_MS      = 5 * 60 * 1000;  // প্রতি ৫ মিনিট
const FIRST_RUN_DELAY_MS    = 45 * 1000;      // boot-এর ১২টা job একসাথে DB hit করে pool
                                              // starve করতো — তাই প্রথম রান একটু পরে

const UUID_RE = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

let running = false; // আগের রান শেষ না হলে নতুন রান শুরু হবে না

const syncReservedStock = async () => {
    if (running) {
        logger.warn('⚠️ reserved_stock sync এখনো চলছে — এই রান বাদ দেওয়া হলো');
        return;
    }
    running = true;
    try {
        const updatedCount = await withTransaction(async (client) => {
            // transaction-scoped — Supabase pooler (transaction mode)-এও নিরাপদ
            await client.query(`SET LOCAL statement_timeout = ${SYNC_TIMEOUT_MS}`);

            const result = await client.query(`
                WITH reserved AS (
                    SELECT
                        CASE WHEN item->>'product_id' ~ '${UUID_RE}'
                             THEN (item->>'product_id')::uuid END AS product_id,
                        SUM(CASE WHEN item->>'quantity' ~ '^[0-9]+$'
                                 THEN (item->>'quantity')::int ELSE 0 END) AS qty
                    FROM orders o
                    CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(o.items::jsonb) = 'array'
                             THEN o.items::jsonb
                             ELSE '[]'::jsonb
                        END
                    ) AS item
                    WHERE o.status IN ('pending', 'approved', 'processing')
                    GROUP BY 1
                ),
                target AS (
                    SELECT p.id, COALESCE(r.qty, 0) AS qty
                    FROM products p
                    LEFT JOIN reserved r ON r.product_id = p.id
                    WHERE p.is_active = true
                )
                UPDATE products p
                SET reserved_stock = t.qty,
                    updated_at = NOW()
                FROM target t
                WHERE p.id = t.id
                  AND p.reserved_stock IS DISTINCT FROM t.qty
            `);
            return result.rowCount;
        });
        logger.info('✅ reserved_stock sync সম্পন্ন', { updated: updatedCount });
    } catch (error) {
        logger.error('❌ reserved_stock sync ব্যর্থ', { err: error });
    } finally {
        running = false;
    }
};

const startReservedStockJob = () => {
    // প্রথম রান কিছুক্ষণ পরে (startup contention এড়াতে), তারপর প্রতি ৫ মিনিটে
    setTimeout(syncReservedStock, FIRST_RUN_DELAY_MS).unref?.();
    setInterval(syncReservedStock, SYNC_INTERVAL_MS);
    logger.info('✅ Reserved Stock Sync Job চালু (প্রতি ৫ মিনিট)');
};

module.exports = { startReservedStockJob, syncReservedStock };
