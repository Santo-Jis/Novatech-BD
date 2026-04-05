const crypto = require('crypto');

// ============================================================
// AES-256-GCM Encryption Helper
// Claude API Key, SMS API Key এনক্রিপশনের জন্য
// ============================================================
// 
// কীভাবে কাজ করে:
// ENCRYPTION_KEY (.env থেকে) → 32 bytes key তৈরি
// encrypt(text) → iv + authTag + encryptedData (hex string)
// decrypt(hash) → আসল text
//
// ⚠️ ENCRYPTION_KEY কখনো DB তে রাখবেন না
// ⚠️ শুধু .env ফাইলে থাকবে
// ============================================================

const ALGORITHM = 'aes-256-gcm';

// .env থেকে key নিয়ে 32 bytes এ রূপান্তর
const getKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY .env ফাইলে নেই!');
    }
    // hex string থেকে buffer
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }
    // অন্যথায় SHA-256 দিয়ে 32 bytes বানাও
    return crypto.createHash('sha256').update(key).digest();
};

// ============================================================
// ENCRYPT
// plainText → encrypted hex string
// ============================================================

const encrypt = (plainText) => {
    try {
        if (!plainText || plainText.trim() === '') {
            return '';
        }

        const key = getKey();
        const iv  = crypto.randomBytes(16); // প্রতিবার নতুন IV

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag(); // GCM authentication tag

        // format: iv(32) + authTag(32) + encrypted
        return iv.toString('hex') + authTag.toString('hex') + encrypted;

    } catch (error) {
        console.error('❌ Encryption Error:', error.message);
        throw new Error('এনক্রিপশন ব্যর্থ হয়েছে।');
    }
};

// ============================================================
// DECRYPT
// encrypted hex string → plainText
// ============================================================

const decrypt = (encryptedText) => {
    try {
        if (!encryptedText || encryptedText.trim() === '') {
            return '';
        }

        const key = getKey();

        // format থেকে আলাদা করো
        const iv         = Buffer.from(encryptedText.slice(0, 32),  'hex'); // প্রথম 16 bytes
        const authTag    = Buffer.from(encryptedText.slice(32, 64), 'hex'); // পরের 16 bytes
        const encrypted  = encryptedText.slice(64);                         // বাকি সব

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;

    } catch (error) {
        console.error('❌ Decryption Error:', error.message);
        throw new Error('ডিক্রিপশন ব্যর্থ হয়েছে। Key পরিবর্তন হয়েছে কিনা দেখুন।');
    }
};

// ============================================================
// MASK - API Key আংশিক দেখানোর জন্য
// "sk-ant-api03-xxxx...xxxx" এভাবে দেখাবে
// ============================================================

const maskApiKey = (plainText) => {
    if (!plainText || plainText.length < 8) return '****';
    const start = plainText.slice(0, 8);
    const end   = plainText.slice(-4);
    return `${start}...${end}`;
};

// ============================================================
// HASH - পাসওয়ার্ড নয়, শুধু comparison এর জন্য
// (পাসওয়ার্ডের জন্য bcrypt ব্যবহার করুন)
// ============================================================

const hash = (text) => {
    return crypto
        .createHash('sha256')
        .update(text)
        .digest('hex');
};

// ============================================================
// GENERATE RANDOM TOKEN
// OTP, Reset Token এর জন্য
// ============================================================

const generateOTP = (length = 6) => {
    // নিরাপদ র‍্যান্ডম OTP
    const digits = '0123456789';
    let otp = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        otp += digits[randomBytes[i] % 10];
    }
    return otp;
};

const generateToken = (bytes = 32) => {
    return crypto.randomBytes(bytes).toString('hex');
};

// ============================================================
// TEST - সিস্টেম চালু হলে encryption কাজ করছে কিনা যাচাই
// ============================================================

const testEncryption = () => {
    try {
        const testText    = 'NovaTechBD_Test_2026';
        const encrypted   = encrypt(testText);
        const decrypted   = decrypt(encrypted);

        if (decrypted !== testText) {
            throw new Error('Encryption/Decryption মিলছে না!');
        }
        console.log('✅ Encryption সিস্টেম সঠিকভাবে কাজ করছে');
        return true;
    } catch (error) {
        console.error('❌ Encryption Test ব্যর্থ:', error.message);
        return false;
    }
};

module.exports = {
    encrypt,
    decrypt,
    maskApiKey,
    hash,
    generateOTP,
    generateToken,
    testEncryption
};
