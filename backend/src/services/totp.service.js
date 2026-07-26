/**
 * totp.service.js — নতুন ফাইল
 * RFC 6238 (TOTP) ও RFC 4226 (HOTP) স্ট্যান্ডার্ড অনুযায়ী বিশুদ্ধ
 * crypto module দিয়ে বানানো — speakeasy/otplib এর মতো এক্সট্রা
 * dependency লাগেনি। Google Authenticator/Authy সহ সব স্ট্যান্ডার্ড
 * TOTP app-এর সাথে সামঞ্জস্যপূর্ণ (SHA1, 6 digit, 30s period)।
 */

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;     // সেকেন্ড
const DIGITS = 6;

// ─── Base32 encode/decode ─────────────────────────────────────
function base32Encode(buffer) {
    let bits = 0, value = 0, output = '';
    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;
        while (bits >= 5) {
            output += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

function base32Decode(base32) {
    let bits = 0, value = 0;
    const output = [];
    for (const char of base32.replace(/=+$/, '').toUpperCase()) {
        const idx = ALPHABET.indexOf(char);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}

// ─── নতুন সিক্রেট তৈরি (২০ বাইট র‍্যান্ডম → base32) ────────────
function generateSecret() {
    return base32Encode(crypto.randomBytes(20));
}

// ─── একটা নির্দিষ্ট সময়ের জন্য TOTP কোড জেনারেট (RFC 4226 dynamic truncation) ───
function generateTOTP(secretBase32, forTimeMs = Date.now(), step = STEP, digits = DIGITS) {
    const counter = Math.floor(forTimeMs / 1000 / step);
    const key = base32Decode(secretBase32);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binCode =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    const otp = binCode % 10 ** digits;
    return otp.toString().padStart(digits, '0');
}

// ─── ইউজারের দেওয়া কোড verify — ±১ step (৩০ সেকেন্ড) clock-drift tolerance সহ ───
function verifyTOTP(secretBase32, token, window = 1) {
    if (!/^\d{6}$/.test(String(token || '').trim())) return false;
    const cleaned = String(token).trim();
    const now = Date.now();
    for (let errStep = -window; errStep <= window; errStep++) {
        const t = now + errStep * STEP * 1000;
        if (generateTOTP(secretBase32, t) === cleaned) return true;
    }
    return false;
}

// ─── Authenticator app-এ QR স্ক্যান করার জন্য otpauth:// URI ───
function buildOtpAuthUri(secretBase32, accountLabel, issuer = 'ZovoriX') {
    const label = encodeURIComponent(`${issuer}:${accountLabel}`);
    const params = new URLSearchParams({
        secret: secretBase32,
        issuer,
        algorithm: 'SHA1',
        digits: String(DIGITS),
        period: String(STEP),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}

// ─── Recovery codes — ফোন হারালে ব্যাকআপ হিসেবে ব্যবহারযোগ্য ───
// প্রতিটা কোড ফরম্যাট: XXXX-XXXX (আপারকেস অক্ষর+সংখ্যা)
function generateRecoveryCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
        const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // ১০ hex char
        codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
    }
    return codes;
}

// শুধু comparison-এর জন্য — deterministic hash (bcrypt-এর দরকার নেই,
// recovery code উচ্চ-এনট্রপি random string, bcrypt-এর মতো slow hash-এর
// প্রয়োজন নেই যা password brute-force ঠেকাতে লাগে)
function hashRecoveryCode(code) {
    return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

module.exports = {
    generateSecret,
    generateTOTP,
    verifyTOTP,
    buildOtpAuthUri,
    generateRecoveryCodes,
    hashRecoveryCode,
};
