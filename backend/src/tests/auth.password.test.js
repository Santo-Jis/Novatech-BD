/**
 * auth.password.test.js
 * ─────────────────────────────────────────────────────────────
 * Password Policy ও OTP validation টেস্ট
 * এই সিস্টেমে salary, NID, commission data আছে
 * তাই দুর্বল পাসওয়ার্ড মারাত্মক ঝুঁকির কারণ
 * ─────────────────────────────────────────────────────────────
 */

// auth.controller.js থেকে extract করা pure function
// (controller-এর বাকি অংশ mock না করে শুধু এই logic টেস্ট করি)

const validatePasswordStrength = (password) => {
    if (!password || typeof password !== 'string') {
        return { valid: false, message: 'পাসওয়ার্ড দিন।' };
    }
    if (password.length < 8) {
        return { valid: false, message: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'পাসওয়ার্ডে কমপক্ষে একটি বড় হাতের অক্ষর (A-Z) থাকতে হবে।' };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, message: 'পাসওয়ার্ডে কমপক্ষে একটি ছোট হাতের অক্ষর (a-z) থাকতে হবে।' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, message: 'পাসওয়ার্ডে কমপক্ষে একটি সংখ্যা (0-9) থাকতে হবে।' };
    }
    return { valid: true };
};

// ─── Password Strength ────────────────────────────────────────

describe('validatePasswordStrength — পাসওয়ার্ড নীতি যাচাই', () => {

    // ✅ Valid passwords
    describe('গ্রহণযোগ্য পাসওয়ার্ড', () => {

        test('uppercase + lowercase + number — valid', () => {
            expect(validatePasswordStrength('Novatech1').valid).toBe(true);
        });

        test('লম্বা শক্তিশালী পাসওয়ার্ড', () => {
            expect(validatePasswordStrength('MyPassword123').valid).toBe(true);
        });

        test('ঠিক ৮ অক্ষর — valid', () => {
            expect(validatePasswordStrength('Abcde1fg').valid).toBe(true); // A+b+number+5chars
        });
    });

    // ❌ Invalid passwords
    describe('অগ্রহণযোগ্য পাসওয়ার্ড', () => {

        test('null দিলে invalid', () => {
            const result = validatePasswordStrength(null);
            expect(result.valid).toBe(false);
        });

        test('empty string — invalid', () => {
            const result = validatePasswordStrength('');
            expect(result.valid).toBe(false);
        });

        test('৭ অক্ষর — invalid (কম)', () => {
            const result = validatePasswordStrength('Abc123x');
            expect(result.valid).toBe(false);
            expect(result.message).toContain('৮ অক্ষর');
        });

        test('"aaaaaa" — invalid (uppercase নেই, সংখ্যা নেই)', () => {
            const result = validatePasswordStrength('aaaaaa');
            expect(result.valid).toBe(false);
        });

        test('"123456" — invalid (letter নেই)', () => {
            const result = validatePasswordStrength('123456');
            expect(result.valid).toBe(false);
        });

        test('শুধু uppercase + lowercase — সংখ্যা নেই, invalid', () => {
            const result = validatePasswordStrength('Abcdefgh');
            expect(result.valid).toBe(false);
            expect(result.message).toContain('সংখ্যা');
        });

        test('শুধু lowercase + number — uppercase নেই, invalid', () => {
            const result = validatePasswordStrength('abcde123');
            expect(result.valid).toBe(false);
            expect(result.message).toContain('বড় হাতের');
        });

        test('শুধু uppercase + number — lowercase নেই, invalid', () => {
            const result = validatePasswordStrength('ABCDE123');
            expect(result.valid).toBe(false);
            expect(result.message).toContain('ছোট হাতের');
        });
    });
});

// ─── OTP Validation ───────────────────────────────────────────

describe('OTP validation — ৬ সংখ্যার OTP', () => {

    const isValidOTP = (otp) => {
        if (!otp) return false;
        const str = String(otp).trim();
        return /^\d{6}$/.test(str);
    };

    test('৬ সংখ্যার OTP — valid', () => {
        expect(isValidOTP('123456')).toBe(true);
    });

    test('৫ সংখ্যা — invalid', () => {
        expect(isValidOTP('12345')).toBe(false);
    });

    test('৭ সংখ্যা — invalid', () => {
        expect(isValidOTP('1234567')).toBe(false);
    });

    test('অক্ষর মিশ্রিত — invalid', () => {
        expect(isValidOTP('12345a')).toBe(false);
    });

    test('empty — invalid', () => {
        expect(isValidOTP('')).toBe(false);
    });

    test('null — invalid', () => {
        expect(isValidOTP(null)).toBe(false);
    });
});

// ─── Location Validation ──────────────────────────────────────
// SR check-in ও visit-এ GPS location validate করা হয়

describe('GPS Location Validation', () => {

    const isValidLocation = (lat, lng) => {
        const latitude  = parseFloat(lat);
        const longitude = parseFloat(lng);
        return (
            isFinite(latitude)  &&
            isFinite(longitude) &&
            latitude  >= -90  && latitude  <= 90  &&
            longitude >= -180 && longitude <= 180
        );
    };

    test('ঢাকার valid location', () => {
        expect(isValidLocation(23.8103, 90.4125)).toBe(true);
    });

    test('latitude 90 এর বেশি — invalid', () => {
        expect(isValidLocation(91, 90)).toBe(false);
    });

    test('longitude 180 এর বেশি — invalid', () => {
        expect(isValidLocation(23, 181)).toBe(false);
    });

    test('string location — valid (parseFloat কাজ করে)', () => {
        expect(isValidLocation('23.8103', '90.4125')).toBe(true);
    });

    test('null — invalid', () => {
        expect(isValidLocation(null, null)).toBe(false);
    });

    test('NaN — invalid', () => {
        expect(isValidLocation('abc', 'xyz')).toBe(false);
    });
});
