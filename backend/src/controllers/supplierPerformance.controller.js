// backend/src/controllers/supplierPerformance.controller.js
// অন-টাইম ডেলিভারি % ও গড় লিড টাইম — সাপ্লায়ার পারফরম্যান্স ট্র্যাকিং।
//
// ডেটা-মডেল নোট: purchase_orders/purchase_order_items-এ কোনো "actual received date"
// কলাম নেই। কিন্তু receivePurchaseOrder() (purchaseOrder.controller.js) প্রতিটা রিসিভ
// অ্যাকশনে stock_movements-এ একটা রো লেখে (reference_type='purchase', reference_id=po.id,
// created_at ডিফল্ট NOW())। সেটাই এখানে "প্রকৃত ডেলিভারির তারিখ" হিসেবে ব্যবহার করা হলো —
// একটা PO-র সর্বশেষ receiving action-এর সময়, যা তার সম্পূর্ণ-প্রাপ্তির সবচেয়ে নির্ভরযোগ্য প্রক্সি।

const logger = require('../config/logger');
const { query } = require('../config/db');

// GET /api/suppliers/:id/performance
const getSupplierPerformance = async (req, res) => {
    try {
        const result = await query(
            `WITH po_delivery AS (
                SELECT
                    po.id,
                    po.expected_date,
                    po.order_date,
                    (SELECT MAX(sm.created_at)::date FROM stock_movements sm
                        WHERE sm.reference_type = 'purchase' AND sm.reference_id = po.id) AS actual_delivery_date
                FROM purchase_orders po
                WHERE po.supplier_id = $1 AND po.tenant_id = $2 AND po.status = 'received'
             )
             SELECT
                COUNT(*) AS total_received,
                COUNT(*) FILTER (WHERE expected_date IS NOT NULL AND actual_delivery_date IS NOT NULL) AS with_expected,
                COUNT(*) FILTER (WHERE expected_date IS NOT NULL AND actual_delivery_date IS NOT NULL
                                        AND actual_delivery_date <= expected_date) AS on_time_count,
                ROUND(AVG(actual_delivery_date - order_date) FILTER (WHERE actual_delivery_date IS NOT NULL), 1) AS avg_lead_time_days
             FROM po_delivery`,
            [req.params.id, req.tenantId]
        );

        const row = result.rows[0];
        const withExpected = parseInt(row.with_expected, 10);
        const onTimeCount  = parseInt(row.on_time_count, 10);

        return res.status(200).json({
            success: true,
            data: {
                total_received:     parseInt(row.total_received, 10),
                with_expected:      withExpected,
                on_time_count:      onTimeCount,
                // ভিত্তি (expected_date-সহ প্রাপ্ত PO) না থাকলে শতাংশ অর্থহীন — null রাখা হলো, 0% নয়
                on_time_pct:        withExpected > 0 ? Math.round((onTimeCount / withExpected) * 1000) / 10 : null,
                avg_lead_time_days: row.avg_lead_time_days !== null ? parseFloat(row.avg_lead_time_days) : null,
            }
        });

    } catch (error) {
        logger.error('❌ Get Supplier Performance Error:', error.message);
        return res.status(500).json({ success: false, message: 'পারফরম্যান্স তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = { getSupplierPerformance };
