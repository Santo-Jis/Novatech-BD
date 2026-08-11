// warehouseStock.utils.js — products.stock-এর পাশাপাশি warehouse_stock সিঙ্ক রাখার
// শেয়ারড হেল্পার। যেসব ফ্লোতে সুনির্দিষ্ট গুদাম বলা নেই (রিটার্ন, রিপ্লেসমেন্ট,
// ম্যানুয়াল অ্যাডজাস্টমেন্ট, বাল্ক ইম্পোর্ট) — সেখানে tenant-এর ডিফল্ট গুদাম
// ব্যবহার করা হয়। PO রিসিভ ও অর্ডার অ্যাপ্রুভালের মতো সুনির্দিষ্ট গুদাম-জ্ঞাত
// ফ্লোতে এই হেল্পারের দরকার নেই (সেখানে সরাসরি লেখা হয়েছে)।

const logger = require('../config/logger');

// executor হতে পারে withTransaction()-এর ভেতরের `client` (client.query আছে)
// অথবা db.js-এর প্লেইন `query` ফাংশন (নিজেই কল করা যায়)। দুটোর জন্যই কাজ করবে।
const runQuery = (executor, text, params) =>
    typeof executor === 'function' ? executor(text, params) : executor.query(text, params);

/**
 * tenant-এর ডিফল্ট গুদামের id বের করে। প্রতিটা tenant-এর জন্য অন্তত একটা
 * ডিফল্ট গুদাম থাকা গ্যারান্টিড (মাল্টি-ওয়্যারহাউজ ধাপ ১ মাইগ্রেশন)।
 */
const getDefaultWarehouseId = async (executor, tenantId) => {
    try {
        const res = await runQuery(
            executor,
            `SELECT id FROM warehouses WHERE tenant_id = $1 AND is_default = true LIMIT 1`,
            [tenantId]
        );
        return res.rows[0]?.id || null;
    } catch (error) {
        logger.warn('⚠️ getDefaultWarehouseId ব্যর্থ:', error.message);
        return null;
    }
};

/**
 * warehouse_stock-এ delta পরিমাণ যোগ/বিয়োগ করে (আপসার্ট)। ০-এর নিচে যাবে না।
 * এই ফাংশন কখনো throw করে না — warehouse_stock সিঙ্ক ব্যর্থ হলেও products.stock
 * (মূল, সব জায়গায় ব্যবহৃত সংখ্যা) যেন অক্ষত ও ফ্লো অব্যাহত থাকে, তাই সাইলেন্টলি
 * লগ করে এগিয়ে যায়।
 *
 * @param {Function|object} executor - withTransaction()-এর client, অথবা db.js-এর query ফাংশন
 * @param {object} params - { tenantId, warehouseId, productId, delta }
 *   delta পজিটিভ হলে ক্রেডিট (স্টক বাড়ছে), নেগেটিভ হলে ডেবিট (স্টক কমছে)
 */
const adjustWarehouseStock = async (executor, { tenantId, warehouseId, productId, delta }) => {
    if (!warehouseId || !delta) return;
    try {
        await runQuery(
            executor,
            `INSERT INTO warehouse_stock (tenant_id, warehouse_id, product_id, quantity, updated_at)
             VALUES ($1, $2, $3, GREATEST(0, $4), NOW())
             ON CONFLICT (warehouse_id, product_id)
             DO UPDATE SET quantity = GREATEST(0, warehouse_stock.quantity + $4), updated_at = NOW()`,
            [tenantId, warehouseId, productId, delta]
        );
    } catch (error) {
        logger.warn('⚠️ adjustWarehouseStock ব্যর্থ (products.stock অক্ষত আছে):', error.message);
    }
};

/**
 * সুবিধার জন্য: ডিফল্ট গুদাম বের করে সরাসরি adjustWarehouseStock কল করে —
 * যেসব ফ্লোতে warehouse_id স্পষ্ট নেই (রিটার্ন/রিপ্লেসমেন্ট/ম্যানুয়াল/ইম্পোর্ট)।
 */
const adjustDefaultWarehouseStock = async (executor, { tenantId, productId, delta }) => {
    const warehouseId = await getDefaultWarehouseId(executor, tenantId);
    if (!warehouseId) return;
    await adjustWarehouseStock(executor, { tenantId, warehouseId, productId, delta });
};

module.exports = {
    getDefaultWarehouseId,
    adjustWarehouseStock,
    adjustDefaultWarehouseStock
};
