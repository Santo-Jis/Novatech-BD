/**
 * price.utils.test.js
 * ─────────────────────────────────────────────────────────────
 * VAT, Tax, Final Price, Subtotal হিসাবের টেস্ট
 * এগুলো সব বিক্রয়ের ভিত্তি — ভুল হলে সব invoice ভুল হবে
 * ─────────────────────────────────────────────────────────────
 */

const {
    calcFinalPrice,
    calcSubtotal,
    calcFromProduct
} = require('../services/price.utils');

// ─── calcFinalPrice ───────────────────────────────────────────

describe('calcFinalPrice — VAT ও Tax সহ final price হিসাব', () => {

    test('VAT ও Tax ছাড়া — base price-ই final price', () => {
        const result = calcFinalPrice(100, 0, 0);
        expect(result.unitPrice).toBe(100);
        expect(result.vatAmount).toBe(0);
        expect(result.taxAmount).toBe(0);
        expect(result.finalPrice).toBe(100);
    });

    test('শুধু VAT আছে (15%) — সঠিক হিসাব', () => {
        const result = calcFinalPrice(1000, 15, 0);
        expect(result.vatAmount).toBe(150);
        expect(result.taxAmount).toBe(0);
        expect(result.finalPrice).toBe(1150);
    });

    test('শুধু Tax আছে (5%) — সঠিক হিসাব', () => {
        const result = calcFinalPrice(1000, 0, 5);
        expect(result.vatAmount).toBe(0);
        expect(result.taxAmount).toBe(50);
        expect(result.finalPrice).toBe(1050);
    });

    test('VAT (15%) ও Tax (5%) উভয় আছে', () => {
        const result = calcFinalPrice(1000, 15, 5);
        expect(result.vatAmount).toBe(150);
        expect(result.taxAmount).toBe(50);
        expect(result.finalPrice).toBe(1200);
    });

    test('দশমিক price — 2 দশমিকে rounded হবে', () => {
        const result = calcFinalPrice(99.99, 10, 0);
        // 99.99 × 10% = 9.999 → 10.00 rounded
        expect(result.vatAmount).toBe(10);
        expect(result.finalPrice).toBe(109.99);
    });

    test('string হিসেবে price পাঠালেও কাজ করবে', () => {
        const result = calcFinalPrice('500', '10', '5');
        expect(result.unitPrice).toBe(500);
        expect(result.vatAmount).toBe(50);
        expect(result.taxAmount).toBe(25);
        expect(result.finalPrice).toBe(575);
    });

    test('null বা undefined দিলে 0 ধরবে', () => {
        const result = calcFinalPrice(null, undefined, null);
        expect(result.unitPrice).toBe(0);
        expect(result.finalPrice).toBe(0);
    });

    test('ফেরত দেওয়া object-এ সব field আছে', () => {
        const result = calcFinalPrice(500, 10, 5);
        expect(result).toHaveProperty('unitPrice');
        expect(result).toHaveProperty('vatRate');
        expect(result).toHaveProperty('taxRate');
        expect(result).toHaveProperty('vatAmount');
        expect(result).toHaveProperty('taxAmount');
        expect(result).toHaveProperty('finalPrice');
    });
});

// ─── calcSubtotal ─────────────────────────────────────────────

describe('calcSubtotal — qty দিয়ে মোট subtotal', () => {

    test('5 পিস × ১১৫০ টাকা = ৫৭৫০ টাকা', () => {
        expect(calcSubtotal(1150, 5)).toBe(5750);
    });

    test('1 পিস — finalPrice-ই subtotal', () => {
        expect(calcSubtotal(1200, 1)).toBe(1200);
    });

    test('qty = 0 হলে subtotal = 0', () => {
        expect(calcSubtotal(1000, 0)).toBe(0);
    });

    test('string qty হলেও কাজ করবে', () => {
        expect(calcSubtotal(500, '3')).toBe(1500);
    });

    test('2 দশমিকে rounded হবে', () => {
        expect(calcSubtotal(99.99, 3)).toBe(299.97);
    });
});

// ─── calcFromProduct ──────────────────────────────────────────

describe('calcFromProduct — DB row থেকে সরাসরি হিসাব', () => {

    test('সাধারণ product row — সঠিক result', () => {
        const productRow = { price: '1000', vat: '15', tax: '5' };
        const result = calcFromProduct(productRow, 2);

        expect(result.unitPrice).toBe(1000);
        expect(result.vatAmount).toBe(150);
        expect(result.taxAmount).toBe(50);
        expect(result.finalPrice).toBe(1200);
        expect(result.subtotal).toBe(2400); // 1200 × 2
    });

    test('VAT ও Tax ছাড়া product', () => {
        const productRow = { price: '500', vat: '0', tax: '0' };
        const result = calcFromProduct(productRow, 3);

        expect(result.finalPrice).toBe(500);
        expect(result.subtotal).toBe(1500);
    });

    test('subtotal field আছে result-এ', () => {
        const productRow = { price: '200', vat: '0', tax: '0' };
        const result = calcFromProduct(productRow, 5);
        expect(result).toHaveProperty('subtotal');
        expect(result.subtotal).toBe(1000);
    });
});
