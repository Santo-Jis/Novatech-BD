// ============================================================
// paymentReliability.service.js
// ✅ NEW (Phase 5 — কোড অডিট) — "পেমেন্ট রিলায়েবিলিটি স্কোর"
//
// ⚠️ গুরুত্বপূর্ণ সীমাবদ্ধতা (সততার সাথে বলা দরকার): এটা একটা heuristic
// নির্দেশক, কোনো ক্রেডিট ব্যুরো-গ্রেড স্কোর না, আর চূড়ান্ত creditworthiness
// প্রমাণ করে না। শুধু এই প্ল্যাটফর্মে থাকা ডেটা (credit_limit,
// current_credit, credit_payments, connection tenure) থেকে ডেরাইভ করা —
// কোনো bKash/bank/বাইরের ক্রেডিট হিস্ট্রি বিবেচনা করা হয় না। একটা
// কোম্পানি নতুন কাস্টমারের রিকোয়েস্ট বিবেচনা করার সময় এক্সট্রা প্রসঙ্গ
// হিসেবে ব্যবহার করতে পারে, একমাত্র সিদ্ধান্তের ভিত্তি হিসেবে না।
//
// ফর্মুলা (স্বচ্ছতার জন্য প্রতিটা কম্পোনেন্ট আলাদা করে রিটার্ন করা হয়,
// শুধু একটা ব্ল্যাক-বক্স নাম্বার না):
//
//   ১. Utilization Health (৪০%) — গড় (1 - current_credit/credit_limit),
//      সব কানেক্টেড সম্পর্ক জুড়ে। কম ব্যবহার = বেশি headroom।
//      credit_limit=0 এমন সম্পর্ক এই গড় থেকে বাদ (divide-by-zero এড়াতে)।
//
//   ২. Payment Activity (৩৫%) — যেসব সম্পর্কে বকেয়া আছে (current_credit>0),
//      তার মধ্যে কতগুলোতে গত ৯০ দিনে অন্তত একটা payment হয়েছে। কোনো
//      সম্পর্কেই বকেয়া না থাকলে (সব শোধ করা/কখনো ক্রেডিট নেয়নি) এই
//      কম্পোনেন্ট ১০০ ধরা হয় (চিন্তার কিছু নেই বলে)।
//
//   ৩. Relationship Tenure (২৫%) — connected সম্পর্কের গড় বয়স (দিনে),
//      ৩৬৫+ দিন = ১০০, নিচে লিনিয়ারলি স্কেল করা।
//
// কোনো connected সম্পর্ক না থাকলে score = null (ডেটার অভাব, ০ না —
// ০ ভুলভাবে "খারাপ" বোঝাতে পারে, যেখানে আসলে ডেটাই নেই)।
// ============================================================

const { query } = require('../config/db');

const WEIGHTS = { utilization: 0.40, paymentActivity: 0.35, tenure: 0.25 };
const TENURE_FULL_SCORE_DAYS = 365;
const PAYMENT_ACTIVITY_WINDOW_DAYS = 90;

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

// একজন person-এর সব CONNECTED সম্পর্ক জুড়ে স্কোর হিসাব করো।
// রিটার্ন: null (ডেটা নেই) অথবা { score, components, connectionCount }
async function computePaymentReliabilityScore(personId) {
    const connRes = await query(
        `SELECT c.id AS customer_id, c.credit_limit, c.current_credit, ccc.created_at AS connected_since
         FROM customer_company_connections ccc
         JOIN customers c ON c.id = ccc.customer_id
         WHERE ccc.person_id = $1 AND ccc.status = 'connected'`,
        [personId]
    );
    const connections = connRes.rows;
    if (connections.length === 0) return null;

    // ── ১. Utilization Health ──────────────────────────────
    const withLimit = connections.filter(c => parseFloat(c.credit_limit || 0) > 0);
    let utilizationScore;
    if (withLimit.length === 0) {
        // কোনো সম্পর্কেই credit_limit নেই (সবই cash-only) — utilization
        // প্রযোজ্য না, নিরপেক্ষ পূর্ণ স্কোর ধরা হলো (কোনো credit risk নেই)
        utilizationScore = 100;
    } else {
        const avgHealth = withLimit.reduce((sum, c) => {
            const util = parseFloat(c.current_credit || 0) / parseFloat(c.credit_limit);
            return sum + (1 - clamp(util, 0, 1));
        }, 0) / withLimit.length;
        utilizationScore = avgHealth * 100;
    }

    // ── ২. Payment Activity ────────────────────────────────
    const owing = connections.filter(c => parseFloat(c.current_credit || 0) > 0);
    let paymentActivityScore;
    if (owing.length === 0) {
        paymentActivityScore = 100; // কোথাও বকেয়া নেই
    } else {
        const owingIds = owing.map(c => c.customer_id);
        const recentPayRes = await query(
            `SELECT DISTINCT customer_id FROM credit_payments
             WHERE customer_id = ANY($1::uuid[])
               AND created_at > NOW() - make_interval(days => $2)`,
            [owingIds, PAYMENT_ACTIVITY_WINDOW_DAYS]
        );
        const paidRecently = new Set(recentPayRes.rows.map(r => r.customer_id));
        paymentActivityScore = (paidRecently.size / owing.length) * 100;
    }

    // ── ৩. Relationship Tenure ──────────────────────────────
    const now = Date.now();
    const avgTenureDays = connections.reduce((sum, c) => {
        const days = (now - new Date(c.connected_since).getTime()) / 86400000;
        return sum + Math.max(days, 0);
    }, 0) / connections.length;
    const tenureScore = clamp((avgTenureDays / TENURE_FULL_SCORE_DAYS) * 100, 0, 100);

    const finalScore = Math.round(
        utilizationScore     * WEIGHTS.utilization +
        paymentActivityScore * WEIGHTS.paymentActivity +
        tenureScore           * WEIGHTS.tenure
    );

    return {
        score: clamp(finalScore, 0, 100),
        components: {
            utilization:     Math.round(utilizationScore),
            paymentActivity: Math.round(paymentActivityScore),
            tenure:           Math.round(tenureScore),
        },
        connectionCount: connections.length,
    };
}

module.exports = { computePaymentReliabilityScore };
