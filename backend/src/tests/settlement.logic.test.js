/**
 * settlement.logic.test.js
 * ─────────────────────────────────────────────────────────────
 * Settlement-এর মূল হিসাব লজিকের টেস্ট
 * নগদ পার্থক্য, ঘাটতি, credit collection হিসাব
 * এগুলো ভুল হলে SR-এর টাকা ভুল কাটবে
 * ─────────────────────────────────────────────────────────────
 */

// ─── Settlement এর pure business logic helper functions ───────
// Controller থেকে extract করা logic যা আলাদাভাবে টেস্ট করা যায়

/**
 * নগদ পার্থক্য হিসাব
 * + মানে SR বেশি জমা দিয়েছে
 * - মানে SR কম জমা দিয়েছে (ঘাটতি)
 */
const calcCashDifference = (srCash, systemCash) => {
    return parseFloat(srCash) - parseFloat(systemCash);
};

/**
 * পণ্য ঘাটতি হিসাব
 * নেওয়া পরিমাণ - (বিক্রি + replace + ফেরত) = ঘাটতি
 */
const calcItemShortage = ({ takenQty, soldQty, replacedQty, returnedQty }) => {
    const accounted = soldQty + replacedQty + returnedQty;
    return Math.max(0, takenQty - accounted);
};

/**
 * ঘাটতির টাকার মূল্য
 */
const calcShortageValue = (shortageQty, effectivePrice) => {
    return shortageQty * parseFloat(effectivePrice);
};

/**
 * নগদ পার্থক্য সীমা যাচাই
 * ৫০০ টাকার বেশি পার্থক্য হলে কারণ বাধ্যতামূলক
 */
const CASH_BLOCK_LIMIT = 500;
const requiresMismatchExplanation = (srCash, systemCash) => {
    const diff = Math.abs(calcCashDifference(srCash, systemCash));
    return diff > CASH_BLOCK_LIMIT;
};

/**
 * নেট বেতন হিসাব
 * basic + commission - attendance_deduction - dues
 */
const calcNetPayable = ({ basicSalary, totalCommission, attendanceDeduction, dues }) => {
    const net = basicSalary + totalCommission - attendanceDeduction - dues;
    return Math.max(0, net); // negative হবে না
};

// ─── Tests ───────────────────────────────────────────────────

describe('calcCashDifference — নগদ পার্থক্য হিসাব', () => {

    test('SR বেশি জমা দিলে positive', () => {
        expect(calcCashDifference(5500, 5000)).toBe(500);
    });

    test('SR কম জমা দিলে negative', () => {
        expect(calcCashDifference(4500, 5000)).toBe(-500);
    });

    test('হুবহু মিলে গেলে 0', () => {
        expect(calcCashDifference(5000, 5000)).toBe(0);
    });

    test('string input হলেও সঠিক হিসাব', () => {
        expect(calcCashDifference('6000', '5000')).toBe(1000);
    });
});

describe('calcItemShortage — পণ্য ঘাটতি হিসাব', () => {

    test('সব পণ্য বিক্রি হলে ঘাটতি 0', () => {
        const shortage = calcItemShortage({
            takenQty: 10, soldQty: 10, replacedQty: 0, returnedQty: 0
        });
        expect(shortage).toBe(0);
    });

    test('কিছু বিক্রি, কিছু ফেরত — ঘাটতি 0', () => {
        const shortage = calcItemShortage({
            takenQty: 10, soldQty: 6, replacedQty: 2, returnedQty: 2
        });
        expect(shortage).toBe(0);
    });

    test('বিক্রি + ফেরত < নেওয়া — ঘাটতি আছে', () => {
        const shortage = calcItemShortage({
            takenQty: 10, soldQty: 5, replacedQty: 2, returnedQty: 1
        });
        expect(shortage).toBe(2); // 10 - (5+2+1) = 2
    });

    test('কিছুই বিক্রি বা ফেরত নেই — সব ঘাটতি', () => {
        const shortage = calcItemShortage({
            takenQty: 5, soldQty: 0, replacedQty: 0, returnedQty: 0
        });
        expect(shortage).toBe(5);
    });

    test('ঘাটতি কখনো negative হবে না', () => {
        // এটা হওয়া উচিত না, কিন্তু defensive check
        const shortage = calcItemShortage({
            takenQty: 5, soldQty: 8, replacedQty: 0, returnedQty: 0
        });
        expect(shortage).toBe(0);
    });
});

describe('calcShortageValue — ঘাটতির টাকার মূল্য', () => {

    test('২ পিস ঘাটতি × ৫০০ টাকা = ১০০০ টাকা', () => {
        expect(calcShortageValue(2, 500)).toBe(1000);
    });

    test('ঘাটতি 0 হলে মূল্য 0', () => {
        expect(calcShortageValue(0, 500)).toBe(0);
    });

    test('VAT সহ price দিলেও সঠিক', () => {
        expect(calcShortageValue(3, 1150)).toBe(3450);
    });
});

describe('requiresMismatchExplanation — কারণ লেখা বাধ্যতামূলক কিনা', () => {

    test('৫০০ টাকার কম পার্থক্য — কারণ লাগবে না', () => {
        expect(requiresMismatchExplanation(5400, 5000)).toBe(false);
    });

    test('ঠিক ৫০০ টাকা পার্থক্য — কারণ লাগবে না', () => {
        expect(requiresMismatchExplanation(5500, 5000)).toBe(false);
    });

    test('৫০১ টাকা পার্থক্য — কারণ বাধ্যতামূলক', () => {
        expect(requiresMismatchExplanation(5501, 5000)).toBe(true);
    });

    test('SR কম জমা দিলেও একই নিয়ম', () => {
        expect(requiresMismatchExplanation(4000, 5000)).toBe(true); // ১০০০ পার্থক্য
    });
});

describe('calcNetPayable — নেট বেতন হিসাব', () => {

    test('সাধারণ হিসাব — basic + commission - deduction - dues', () => {
        const net = calcNetPayable({
            basicSalary:         15000,
            totalCommission:      3000,
            attendanceDeduction:   500,
            dues:                 1000
        });
        expect(net).toBe(16500); // 15000 + 3000 - 500 - 1000
    });

    test('commission ছাড়া — শুধু basic', () => {
        const net = calcNetPayable({
            basicSalary:         15000,
            totalCommission:          0,
            attendanceDeduction:      0,
            dues:                     0
        });
        expect(net).toBe(15000);
    });

    test('dues বেশি হলে নেট বেতন 0 — negative হবে না', () => {
        const net = calcNetPayable({
            basicSalary:          5000,
            totalCommission:          0,
            attendanceDeduction:      0,
            dues:                 10000 // বেতনের চেয়ে বেশি dues
        });
        expect(net).toBe(0);
    });

    test('পণ্য ঘাটতি বেতন থেকে কাটলে dues বাড়ে', () => {
        // SR ২ পিস ঘাটতি দিয়েছে, প্রতিটি ৫০০ টাকা = ১০০০ টাকা dues
        const shortageValue = calcShortageValue(2, 500);
        const net = calcNetPayable({
            basicSalary:         15000,
            totalCommission:      3000,
            attendanceDeduction:      0,
            dues:            shortageValue // ১০০০ টাকা কাটবে
        });
        expect(net).toBe(17000); // 15000 + 3000 - 1000
    });

    test('late deduction সহ হিসাব', () => {
        const net = calcNetPayable({
            basicSalary:         15000,
            totalCommission:      2000,
            attendanceDeduction:   300, // ৩ দিন লেট
            dues:                     0
        });
        expect(net).toBe(16700);
    });
});
