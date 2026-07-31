// batchFefo.utils.js
// Step ৪: FEFO (First Expired, First Out) ব্যাচ কনজাম্পশন হেল্পার।
//
// products.stock থেকে যেখানেই আসল স্টক বের হয় (approveOrder-এ — কারণ
// sales.controller.js শুধু audit trail রাখে, products.stock সেখানে touch হয় না,
// দেখুন handoff ডকুমেন্ট), সেখানে এই ফাংশন কল করে product_batches থেকেও
// expiry-ভিত্তিক ক্রমে (আগে মেয়াদ শেষ হবে যেটার, আগে সেটা) কমাতে হবে।
//
// ব্যাচ ট্র্যাকিং ঐচ্ছিক — অনেক প্রোডাক্টের কোনো ব্যাচ রেকর্ডই নাও থাকতে পারে
// (legacy স্টক, বা batch/expiry ছাড়া রিসিভ করা মাল)। তাই এই ফাংশন কখনো ব্লক
// করে না — batch থেকে যতটুকু মেলে ততটুকু কাটে, বাকিটা "untracked" হিসেবে
// (batch_id = NULL) audit-এ রেকর্ড হয়।

/**
 * একটা প্রোডাক্টের জন্য FEFO অনুযায়ী ব্যাচ থেকে qty কনজিউম করে এবং
 * stock_movements-এ প্রতিটা ব্যাচ-অংশের জন্য আলাদা 'out' এন্ট্রি লেখে।
 *
 * @param {object} client - withTransaction থেকে পাওয়া pg client
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.productId
 * @param {number} opts.qty              - মোট কমাতে হবে এমন পরিমাণ
 * @param {string} opts.referenceId      - stock_movements.reference_id (যেমন order.id)
 * @param {string} opts.referenceType    - stock_movements.reference_type (যেমন 'order')
 * @param {string} opts.createdBy        - stock_movements.created_by (req.user.id)
 * @param {string} [opts.note]
 * @returns {Promise<{consumed: Array<{batch_id: string, quantity: number}>, untracked: number}>}
 */
async function consumeBatchesFEFO(client, {
    tenantId, productId, qty, referenceId, referenceType, createdBy, note
}) {
    const consumed = [];
    let remaining = parseInt(qty, 10) || 0;
    if (remaining <= 0) return { consumed, untracked: 0 };

    // FEFO অর্ডার: expiry_date যার নেই সে সবার পরে, তারপর যার expiry সবচেয়ে কাছে সে আগে
    // FOR UPDATE — একই সময়ে একাধিক approval একই ব্যাচ থেকে ওভার-কনজিউম না করে
    const batchResult = await client.query(
        `SELECT id, quantity FROM product_batches
         WHERE tenant_id = $1 AND product_id = $2 AND quantity > 0
         ORDER BY (expiry_date IS NULL), expiry_date ASC, created_at ASC
         FOR UPDATE`,
        [tenantId, productId]
    );

    for (const batch of batchResult.rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, parseInt(batch.quantity, 10) || 0);
        if (take <= 0) continue;

        await client.query(
            `UPDATE product_batches SET quantity = quantity - $1 WHERE id = $2`,
            [take, batch.id]
        );
        await client.query(
            `INSERT INTO stock_movements
                (product_id, movement_type, quantity, reference_id, reference_type, note, created_by, tenant_id, batch_id)
             VALUES ($1, 'out', $2, $3, $4, $5, $6, $7, $8)`,
            [productId, take, referenceId, referenceType, note || null, createdBy, tenantId, batch.id]
        );

        consumed.push({ batch_id: batch.id, quantity: take });
        remaining -= take;
    }

    // batch-এ যা পাওয়া যায়নি (legacy/untracked স্টক) তার জন্য batch_id ছাড়া audit এন্ট্রি
    if (remaining > 0) {
        await client.query(
            `INSERT INTO stock_movements
                (product_id, movement_type, quantity, reference_id, reference_type, note, created_by, tenant_id, batch_id)
             VALUES ($1, 'out', $2, $3, $4, $5, $6, $7, NULL)`,
            [productId, remaining, referenceId, referenceType, note ? `${note} (ব্যাচবিহীন স্টক)` : 'ব্যাচবিহীন স্টক', createdBy, tenantId]
        );
    }

    return { consumed, untracked: remaining };
}

module.exports = { consumeBatchesFEFO };
