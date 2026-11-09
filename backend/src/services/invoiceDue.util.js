// backend/src/services/invoiceDue.util.js
//
// ইনভয়েস (PDF / WhatsApp / Email) এ "বাকির হিসাব" অংশ বানানোর একমাত্র জায়গা।
//
// ডেটা আসে sales_transactions-এর স্ন্যাপশট কলাম থেকে (migration_invoice_due_snapshot.sql):
//   previous_due, due_payment, closing_due
// পুরনো ইনভয়েসে previous_due/closing_due NULL → null ফেরত দিই, যাতে অঙ্ক বানিয়ে না বসে।
//
// ⚠️ কাস্টমারের আগে বা পরে কোনো বাকি না থাকলে (০ → ০) অংশটা দেখানোর দরকার নেই।

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * @param {object} sale sales_transactions row (বা তার সমতুল্য অবজেক্ট)
 * @returns {null | {previous:number, thisInvoiceDue:number, duePayment:number, closing:number}}
 */
const getDueSummary = (sale) => {
    if (!sale) return null;
    if (sale.previous_due === null || sale.previous_due === undefined) return null;
    if (sale.closing_due  === null || sale.closing_due  === undefined) return null;

    const previous       = num(sale.previous_due);
    const closing        = num(sale.closing_due);
    const duePayment     = num(sale.due_payment);
    const thisInvoiceDue = num(sale.credit_used);

    if (previous <= 0 && closing <= 0 && duePayment <= 0 && thisInvoiceDue <= 0) return null;

    return { previous, thisInvoiceDue, duePayment, closing };
};

// দুই দশমিক পর্যন্ত, অপ্রয়োজনীয় .00 ছাড়া
const fmt = (n) => num(n).toLocaleString('en', { maximumFractionDigits: 2 });

/**
 * প্লেইন-টেক্সট সারি (WhatsApp / SMS / PDF-এর জন্য): [{ label, value, bold? }]
 * value ইতিমধ্যে "৳১২৩" ফরম্যাটে।
 */
const getDueRows = (sale) => {
    const d = getDueSummary(sale);
    if (!d) return [];
    const rows = [];
    rows.push({ label: 'আগের বাকি', value: `৳${fmt(d.previous)}` });
    if (d.thisInvoiceDue > 0) rows.push({ label: '+ এই ইনভয়েসের বাকি', value: `৳${fmt(d.thisInvoiceDue)}` });
    if (d.duePayment > 0)     rows.push({ label: '− বাকি আদায় (আজ)',  value: `৳${fmt(d.duePayment)}` });
    rows.push({ label: 'এখনকার মোট বাকি', value: `৳${fmt(d.closing)}`, bold: true });
    return rows;
};

module.exports = { getDueSummary, getDueRows, fmt };
