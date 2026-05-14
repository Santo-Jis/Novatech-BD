const { query } = require('../config/db');

// ============================================================
// RESERVED STOCK SYNC JOB
// প্রতি ৫ মিনিটে products.reserved_stock recalculate করে
// যাতে stale data থেকে available_stock ভুল না দেখায়
// ============================================================

const syncReservedStock = async () => {
    try {
        await query(`
            UPDATE products p
            SET reserved_stock = COALESCE((
                SELECT SUM((item->>'quantity')::int)
                FROM orders o,
                     jsonb_array_elements(
                         CASE WHEN jsonb_typeof(o.items::jsonb) = 'array'
                              THEN o.items::jsonb
                              ELSE '[]'::jsonb
                         END
                     ) AS item
                WHERE (item->>'product_id')::int = p.id
                  AND o.status IN ('pending', 'approved', 'processing')
            ), 0),
            updated_at = NOW()
            WHERE is_active = true
        `);
        console.log('✅ reserved_stock sync সম্পন্ন');
    } catch (error) {
        console.error('❌ reserved_stock sync ব্যর্থ:', error.message);
    }
};

const startReservedStockJob = () => {
    // প্রথমবার সাথে সাথে চালাও, তারপর প্রতি ৫ মিনিটে
    syncReservedStock();
    setInterval(syncReservedStock, 5 * 60 * 1000);
    console.log('✅ Reserved Stock Sync Job চালু (প্রতি ৫ মিনিট)');
};

module.exports = { startReservedStockJob, syncReservedStock };
