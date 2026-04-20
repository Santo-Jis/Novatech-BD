/**
 * price.utils.js
 * ─────────────────────────────────────────────────────────────
 * সব দামের হিসাব এক জায়গায়।
 * যেকোনো controller-এ price নিয়ে কাজ করতে এই ফাংশনগুলো ব্যবহার করুন।
 * সরাসরি  unitPrice + vatAmount + taxAmount  লেখা নিষেধ।
 * ─────────────────────────────────────────────────────────────
 */

/**
 * একটা প্রডাক্টের VAT ও Tax সহ final price বের করে।
 *
 * @param {number|string} basePrice  - products টেবিলের price
 * @param {number|string} vatRate    - products টেবিলের vat  (%, default 0)
 * @param {number|string} taxRate    - products টেবিলের tax  (%, default 0)
 * @returns {{
 *   unitPrice:  number,
 *   vatRate:    number,
 *   taxRate:    number,
 *   vatAmount:  number,
 *   taxAmount:  number,
 *   finalPrice: number   ← সবসময় 2 দশমিকে rounded
 * }}
 */
const calcFinalPrice = (basePrice, vatRate = 0, taxRate = 0) => {
    const unitPrice = parseFloat(basePrice)  || 0;
    const vat       = parseFloat(vatRate)    || 0;
    const tax       = parseFloat(taxRate)    || 0;

    const vatAmount  = parseFloat((unitPrice * vat  / 100).toFixed(2));
    const taxAmount  = parseFloat((unitPrice * tax  / 100).toFixed(2));
    const finalPrice = parseFloat((unitPrice + vatAmount + taxAmount).toFixed(2));

    return { unitPrice, vatRate: vat, taxRate: tax, vatAmount, taxAmount, finalPrice };
};

/**
 * qty দিয়ে মোট subtotal বের করে (finalPrice × qty), 2 দশমিকে rounded।
 *
 * @param {number} finalPrice
 * @param {number|string} qty
 * @returns {number}
 */
const calcSubtotal = (finalPrice, qty) =>
    parseFloat((finalPrice * (parseInt(qty) || 0)).toFixed(2));

/**
 * DB row (products টেবিল) থেকে সরাসরি price info বের করে।
 * controller-এ পণ্য query করার পরে এটা call করুন।
 *
 * @param {{ price, vat, tax }} productRow  - DB থেকে আসা row
 * @param {number|string}       qty
 * @returns {{
 *   unitPrice, vatRate, taxRate,
 *   vatAmount, taxAmount, finalPrice,
 *   subtotal
 * }}
 */
const calcFromProduct = (productRow, qty) => {
    const info     = calcFinalPrice(productRow.price, productRow.vat, productRow.tax);
    const subtotal = calcSubtotal(info.finalPrice, qty);
    return { ...info, subtotal };
};

module.exports = { calcFinalPrice, calcSubtotal, calcFromProduct };
