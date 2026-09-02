// ============================================================
// CUSTOMER PORTAL CONTROLLER — Multi-Device Whitelist Edition
// Google OAuth দিয়ে কাস্টমার লগইন করবে
// WhatsApp-এ পাঠানো unique link → Google Login → Dashboard
//
// পরিবর্তন (Single-Device Lock → Multi-Device Whitelist):
//   আগে: bound_device_id একটি — প্রথম device-এ লক
//   এখন: customer_portal_devices টেবিলে একাধিক device সংরক্ষণ
//        Google login করলে device whitelist-এ যোগ হয়
//        deviceLogin whitelist চেক করে — Google ছাড়াই চলে
//        admin যেকোনো device revoke করতে পারবে
// ============================================================

const { query }       = require('../config/db');
const jwt             = require('jsonwebtoken');
const crypto          = require('crypto');
const bcrypt          = require('bcryptjs');
const axios           = require('axios');
const logger          = require('../config/logger');
const PDFDocument     = require('pdfkit');
const { invalidatePortalAuthCache } = require('../services/portalCache.service');
const { generateCustomerCode, uploadToCloudinary } = require('../services/employee.service');
const { getPublicAppUrl } = require('../config/publicAppUrl');
const { generateOTP } = require('../config/encryption');
const { getLocationFromIP } = require('../services/geoip.service');
// (DEFAULT_TENANT_ID import সরানো হলো — এখন এই ফাইলে আর দরকার নেই,
// selfRegisterCustomer এখন tenant-agnostic persons row তৈরি করে)

// ============================================================
// HELPERS
// ============================================================

// 64-char hex token (cryptographically secure) — কখনো response-এ যাবে না
const generatePortalToken = () => crypto.randomBytes(32).toString('hex');

// Short opaque redirect ID — URL-এ এটা যাবে, token নয়
const generateRedirectId = () => crypto.randomBytes(16).toString('base64url');

// One-time exchange token — resolveLink response-এ যাবে
// portal_token-এর বদলে এটা দিয়ে deviceLogin/googleAuth call হবে
// ব্যবহারের পরেই DB-তে NULL করা হয়, TTL ৫ মিনিট
const generateLinkToken = () => crypto.randomBytes(24).toString('base64url');

// Device fingerprint hash — client device_id + User-Agent
// IP বাদ দেওয়া হয়েছে: বাংলাদেশে মোবাইল ডেটায় প্রতি session-এ IP বদলায়
const hashDeviceId = (raw) => {
    if (!raw) return null;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
};

// User-Agent থেকে মানবপাঠ্য label তৈরি
// Admin panel-এ "iPhone Safari", "Windows Chrome" দেখাবে
const guessDeviceLabel = (userAgent = '') => {
    const ua = userAgent.toLowerCase();
    let os     = 'Unknown OS';
    let browser = 'Unknown Browser';

    if (ua.includes('iphone'))       os = 'iPhone';
    else if (ua.includes('ipad'))    os = 'iPad';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac'))     os = 'Mac';
    else if (ua.includes('linux'))   os = 'Linux';

    if (ua.includes('chrome') && !ua.includes('edg'))  browser = 'Chrome';
    else if (ua.includes('firefox'))                    browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edg'))                        browser = 'Edge';
    else if (ua.includes('samsung'))                    browser = 'Samsung Browser';

    return `${os} · ${browser}`;
};


// ── Refresh token HttpOnly cookie helper ─────────────────────
// HttpOnly: JS পড়তে পারে না (XSS-proof)
// secure:   production-এ HTTPS only
// sameSite: production-এ 'none' (Vercel→Render cross-origin দরকার)
//           'strict' হলে cross-origin request-এ browser cookie পাঠায় না!
//           'none' requires Secure=true — production-এ সেটা আছে।
//           dev-এ 'lax' (localhost same-origin, Secure বাদে চলে)
// path:     শুধু /api/portal routes-এ cookie পাঠাবে
const setRefreshCookie = (res, refreshJWT) => {
    res.cookie('portal_rt', refreshJWT, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge:   30 * 24 * 60 * 60 * 1000,   // 30 দিন (ms)
        path:     '/api/portal',
    });
};

// OTP DB-তে plain রাখা হয় না — HMAC hash রাখা হয় (auth.controller.js-এর
// staff forgot-password প্যাটার্নের সাথে হুবহু সামঞ্জস্যপূর্ণ)
const hashOTP = (otp) => {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) throw new Error('ENCRYPTION_KEY environment variable সেট নেই');
    return crypto.createHmac('sha256', secret).update(String(otp)).digest('hex');
};

// identifier একটা email নাকি মোবাইল নম্বর সেটা বোঝা, এবং ফোন নম্বর হলে
// এর দুইটা সম্ভাব্য stored ফরম্যাট (লোকাল 01XXXXXXXXX ও আন্তর্জাতিক
// 8801XXXXXXXXX) বের করা — যাতে যেভাবেই DB-তে সংরক্ষিত থাকুক, ম্যাচ করে
const parseIdentifier = (raw) => {
    const cleaned = String(raw || '').trim();
    if (cleaned.includes('@')) {
        return { isEmail: true, email: cleaned.toLowerCase(), phoneCandidates: null };
    }
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 10) return { isEmail: false, email: null, phoneCandidates: [] };
    const local    = digits.startsWith('880') ? '0' + digits.slice(3) : (digits.startsWith('0') ? digits : '0' + digits);
    const withCode = digits.startsWith('880') ? digits : '880' + digits.replace(/^0/, '');
    return { isEmail: false, email: null, phoneCandidates: [local, withCode] };
};

// ============================================================
// 1. SEND PORTAL LINK (WhatsApp)
// POST /api/portal/send-link/:customerId
// SR বা System call করবে — কাস্টমারের WhatsApp-এ লিংক যাবে
// নতুন লিংক পাঠালে token_version বাড়ে → পুরনো JWT সব device-এ invalid
// (device whitelist-এ devices থাকবে, reset হবে না — admin চাইলে আলাদা করবে)
// ============================================================
const sendPortalLink = async (req, res) => {
    try {
        const { customerId } = req.params;

        const customer = await query(
            'SELECT id, shop_name, owner_name, whatsapp, email, customer_code FROM customers WHERE id = $1 AND is_active = true AND tenant_id = $2',
            [customerId, req.tenantId]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        const cust = customer.rows[0];

        if (!cust.whatsapp) {
            return res.status(400).json({ success: false, message: 'কাস্টমারের WhatsApp নম্বর নেই।' });
        }

        if (!cust.customer_code) {
            return res.status(400).json({ success: false, message: 'কাস্টমারের customer_code নেই।' });
        }

        // ⚠️ SECURITY FIX: আগে এখানে ১০ বছরের permanent link তৈরি হতো —
        // ফোন/লিংক যার হাতে পড়তো সে চিরকাল ঢুকতে পারতো। এখন প্রতিটা
        // পাঠানো/রি-সেন্ড করা লিংক ১০ দিনের জন্য বৈধ। SR আবার এই বাটনে
        // চাপলে (রিসেন্ড) expires_at আবার ফ্রেশ ১০ দিন হয়ে যায় —
        // ON CONFLICT...DO UPDATE, তাই কাস্টমার কখনো স্থায়ীভাবে আটকায় না,
        // শুধু SR-কে মাঝেমধ্যে নতুন করে পাঠাতে হবে। এক্সপায়ারি আসলে
        // চেক হয় getPublicCustomerByCode ও sendLoginOtp-এ
        // (isPortalLinkExpired হেল্পার)।
        await query(
            `INSERT INTO customer_portal_tokens
                (customer_id, token, redirect_id, expires_at, token_version, bound_email, last_login, google_email)
             VALUES ($1, $2, $3, NOW() + INTERVAL '10 days', 1, NULL, NULL, NULL)
             ON CONFLICT (customer_id) DO UPDATE
                SET expires_at = NOW() + INTERVAL '10 days'`,
            [customerId, generatePortalToken(), generateRedirectId()]
        );

        // ⚠️ FRONTEND_URL সরাসরি ব্যবহার করা হয় না — ওটা CORS-এর জন্য
        // comma/wildcard ধারণ করতে পারে (দেখুন server.js), যা এখানে সরাসরি
        // বসালে লিংক ভেঙে যায়। getPublicAppUrl() একটা clean single URL দেয়।
        const frontendUrl = getPublicAppUrl();

        // ✅ ?c=customer_code — ১০ দিনের জন্য বৈধ (উপরের UPSERT দেখুন)
        const portalLink = `${frontendUrl}/customer-login?c=${cust.customer_code}`;

        const rawPhone = cust.whatsapp.replace(/\D/g, '');
        const phone    = rawPhone.startsWith('880') ? rawPhone : '880' + rawPhone.replace(/^0/, '');
        const message  = encodeURIComponent(
            `আস্সালামু আলাইকুম ${cust.owner_name} ভাই,\n\n` +
            `আপনার *${cust.shop_name}* এর সকল ক্রয় তথ্য, বাকি ও পেমেন্ট ইতিহাস দেখতে নিচের লিংকে ক্লিক করুন:\n\n` +
            `🔗 ${portalLink}\n\n` +
            `👆 লিংকে গিয়ে Continue চাপুন — WhatsApp-এ একটা OTP কোড যাবে, সেটা বসিয়ে দিলেই সরাসরি ঢুকে যাবেন! (লিংকটি ১০ দিন পর্যন্ত বৈধ)\n\n` +
            `_ZovoriX_`
        );

        const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

        return res.status(200).json({
            success: true,
            message: 'পোর্টাল লিংক তৈরি হয়েছে।',
            data: {
                portal_link:      portalLink,
                whatsapp_url:     whatsappUrl,
                permanent:        false,
                expires_in_days:  10,
                customer_name:    cust.owner_name,
                shop_name:        cust.shop_name,
            }
        });

    } catch (error) {
        logger.error('❌ Send Portal Link Error:', error.message);
        return res.status(500).json({ success: false, message: 'লিংক তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 1a. SELF-REGISTER (ব্যক্তি নিজেই নিজের প্রোফাইল তৈরি করে)
// POST /api/portal/self-register — Public, কোনো auth লাগে না
//
// ⚠️ REDESIGN: আগে এখানে সরাসরি DEFAULT_TENANT_ID দিয়ে একটা
// tenant-bound `customers` row তৈরি হতো (single-tenant ধরে নিয়ে)।
// কিন্তু বাস্তবে একজন কাস্টমার (রিটেইল শপ) কোনো একটা কোম্পানির
// exclusive সম্পত্তি না — সে একাধিক কোম্পানির সাথে connect থাকতে
// পারে (persons + customer_company_connections সিস্টেম দেখুন,
// connection.controller.js/discovery.controller.js)।
//
// তাই এখন এটা কোনো tenant_id ছাড়াই একটা global `persons` row
// তৈরি করে। রেজিস্ট্রেশনের সময় কোনো কোম্পানির সাথে auto-connect
// হয় না — পরে পোর্টালে ঢুকে ব্যক্তি নিজেই কোম্পানি খুঁজে (searchCompanies)
// connection request পাঠাবে, অথবা কোনো কোম্পানি তাকে discover করে
// request পাঠাবে।
//
// সফল হলে শুধু person_id ফেরত দেয়। JWT/cookie এখানে সেট করা হয় না —
// frontend সাথে সাথেই এই person_id দিয়ে directGoogleAuth কল করবে
// (person_id প্যারামিটার — customer_code-এর সমতুল্য, প্রথমবার Gmail bind করার জন্য)।
// ============================================================

// ============================================================
// সেলফ-রেজিস্ট্রেশনে দেওয়া ইমেইলের জন্য magic-link ভেরিফিকেশন পাঠানো।
// WhatsApp-এর ভারী OTP-টাইপিং ট্রিটমেন্ট এখানে ইচ্ছাকৃতভাবে দেওয়া
// হয়নি — email ঐচ্ছিক, তাই ভেরিফিকেশনও হালকা/non-blocking: এক ক্লিকে
// verify, কোনো কোড টাইপ করা লাগে না, রেজিস্ট্রেশন ফর্মেও অপেক্ষা
// করতে হয় না।
//
// টোকেন ৭ দিন কার্যকর (password reset OTP-এর চেয়ে অনেক বেশি) — এটা
// কোনো লগইন ক্রেডেনশিয়াল না, শুধু ইমেইল মালিকানা যাচাই, তাড়াহুড়ার
// কিছু নেই। Best-effort, fire-and-forget — ব্যর্থ হলেও রেজিস্ট্রেশন
// ব্লক হয় না।
// ============================================================
const sendEmailVerificationLink = async (personId, email, shopName, name) => {
    try {
        // ✅ Abuse-প্রতিরোধ: email ইউনিক না (শুধু whatsapp দিয়ে duplicate
        // চেক হয়) — তাই কেউ ইচ্ছাকৃতভাবে অন্য কারো email দিয়ে বারবার
        // (প্রতিবার আলাদা WhatsApp নম্বর দিয়ে) রেজিস্টার করে সেই real
        // ইমেইল ঠিকানায় বারবার "verify your email" মেসেজ পাঠিয়ে স্প্যাম
        // করতে পারত। একই email-এ ইতিমধ্যে কয়টা আনভেরিফাইড রেজিস্ট্রেশন
        // pending আছে চেক করে, একটা সীমার পর নতুন মেইল পাঠানো বন্ধ করে
        // দেওয়া হয় (রেজিস্ট্রেশন নিজে তখনও সফলই হয় — শুধু ওই email-এ
        // আর মেইল যায় না, যাতে victim-এর ইনবক্স স্প্যাম না হয়)।
        const pendingCount = await query(
            `SELECT COUNT(*) AS cnt FROM persons WHERE LOWER(email) = LOWER($1) AND email_verified = false`,
            [email]
        );
        if (parseInt(pendingCount.rows[0].cnt, 10) > 3) {
            logger.warn(`⚠️ Email verification স্কিপ করা হলো (spam-guard, ইতিমধ্যে অনেক pending): ${email}`);
            return;
        }

        const token     = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // ৭ দিন

        await query(
            `UPDATE persons SET email_verify_token = $1, email_verify_token_expires_at = $2 WHERE id = $3`,
            [token, expiresAt, personId]
        );

        const verifyLink = `${getPublicAppUrl()}/customer-email-verify?token=${token}`;
        // ✅ শপ-নেম স্পষ্টভাবে দেখানো হচ্ছে — কেউ যদি নিজের ইমেইল দিয়ে
        // রেজিস্টার না করে থাকে, এই নামটা অচেনা লাগলে সে বুঝতে পারবে
        // এটা তার না, এবং ক্লিক না করেই উপেক্ষা করবে।
        const html = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #E1EEFC;border-radius:12px;overflow:hidden">
          <div style="background:#124A8C;padding:20px;text-align:center">
            <h2 style="color:#ffffff;margin:0;font-size:18px">ZovoriX কাস্টমার পোর্টাল</h2>
          </div>
          <div style="padding:24px;color:#1F2937">
            <p>আসসালামু আলাইকুম${name ? ' ' + name : ''},</p>
            <p>"<strong>${shopName || 'একটি দোকান'}</strong>" নামে ZovoriX কাস্টমার পোর্টালে এই ইমেইল ঠিকানা দিয়ে একটা রেজিস্ট্রেশন হয়েছে। এটা যদি আপনি নিজে করে থাকেন, ইমেইল ঠিকানাটা নিশ্চিত করতে নিচের বাটনে ক্লিক করুন:</p>
            <div style="text-align:center;margin:28px 0">
              <a href="${verifyLink}" style="background:#124A8C;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;display:inline-block">ইমেইল ভেরিফাই করুন</a>
            </div>
            <p style="font-size:12.5px;color:#6B7280">বাটন কাজ না করলে এই লিংকটা ব্রাউজারে কপি-পেস্ট করুন:<br>${verifyLink}</p>
            <p style="font-size:13px;color:#B3452C;font-weight:600">⚠️ "${shopName || 'এই দোকান'}" আপনার পরিচিত না হলে, বা আপনি এই রেজিস্ট্রেশন না করে থাকলে — দয়া করে ক্লিক করবেন না, এই ইমেইলটা উপেক্ষা করুন।</p>
            <p style="font-size:13px;color:#6B7280">এই লিংকটা ৭ দিন কার্যকর থাকবে।</p>
            <p style="margin-top:20px">ধন্যবাদান্তে,<br><strong>ZovoriX টিম</strong></p>
          </div>
        </div>`;

        const { sendEmail } = require('../services/email.service');
        await sendEmail(email, 'আপনার ZovoriX ইমেইল ভেরিফাই করুন ✅', html, '', { type: 'email_verification' });
        logger.info(`📧 Email verification link পাঠানো হয়েছে → ${email}`);
    } catch (err) {
        logger.warn('⚠️ Email verification link পাঠানো যায়নি:', err.message);
    }
};

// ============================================================
// ইমেইল ভেরিফিকেশন লিংকে ক্লিক করলে ফ্রন্টএন্ড পেজ (CustomerEmailVerify.jsx)
// থেকে এই এন্ডপয়েন্ট কল হয়।
// POST /api/portal/verify-email — Public
// body: { token }
// ============================================================
const verifyEmailToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || !String(token).trim()) {
            return res.status(400).json({ success: false, message: 'টোকেন পাওয়া যায়নি।' });
        }

        const result = await query(
            `SELECT id, email_verified, shop_name FROM persons
             WHERE email_verify_token = $1 AND email_verify_token_expires_at > NOW()
             LIMIT 1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'লিংকের মেয়াদ শেষ হয়ে গেছে অথবা এটা অবৈধ।' });
        }

        const person = result.rows[0];
        if (person.email_verified) {
            return res.status(200).json({ success: true, already_verified: true, shop_name: person.shop_name, message: 'এই ইমেইল আগেই ভেরিফাই করা হয়েছে।' });
        }

        // ⚠️ token ইচ্ছাকৃতভাবে null করা হচ্ছে না — শুধু email_verified=true
        // সেট হচ্ছে। token null করে দিলে দ্বিতীয়বার একই লিংকে ক্লিক করলে
        // (স্বাভাবিক আচরণ — ডাবল-ক্লিক, বা পরে আবার) উপরের "already
        // verified" শাখাটা আর কখনো পৌঁছানো যেত না (token আর ম্যাচ করত
        // না), বদলে "লিংক অবৈধ" এর মতো confusing এরর দেখাত। expires_at
        // পার হয়ে গেলে এমনিতেই আর ম্যাচ করবে না।
        await query(
            `UPDATE persons SET email_verified = true WHERE id = $1`,
            [person.id]
        );

        logger.info(`✅ Email verified (person): ${person.id}`);

        return res.status(200).json({ success: true, already_verified: false, shop_name: person.shop_name, message: 'ইমেইল সফলভাবে ভেরিফাই হয়েছে!' });

    } catch (error) {
        logger.error('❌ Verify Email Token Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// ⚠️ SECURITY FIX: আগে permanent link (১০ বছর) ছিল — কেউ ফোন/লিংক
// হাতে পেলে সেটা চিরকাল বৈধ থাকতো। এখন প্রতিটা পাঠানো লিংকের একটা
// এক্সপায়ারি থাকে (sendPortalLink-এ NOW() + 10 days সেট হয়)। এই
// হেল্পার সেই এক্সপায়ারি চেক করে — customer-info ও send-login-otp
// দুই জায়গাতেই ব্যবহার হয় (defense in depth: কেউ customer-info
// স্কিপ করে সরাসরি send-login-otp কল করলেও আটকাবে)।
// ============================================================
async function isPortalLinkExpired(customerId) {
    const r = await query(
        `SELECT expires_at FROM customer_portal_tokens WHERE customer_id = $1`,
        [customerId]
    );
    if (r.rows.length === 0) return true; // কখনো লিংক পাঠানোই হয়নি
    return new Date(r.rows[0].expires_at) < new Date();
}

// ============================================================
// PUBLIC: SR-এর পাঠানো WhatsApp লিংকের customer_code দিয়ে বেসিক
// তথ্য (দোকানের নাম, মালিকের নাম, ছবি) দেখানো — "এটা কি আপনি?"
// কনফার্ম-স্ক্রিনের জন্য। এখানে কোনো auth/secret লাগে না — ঠিক
// sendPortalLink/directGoogleAuth-এর customer_code path যেভাবে
// আগে থেকেই এই কোডটাকে secret না ধরে চেক করে, একই threat model।
// আসল secret গেট হলো পরের ধাপ: WhatsApp OTP (নম্বরটা কার কাছে
// আছে সেটাই প্রমাণ করে, শুধু কোড জানা/লিংক থাকাটা যথেষ্ট না)।
// এখন এর সাথে যোগ হলো লিংক-এক্সপায়ারি — এই দুটো মিলিয়ে "লিংক
// হাতে পাওয়া = চিরকালের অ্যাক্সেস" ঝুঁকিটা কমে।
//
// GET /api/portal/customer-info/:code — Public
// ============================================================
const getPublicCustomerByCode = async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        if (!code) {
            return res.status(400).json({ success: false, message: 'কাস্টমার কোড পাওয়া যায়নি।' });
        }

        const result = await query(
            `SELECT id, shop_name, owner_name, shop_photo, customer_code
             FROM customers
             WHERE customer_code = $1 AND is_active = true
             LIMIT 1`,
            [code]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'লিংকটি সঠিক নয় অথবা প্রোফাইল পাওয়া যায়নি।' });
        }

        const custRow = result.rows[0];

        if (await isPortalLinkExpired(custRow.id)) {
            return res.status(410).json({
                success: false,
                link_expired: true,
                message: 'এই লিংকের মেয়াদ শেষ হয়ে গেছে। আপনার SR-কে বলুন নতুন লিংক পাঠাতে।',
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                shop_name:     custRow.shop_name,
                owner_name:    custRow.owner_name,
                shop_photo:    custRow.shop_photo,
                customer_code: custRow.customer_code,
            },
        });

    } catch (error) {
        logger.error('❌ Get Public Customer By Code Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// PUBLIC: WhatsApp OTP দিয়ে সরাসরি লগইন — password/Google ছাড়াই।
// SR-এর যোগ করা কাস্টমারের জন্য এটাই মূল প্রথমবার-অ্যাক্সেসের পথ:
// getPublicCustomerByCode-এর "এটা কি আপনি?" কনফার্ম স্ক্রিনে Continue
// চাপলে এই এন্ডপয়েন্ট কল হয়, WhatsApp-এ OTP যায়, verify হলে (নিচের
// verifyLoginOtp) সরাসরি JWT সেশন ইস্যু হয় — password কোথাও ছোঁয়া
// হয় না, self-register/persons টেবিলও ছোঁয়া হয় না (তাই আগের
// duplicate-profile ঝুঁকিটাও এই পথে নেই)।
//
// forgot-password-এর মতো enumeration-নিরাপদ generic message দরকার
// নেই — এখানে identifier customer_code (URL/লিংকে আগে থেকেই public,
// getPublicCustomerByCode-এর মতোই), কোনো secret guess না।
//
// ধাপ ১: OTP পাঠাও — POST /api/portal/send-login-otp — Public
// body: { customer_code }
// ============================================================
const sendLoginOtp = async (req, res) => {
    try {
        const cleanCode = String(req.body.customer_code || '').trim();
        if (!cleanCode) {
            return res.status(400).json({ success: false, message: 'কাস্টমার কোড পাওয়া যায়নি।' });
        }

        const { isWhatsAppLikelyDown } = require('../services/portalWhatsapp.service');
        if (isWhatsAppLikelyDown()) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp এই মুহূর্তে সাময়িকভাবে অনুপলব্ধ। একটু পর আবার চেষ্টা করুন।'
            });
        }

        const result = await query(
            `SELECT id, whatsapp FROM customers WHERE customer_code = $1 AND is_active = true LIMIT 1`,
            [cleanCode]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'প্রোফাইল পাওয়া যায়নি।' });
        }
        const cust = result.rows[0];

        // ⚠️ SECURITY FIX: customer-info-এর মতো এখানেও এক্সপায়ারি চেক —
        // defense in depth, কেউ customer-info স্কিপ করে সরাসরি এখানে
        // কল করলেও পুরনো/মেয়াদোত্তীর্ণ লিংক দিয়ে OTP পাঠানো আটকাবে।
        if (await isPortalLinkExpired(cust.id)) {
            return res.status(410).json({
                success: false,
                link_expired: true,
                message: 'এই লিংকের মেয়াদ শেষ হয়ে গেছে। আপনার SR-কে বলুন নতুন লিংক পাঠাতে।',
            });
        }

        if (!cust.whatsapp) {
            return res.status(400).json({ success: false, message: 'এই প্রোফাইলে কোনো WhatsApp নম্বর নেই। আপনার SR-এর সাথে যোগাযোগ করুন।' });
        }

        const otp       = generateOTP(6);
        const otpHash   = hashOTP(otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // ১০ মিনিট

        // আগের যেকোনো অব্যবহৃত OTP বাতিল — একসাথে একটাই বৈধ OTP থাকবে
        await query(`DELETE FROM customer_login_otps WHERE customer_id = $1`, [cust.id]);
        await query(
            `INSERT INTO customer_login_otps (customer_id, otp, expires_at) VALUES ($1, $2, $3)`,
            [cust.id, otpHash, expiresAt]
        );

        const { sendPortalOTPWhatsApp } = require('../services/portalWhatsapp.service');
        const sendResult = await sendPortalOTPWhatsApp(cust.whatsapp, otp, 'লগইন যাচাই');

        if (!sendResult.success) {
            logger.warn(`⚠️ Login OTP পাঠানো যায়নি (${cust.id}): ${sendResult.reason}`);
            return res.status(503).json({
                success: false,
                message: 'WhatsApp এই মুহূর্তে সাময়িকভাবে অনুপলব্ধ। একটু পর আবার চেষ্টা করুন।'
            });
        }

        return res.status(200).json({ success: true, message: 'WhatsApp-এ OTP পাঠানো হয়েছে।' });

    } catch (error) {
        logger.error('❌ Send Login OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// পূর্ণ কাস্টমার-পোর্টাল সেশন ইস্যু করা (access JWT + refresh cookie
// + login event লগ) — verifyLoginOtp (password_hash আগে থেকে থাকলে)
// আর completePasswordSetup (পাসওয়ার্ড সেট করার পরপরই), দুই জায়গায়
// হুবহু একই কাজ বলে একটাই ফাংশনে রাখা হলো।
// ============================================================
const issueFullCustomerSession = async (res, cust, { loginMethod, deviceId, req }) => {
    const tokenRow     = await query('SELECT token_version FROM customer_portal_tokens WHERE customer_id = $1', [cust.id]);
    const tokenVersion = tokenRow.rows[0]?.token_version || 1;

    const jwtPayload = {
        customer_id:   cust.id,
        customer_code: cust.customer_code,
        person_id:     cust.person_id || null,
        email:         cust.email || null,
        type:          'customer_portal',
        token_version: tokenVersion,
    };
    const accessJWT  = jwt.sign(jwtPayload, process.env.JWT_PORTAL_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
    const refreshJWT = jwt.sign(
        { ...jwtPayload, type: 'customer_portal_refresh' },
        process.env.JWT_PORTAL_SECRET,
        { expiresIn: '30d', algorithm: 'HS256' }
    );
    setRefreshCookie(res, refreshJWT);

    recordLoginEvent({
        ownerType: 'customer', ownerId: cust.id, loginMethod,
        deviceFingerprint: deviceId, ipAddress: req.ip, userAgent: req.get('user-agent'),
        email: cust.email, phone: cust.whatsapp, name: cust.owner_name,
    });

    return { accessJWT, expires_in: 900 };
};

// ============================================================
// ধাপ ২: OTP যাচাই।
//
// ⚠️ SECURITY FIX: আগে OTP মিললেই সরাসরি পূর্ণ সেশন (15m access +
// 30d refresh cookie) ইস্যু হয়ে যেতো, password_hash না থাকলেও —
// needs_password_setup ফ্ল্যাগ তখন শুধু frontend-কে "কোন স্ক্রিন
// দেখাও" বলতো, backend আসল অ্যাক্সেস আটকাতো না। এখন: password_hash
// না থাকলে পূর্ণ সেশন ইস্যুই হয় না — শুধু একটা সীমিত-ক্ষমতার
// 'customer_portal_setup' টোকেন (১৫ মিনিট, refresh cookie নেই), যেটা
// portalAuth মিডলওয়্যার এমনিতেই রিজেক্ট করবে (type !== 'customer_portal')
// — তাই dashboard/profile কোনো protected API এই টোকেন দিয়ে ছোঁয়া
// যাবে না, শুধু নিচের নতুন complete-password-setup এন্ডপয়েন্টে
// পাসওয়ার্ড বসানো যাবে। পূর্ণ অ্যাক্সেস ইস্যু হয় তখনই — পাসওয়ার্ড
// সেট হওয়ার পরে (দেখুন completePasswordSetup নিচে)।
//
// POST /api/portal/verify-login-otp — Public
// body: { customer_code, otp, device_id }
// ============================================================
const verifyLoginOtp = async (req, res) => {
    try {
        const cleanCode = String(req.body.customer_code || '').trim();
        const otp       = String(req.body.otp || '').trim();
        const deviceId  = req.body.device_id || null;

        if (!cleanCode || !otp) {
            return res.status(400).json({ success: false, message: 'কাস্টমার কোড ও OTP দিন।' });
        }

        const result = await query(
            `SELECT id, shop_name, owner_name, customer_code, email, whatsapp, person_id,
                    current_credit, credit_limit, credit_balance, password_hash
             FROM customers WHERE customer_code = $1 AND is_active = true LIMIT 1`,
            [cleanCode]
        );
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP মিলছে না অথবা মেয়াদ শেষ হয়ে গেছে।' });
        }
        const cust = result.rows[0];

        const otpHash   = hashOTP(otp);
        const otpResult = await query(
            `SELECT id FROM customer_login_otps
             WHERE customer_id = $1 AND otp = $2 AND used = false AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [cust.id, otpHash]
        );
        if (otpResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP মিলছে না অথবা মেয়াদ শেষ হয়ে গেছে।' });
        }
        await query(`UPDATE customer_login_otps SET used = true WHERE id = $1`, [otpResult.rows[0].id]);

        // ✅ সফল লগইন — pending deletion থাকলে বাতিল (৩০ দিন গ্রেস পিরিয়ড)
        await cancelPendingDeletion(cust.person_id);

        if (!process.env.JWT_PORTAL_SECRET) {
            logger.error('❌ JWT_PORTAL_SECRET environment variable সেট নেই!');
            return res.status(500).json({ success: false, message: 'Server configuration error.' });
        }

        // ── password_hash নেই → সীমিত setup-only টোকেন, পূর্ণ সেশন না ──
        if (!cust.password_hash) {
            const setupJWT = jwt.sign(
                { customer_id: cust.id, type: 'customer_portal_setup' },
                process.env.JWT_PORTAL_SECRET,
                { expiresIn: '15m', algorithm: 'HS256' }
            );
            logger.info(`✅ OTP verified, password setup pending (customer): ${cust.customer_code || cust.id}`);
            return res.status(200).json({
                success: true,
                message: 'OTP মিলেছে — এবার পাসওয়ার্ড সেট করুন।',
                data: {
                    portal_jwt:            setupJWT,
                    expires_in:            900,
                    needs_password_setup:  true,
                },
            });
        }

        // ── password_hash আছে → স্বাভাবিক পূর্ণ সেশন (আগের মতোই) ──
        logger.info(`✅ Login via WhatsApp OTP (customer): ${cust.customer_code || cust.id}`);
        const { accessJWT, expires_in } = await issueFullCustomerSession(res, cust, {
            loginMethod: 'whatsapp_otp', deviceId, req,
        });

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল!',
            data: {
                portal_jwt:  accessJWT,
                expires_in,
                has_company: true,
                needs_password_setup: false,
                customer: {
                    id:             cust.id,
                    shop_name:      cust.shop_name,
                    owner_name:     cust.owner_name,
                    customer_code:  cust.customer_code,
                    email:          cust.email,
                    current_credit: cust.current_credit,
                    credit_limit:   cust.credit_limit,
                    credit_balance: cust.credit_balance,
                }
            }
        });

    } catch (error) {
        logger.error('❌ Verify Login OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// ধাপ ৩ (শুধু password_hash না-থাকা কাস্টমারদের জন্য): OTP-এর পর
// পাঠানো সীমিত 'customer_portal_setup' টোকেন দিয়ে নতুন পাসওয়ার্ড
// বসানো, তারপর তবেই পূর্ণ সেশন (issueFullCustomerSession — verifyLoginOtp
// যে হেল্পার ব্যবহার করে, সেটাই) ইস্যু হয়। portalAuth মিডলওয়্যার দিয়ে
// যায় না (সেটা type==='customer_portal' চায়) — এখানে টোকেন-টাইপ
// ম্যানুয়ালি যাচাই করা হচ্ছে, যাতে সীমিত টোকেন দিয়ে সত্যিই শুধু এই
// একটা কাজই করা যায়।
//
// ⚠️ এখানেও cancelPendingDeletion কল করা হয়নি — verifyLoginOtp-এই
// (OTP ধাপে) ইতিমধ্যে হয়ে গেছে, একই person_id-এর জন্য দ্বিতীয়বার
// no-op কল করার দরকার নেই।
//
// POST /api/portal/complete-password-setup — সীমিত টোকেন লাগবে
// header: Authorization: Bearer <setup_jwt>
// body: { new_password, device_id }
// ============================================================
const completePasswordSetup = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(403).json({ success: false, message: 'অবৈধ সেশন — আবার WhatsApp লিংকে ক্লিক করুন।' });
        }
        if (!process.env.JWT_PORTAL_SECRET) {
            return res.status(500).json({ success: false, message: 'Server configuration error.' });
        }

        let decoded;
        try {
            decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_PORTAL_SECRET, { algorithms: ['HS256'] });
        } catch {
            return res.status(403).json({ success: false, message: 'সেশনের মেয়াদ শেষ — আবার WhatsApp লিংকে ক্লিক করুন।' });
        }
        if (decoded.type !== 'customer_portal_setup' || !decoded.customer_id) {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন।' });
        }

        const new_password = String(req.body.new_password || '');
        if (new_password.length < 6) {
            return res.status(400).json({ success: false, message: 'ন্যূনতম ৬ ডিজিট/অক্ষরের পাসওয়ার্ড দিন।' });
        }

        const result = await query(
            `SELECT id, shop_name, owner_name, customer_code, email, whatsapp, person_id,
                    current_credit, credit_limit, credit_balance
             FROM customers WHERE id = $1 AND is_active = true LIMIT 1`,
            [decoded.customer_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'প্রোফাইল পাওয়া যায়নি।' });
        }
        const cust = result.rows[0];

        const newHash = await bcrypt.hash(new_password, 10);
        await query(`UPDATE customers SET password_hash = $1 WHERE id = $2`, [newHash, cust.id]);

        // ✅ পাসওয়ার্ড সেট হলো — এবারই প্রথম পূর্ণ সেশন (refresh cookie সহ) ইস্যু
        const { accessJWT, expires_in } = await issueFullCustomerSession(res, cust, {
            loginMethod: 'whatsapp_otp_password_setup', deviceId: req.body.device_id || null, req,
        });

        logger.info(`✅ Password set (first-time, post-OTP) + full session issued: ${cust.customer_code || cust.id}`);

        return res.status(200).json({
            success: true,
            message: 'পাসওয়ার্ড সেট হয়েছে!',
            data: {
                portal_jwt:  accessJWT,
                expires_in,
                has_company: true,
                needs_password_setup: false,
                customer: {
                    id:             cust.id,
                    shop_name:      cust.shop_name,
                    owner_name:     cust.owner_name,
                    customer_code:  cust.customer_code,
                    email:          cust.email,
                    current_credit: cust.current_credit,
                    credit_limit:   cust.credit_limit,
                    credit_balance: cust.credit_balance,
                }
            }
        });

    } catch (error) {
        logger.error('❌ Complete Password Setup Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

const selfRegisterCustomer = async (req, res) => {
    try {
        const { shop_name, owner_name, business_type, date_of_birth, whatsapp, sms_phone, email, password, confirm_password } = req.body;

        if (!shop_name || !shop_name.trim()) {
            return res.status(400).json({ success: false, message: 'দোকানের নাম দিন।' });
        }
        if (!owner_name || !owner_name.trim()) {
            return res.status(400).json({ success: false, message: 'মালিকের নাম দিন।' });
        }
        if (!business_type || !business_type.trim()) {
            return res.status(400).json({ success: false, message: 'ব্যবসার ধরন নির্বাচন করুন।' });
        }
        const cleanWhatsapp = (whatsapp || '').trim();
        if (!/^01[0-9]{9}$/.test(cleanWhatsapp)) {
            return res.status(400).json({ success: false, message: 'সঠিক WhatsApp নম্বর দিন (01XXXXXXXXX)।' });
        }

        // ✅ WhatsApp নম্বর OTP verification — এখন বাধ্যতামূলক। ফ্রন্টএন্ড
        // আগে /portal/send-register-otp → /portal/verify-register-otp দিয়ে
        // এই নম্বরটা যাচাই করিয়ে একটা verify_token পাবে, সেটাই এখানে
        // পাঠাতে হবে। এটা ছাড়া রেজিস্ট্রেশন হবে না — fake/ভুল নম্বর দিয়ে
        // অ্যাকাউন্ট খোলা ঠেকানোর জন্য।
        const whatsappVerifyToken = String(req.body.whatsapp_verify_token || '').trim();
        if (!whatsappVerifyToken) {
            return res.status(400).json({ success: false, message: 'WhatsApp নম্বর যাচাই করুন।' });
        }
        const verifyCheck = await query(
            `SELECT id FROM whatsapp_verification_otps
             WHERE phone = $1 AND verify_token = $2 AND used = true AND token_expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [cleanWhatsapp, whatsappVerifyToken]
        );
        if (verifyCheck.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp যাচাইয়ের মেয়াদ শেষ হয়ে গেছে অথবা নম্বর মিলছে না। আবার OTP পাঠিয়ে যাচাই করুন।'
            });
        }

        // ✅ পাসওয়ার্ড — এখন থেকে আবশ্যক, যাতে Google ছাড়াও (identifier +
        // password দিয়ে) কাস্টমার পোর্টালে ঢুকতে পারে। WhatsApp/email —
        // যেকোনো একটা দিয়ে পরে লগইন করা যাবে, password উভয়ের জন্য একই।
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, message: 'ন্যূনতম ৬ ডিজিট/অক্ষরের পাসওয়ার্ড দিন।' });
        }
        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: 'পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না।' });
        }

        // জন্মতারিখ যাচাই — আবশ্যক, ন্যূনতম বয়স ১৫ বছর
        if (!date_of_birth) {
            return res.status(400).json({ success: false, message: 'জন্মতারিখ দিন।' });
        }
        const dob = new Date(date_of_birth);
        if (isNaN(dob.getTime())) {
            return res.status(400).json({ success: false, message: 'সঠিক জন্মতারিখ দিন।' });
        }
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        if (age < 15) {
            return res.status(400).json({ success: false, message: 'রেজিস্ট্রেশনের জন্য ন্যূনতম বয়স ১৫ বছর হতে হবে।' });
        }
        if (dob > today) {
            return res.status(400).json({ success: false, message: 'সঠিক জন্মতারিখ দিন।' });
        }

        // ⚠️ FIX: এখন global persons টেবিলে duplicate check — tenant_id
        // দিয়ে scope করা হয় না, কারণ persons কোনো কোম্পানির অধীনে না।
        // এক WhatsApp নম্বরে একটাই profile থাকবে, চাই সে যত কোম্পানির
        // সাথেই পরবর্তীতে connect হোক না কেন।
        //
        // ✅ NEW (নবম ধাপের ফলো-আপ): persons-এর পাশাপাশি customers
        // টেবিলও চেক করা হচ্ছে — এখানে match পেলে (SR-added কাস্টমার)
        // নতুন OTP-login (?c= লিংক) পথে পাঠানো হয়, sendRegisterOtp-এর
        // ঠিক একই কারণে/একই মেসেজে (দেখুন উপরের কমেন্ট)। এই চেক
        // sendRegisterOtp-এ আগেই হয় (wizard শুরুতে), কিন্তু ফ্রন্টএন্ড
        // ওই ধাপ বাইপাস করলেও (সরাসরি API কল) যাতে এখানেও আটকায়।
        const existingCustomer = await query(
            `SELECT id FROM customers WHERE whatsapp = $1 AND is_active = true LIMIT 1`,
            [cleanWhatsapp]
        );
        if (existingCustomer.rows.length > 0) {
            return res.status(409).json({
                success: false,
                already_registered: true,
                message: 'এই WhatsApp নম্বরে আপনার দোকান আগে থেকেই যোগ করা আছে। SR-এর পাঠানো WhatsApp লিংকে গিয়ে Continue চাপুন — সরাসরি OTP দিয়ে ঢুকে যাবেন, নতুন করে রেজিস্ট্রেশনের দরকার নেই।'
            });
        }

        const existing = await query(
            `SELECT id FROM persons WHERE whatsapp = $1 LIMIT 1`,
            [cleanWhatsapp]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                already_registered: true,
                message: 'এই WhatsApp নম্বরে আগে থেকেই একটি প্রোফাইল আছে। লগইন পেজ থেকে পাসওয়ার্ড অথবা Google দিয়ে প্রবেশ করুন — পাসওয়ার্ড মনে না থাকলে "পাসওয়ার্ড ভুলে গেছেন?" ব্যবহার করুন।'
            });
        }

        // প্রোফাইল ছবি ও দোকানের ছবি — দুটোই ঐচ্ছিক, দিলে Cloudinary-তে যাবে
        let profilePhotoUrl = null;
        let shopPhotoUrl    = null;
        const profileFile = req.files?.profile_photo?.[0];
        const shopFile     = req.files?.shop_photo?.[0];

        if (profileFile) {
            profilePhotoUrl = await uploadToCloudinary(
                profileFile.buffer, 'customer_profiles', `profile_${Date.now()}`, profileFile.mimetype
            );
        }
        if (shopFile) {
            shopPhotoUrl = await uploadToCloudinary(
                shopFile.buffer, 'shops', `shop_${Date.now()}`, shopFile.mimetype
            );
        }

        const passwordHash = await bcrypt.hash(password, 10);

        // ✅ কোনো tenant_id ছাড়াই global persons row — এখনো কোনো
        // কোম্পানির সাথে connect হয়নি (discoverable ডিফল্ট true থাকে,
        // অর্থাৎ কোম্পানিগুলো discovery.controller.js দিয়ে তাকে খুঁজে পাবে)।
        const result = await query(
            `INSERT INTO persons (full_name, shop_name, business_type, date_of_birth,
              profile_photo, shop_photo, whatsapp, phone, email, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
                owner_name.trim(), shop_name.trim(), business_type.trim(), date_of_birth,
                profilePhotoUrl, shopPhotoUrl, cleanWhatsapp,
                (sms_phone || '').trim() || null, (email || '').trim() || null, passwordHash
            ]
        );

        logger.info(`✅ Self-registered person: ${result.rows[0].id} (${shop_name})`);

        // ব্যবহৃত হয়ে গেছে — verify_token পুনরায় ব্যবহার করা যাবে না
        await query(`DELETE FROM whatsapp_verification_otps WHERE phone = $1`, [cleanWhatsapp]);

        // ✅ ইমেইল দেওয়া থাকলে magic-link পাঠাও — fire-and-forget,
        // রেজিস্ট্রেশন রেসপন্সকে ব্লক করে না (email ঐচ্ছিক বলে
        // ভেরিফিকেশনও ঐচ্ছিক/non-blocking)
        const cleanEmailForVerify = (email || '').trim();
        if (cleanEmailForVerify) {
            sendEmailVerificationLink(result.rows[0].id, cleanEmailForVerify, shop_name.trim(), owner_name.trim());
        }

        return res.status(201).json({
            success: true,
            person_id: result.rows[0].id,
            message: 'রেজিস্ট্রেশন সফল হয়েছে!'
        });

    } catch (error) {
        logger.error('❌ Self Register Error:', error.message);
        return res.status(500).json({ success: false, message: 'রেজিস্ট্রেশন করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// 1b. PASSWORD LOGIN — identifier (email/মোবাইল) + password
// POST /api/portal/login — Public
//
// Google-এর বিকল্প হিসেবে যোগ করা হলো। customers টেবিলে আগে খোঁজে
// (কোনো একটা কোম্পানির সাথে সংযুক্ত কাস্টমার), না পেলে persons টেবিলে
// (এখনো কোনো কোম্পানির সাথে সংযুক্ত হয়নি) — ঠিক directGoogleAuth-এর
// path 1 → path 2 এর মতোই। JWT payload shape হুবহু এক, তাই dashboard,
// refresh, logout — সবকিছু কোনো পরিবর্তন ছাড়াই কাজ করবে।
// ============================================================
// ============================================================
// ডিলিট-রিকোয়েস্ট বাতিল — সফল লগইনের পর কল হয় (password/OTP/Google
// তিনটাতেই)। ৩০ দিনের গ্রেস পিরিয়ডের মূল লজিক: deletion_requested_at
// সেট থাকলে NULL করে দেয় — মানে "৩০ দিনের মধ্যে লগইন করলে ডিলিট
// বাতিল হয়ে যাবে" এভাবেই কাজ করে। no-op যদি কিছু pending না থাকে।
//
// ✅ ৩০ দিন পার হয়ে গেলে finalize করার job এখন আছে
// (jobs/accountDeletion.job.js, প্রতিদিন রাত ৩:৩০) — customers-এর
// জন্য is_active=false করে। person-only অ্যাকাউন্টের জন্য
// is_active কলাম নেই বলে নিচের persons lookup-এ সরাসরি
// safety-net চেক করা হচ্ছে (৩০ দিনের বেশি পুরনো হলে login block)।
// ============================================================
async function cancelPendingDeletion(personId) {
    if (!personId) return;
    await query(
        `UPDATE persons SET deletion_requested_at = NULL, deletion_reason = NULL
         WHERE id = $1 AND deletion_requested_at IS NOT NULL`,
        [personId]
    );
}

const passwordLogin = async (req, res) => {
    try {
        const { identifier, password, device_id } = req.body;

        // ⚠️ নোট: ভুল identifier/password-এ ইচ্ছাকৃতভাবে 401 না দিয়ে 400
        // ব্যবহার করা হচ্ছে। frontend-এর portalFetch() যেকোনো 401 দেখলেই
        // ধরে নেয় "token expired" এবং /portal/refresh কল করে retry করে —
        // সেটা ব্যর্থ হয়ে "Session শেষ হয়েছে" এর মতো ভুল/confusing মেসেজ
        // দেখাবে, আসল "identifier/password ভুল" মেসেজ চাপা পড়ে যাবে।
        if (!identifier || !String(identifier).trim() || !password) {
            return res.status(400).json({ success: false, message: 'ইমেইল/মোবাইল নম্বর এবং পাসওয়ার্ড দিন।' });
        }

        const { isEmail, email, phoneCandidates } = parseIdentifier(identifier);
        if (!isEmail && phoneCandidates.length === 0) {
            return res.status(400).json({ success: false, message: 'ইমেইল/মোবাইল নম্বর অথবা পাসওয়ার্ড ভুল।' });
        }

        // ── ১. customers টেবিলে খোঁজো ─────────────────────────
        const customerResult = isEmail
            ? await query(
                `SELECT id, shop_name, owner_name, customer_code, email, whatsapp,
                        current_credit, credit_limit, credit_balance, person_id, password_hash
                 FROM customers
                 WHERE is_active = true AND LOWER(email) = $1
                 LIMIT 1`,
                [email]
              )
            : await query(
                `SELECT id, shop_name, owner_name, customer_code, email, whatsapp,
                        current_credit, credit_limit, credit_balance, person_id, password_hash
                 FROM customers
                 WHERE is_active = true AND (whatsapp = ANY($1) OR sms_phone = ANY($1))
                 LIMIT 1`,
                [phoneCandidates]
              );

        let ownerType = null;
        let owner     = null;

        if (customerResult.rows.length > 0) {
            ownerType = 'customer';
            owner     = customerResult.rows[0];
        } else {
            // ── ২. না পেলে persons টেবিলে (company-বিহীন profile) ──
            // deletion_requested_at থাকলেও গ্রেস পিরিয়ডের মধ্যে লগইন
            // ব্লক করা হয় না (login = cancel, উপরে cancelPendingDeletion
            // দ্রষ্টব্য) — কিন্তু ৩০ দিন পার হয়ে গেলে safety-net হিসেবে
            // ব্লক করা হয় (customers-এর is_active=false-এর সমতুল্য,
            // persons টেবিলে is_active কলাম নেই বলে সরাসরি এখানে চেক)
            const personResult = isEmail
                ? await query(
                    `SELECT id, full_name, shop_name, email, whatsapp, password_hash
                     FROM persons
                     WHERE LOWER(email) = $1
                       AND (deletion_requested_at IS NULL OR deletion_requested_at > NOW() - INTERVAL '30 days')
                     LIMIT 1`,
                    [email]
                  )
                : await query(
                    `SELECT id, full_name, shop_name, email, whatsapp, password_hash
                     FROM persons
                     WHERE (whatsapp = ANY($1) OR phone = ANY($1))
                       AND (deletion_requested_at IS NULL OR deletion_requested_at > NOW() - INTERVAL '30 days')
                     LIMIT 1`,
                    [phoneCandidates]
                  );

            if (personResult.rows.length > 0) {
                ownerType = 'person';
                owner     = personResult.rows[0];
            }
        }

        // ✅ SECURITY: owner না পেলে বা password সেট না থাকলেও generic
        // error — এতে কোন identifier-এ অ্যাকাউন্ট আছে সেটা বোঝা যাবে না
        if (!owner || !owner.password_hash) {
            return res.status(400).json({ success: false, message: 'ইমেইল/মোবাইল নম্বর অথবা পাসওয়ার্ড ভুল।' });
        }

        const isValid = await bcrypt.compare(password, owner.password_hash);
        if (!isValid) {
            return res.status(400).json({ success: false, message: 'ইমেইল/মোবাইল নম্বর অথবা পাসওয়ার্ড ভুল।' });
        }

        // ✅ সফল লগইন — pending deletion থাকলে বাতিল (৩০ দিন গ্রেস পিরিয়ড)
        await cancelPendingDeletion(ownerType === 'customer' ? owner.person_id : owner.id);

        if (!process.env.JWT_PORTAL_SECRET) {
            logger.error('❌ JWT_PORTAL_SECRET environment variable সেট নেই!');
            return res.status(500).json({ success: false, message: 'Server configuration error.' });
        }

        // ============================================================
        // পথ ১: customer (কোনো একটা কোম্পানির সাথে সংযুক্ত)
        // ============================================================
        if (ownerType === 'customer') {
            // বিদ্যমান token_version পড়ো (আগে কখনো Google/link দিয়ে ঢুকে
            // থাকলে row থাকতে পারে) — directGoogleAuth-এর সাথে সামঞ্জস্যপূর্ণ
            const tokenResult = await query(
                'SELECT token_version FROM customer_portal_tokens WHERE customer_id = $1',
                [owner.id]
            );
            const tokenVersion = tokenResult.rows[0]?.token_version || 1;

            const jwtPayload = {
                customer_id:   owner.id,
                customer_code: owner.customer_code,
                person_id:     owner.person_id || null,
                email:         owner.email || null,
                type:          'customer_portal',
                token_version: tokenVersion,
            };

            const accessJWT  = jwt.sign(jwtPayload, process.env.JWT_PORTAL_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
            const refreshJWT = jwt.sign(
                { ...jwtPayload, type: 'customer_portal_refresh' },
                process.env.JWT_PORTAL_SECRET,
                { expiresIn: '30d', algorithm: 'HS256' }
            );
            setRefreshCookie(res, refreshJWT);

            logger.info(`✅ Password Login (customer): ${owner.customer_code || owner.id}`);

            // ✅ device + location ট্র্যাকিং — fire-and-forget, response ব্লক করে না
            recordLoginEvent({
                ownerType: 'customer', ownerId: owner.id, loginMethod: 'password',
                deviceFingerprint: device_id || null,
                ipAddress: req.ip, userAgent: req.get('user-agent'),
                email: owner.email, phone: owner.whatsapp, name: owner.owner_name,
            });

            return res.status(200).json({
                success: true,
                message: 'লগইন সফল!',
                data: {
                    portal_jwt: accessJWT,
                    expires_in: 900,
                    has_company: true,
                    customer: {
                        id:             owner.id,
                        shop_name:      owner.shop_name,
                        owner_name:     owner.owner_name,
                        customer_code:  owner.customer_code,
                        email:          owner.email,
                        current_credit: owner.current_credit,
                        credit_limit:   owner.credit_limit,
                        credit_balance: owner.credit_balance,
                    }
                }
            });
        }

        // ============================================================
        // পথ ২: person (এখনো কোনো কোম্পানির সাথে সংযুক্ত না)
        // ============================================================
        const jwtPayload = {
            customer_id:   null,
            person_id:     owner.id,
            email:         owner.email || null,
            type:          'customer_portal',
            token_version: 1,
        };

        const accessJWT  = jwt.sign(jwtPayload, process.env.JWT_PORTAL_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
        const refreshJWT = jwt.sign(
            { ...jwtPayload, type: 'customer_portal_refresh' },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '30d', algorithm: 'HS256' }
        );
        setRefreshCookie(res, refreshJWT);

        logger.info(`✅ Password Login (person): ${owner.id}`);

        // ✅ device + location ট্র্যাকিং — fire-and-forget, response ব্লক করে না
        recordLoginEvent({
            ownerType: 'person', ownerId: owner.id, loginMethod: 'password',
            deviceFingerprint: device_id || null,
            ipAddress: req.ip, userAgent: req.get('user-agent'),
            email: owner.email, phone: owner.whatsapp, name: owner.full_name,
        });

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল!',
            data: {
                portal_jwt: accessJWT,
                expires_in: 900,
                has_company: false,
                person: {
                    id:        owner.id,
                    shop_name: owner.shop_name,
                    full_name: owner.full_name,
                    email:     owner.email,
                }
            }
        });

    } catch (error) {
        logger.error('❌ Password Login Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে। আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// identifier (email/মোবাইল) দিয়ে customer বা person owner খোঁজা —
// passwordLogin, forgot-password ফ্লো — সব জায়গায় একই লজিক ব্যবহারের
// জন্য শেয়ার্ড হেল্পার। ফোন নম্বর হলে সাথে matched phone value-ও
// ফেরত দেয় (WhatsApp OTP পাঠানোর জন্য দরকার)।
// ============================================================
const resolvePortalOwner = async (identifier) => {
    const { isEmail, email, phoneCandidates } = parseIdentifier(identifier);

    if (isEmail) {
        const c = await query(
            `SELECT id, owner_name FROM customers WHERE is_active = true AND LOWER(email) = $1 LIMIT 1`,
            [email]
        );
        if (c.rows.length > 0) {
            return { ownerType: 'customer', ownerId: c.rows[0].id, ownerName: c.rows[0].owner_name, phone: null };
        }
        const p = await query(`SELECT id, full_name FROM persons WHERE LOWER(email) = $1 LIMIT 1`, [email]);
        if (p.rows.length > 0) {
            return { ownerType: 'person', ownerId: p.rows[0].id, ownerName: p.rows[0].full_name, phone: null };
        }
        return { ownerType: null, ownerId: null, ownerName: null, phone: null };
    }

    if (!phoneCandidates || phoneCandidates.length === 0) {
        return { ownerType: null, ownerId: null, ownerName: null, phone: null };
    }

    const c = await query(
        `SELECT id, owner_name, whatsapp, sms_phone FROM customers
         WHERE is_active = true AND (whatsapp = ANY($1) OR sms_phone = ANY($1)) LIMIT 1`,
        [phoneCandidates]
    );
    if (c.rows.length > 0) {
        return { ownerType: 'customer', ownerId: c.rows[0].id, ownerName: c.rows[0].owner_name, phone: c.rows[0].whatsapp || c.rows[0].sms_phone };
    }
    const p = await query(
        `SELECT id, full_name, whatsapp, phone FROM persons WHERE whatsapp = ANY($1) OR phone = ANY($1) LIMIT 1`,
        [phoneCandidates]
    );
    if (p.rows.length > 0) {
        return { ownerType: 'person', ownerId: p.rows[0].id, ownerName: p.rows[0].full_name, phone: p.rows[0].whatsapp || p.rows[0].phone };
    }
    return { ownerType: null, ownerId: null, ownerName: null, phone: null };
};

// ============================================================
// 1c. FORGOT / SET PASSWORD — ধাপ ১: OTP পাঠাও
// POST /api/portal/forgot-password — Public
// body: { identifier }  — ইমেইল দিলে Email-এ, মোবাইল নম্বর দিলে
// WhatsApp-এ OTP যায়। WhatsApp পাঠানো হয় Baileys গেটওয়ে (self-hosted
// WhatsApp session) দিয়ে — sms.service.js (tenant wallet billing) না —
// তাই কোনো SaaS কোম্পানির ক্রেডিট থেকে কিছু কাটা হয় না; খরচ প্ল্যাটফর্মের।
//
// যাদের আগে password ছিলই না (শুধু Google দিয়ে ঢুকতেন), তাদের জন্য
// এটাই প্রথমবার password সেট করার উপায়ও — তাই ভাষাটা "reset" না বলে
// "সেট/রিসেট" দুটোই বলা হচ্ছে।
// ============================================================
const portalForgotPassword = async (req, res) => {
    try {
        const { identifier } = req.body;
        const cleanIdentifier = String(identifier || '').trim();
        const { isEmail, phoneCandidates } = parseIdentifier(cleanIdentifier);

        if (!cleanIdentifier || (!isEmail && phoneCandidates.length === 0)) {
            return res.status(400).json({ success: false, message: 'একটি বৈধ ইমেইল অথবা মোবাইল নম্বর দিন।' });
        }

        const genericMsg = isEmail
            ? 'এই ইমেইলে অ্যাকাউন্ট থাকলে একটি OTP পাঠানো হয়েছে।'
            : 'এই নম্বরে অ্যাকাউন্ট থাকলে WhatsApp-এ একটি OTP পাঠানো হয়েছে।';

        // ✅ WhatsApp গেটওয়ে সাম্প্রতিক সময়ে ডাউন থাকলে honest মেসেজ —
        // ⚠️ এটা owner lookup-এর *আগে* চেক করা হচ্ছে, ইচ্ছাকৃতভাবে। যদি
        // এই চেক owner পাওয়া/না-পাওয়ার পরে করা হতো, তাহলে "unavailable"
        // মেসেজ শুধু তখনই দেখাত যখন identifier সত্যিই কোনো অ্যাকাউন্টের
        // সাথে মিলত — এটা নিজেই একটা enumeration leak হয়ে যেত (attacker
        // বুঝে যেত কোন নম্বরে অ্যাকাউন্ট আছে, গেটওয়ে ডাউন থাকা অবস্থায়)।
        // এখন যেভাবে আছে: গেটওয়ে ডাউন হলে সব ফোন-identifier-এর জন্য
        // *একই* রেসপন্স, owner মিলুক বা না মিলুক — কোনো তথ্য leak হয় না।
        if (!isEmail) {
            const { isWhatsAppLikelyDown } = require('../services/portalWhatsapp.service');
            if (isWhatsAppLikelyDown()) {
                return res.status(200).json({
                    success: true,
                    whatsapp_unavailable: true,
                    message: 'WhatsApp এই মুহূর্তে সাময়িকভাবে অনুপলব্ধ। একটু পর আবার চেষ্টা করুন, অথবা ইমেইল ব্যবহার করুন।'
                });
            }
        }

        const { ownerType, ownerId, ownerName, phone } = await resolvePortalOwner(cleanIdentifier);

        // ✅ SECURITY: enumeration ঠেকাতে — অ্যাকাউন্ট না পেলেও একই
        // success message (attacker বুঝতে পারবে না কোন identifier registered)
        if (!ownerType) {
            return res.status(200).json({ success: true, message: genericMsg });
        }

        const otp       = generateOTP(6);
        const otpHash   = hashOTP(otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // ১০ মিনিট

        const ownerCol = ownerType === 'customer' ? 'customer_id' : 'person_id';
        await query(`DELETE FROM customer_password_reset_otps WHERE ${ownerCol} = $1`, [ownerId]);
        await query(
            `INSERT INTO customer_password_reset_otps (${ownerCol}, otp, expires_at) VALUES ($1, $2, $3)`,
            [ownerId, otpHash, expiresAt]
        );

        if (isEmail) {
            const { sendEmail } = require('../services/email.service');
            const html = `
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #E1EEFC;border-radius:12px;overflow:hidden">
              <div style="background:#124A8C;padding:20px;text-align:center">
                <h2 style="color:#ffffff;margin:0;font-size:18px">ZovoriX কাস্টমার পোর্টাল</h2>
              </div>
              <div style="padding:24px;color:#1F2937">
                <p>আসসালামু আলাইকুম${ownerName ? ' ' + ownerName : ''},</p>
                <p>আপনার পোর্টাল পাসওয়ার্ড সেট/রিসেট করার জন্য নিচের OTP কোডটি ব্যবহার করুন:</p>
                <div style="background:#E1EEFC;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
                  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#124A8C;margin:0">${otp}</p>
                </div>
                <p style="color:#D64545;font-size:13px">⚠️ এই কোডটি <strong>১০ মিনিট</strong> পর্যন্ত কার্যকর থাকবে। কারো সাথে শেয়ার করবেন না।</p>
                <p style="font-size:13px;color:#6B7280">এই অনুরোধ আপনি না করে থাকলে এই ইমেইলটি উপেক্ষা করুন — আপনার অ্যাকাউন্ট নিরাপদ আছে।</p>
                <p style="margin-top:20px">ধন্যবাদান্তে,<br><strong>ZovoriX টিম</strong></p>
              </div>
            </div>`;
            await sendEmail(cleanIdentifier.toLowerCase(), 'ZovoriX পোর্টাল — পাসওয়ার্ড OTP 🔑', html, '', { type: 'otp' });
        } else {
            const { sendPortalOTPWhatsApp } = require('../services/portalWhatsapp.service');
            await sendPortalOTPWhatsApp(phone || cleanIdentifier, otp, 'পাসওয়ার্ড সেট/রিসেট');
        }

        return res.status(200).json({ success: true, message: genericMsg });

    } catch (error) {
        logger.error('❌ Portal Forgot Password Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// 1d. FORGOT / SET PASSWORD — ধাপ ২: OTP যাচাই → reset_token ফেরত
// POST /api/portal/verify-reset-otp — Public
// body: { identifier, otp }  — identifier ধাপ ১-এ যা দেওয়া হয়েছিল তার সাথে মিলতে হবে
// ============================================================
const portalVerifyResetOtp = async (req, res) => {
    try {
        const { identifier, otp } = req.body;
        const cleanIdentifier = String(identifier || '').trim();

        if (!cleanIdentifier || !otp) {
            return res.status(400).json({ success: false, message: 'ইমেইল/মোবাইল নম্বর ও OTP দিন।' });
        }

        const { ownerType, ownerId } = await resolvePortalOwner(cleanIdentifier);
        if (!ownerType) {
            return res.status(400).json({ success: false, message: 'OTP মিলছে না অথবা মেয়াদ শেষ হয়ে গেছে।' });
        }

        const ownerCol = ownerType === 'customer' ? 'customer_id' : 'person_id';
        const otpHash  = hashOTP(otp);

        const otpResult = await query(
            `SELECT id FROM customer_password_reset_otps
             WHERE ${ownerCol} = $1 AND otp = $2 AND used = false AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [ownerId, otpHash]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP মিলছে না অথবা মেয়াদ শেষ হয়ে গেছে।' });
        }

        const resetToken     = crypto.randomBytes(32).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // ১৫ মিনিট

        await query(
            `UPDATE customer_password_reset_otps
             SET used = true, reset_token = $1, token_expires_at = $2
             WHERE id = $3`,
            [resetToken, tokenExpiresAt, otpResult.rows[0].id]
        );

        return res.status(200).json({ success: true, reset_token: resetToken, message: 'OTP যাচাই সফল হয়েছে।' });

    } catch (error) {
        logger.error('❌ Portal Verify Reset OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// 1e. FORGOT / SET PASSWORD — ধাপ ৩: নতুন পাসওয়ার্ড সেট করো
// POST /api/portal/reset-password — Public
// body: { identifier, reset_token, new_password }
// ============================================================
// ============================================================
// পাসওয়ার্ড পরিবর্তন/সেট হওয়ার নিরাপত্তা সতর্কতা — email + WhatsApp
// দুটো চ্যানেলেই পাঠানো হয় (কাস্টমারের যেগুলো আছে), OTP আসলে কোন
// চ্যানেল দিয়ে ভেরিফাই হয়েছিল তা নির্বিশেষে। কারণ: একটা চ্যানেল
// (ধরুন email) কম্প্রোমাইজড হয়ে থাকলেও অন্যটা (WhatsApp) দিয়ে
// আসল মালিকের কাছে অ্যালার্ট পৌঁছাবে।
//
// Best-effort, fire-and-forget: email/WhatsApp পাঠাতে ব্যর্থ হলেও
// পাসওয়ার্ড রিসেট রেসপন্স সফলই থাকে — caller await করে না, এখানেই
// নিজে থেকে সব error ধরে নেওয়া হয়েছে যাতে কখনো unhandled rejection
// না হয়।
// ============================================================
const notifyPasswordChanged = async ({ email, phone, name }) => {
    const whenText = new Date().toLocaleString('bn-BD', {
        timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short'
    });

    const tasks = [];

    if (email) {
        const html = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #F3D9D9;border-radius:12px;overflow:hidden">
          <div style="background:#B3452C;padding:20px;text-align:center">
            <h2 style="color:#ffffff;margin:0;font-size:18px">🔒 ZovoriX নিরাপত্তা সতর্কতা</h2>
          </div>
          <div style="padding:24px;color:#1F2937">
            <p>আসসালামু আলাইকুম${name ? ' ' + name : ''},</p>
            <p>আপনার কাস্টমার পোর্টাল অ্যাকাউন্টের <strong>পাসওয়ার্ড এইমাত্র পরিবর্তন/সেট করা হয়েছে</strong>।</p>
            <div style="background:#FBE4E4;border-radius:12px;padding:16px 20px;margin:20px 0">
              <p style="margin:0;font-size:13px;color:#6B7280">🕐 সময়</p>
              <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1F2937">${whenText}</p>
            </div>
            <p style="color:#B3452C;font-size:13.5px;font-weight:600">⚠️ এটা যদি আপনি না করে থাকেন, দয়া করে সাথে সাথে আপনার সংশ্লিষ্ট দোকান/কোম্পানির সাথে যোগাযোগ করুন।</p>
            <p style="margin-top:20px">ধন্যবাদান্তে,<br><strong>ZovoriX টিম</strong></p>
          </div>
        </div>`;
        const { sendEmail } = require('../services/email.service');
        tasks.push(
            sendEmail(email, '🔒 আপনার ZovoriX পাসওয়ার্ড পরিবর্তন হয়েছে', html, '', { type: 'security_alert' })
                .catch(e => logger.warn('⚠️ Password-changed email alert পাঠানো যায়নি:', e.message))
        );
    }

    if (phone) {
        const { sendPasswordChangedAlertWhatsApp } = require('../services/portalWhatsapp.service');
        tasks.push(
            sendPasswordChangedAlertWhatsApp(phone, whenText)
                .catch(e => logger.warn('⚠️ Password-changed WhatsApp alert পাঠানো যায়নি:', e.message))
        );
    }

    await Promise.allSettled(tasks);
};

// ============================================================
// নতুন ডিভাইস থেকে লগইন হলে নিরাপত্তা সতর্কতা — email + WhatsApp,
// city/country সহ (পাওয়া গেলে)। notifyPasswordChanged-এর মতোই
// best-effort, fire-and-forget প্যাটার্ন।
// ============================================================
const notifyNewDeviceLogin = async ({ email, phone, name, city, country, whenText }) => {
    const locationText = city && country ? `${city}, ${country}` : (country || 'অজানা অবস্থান');
    const tasks = [];

    if (email) {
        const html = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #F3D9D9;border-radius:12px;overflow:hidden">
          <div style="background:#B3452C;padding:20px;text-align:center">
            <h2 style="color:#ffffff;margin:0;font-size:18px">🔒 ZovoriX নিরাপত্তা সতর্কতা</h2>
          </div>
          <div style="padding:24px;color:#1F2937">
            <p>আসসালামু আলাইকুম${name ? ' ' + name : ''},</p>
            <p>আপনার কাস্টমার পোর্টাল অ্যাকাউন্টে একটা <strong>নতুন ডিভাইস থেকে লগইন</strong> হয়েছে।</p>
            <table style="width:100%;background:#FBE4E4;border-radius:12px;margin:20px 0;border-collapse:collapse">
              <tr><td style="padding:14px 20px 2px;font-size:13px;color:#6B7280">📍 অবস্থান (আনুমানিক)</td></tr>
              <tr><td style="padding:0 20px 12px;font-size:15px;font-weight:600;color:#1F2937">${locationText}</td></tr>
              <tr><td style="padding:0 20px 2px;font-size:13px;color:#6B7280">🕐 সময়</td></tr>
              <tr><td style="padding:0 20px 14px;font-size:15px;font-weight:600;color:#1F2937">${whenText}</td></tr>
            </table>
            <p style="color:#B3452C;font-size:13.5px;font-weight:600">⚠️ এটা যদি আপনি না করে থাকেন, দয়া করে সাথে সাথে পাসওয়ার্ড বদলান এবং আপনার সংশ্লিষ্ট দোকান/কোম্পানির সাথে যোগাযোগ করুন।</p>
            <p style="margin-top:20px">ধন্যবাদান্তে,<br><strong>ZovoriX টিম</strong></p>
          </div>
        </div>`;
        const { sendEmail } = require('../services/email.service');
        tasks.push(
            sendEmail(email, '🔒 নতুন ডিভাইস থেকে আপনার ZovoriX অ্যাকাউন্টে লগইন', html, '', { type: 'security_alert' })
                .catch(e => logger.warn('⚠️ New-device email alert পাঠানো যায়নি:', e.message))
        );
    }

    if (phone) {
        const { sendPortalWhatsAppMessage } = require('../services/portalWhatsapp.service');
        const message =
            `🔒 *ZovoriX নিরাপত্তা সতর্কতা*\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `আপনার অ্যাকাউন্টে একটা *নতুন ডিভাইস* থেকে লগইন হয়েছে।\n\n` +
            `📍 অবস্থান: ${locationText}\n` +
            `🕐 সময়: ${whenText}\n\n` +
            `⚠️ *এটা যদি আপনি না করে থাকেন*, দয়া করে সাথে সাথে পাসওয়ার্ড বদলান এবং আপনার সংশ্লিষ্ট দোকান/কোম্পানির সাথে যোগাযোগ করুন।\n` +
            `━━━━━━━━━━━━━━━━`;
        tasks.push(
            sendPortalWhatsAppMessage(phone, message, 'new_device_alert')
                .catch(e => logger.warn('⚠️ New-device WhatsApp alert পাঠানো যায়নি:', e.message))
        );
    }

    await Promise.allSettled(tasks);
};

// ============================================================
// প্রতিটা সফল লগইনে (password অথবা Google) একটা ইভেন্ট রেকর্ড করে —
// device fingerprint + IP + geolocation (city/country) সহ। আগে কখনো
// এই fingerprint দেখা না গেলে (এবং এটাই owner-এর প্রথম লগইন না হলে)
// নতুন-ডিভাইস সতর্কতা পাঠায়।
//
// পুরোপুরি best-effort — কোনো ধাপ ব্যর্থ হলেও throw করে না, শুধু log
// করে; মূল লগইন ফ্লো কখনো এর জন্য আটকাবে না বা ব্যর্থ হবে না। Caller
// থেকে await ছাড়াই ডাকা হয় (fire-and-forget)।
// ============================================================
const recordLoginEvent = async ({ ownerType, ownerId, loginMethod, deviceFingerprint, ipAddress, userAgent, email, phone, name }) => {
    try {
        const ownerCol = ownerType === 'customer' ? 'customer_id' : 'person_id';

        // এই owner-এর আগের সব লগইন-ইভেন্টের fingerprint আনো
        const priorEvents = await query(
            `SELECT device_fingerprint FROM customer_portal_login_events WHERE ${ownerCol} = $1`,
            [ownerId]
        );
        const isFirstEverLogin = priorEvents.rows.length === 0;
        const knownFingerprints = new Set(priorEvents.rows.map(r => r.device_fingerprint).filter(Boolean));
        const isNewDevice = !!deviceFingerprint && !knownFingerprints.has(deviceFingerprint);

        // geolocation — ব্যর্থ হলেও gracefully null (কখনো throw করে না, getLocationFromIP নিজেই সেফ)
        const { city, country } = await getLocationFromIP(ipAddress);

        await query(
            `INSERT INTO customer_portal_login_events
                (${ownerCol}, login_method, device_fingerprint, ip_address, city, country, user_agent, is_new_device)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [ownerId, loginMethod, deviceFingerprint || null, ipAddress || null, city, country, userAgent || null, isNewDevice]
        );

        // নতুন ডিভাইস থেকে লগইন — কিন্তু এই owner-এর একদম প্রথম লগইন
        // হলে অ্যালার্ট পাঠানো হয় না (প্রথমবার সবকিছুই "নতুন", এতে
        // সন্দেহজনক কিছু নেই)
        if (isNewDevice && !isFirstEverLogin) {
            const whenText = new Date().toLocaleString('bn-BD', {
                timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short'
            });
            notifyNewDeviceLogin({ email, phone, name, city, country, whenText }).catch((e) =>
                logger.warn('⚠️ notifyNewDeviceLogin ব্যর্থ:', e.message)
            );
        }
    } catch (err) {
        logger.warn('⚠️ recordLoginEvent ব্যর্থ (login flow প্রভাবিত হয়নি):', err.message);
    }
};

const portalResetPassword = async (req, res) => {
    try {
        const { identifier, reset_token, new_password } = req.body;
        const cleanIdentifier = String(identifier || '').trim();

        if (!cleanIdentifier || !reset_token || !new_password) {
            return res.status(400).json({ success: false, message: 'সব তথ্য দিন।' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ success: false, message: 'ন্যূনতম ৬ ডিজিট/অক্ষরের পাসওয়ার্ড দিন।' });
        }

        const { ownerType, ownerId } = await resolvePortalOwner(cleanIdentifier);
        if (!ownerType) {
            return res.status(400).json({ success: false, message: 'অনুরোধ যাচাই করা যায়নি। প্রথম থেকে আবার চেষ্টা করুন।' });
        }

        const ownerCol = ownerType === 'customer' ? 'customer_id' : 'person_id';

        const otpResult = await query(
            `SELECT id FROM customer_password_reset_otps
             WHERE ${ownerCol} = $1 AND reset_token = $2 AND used = true AND token_expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [ownerId, reset_token]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'অনুরোধের মেয়াদ শেষ হয়ে গেছে। প্রথম থেকে আবার চেষ্টা করুন।' });
        }

        const passwordHash = await bcrypt.hash(new_password, 10);
        const table = ownerType === 'customer' ? 'customers' : 'persons';
        await query(`UPDATE ${table} SET password_hash = $1 WHERE id = $2`, [passwordHash, ownerId]);

        // ব্যবহৃত OTP মুছে ফেলো — reset_token পুনরায় ব্যবহার করা যাবে না
        await query(`DELETE FROM customer_password_reset_otps WHERE ${ownerCol} = $1`, [ownerId]);

        logger.info(`✅ Password reset (${ownerType}): ${ownerId}`);

        // ✅ নিরাপত্তা সতর্কতা — fire-and-forget (response block করে না)।
        // এই তাজা query-টা করেই কেন আবার কন্টাক্ট আনা হচ্ছে: ownerType/ownerId
        // resolve হয়েছিল identifier দিয়ে (email অথবা phone — যেকোনো একটা),
        // কিন্তু অ্যালার্ট পাঠাতে হবে উভয় চ্যানেলেই যদি দুটোই থাকে।
        query(
            ownerType === 'customer'
                ? `SELECT email, whatsapp, sms_phone, owner_name AS name FROM customers WHERE id = $1`
                : `SELECT email, whatsapp, full_name AS name FROM persons WHERE id = $1`,
            [ownerId]
        ).then((contactResult) => {
            const contact = contactResult.rows[0];
            if (!contact) return;
            notifyPasswordChanged({
                email: contact.email,
                phone: contact.whatsapp || contact.sms_phone,
                name:  contact.name,
            });
        }).catch((notifyErr) => {
            logger.warn('⚠️ Password-changed notification contact fetch ব্যর্থ:', notifyErr.message);
        });

        return res.status(200).json({ success: true, message: 'পাসওয়ার্ড সফলভাবে সেট হয়েছে! এখন লগইন করুন।' });

    } catch (error) {
        logger.error('❌ Portal Reset Password Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// 1f. রেজিস্ট্রেশনে WhatsApp নম্বর OTP verification (বাধ্যতামূলক)
// ধাপ ১: OTP পাঠাও — POST /api/portal/send-register-otp — Public
// body: { whatsapp }
//
// ⚠️ এখানে এখনো কোনো customer/person রেকর্ড নেই — তাই আলাদা
// phone-keyed টেবিল (whatsapp_verification_otps) ব্যবহার করা হচ্ছে।
// এটাও Baileys (প্ল্যাটফর্ম-লেভেল, tenant billing নেই) দিয়ে পাঠানো হয়।
// ============================================================
const sendRegisterOtp = async (req, res) => {
    try {
        const { whatsapp } = req.body;
        const cleanWhatsapp = String(whatsapp || '').trim();

        if (!/^01[0-9]{9}$/.test(cleanWhatsapp)) {
            return res.status(400).json({ success: false, message: 'সঠিক WhatsApp নম্বর দিন (01XXXXXXXXX)।' });
        }

        // ✅ গেটওয়ে সাম্প্রতিক সময়ে ডাউন জানা থাকলে আগেই honest এরর —
        // duplicate-check query, OTP generate/insert — এসব অপ্রয়োজনীয়
        // কাজ এড়ানো যায় (এখানে enumeration ঝুঁকি নেই, এই এন্ডপয়েন্ট
        // এমনিতেই "already registered" প্রকাশ করে, তাই আলাদা করে
        // owner-lookup-এর আগে চেক করার দরকার নেই)।
        const { isWhatsAppLikelyDown } = require('../services/portalWhatsapp.service');
        if (isWhatsAppLikelyDown()) {
            return res.status(503).json({
                success: false,
                message: 'এই মুহূর্তে WhatsApp-এ OTP পাঠানো যাচ্ছে না। একটু পর আবার চেষ্টা করুন।'
            });
        }

        // ✅ NEW (নবম ধাপের ফলো-আপ): আগে শুধু persons চেক হতো — SR-added
        // কাস্টমার (শুধু customers টেবিলে, persons-এ না) একই WhatsApp
        // নম্বর দিয়ে self-register করলে ধরা পড়ত না, ফলে বিচ্ছিন্ন একটা
        // persons প্রোফাইল তৈরি হয়ে যেত (আগের invoice/credit history
        // থেকে আলাদা)। এখন customers টেবিলও আগে চেক করা হচ্ছে — matched
        // হলে নতুন OTP-login (?c= লিংক) পথে পাঠানো হয়, যেটা এখন তাদের
        // জন্য সবচেয়ে সহজ পথ (password/Google কোনোটাই লাগে না)।
        const existingCustomer = await query(
            `SELECT id FROM customers WHERE whatsapp = $1 AND is_active = true LIMIT 1`,
            [cleanWhatsapp]
        );
        if (existingCustomer.rows.length > 0) {
            return res.status(409).json({
                success: false,
                already_registered: true,
                message: 'এই WhatsApp নম্বরে আপনার দোকান আগে থেকেই যোগ করা আছে। SR-এর পাঠানো WhatsApp লিংকে গিয়ে Continue চাপুন — সরাসরি OTP দিয়ে ঢুকে যাবেন, নতুন করে রেজিস্ট্রেশনের দরকার নেই।'
            });
        }

        // ✅ আগেই duplicate চেক করে নেওয়া হচ্ছে — যাতে পুরো ৬-ধাপ wizard
        // শেষ করে (ছবি আপলোড সহ) শেষ মুহূর্তে গিয়ে "already registered"
        // এরর না পায়। selfRegisterCustomer-এর একই চেক, শুধু আগে করা হচ্ছে।
        const existing = await query(`SELECT id FROM persons WHERE whatsapp = $1 LIMIT 1`, [cleanWhatsapp]);
        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                already_registered: true,
                message: 'এই WhatsApp নম্বরে আগে থেকেই একটি প্রোফাইল আছে। লগইন পেজ থেকে পাসওয়ার্ড অথবা Google দিয়ে প্রবেশ করুন।'
            });
        }

        const otp       = generateOTP(6);
        const otpHash   = hashOTP(otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // ১০ মিনিট

        await query(`DELETE FROM whatsapp_verification_otps WHERE phone = $1`, [cleanWhatsapp]);
        await query(
            `INSERT INTO whatsapp_verification_otps (phone, otp, expires_at) VALUES ($1, $2, $3)`,
            [cleanWhatsapp, otpHash, expiresAt]
        );

        const { sendPortalOTPWhatsApp } = require('../services/portalWhatsapp.service');
        const sendResult = await sendPortalOTPWhatsApp(cleanWhatsapp, otp, 'রেজিস্ট্রেশন যাচাই');

        if (!sendResult.success) {
            logger.warn(`⚠️ Register OTP পাঠানো যায়নি: ${cleanWhatsapp} — ${sendResult.reason}`);
            return res.status(503).json({
                success: false,
                message: 'এই মুহূর্তে WhatsApp-এ OTP পাঠানো যাচ্ছে না। একটু পর আবার চেষ্টা করুন।'
            });
        }

        return res.status(200).json({ success: true, message: 'WhatsApp-এ OTP পাঠানো হয়েছে।' });

    } catch (error) {
        logger.error('❌ Send Register OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// 1g. রেজিস্ট্রেশনে WhatsApp OTP verification — ধাপ ২: যাচাই
// POST /api/portal/verify-register-otp — Public
// body: { whatsapp, otp }
// সফল হলে whatsapp_verify_token ফেরত দেয় — সেটা self-register
// সাবমিট করার সময় দিতে হবে (নিশ্চিত করার জন্য যে ঠিক ওই নম্বরটাই
// যাচাই হয়েছে যেটা দিয়ে রেজিস্ট্রেশন হচ্ছে)।
// ============================================================
const verifyRegisterOtp = async (req, res) => {
    try {
        const { whatsapp, otp } = req.body;
        const cleanWhatsapp = String(whatsapp || '').trim();

        if (!cleanWhatsapp || !otp) {
            return res.status(400).json({ success: false, message: 'WhatsApp নম্বর ও OTP দিন।' });
        }

        const otpHash = hashOTP(otp);
        const otpResult = await query(
            `SELECT id FROM whatsapp_verification_otps
             WHERE phone = $1 AND otp = $2 AND used = false AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [cleanWhatsapp, otpHash]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP মিলছে না অথবা মেয়াদ শেষ হয়ে গেছে।' });
        }

        // রেজিস্ট্রেশন wizard শেষ করতে সময় লাগতে পারে (ছবি আপলোড ইত্যাদি) —
        // তাই reset_token-এর (১৫ মিনিট) চেয়ে বেশি মেয়াদ: ৪৫ মিনিট
        const verifyToken    = crypto.randomBytes(32).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 45 * 60 * 1000);

        await query(
            `UPDATE whatsapp_verification_otps
             SET used = true, verify_token = $1, token_expires_at = $2
             WHERE id = $3`,
            [verifyToken, tokenExpiresAt, otpResult.rows[0].id]
        );

        return res.status(200).json({ success: true, verify_token: verifyToken, message: 'WhatsApp নম্বর যাচাই সফল হয়েছে।' });

    } catch (error) {
        logger.error('❌ Verify Register OTP Error:', error.message);
        return res.status(500).json({ success: false, message: 'সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

// ============================================================
// 1b. RESOLVE LINK
// POST /api/portal/resolve-link
// body: { redirect_id }
// URL-এ শুধু redirect_id — token কখনো URL-এ যায় না
// Frontend POST করে → actual portal_token পায় (body-তে)
// ============================================================
const resolveLink = async (req, res) => {
    try {
        const { redirect_id } = req.body;

        if (!redirect_id) {
            return res.status(400).json({ success: false, message: 'redirect_id দেওয়া হয়নি।' });
        }

        const result = await query(
            `SELECT cpt.token, cpt.expires_at, cpt.bound_email,
                    c.shop_name, c.owner_name, c.customer_code
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.redirect_id = $1
               AND cpt.expires_at > NOW()
               AND c.is_active = true`,
            [redirect_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'লিংকটি পাওয়া যায়নি বা মেয়াদ শেষ হয়েছে।'
            });
        }

        const row = result.rows[0];

        // One-time link_token তৈরি — ৫ মিনিট TTL, single use
        // portal_token (master secret) কখনো response-এ দেওয়া হয় না।
        // Frontend এই link_token দিয়ে deviceLogin বা googleAuth call করবে।
        // ব্যবহারের পরে সার্ভার link_token NULL করে দেয়।
        const linkToken   = generateLinkToken();
        const linkExpires = new Date(Date.now() + 5 * 60 * 1000); // ৫ মিনিট

        await query(
            `UPDATE customer_portal_tokens
             SET link_token = $1, link_token_expires_at = $2
             WHERE redirect_id = $3`,
            [linkToken, linkExpires, redirect_id]
        );

        return res.status(200).json({
            success: true,
            data: {
                link_token:    linkToken,          // ৫-মিনিটের one-time token
                expires_at:    row.expires_at,
                is_bound:      !!row.bound_email,  // Google account আগে bind হয়েছে কিনা
                shop_name:     row.shop_name,
                owner_name:    row.owner_name,
                customer_code: row.customer_code,
            }
        });

    } catch (error) {
        logger.error('❌ Resolve Link Error:', error.message);
        return res.status(500).json({ success: false, message: 'লিংক যাচাইয়ে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2. VERIFY TOKEN (pre-login check)
// GET /api/portal/verify-token?token=xxx&device_id=xxx
// Frontend check করে: device whitelisted কিনা, Google skip যাবে কিনা
// ============================================================
const verifyPortalToken = async (req, res) => {
    try {
        const { token, device_id } = req.query;

        if (!token) {
            return res.status(400).json({ success: false, message: 'token দেওয়া হয়নি।' });
        }

        // ✅ FIX: link_token দিয়ে lookup (master token কখনো client-এ যায় না)
        // link_token_expires_at চেক — ৫ মিনিট TTL enforce
        const result = await query(
            `SELECT cpt.customer_id, cpt.expires_at, cpt.bound_email,
                    c.shop_name, c.owner_name, c.customer_code
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.link_token = $1
               AND cpt.link_token_expires_at > NOW()
               AND cpt.expires_at > NOW()
               AND c.is_active = true`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।' });
        }

        const record    = result.rows[0];
        const userAgent = req.headers['user-agent'] || '';

        // device whitelist চেক — Google skip করা যাবে কিনা
        let can_skip_google = false;
        if (device_id && record.bound_email) {
            // এই token-এ Google account bound আছে এবং device_id দেওয়া হয়েছে
            const compositeRaw = `${device_id}::${userAgent}`;
            const hashedDevice = hashDeviceId(compositeRaw);

            const deviceCheck = await query(
                `SELECT id FROM customer_portal_devices
                 WHERE customer_id = $1
                   AND device_hash = $2
                   AND is_active = true`,
                [record.customer_id, hashedDevice]
            );

            can_skip_google = deviceCheck.rows.length > 0;
        }

        return res.status(200).json({
            success: true,
            data: {
                customer_id:    record.customer_id,      // ✅ FIX: frontend storageKey তৈরিতে দরকার
                shop_name:      record.shop_name,
                owner_name:     record.owner_name,
                customer_code:  record.customer_code,
                expires_at:     record.expires_at,
                is_bound:       !!record.bound_email,   // Google account আগে bind হয়েছে
                can_skip_google,                         // এই device whitelisted কিনা
            }
        });

    } catch (error) {
        logger.error('❌ Verify Token Error:', error.message);
        return res.status(500).json({ success: false, message: 'যাচাইয়ে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 3. DEVICE LOGIN (Google ছাড়া — whitelisted device-এ)
// POST /api/portal/device-login
// body: { portal_token, device_id }
// device_id শুধু নয় — User-Agent-সহ composite hash মেলাতে হবে
// ============================================================
const deviceLogin = async (req, res) => {
    try {
        const { link_token, device_id } = req.body;

        if (!link_token || !device_id) {
            return res.status(400).json({ success: false, message: 'link_token ও device_id দেওয়া হয়নি।' });
        }

        const userAgent    = req.headers['user-agent'] || '';
        const compositeRaw = `${device_id}::${userAgent}`;
        const hashedDevice = hashDeviceId(compositeRaw);

        // link_token দিয়ে portal_token lookup — master token কখনো client-এ যায় না
        // link_token_expires_at চেক করা হচ্ছে (৫ মিনিট TTL)
        const tokenResult = await query(
            `SELECT cpt.customer_id, cpt.token, cpt.token_version, cpt.bound_email,
                    c.shop_name, c.owner_name, c.customer_code, c.person_id,
                    c.current_credit, c.credit_limit, c.credit_balance, c.email
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.link_token = $1
               AND cpt.link_token_expires_at > NOW()
               AND cpt.expires_at > NOW()
               AND c.is_active = true`,
            [link_token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।' });
        }

        const record = tokenResult.rows[0];

        if (!record.bound_email) {
            // এখনো Google login হয়নি — device login সম্ভব নয়
            return res.status(400).json({
                success: false,
                message: 'এই লিংকে আগে Google login করা হয়নি। প্রথমে Google দিয়ে login করুন।',
                error_code: 'GOOGLE_LOGIN_REQUIRED',
            });
        }

        // Whitelist চেক — এই device আগে Google login করেছে কিনা
        const deviceCheck = await query(
            `SELECT id, google_email FROM customer_portal_devices
             WHERE customer_id = $1
               AND device_hash = $2
               AND is_active = true`,
            [record.customer_id, hashedDevice]
        );

        if (deviceCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'এই ডিভাইসে আগে login করা হয়নি। Google দিয়ে login করুন।',
                error_code: 'DEVICE_NOT_WHITELISTED',
            });
        }

        // last_used_at আপডেট + link_token single-use enforce (NULL করো)
        // record.token হলো DB-র master portal_token — client কখনো দেখেনি
        await Promise.all([
            query(
                'UPDATE customer_portal_devices SET last_used_at = NOW() WHERE customer_id = $1 AND device_hash = $2',
                [record.customer_id, hashedDevice]
            ),
            query(
                `UPDATE customer_portal_tokens
                 SET last_login = NOW(), link_token = NULL, link_token_expires_at = NULL
                 WHERE token = $1`,
                [record.token]
            ),
        ]);

        // ✅ সফল লগইন — pending deletion থাকলে বাতিল (৩০ দিন গ্রেস পিরিয়ড)
        await cancelPendingDeletion(record.person_id);

        if (!process.env.JWT_PORTAL_SECRET) {
            return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
        }

        const jwtPayload_device = {
            customer_id:   record.customer_id,
            person_id:     record.person_id || null,  // ✅ নতুন — getPersonId lookup সহজ করে
            email:         record.bound_email,
            type:          'customer_portal',
            token_version: record.token_version || 1,
        };

        const accessJWT_device = jwt.sign(
            jwtPayload_device,
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '15m', algorithm: 'HS256' }
        );
        const refreshJWT_device = jwt.sign(
            { ...jwtPayload_device, type: 'customer_portal_refresh' },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '30d', algorithm: 'HS256' }
        );
        setRefreshCookie(res, refreshJWT_device);

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল!',
            data: {
                portal_jwt: accessJWT_device,
                expires_in: 900,
                has_company: true,
                customer: {
                    id:             record.customer_id,
                    shop_name:      record.shop_name,
                    owner_name:     record.owner_name,
                    customer_code:  record.customer_code,
                    email:          record.email,
                    current_credit: record.current_credit,
                    credit_limit:   record.credit_limit,
                    credit_balance: record.credit_balance,
                }
            }
        });

    } catch (error) {
        logger.error('❌ Device Login Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 4. GOOGLE OAUTH CALLBACK
// POST /api/portal/google-auth
// body: { google_token, link_token, device_id }
// প্রথমবার: email lock + device whitelist-এ add
// পরের device: same email verify + device whitelist-এ add
// ✅ FIX: portal_token → link_token (one-time, 5-min TTL)
//         DB-তে link_token দিয়ে lookup, ব্যবহারের পর NULL করা হয়
// ============================================================
const googleAuth = async (req, res) => {
    try {
        const { google_token, link_token, device_id } = req.body;

        if (!google_token || !link_token) {
            return res.status(400).json({ success: false, message: 'Google token এবং link token দেওয়া হয়নি।' });
        }

        if (!device_id) {
            return res.status(400).json({ success: false, message: 'Device ID পাওয়া যায়নি।' });
        }

        // ✅ FIX: link_token দিয়ে lookup (master portal_token কখনো client-এ যায় না)
        // link_token_expires_at চেক — ৫ মিনিট TTL enforce
        const tokenResult = await query(
            `SELECT cpt.*, c.id AS cid, c.shop_name, c.owner_name, c.customer_code, c.person_id,
                    c.email, c.whatsapp, c.current_credit, c.credit_limit, c.credit_balance
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.link_token = $1
               AND cpt.link_token_expires_at > NOW()
               AND cpt.expires_at > NOW()
               AND c.is_active = true`,
            [link_token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।' });
        }

        const customerData = tokenResult.rows[0];
        const userAgent    = req.headers['user-agent'] || '';
        const compositeRaw = `${device_id}::${userAgent}`;
        const hashedDevice = hashDeviceId(compositeRaw);

        // ── Google token যাচাই — userinfo + audience (aud) check ──
        let googleUser;
        try {
            const [userinfoRes, tokeninfoRes] = await Promise.all([
                axios.get(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    { headers: { Authorization: `Bearer ${google_token}` } }
                ),
                // POST body দিয়ে — GET query param-এ token পাঠালে Google server log-এ পড়ে
                axios.post(
                    'https://www.googleapis.com/oauth2/v3/tokeninfo',
                    new URLSearchParams({ access_token: google_token }).toString(),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                ),
            ]);

            googleUser = userinfoRes.data;

            // ✅ FIX: audience verify — hard fail, silent bypass নেই
            // GOOGLE_CLIENT_ID ছাড়া যেকোনো app-এর valid Google token accept হয়ে যেত।
            // validateEnv.js-এ এটি এখন REQUIRED — server startup-এই ধরা পড়বে।
            // কিন্তু runtime-এও guard রাখা হয়েছে defence-in-depth হিসেবে।
            const expectedClientId = process.env.GOOGLE_CLIENT_ID;
            if (!expectedClientId) {
                // validateEnv.js পাস করেও যদি কোনোভাবে এখানে আসে —
                // silent bypass-এর চেয়ে server error অনেক ভালো
                logger.error('CRITICAL: GOOGLE_CLIENT_ID নেই — aud check করা সম্ভব নয়।');
                return res.status(500).json({
                    success: false,
                    message: 'Server configuration error। Admin-কে জানান।'
                });
            }
            const aud = tokeninfoRes.data.aud || tokeninfoRes.data.azp || '';
            if (aud !== expectedClientId) {
                logger.warn(`❌ Google token aud mismatch: got "${aud}", expected "${expectedClientId}"`);
                return res.status(401).json({
                    success: false,
                    message: 'Google token অবৈধ — ভিন্ন app-এর token গ্রহণযোগ্য নয়।'
                });
            }
        } catch {
            return res.status(401).json({ success: false, message: 'Google যাচাই ব্যর্থ হয়েছে।' });
        }

        const { email, name, picture } = googleUser;

        // ── Email Lock চেক ────────────────────────────────────
        // একই লিংকে ভিন্ন Gmail দিয়ে login ব্লক
        // (নতুন লিংক পাঠালে bound_email reset হয় → নতুন Gmail সম্ভব)
        if (customerData.bound_email && email.toLowerCase() !== customerData.bound_email.toLowerCase()) {
            return res.status(403).json({
                success: false,
                message: `এই লিংকে অন্য Gmail (${customerData.bound_email}) দিয়ে আগে login করা হয়েছে। একই Gmail ব্যবহার করুন।`,
                error_code: 'EMAIL_LOCKED',
            });
        }

        // ── Device whitelist-এ add / update ──────────────────
        // ON CONFLICT: একই device আগে whitelisted থাকলে last_used_at আপডেট + is_active = true
        // নতুন device হলে নতুন row insert
        const deviceLabel = guessDeviceLabel(userAgent);

        await query(
            `INSERT INTO customer_portal_devices
                (customer_id, device_hash, google_email, device_label)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (customer_id, device_hash) DO UPDATE SET
                last_used_at = NOW(),
                is_active    = true,
                device_label = EXCLUDED.device_label`,
            [customerData.cid, hashedDevice, email.toLowerCase(), deviceLabel]
        );

        // ── প্রথমবার login → email lock + google_email সেট ───
        const isFirstLogin = !customerData.bound_email;

        // ✅ FIX: customerData.token = master portal_token (DB থেকে আনা, client কখনো দেখেনি)
        //         link_token single-use enforce — ব্যবহারের পরেই NULL করা হচ্ছে
        if (isFirstLogin) {
            await query(
                `UPDATE customer_portal_tokens SET
                    bound_email            = $1,
                    last_login             = NOW(),
                    google_email           = $2,
                    link_token             = NULL,
                    link_token_expires_at  = NULL
                 WHERE token = $3`,
                [email.toLowerCase(), email.toLowerCase(), customerData.token]
            );

            // কাস্টমারের email DB-তে সেভ (প্রথমবার — email ফিল্ড খালি থাকলে)
            if (!customerData.email) {
                await query(
                    'UPDATE customers SET email = $1, updated_at = NOW() WHERE id = $2',
                    [email, customerData.cid]
                );
            }
        } else {
            // পুনরায় login — last_login আপডেট + link_token single-use enforce
            await query(
                `UPDATE customer_portal_tokens
                 SET last_login = NOW(), link_token = NULL, link_token_expires_at = NULL
                 WHERE token = $1`,
                [customerData.token]
            );
        }

        if (!process.env.JWT_PORTAL_SECRET) {
            logger.error('❌ JWT_PORTAL_SECRET is not set in environment variables.');
            return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
        }

        const jwtPayload_google = {
            customer_id:    customerData.cid,
            person_id:      customerData.person_id || null,  // ✅ নতুন — getPersonId lookup সহজ করে
            email,
            google_name:    name,
            google_picture: picture,
            type:           'customer_portal',
            token_version:  customerData.token_version || 1,
        };

        const accessJWT_google = jwt.sign(
            jwtPayload_google,
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '15m', algorithm: 'HS256' }
        );
        const refreshJWT_google = jwt.sign(
            { ...jwtPayload_google, type: 'customer_portal_refresh' },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '30d', algorithm: 'HS256' }
        );
        setRefreshCookie(res, refreshJWT_google);

        const deviceCount = await query(
            'SELECT COUNT(*) AS count FROM customer_portal_devices WHERE customer_id = $1 AND is_active = true',
            [customerData.cid]
        );

        return res.status(200).json({
            success: true,
            message: isFirstLogin
                ? 'প্রথমবার লগইন সফল! এই ডিভাইস যোগ করা হয়েছে।'
                : 'লগইন সফল! এই ডিভাইস whitelisted।',
            data: {
                portal_jwt:    accessJWT_google,
                expires_in:    900,
                has_company:   true,
                device_added:  true,
                total_devices: parseInt(deviceCount.rows[0].count),
                customer: {
                    id:             customerData.cid,
                    shop_name:      customerData.shop_name,
                    owner_name:     customerData.owner_name,
                    customer_code:  customerData.customer_code,
                    email,
                    google_name:    name,
                    google_picture: picture,
                    current_credit: customerData.current_credit,
                    credit_limit:   customerData.credit_limit,
                    credit_balance: customerData.credit_balance,
                }
            }
        });

    } catch (error) {
        logger.error('❌ Google Auth Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 5. LIST DEVICES (Admin/SR-এর জন্য)
// GET /api/portal/devices/:customerId
// কাস্টমারের সব whitelisted device দেখাবে
// ============================================================
const listCustomerDevices = async (req, res) => {
    try {
        const { customerId } = req.params;

        const result = await query(
            `SELECT id, device_label, google_email, is_active, added_at, last_used_at
             FROM customer_portal_devices
             WHERE customer_id = $1
             ORDER BY added_at DESC`,
            [customerId]
        );

        return res.status(200).json({
            success: true,
            data: result.rows,
            total: result.rows.length,
        });

    } catch (error) {
        logger.error('❌ List Devices Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 6. REVOKE DEVICE (Admin/SR-এর জন্য)
// DELETE /api/portal/devices/:customerId/:deviceId
// নির্দিষ্ট একটি device revoke — ঐ device থেকে আর JWT issue হবে না
// বিদ্যমান JWT এখনো ৩০ দিন চলবে — token_version বাড়াতে চাইলে
// send-link-এ নতুন লিংক পাঠাও
// ============================================================
const revokeDevice = async (req, res) => {
    try {
        const { customerId, deviceId } = req.params;

        const result = await query(
            `UPDATE customer_portal_devices
             SET is_active = false
             WHERE id = $1 AND customer_id = $2
             RETURNING id, device_label`,
            [deviceId, customerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Device পাওয়া যায়নি।' });
        }

        // Device revoke হলে Redis cache মুছো — পরের request-এ DB থেকে fresh data আসবে
        await invalidatePortalAuthCache(customerId);

        return res.status(200).json({
            success: true,
            message: `"${result.rows[0].device_label}" revoke করা হয়েছে।`,
        });

    } catch (error) {
        logger.error('❌ Revoke Device Error:', error.message);
        return res.status(500).json({ success: false, message: 'Revoke করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 7. REVOKE ALL DEVICES (Admin-এর জন্য)
// DELETE /api/portal/devices/:customerId
// কাস্টমারের সব device বাতিল
// কাস্টমার এরপর Google দিয়ে নতুন করে login করতে বাধ্য হবে
// JWT-ও invalidate করতে চাইলে send-link-এ নতুন লিংক পাঠাও
// ============================================================
const revokeAllDevices = async (req, res) => {
    try {
        const { customerId } = req.params;

        const result = await query(
            `UPDATE customer_portal_devices
             SET is_active = false
             WHERE customer_id = $1 AND is_active = true
             RETURNING id`,
            [customerId]
        );

        // সব device revoke হলে Redis cache মুছো — পরের request-এ DB থেকে fresh data আসবে
        await invalidatePortalAuthCache(customerId);

        return res.status(200).json({
            success: true,
            message: `${result.rows.length}টি device revoke করা হয়েছে।`,
            revoked_count: result.rows.length,
        });

    } catch (error) {
        logger.error('❌ Revoke All Devices Error:', error.message);
        return res.status(500).json({ success: false, message: 'Revoke করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 8. CUSTOMER DASHBOARD DATA
// GET /api/portal/dashboard
// ============================================================
const getCustomerDashboard = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;

        const customerResult = await query(
            `SELECT c.shop_name, c.owner_name, c.customer_code, c.email,
                    c.credit_limit, c.current_credit, c.credit_balance,
                    c.business_type, c.whatsapp,
                    c.is_verified, c.registration_source,
                    r.name AS route_name,
                    u.name_bn  AS assigned_sr_name,
                    u.phone    AS assigned_sr_phone,
                    u.employee_code AS assigned_sr_code
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             LEFT JOIN customer_assignments ca
               ON ca.customer_id = c.id AND ca.is_active = true
             LEFT JOIN users u ON u.id = ca.worker_id
             WHERE c.id = $1
             LIMIT 1`,
            [customer_id]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'তথ্য পাওয়া যায়নি।' });
        }

        const [mainResult, paymentsResult] = await Promise.all([
            query(
                `WITH
                 recent_sales AS (
                     SELECT st.invoice_number, st.items, st.total_amount,
                            st.discount_amount, st.net_amount,
                            st.payment_method, st.cash_received, st.credit_used,
                            st.replacement_items, st.replacement_value,
                            st.credit_balance_used, st.credit_balance_added,
                            st.created_at,
                            u.name_bn AS sr_name,
                            'sale' AS row_type
                     FROM sales_transactions st
                     JOIN users u ON st.worker_id = u.id
                     WHERE st.customer_id = $1
                       AND (st.otp_verified = true OR st.otp_skipped = true)
                     ORDER BY st.created_at DESC
                     LIMIT 30
                 ),
                 monthly AS (
                     SELECT
                         COUNT(*)                               AS total_invoices,
                         COALESCE(SUM(net_amount), 0)           AS total_purchase,
                         COALESCE(SUM(cash_received), 0)        AS total_cash,
                         COALESCE(SUM(credit_used), 0)          AS total_credit,
                         COALESCE(SUM(replacement_value), 0)    AS total_replacement,
                         COALESCE(SUM(credit_balance_added), 0) AS total_credit_earned
                     FROM sales_transactions
                     WHERE customer_id = $1
                       AND (otp_verified = true OR otp_skipped = true)
                       AND date_trunc('month', created_at) = date_trunc('month', NOW())
                 ),
                 overall AS (
                     SELECT
                         COUNT(*)                               AS total_invoices,
                         COALESCE(SUM(net_amount), 0)           AS total_purchase,
                         COALESCE(SUM(cash_received), 0)        AS total_cash,
                         COALESCE(SUM(credit_used), 0)          AS total_credit,
                         COALESCE(SUM(replacement_value), 0)    AS total_replacement,
                         COALESCE(SUM(credit_balance_added), 0) AS total_credit_earned
                     FROM sales_transactions
                     WHERE customer_id = $1
                       AND (otp_verified = true OR otp_skipped = true)
                 ),
                 returns AS (
                     SELECT st.invoice_number,
                            st.replacement_items,
                            st.replacement_value,
                            st.credit_balance_added,
                            st.created_at,
                            u.name_bn AS sr_name
                     FROM sales_transactions st
                     JOIN users u ON st.worker_id = u.id
                     WHERE st.customer_id = $1
                       AND (st.otp_verified = true OR st.otp_skipped = true)
                       AND st.replacement_value > 0
                     ORDER BY st.created_at DESC
                     LIMIT 20
                 )
                 SELECT
                     (SELECT json_agg(recent_sales.*) FROM recent_sales) AS sales,
                     (SELECT row_to_json(monthly.*)   FROM monthly)      AS monthly_summary,
                     (SELECT row_to_json(overall.*)   FROM overall)      AS total_summary,
                     (SELECT json_agg(returns.*)      FROM returns)      AS returns`,
                [customer_id]
            ),
            query(
                `SELECT cp.amount, cp.notes, cp.created_at,
                        u.name_bn AS collected_by
                 FROM credit_payments cp
                 JOIN users u ON cp.worker_id = u.id
                 WHERE cp.customer_id = $1
                 ORDER BY cp.created_at DESC
                 LIMIT 20`,
                [customer_id]
            ),
        ]);

        const { sales, monthly_summary, total_summary, returns } = mainResult.rows[0];
        const totalInvoices = parseInt(total_summary?.total_invoices || 0);
        const salesPreview  = sales   || [];
        const returnsData   = returns || [];

        return res.status(200).json({
            success: true,
            data: {
                customer:        customerResult.rows[0],
                sales:           salesPreview,
                sales_note: salesPreview.length === 30 && totalInvoices > 30
                    ? `সর্বশেষ ৩০টি দেখানো হচ্ছে। মোট ${totalInvoices}টি ইনভয়েস আছে।`
                    : null,
                returns:         returnsData,
                credit_payments: paymentsResult.rows,
                monthly_summary: monthly_summary || {},
                total_summary:   total_summary   || {},
            }
        });

    } catch (error) {
        logger.error('❌ Customer Dashboard Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 9. INVOICE LIST (paginated, filtered)
// GET /api/portal/invoices
// ============================================================
const getCustomerInvoices = async (req, res) => {
    try {
        const customer_id    = req.portalUser.customer_id;
        const page           = Math.max(1, parseInt(req.query.page)  || 1);
        const limit          = Math.min(50, parseInt(req.query.limit) || 15);
        const offset         = (page - 1) * limit;
        const search         = (req.query.search || '').trim();
        const payment_method = (req.query.payment_method || '').trim().toLowerCase();
        const date_from      = req.query.date_from || null;
        const date_to        = req.query.date_to   || null;

        const params  = [customer_id];
        const filters = [
            'st.customer_id = $1',
            '(st.otp_verified = true OR st.otp_skipped = true)',
        ];

        if (search) {
            params.push(`%${search}%`);
            filters.push(`(st.invoice_number ILIKE $${params.length} OR u.name_bn ILIKE $${params.length})`);
        }

        if (['cash', 'credit', 'mixed'].includes(payment_method)) {
            // whitelist validation যথেষ্ট হলেও parameterized রাখা best practice —
            // whitelist bypass হলে (e.g. prototype pollution) শেষ রক্ষা থাকে।
            params.push(payment_method);
            filters.push(`st.payment_method = $${params.length}`);
        }

        if (date_from) {
            params.push(date_from);
            filters.push(`st.created_at >= $${params.length}::date`);
        }
        if (date_to) {
            params.push(date_to);
            filters.push(`st.created_at < ($${params.length}::date + INTERVAL '1 day')`);
        }

        const whereClause = filters.join(' AND ');
        params.push(limit, offset);
        const limitIdx  = params.length - 1;  // $N   → limit
        const offsetIdx = params.length;       // $N+1 → offset

        const result = await query(
            `SELECT st.invoice_number, st.items, st.total_amount,
                    st.discount_amount, st.net_amount,
                    st.payment_method, st.cash_received, st.credit_used,
                    st.replacement_value, st.credit_balance_used,
                    st.created_at,
                    u.name_bn AS sr_name,
                    COUNT(*) OVER() AS total_count
             FROM sales_transactions st
             JOIN users u ON st.worker_id = u.id
             WHERE ${whereClause}
             ORDER BY st.created_at DESC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
        );

        const total      = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
        const totalPages = Math.ceil(total / limit);
        const rows       = result.rows.map(({ total_count, ...rest }) => rest);

        return res.status(200).json({
            success: true,
            data:    rows,
            filters: { search: search || null, payment_method: payment_method || null, date_from, date_to },
            pagination: { page, limit, total, totalPages }
        });

    } catch (error) {
        logger.error('❌ Invoice List Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 10. PAYMENT HISTORY (নগদ + credit UNION)
// GET /api/portal/payment-history
// ============================================================
const getPaymentHistory = async (req, res) => {
    try {
        const customer_id = req.portalUser.customer_id;
        const page        = Math.max(1, parseInt(req.query.page)  || 1);
        const limit       = Math.min(50, parseInt(req.query.limit) || 20);
        const offset      = (page - 1) * limit;
        const typeFilter  = (req.query.type || '').trim().toLowerCase();
        const date_from   = req.query.date_from || null;
        const date_to     = req.query.date_to   || null;

        const params = [customer_id];
        let dateClause = '';

        if (date_from) {
            params.push(date_from);
            dateClause += ` AND created_at >= $${params.length}::date`;
        }
        if (date_to) {
            params.push(date_to);
            dateClause += ` AND created_at < ($${params.length}::date + INTERVAL '1 day')`;
        }

        const cashBranch = `
            SELECT
                st.cash_received  AS amount,
                'cash'            AS payment_type,
                st.invoice_number AS reference,
                u.name_bn         AS collected_by,
                st.created_at
            FROM sales_transactions st
            JOIN users u ON st.worker_id = u.id
            WHERE st.customer_id = $1
              AND (st.otp_verified = true OR st.otp_skipped = true)
              AND st.cash_received > 0
              ${dateClause}`;

        const creditBranch = `
            SELECT
                cp.amount   AS amount,
                'credit'    AS payment_type,
                cp.notes    AS reference,
                u.name_bn   AS collected_by,
                cp.created_at
            FROM credit_payments cp
            JOIN users u ON cp.worker_id = u.id
            WHERE cp.customer_id = $1
              ${dateClause}`;

        let unionSQL;
        if (typeFilter === 'cash')         unionSQL = cashBranch;
        else if (typeFilter === 'credit')  unionSQL = creditBranch;
        else                               unionSQL = `${cashBranch} UNION ALL ${creditBranch}`;

        params.push(limit, offset);
        const limitIdx  = params.length - 1;
        const offsetIdx = params.length;

        const result = await query(
            `SELECT *, COUNT(*) OVER() AS total_count
             FROM (${unionSQL}) AS combined
             ORDER BY created_at DESC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
        );

        const total      = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
        const totalPages = Math.ceil(total / limit);
        const rows       = result.rows.map(({ total_count, ...rest }) => rest);

        const summaryResult = await query(
            `SELECT
                 COALESCE(SUM(CASE WHEN payment_type = 'cash'   THEN amount ELSE 0 END), 0) AS total_cash_received,
                 COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN amount ELSE 0 END), 0) AS total_credit_collected,
                 COUNT(*) AS total_transactions
             FROM (
                 SELECT cash_received AS amount, 'cash' AS payment_type
                 FROM sales_transactions
                 WHERE customer_id = $1
                   AND (otp_verified = true OR otp_skipped = true)
                   AND cash_received > 0
                 UNION ALL
                 SELECT amount, 'credit' AS payment_type
                 FROM credit_payments
                 WHERE customer_id = $1
             ) AS all_payments`,
            [customer_id]
        );

        return res.status(200).json({
            success: true,
            data:    rows,
            summary: summaryResult.rows[0],
            filters: { type: typeFilter || null, date_from, date_to },
            pagination: { page, limit, total, totalPages }
        });

    } catch (error) {
        logger.error('❌ Payment History Error:', error.message);
        return res.status(500).json({ success: false, message: 'পেমেন্ট ইতিহাস আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 11. MONTHLY SUMMARY
// GET /api/portal/monthly-summary
// ============================================================
const getMonthlySummary = async (req, res) => {
    try {
        const customer_id   = req.portalUser.customer_id;
        const monthsBack    = Math.min(24, Math.max(1, parseInt(req.query.months) || 6));
        const specificYear  = req.query.year  ? parseInt(req.query.year)  : null;
        const specificMonth = req.query.month ? parseInt(req.query.month) : null;

        let whereExtra = '';
        const params   = [customer_id];

        if (specificYear && specificMonth) {
            params.push(specificYear, specificMonth);
            whereExtra = `AND EXTRACT(YEAR  FROM created_at) = $${params.length - 1}
                          AND EXTRACT(MONTH FROM created_at) = $${params.length}`;
        } else {
            params.push(monthsBack - 1);
            whereExtra = `AND date_trunc('month', created_at) >=
                              date_trunc('month', NOW()) - ($${params.length} * INTERVAL '1 month')`;
        }

        const result = await query(
            `SELECT
                 date_trunc('month', created_at)               AS month_start,
                 TO_CHAR(created_at, 'YYYY-MM')                AS month_label,
                 COUNT(*)                                       AS total_invoices,
                 COALESCE(SUM(net_amount), 0)                   AS total_purchase,
                 COALESCE(SUM(cash_received), 0)                AS total_cash,
                 COALESCE(SUM(credit_used), 0)                  AS total_credit,
                 COALESCE(SUM(discount_amount), 0)              AS total_discount,
                 COALESCE(SUM(replacement_value), 0)            AS total_replacement,
                 COALESCE(SUM(credit_balance_added), 0)         AS total_credit_earned,
                 COALESCE(SUM(credit_balance_used), 0)          AS total_credit_balance_used
             FROM sales_transactions
             WHERE customer_id = $1
               AND (otp_verified = true OR otp_skipped = true)
               ${whereExtra}
             GROUP BY date_trunc('month', created_at), TO_CHAR(created_at, 'YYYY-MM')
             ORDER BY month_start DESC`,
            params
        );

        const creditPaymentsResult = await query(
            `SELECT
                 TO_CHAR(created_at, 'YYYY-MM')  AS month_label,
                 COALESCE(SUM(amount), 0)         AS total_credit_collected
             FROM credit_payments
             WHERE customer_id = $1
             GROUP BY TO_CHAR(created_at, 'YYYY-MM')`,
            [customer_id]
        );

        const creditMap = {};
        for (const row of creditPaymentsResult.rows) {
            creditMap[row.month_label] = parseFloat(row.total_credit_collected);
        }

        const merged = result.rows.map(row => ({
            ...row,
            total_credit_collected: creditMap[row.month_label] || 0,
        }));

        return res.status(200).json({
            success: true,
            data:    merged,
            meta: {
                months_shown: merged.length,
                query_type: specificYear && specificMonth ? 'specific_month' : 'last_n_months',
            }
        });

    } catch (error) {
        logger.error('❌ Monthly Summary Error:', error.message);
        return res.status(500).json({ success: false, message: 'মাসিক সারসংক্ষেপ আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 12. CREDIT OVERVIEW
// GET /api/portal/credit-overview
// ============================================================
const getCreditOverview = async (req, res) => {
    try {
        const customer_id = req.portalUser.customer_id;

        const [customerResult, paymentsResult] = await Promise.all([
            query(
                `SELECT
                     credit_limit,
                     current_credit,
                     credit_balance,
                     GREATEST(0, credit_limit - current_credit) AS available_credit,
                     CASE
                         WHEN credit_limit > 0
                         THEN ROUND((current_credit::numeric / credit_limit) * 100, 1)
                         ELSE 0
                     END AS utilization_pct
                 FROM customers
                 WHERE id = $1`,
                [customer_id]
            ),
            query(
                `SELECT cp.amount, cp.notes, cp.created_at,
                        u.name_bn AS collected_by
                 FROM credit_payments cp
                 JOIN users u ON cp.worker_id = u.id
                 WHERE cp.customer_id = $1
                 ORDER BY cp.created_at DESC
                 LIMIT 5`,
                [customer_id]
            ),
        ]);

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'তথ্য পাওয়া যায়নি।' });
        }

        const creditInfo = customerResult.rows[0];
        const pct        = parseFloat(creditInfo.utilization_pct);
        let status;
        if (pct >= 100)     status = 'exceeded';
        else if (pct >= 80) status = 'critical';
        else if (pct >= 50) status = 'warning';
        else                status = 'healthy';

        return res.status(200).json({
            success: true,
            data: {
                ...creditInfo,
                status,
                recent_payments: paymentsResult.rows,
            }
        });

    } catch (error) {
        logger.error('❌ Credit Overview Error:', error.message);
        return res.status(500).json({ success: false, message: 'ক্রেডিট তথ্য আনতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// CREDIT LIMIT INCREASE REQUEST
// POST /api/portal/credit-limit-request
// GET  /api/portal/credit-limit-request (নিজের আবেদন দেখো)
// ============================================================
const MAX_CREDIT_REQUEST = 10_000_000; // সর্বোচ্চ ১ কোটি টাকা
const MIN_CREDIT_REQUEST =      1_000; // ন্যূনতম ১ হাজার টাকা

const submitCreditLimitRequest = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { requested_amount, reason } = req.body;

        const amount = parseFloat(requested_amount);
        if (!requested_amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ দিন।' });
        }
        if (amount < MIN_CREDIT_REQUEST) {
            return res.status(400).json({ success: false, message: 'ন্যূনতম ১,০০০ টাকার আবেদন করুন।' });
        }
        if (amount > MAX_CREDIT_REQUEST) {
            return res.status(400).json({ success: false, message: 'অনুরোধকৃত পরিমাণ সর্বোচ্চ ১,০০,০০,০০০ টাকার বেশি হবে না।' });
        }
        if (reason && reason.trim().length > 500) {
            return res.status(400).json({ success: false, message: 'কারণ ৫০০ অক্ষরের বেশি হবে না।' });
        }

        // কাস্টমার তথ্য আনো
        const custResult = await query(
            `SELECT shop_name, customer_code, credit_limit FROM customers WHERE id = $1`,
            [customer_id]
        );
        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }
        const cust = custResult.rows[0];

        // ইতোমধ্যে pending আবেদন আছে কিনা
        const existingResult = await query(
            `SELECT id FROM credit_limit_requests
             WHERE customer_id = $1 AND status = 'pending'
             LIMIT 1`,
            [customer_id]
        );
        if (existingResult.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'আপনার একটি আবেদন ইতোমধ্যে প্রক্রিয়াধীন আছে। অনুমোদনের অপেক্ষা করুন।'
            });
        }

        const result = await query(
            `INSERT INTO credit_limit_requests
                 (customer_id, current_limit, requested_amount, reason, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING id, created_at`,
            [customer_id, cust.credit_limit, amount, reason?.trim() || null]
        );

        // Manager/Admin notification
        const { sendCustomerNotification } = require('./customerNotification.controller');
        // Admin-level DB notification (internal log)
        await query(
            `INSERT INTO customer_notifications (customer_id, title, body, type)
             VALUES ($1, $2, $3, 'credit_request')`,
            [
                customer_id,
                '📋 ক্রেডিট লিমিট আবেদন জমা হয়েছে',
                `আপনার ৳${amount.toLocaleString()} ক্রেডিট লিমিট বৃদ্ধির আবেদন জমা হয়েছে। Manager অনুমোদন দিলে আপনাকে জানানো হবে।`
            ]
        );

        return res.status(201).json({
            success: true,
            message: 'আবেদন সফলভাবে জমা হয়েছে।',
            data: { id: result.rows[0].id, created_at: result.rows[0].created_at }
        });

    } catch (error) {
        logger.error('❌ Credit Limit Request Error:', error.message);
        return res.status(500).json({ success: false, message: 'আবেদন জমা দিতে সমস্যা হয়েছে।' });
    }
};

const getMyLimitRequests = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const result = await query(
            `SELECT id, current_limit, requested_amount, reason,
                    status, admin_note, created_at, resolved_at
             FROM credit_limit_requests
             WHERE customer_id = $1
             ORDER BY created_at DESC
             LIMIT 10`,
            [customer_id]
        );
        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Limit Requests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// COMPLAINT / FEEDBACK SYSTEM
// POST /api/portal/complaint         — নতুন অভিযোগ/ফিডব্যাক
// GET  /api/portal/complaint         — নিজের অভিযোগগুলো দেখো
// ============================================================
const VALID_COMPLAINT_TYPES = [
    'complaint', 'feedback', 'delivery_issue',
    'product_issue', 'payment_issue', 'other'
];

const submitComplaint = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { type, subject, description } = req.body;
        // type: 'complaint' | 'feedback' | 'delivery_issue' | 'product_issue' | 'payment_issue' | 'other'

        if (!subject?.trim() || !description?.trim()) {
            return res.status(400).json({ success: false, message: 'বিষয় ও বিস্তারিত বিবরণ দিন।' });
        }
        if (subject.trim().length > 200) {
            return res.status(400).json({ success: false, message: 'বিষয় ২০০ অক্ষরের বেশি হবে না।' });
        }
        if (description.trim().length > 2000) {
            return res.status(400).json({ success: false, message: 'বিবরণ ২০০০ অক্ষরের বেশি হবে না।' });
        }
        if (type && !VALID_COMPLAINT_TYPES.includes(type)) {
            return res.status(400).json({ success: false, message: 'অবৈধ অভিযোগের ধরন।' });
        }

        const result = await query(
            `INSERT INTO customer_complaints
                 (customer_id, type, subject, description, status)
             VALUES ($1, $2, $3, $4, 'open')
             RETURNING id, created_at`,
            [customer_id, type || 'complaint', subject.trim(), description.trim()]
        );

        // কাস্টমারকে confirmation notification পাঠাও
        await query(
            `INSERT INTO customer_notifications (customer_id, title, body, type)
             VALUES ($1, $2, $3, 'complaint')`,
            [
                customer_id,
                '✅ আপনার অভিযোগ গ্রহণ হয়েছে',
                `"${subject.trim()}" — আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।`
            ]
        );

        return res.status(201).json({
            success: true,
            message: 'অভিযোগ/ফিডব্যাক সফলভাবে জমা হয়েছে।',
            data: { id: result.rows[0].id, created_at: result.rows[0].created_at }
        });

    } catch (error) {
        logger.error('❌ Submit Complaint Error:', error.message);
        return res.status(500).json({ success: false, message: 'অভিযোগ জমা দিতে সমস্যা হয়েছে।' });
    }
};

const getMyComplaints = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const result = await query(
            `SELECT id, type, subject, description, status,
                    admin_reply, created_at, resolved_at
             FROM customer_complaints
             WHERE customer_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [customer_id]
        );
        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('❌ Get Complaints Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// STATEMENT PDF DOWNLOAD
// GET /api/portal/statement?from=2025-01-01&to=2025-12-31
// কাস্টমারের পুরো হিসাবের PDF statement
// ============================================================
const getCustomerStatement = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;

        // ইনপুট ভ্যালিডেশন: শুধু YYYY-MM-DD ফরম্যাট গ্রহণযোগ্য
        const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
        const rawFrom = req.query.from || null;
        const rawTo   = req.query.to   || null;
        if (rawFrom && !DATE_RE.test(rawFrom)) {
            return res.status(400).json({ success: false, message: 'অবৈধ তারিখ ফরম্যাট (from)।' });
        }
        if (rawTo && !DATE_RE.test(rawTo)) {
            return res.status(400).json({ success: false, message: 'অবৈধ তারিখ ফরম্যাট (to)।' });
        }
        const date_from = rawFrom;
        const date_to   = rawTo;

        // Customer তথ্য
        const custResult = await query(
            `SELECT shop_name, owner_name, customer_code, whatsapp, email,
                    credit_limit, current_credit, credit_balance
             FROM customers WHERE id = $1`,
            [customer_id]
        );
        if (custResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'তথ্য পাওয়া যায়নি।' });
        }
        const cust = custResult.rows[0];

        // Date filter তৈরি
        const params  = [customer_id];
        let dateClause = '';
        if (date_from) { params.push(date_from); dateClause += ` AND st.created_at >= $${params.length}::date`; }
        if (date_to)   { params.push(date_to);   dateClause += ` AND st.created_at < ($${params.length}::date + INTERVAL '1 day')`; }

        // Sales + Credit payments একসাথে
        const [salesRes, paymentsRes] = await Promise.all([
            query(
                `SELECT st.invoice_number, st.items, st.total_amount,
                        st.net_amount, st.payment_method,
                        st.cash_received, st.credit_used,
                        st.discount_amount, st.replacement_value,
                        st.created_at, u.name_bn AS sr_name
                 FROM sales_transactions st
                 JOIN users u ON st.worker_id = u.id
                 WHERE st.customer_id = $1
                   AND (st.otp_verified = true OR st.otp_skipped = true)
                   ${dateClause}
                 ORDER BY st.created_at ASC`,
                params
            ),
            (() => {
                const cpParams = [customer_id];
                let   cpClause = '';
                if (date_from) { cpParams.push(date_from); cpClause += ` AND cp.created_at >= $${cpParams.length}::date`; }
                if (date_to)   { cpParams.push(date_to);   cpClause += ` AND cp.created_at < ($${cpParams.length}::date + INTERVAL '1 day')`; }
                return query(
                    `SELECT cp.amount, cp.notes, cp.created_at, u.name_bn AS collected_by
                     FROM credit_payments cp
                     JOIN users u ON cp.worker_id = u.id
                     WHERE cp.customer_id = $1
                       ${cpClause}
                     ORDER BY cp.created_at ASC`,
                    cpParams
                );
            })(),
        ]);

        const sales    = salesRes.rows;
        const payments = paymentsRes.rows;

        // Summary হিসাব
        const totalPurchase       = sales.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
        const totalCash           = sales.reduce((s, r) => s + parseFloat(r.cash_received || 0), 0);
        const totalCredit         = sales.reduce((s, r) => s + parseFloat(r.credit_used || 0), 0);
        const totalCreditPaid     = payments.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

        // PDFKit দিয়ে তৈরি
        const doc    = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks = [];

        doc.on('data', c => chunks.push(c));
        doc.on('end', () => {
            const buffer = Buffer.concat(chunks);

            // filename sanitization:
            // ১. date_from / date_to ইতিমধ্যে YYYY-MM-DD regex দিয়ে validated (উপরে)
            // ২. customer_code DB থেকে আসে, তবুও alphanumeric-only রাখা নিরাপদ
            // ৩. label ও customer_code উভয়কে [^a-zA-Z0-9_-] দিয়ে strip করা হচ্ছে
            //    যাতে path traversal (../), newline, বা header injection সম্ভব না হয়
            const safeCode  = String(cust.customer_code).replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeLabel = (date_from && date_to)
                ? `${date_from}_to_${date_to}`   // regex-validated উপরে, নিরাপদ
                : 'full';

            // RFC 6266 — non-ASCII বা special char থাকলে filename* (UTF-8) ব্যবহার করা উচিত,
            // কিন্তু এখানে সব ASCII-safe, তাই সাধারণ filename যথেষ্ট।
            const filename  = `statement_${safeCode}_${safeLabel}.pdf`;

            res.set({
                'Content-Type':        'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length':      buffer.length,
            });
            res.send(buffer);
        });

        const fmt = (n) => parseFloat(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

        // ── Header ──────────────────────────────────────────
        doc.fontSize(18).font('Helvetica-Bold').text('ZovoriX (Ltd.)', { align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor('#555')
           .text('Janaki Singha Road, Barisal — 1200 | inf.novatechbd@gmail.com', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(13).font('Helvetica-Bold').fillColor('#1e40af')
           .text('ACCOUNT STATEMENT', { align: 'center' });

        if (date_from || date_to) {
            doc.fontSize(9).font('Helvetica').fillColor('#555')
               .text(`Period: ${date_from || 'Start'} to ${date_to || 'Today'}`, { align: 'center' });
        }
        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1.5).strokeColor('#1e40af').stroke();
        doc.moveDown(0.5);

        // ── Customer Info ────────────────────────────────────
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Customer Information');
        doc.moveDown(0.3);
        const infoY = doc.y;
        doc.fontSize(9).font('Helvetica').fillColor('#333')
           .text(`Shop: ${cust.shop_name}`, 40, infoY)
           .text(`Owner: ${cust.owner_name}`, 40, infoY + 15)
           .text(`Code: ${cust.customer_code}`, 40, infoY + 30)
           .text(`WhatsApp: ${cust.whatsapp || '—'}`, 300, infoY)
           .text(`Credit Limit: ৳${fmt(cust.credit_limit)}`, 300, infoY + 15)
           .text(`Current Due: ৳${fmt(cust.current_credit)}`, 300, infoY + 30);
        doc.y = infoY + 50;
        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#ccc').stroke();
        doc.moveDown(0.5);

        // ── Summary Box ──────────────────────────────────────
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Summary');
        doc.moveDown(0.3);
        const sumY = doc.y;
        doc.rect(40, sumY, 515, 72).fillColor('#f0f4ff').fill();
        doc.fillColor('#1e3a8a');
        doc.fontSize(9).font('Helvetica-Bold')
           .text(`Total Invoices: ${sales.length}`,       50, sumY + 8)
           .text(`Total Purchase: ৳${fmt(totalPurchase)}`, 50, sumY + 24)
           .text(`Cash Paid: ৳${fmt(totalCash)}`,         50, sumY + 40)
           .text(`Credit Remaining: ৳${fmt(totalCredit - totalCreditPaid)}`, 50, sumY + 56)
           .text(`Credit Collected: ৳${fmt(totalCreditPaid)}`, 300, sumY + 8)
           .text(`Balance: ৳${fmt(cust.credit_balance)}`,  300, sumY + 24)
           .text(`Generated: ${new Date().toLocaleDateString('en-BD')}`, 300, sumY + 56);
        doc.y = sumY + 80;
        doc.moveDown(0.5);

        // ── Transactions Table ───────────────────────────────
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Transaction History');
        doc.moveDown(0.3);

        // Table Header
        const col = { date: 40, invoice: 110, sr: 230, method: 330, amount: 420, cash: 480 };
        const rowH = 18;
        let y = doc.y;

        doc.rect(40, y, 515, rowH).fillColor('#1e40af').fill();
        doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
           .text('তারিখ',     col.date,    y + 5)
           .text('Invoice',   col.invoice,  y + 5)
           .text('SR',        col.sr,       y + 5)
           .text('Method',    col.method,   y + 5)
           .text('Amount ৳',  col.amount,   y + 5)
           .text('Cash ৳',    col.cash,     y + 5);
        y += rowH;

        let rowIdx = 0;
        for (const sale of sales) {
            if (y > 720) { doc.addPage(); y = 40; }
            const bg = rowIdx % 2 === 0 ? '#f9f9ff' : '#fff';
            doc.rect(40, y, 515, rowH).fillColor(bg).fill();
            doc.fillColor('#333').fontSize(7.5).font('Helvetica')
               .text(fmtDate(sale.created_at),   col.date,    y + 5, { width: 68 })
               .text(sale.invoice_number || '—', col.invoice,  y + 5, { width: 115 })
               .text(sale.sr_name || '—',        col.sr,       y + 5, { width: 95 })
               .text(sale.payment_method || '—', col.method,   y + 5, { width: 85 })
               .text(fmt(sale.net_amount),        col.amount,   y + 5, { width: 55, align: 'right' })
               .text(fmt(sale.cash_received),     col.cash,     y + 5, { width: 55, align: 'right' });
            y += rowH;
            rowIdx++;
        }

        // Credit Payments section
        if (payments.length > 0) {
            if (y > 680) { doc.addPage(); y = 40; }
            y += 15;
            doc.y = y;
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Credit Collections');
            y = doc.y + 5;

            doc.rect(40, y, 515, rowH).fillColor('#166534').fill();
            doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
               .text('তারিখ',           col.date,    y + 5)
               .text('Collected By',    col.invoice,  y + 5)
               .text('নোট',             col.sr,       y + 5)
               .text('Amount ৳',        col.amount,   y + 5, { width: 115, align: 'right' });
            y += rowH;

            rowIdx = 0;
            for (const p of payments) {
                if (y > 720) { doc.addPage(); y = 40; }
                const bg = rowIdx % 2 === 0 ? '#f0fdf4' : '#fff';
                doc.rect(40, y, 515, rowH).fillColor(bg).fill();
                doc.fillColor('#333').fontSize(7.5).font('Helvetica')
                   .text(fmtDate(p.created_at),   col.date,    y + 5, { width: 68 })
                   .text(p.collected_by || '—',   col.invoice,  y + 5, { width: 115 })
                   .text(p.notes || '—',           col.sr,       y + 5, { width: 200 })
                   .text(fmt(p.amount),             col.amount,   y + 5, { width: 115, align: 'right' });
                y += rowH;
                rowIdx++;
            }
        }

        // Footer
        doc.y = y + 20;
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#ccc').stroke();
        doc.moveDown(0.3);
        doc.fontSize(8).font('Helvetica').fillColor('#999')
           .text('This is a system-generated statement. For queries, contact your SR.', { align: 'center' })
           .text('ZovoriX (Ltd.) — Barisal, Bangladesh', { align: 'center' });

        doc.end();

    } catch (error) {
        logger.error('❌ Statement PDF Error:', error.message);
        return res.status(500).json({ success: false, message: 'Statement তৈরি করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// NEW: DIRECT GOOGLE AUTH (Permanent Link System)
// POST /api/portal/direct-auth
// body: { google_token, customer_code, device_id }
//
// নতুন system: ?c=customer_code permanent link
// - link_token / redirect_id লাগে না
// - প্রথমবার Google login → 30-day JWT
// - পরের বার localStorage-এর JWT দিয়ে auto-login
// - 30 দিন পরে শুধু Google দিয়ে আবার login
// ============================================================
const directGoogleAuth = async (req, res) => {
    try {
        // ✅ HYBRID (৩ পথ):
        //   customer_code → বিদ্যমান customer-এর প্রথমবার Gmail bind
        //   person_id     → নতুন self-register person-এর প্রথমবার Gmail bind
        //                   (কোনো কোম্পানি এখনো নেই)
        //   কোনোটাই না    → ফিরতি লগইন, Gmail দিয়ে customers অথবা persons-এ খোঁজা
        const { google_token, device_id, customer_code, person_id } = req.body;

        if (!google_token || !device_id) {
            return res.status(400).json({ success: false, message: 'google_token এবং device_id পাঠান।' });
        }

        // ── ১. আগে Google token যাচাই করো ───────────────────
        let googleUser;
        try {
            const [userinfoRes, tokeninfoRes] = await Promise.all([
                axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${google_token}` }
                }),
                axios.post(
                    'https://www.googleapis.com/oauth2/v3/tokeninfo',
                    new URLSearchParams({ access_token: google_token }).toString(),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                ),
            ]);

            googleUser = userinfoRes.data;

            const expectedClientId = process.env.GOOGLE_CLIENT_ID;
            if (!expectedClientId) {
                return res.status(500).json({ success: false, message: 'Server configuration error।' });
            }
            const aud = tokeninfoRes.data.aud || tokeninfoRes.data.azp || '';
            if (aud !== expectedClientId) {
                return res.status(401).json({ success: false, message: 'Google token অবৈধ।' });
            }
        } catch {
            return res.status(401).json({ success: false, message: 'Google যাচাই ব্যর্থ হয়েছে।' });
        }

        const { email, name, picture } = googleUser;
        let customer   = null; // বিদ্যমান tenant-bound customer (কোনো কোম্পানির সাথে connected)
        let personOnly = null; // company-বিহীন person (এখনো কোনো connection নেই)

        if (customer_code) {
            // ── ২A. প্রথমবার: customer_code দিয়ে customer খোঁজো ──
            const result = await query(
                `SELECT id, shop_name, owner_name, customer_code, email, whatsapp,
                        current_credit, credit_limit, credit_balance, person_id
                 FROM customers
                 WHERE customer_code = $1 AND is_active = true`,
                [customer_code]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
            }

            customer = result.rows[0];

            // Email lock চেক — আগে অন্য Gmail দিয়ে login থাকলে block
            if (customer.email && customer.email.toLowerCase() !== email.toLowerCase()) {
                return res.status(403).json({
                    success: false,
                    message: `এই পোর্টালে অন্য Gmail (${customer.email}) দিয়ে আগে login করা আছে।`,
                    error_code: 'EMAIL_LOCKED',
                });
            }

            // ✅ প্রথমবার হলে Gmail auto-save করো
            if (!customer.email) {
                await query(
                    'UPDATE customers SET email = $1, updated_at = NOW() WHERE id = $2',
                    [email.toLowerCase(), customer.id]
                );
                customer.email = email.toLowerCase();
            }
        } else if (person_id) {
            // ── ২B. প্রথমবার (নতুন মডেল): person_id দিয়ে person খোঁজো ──
            // এই person-এর এখনো কোনো কোম্পানির customer row নেই।
            const result = await query(
                `SELECT id, full_name, shop_name, email, whatsapp FROM persons WHERE id = $1`,
                [person_id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'প্রোফাইল পাওয়া যায়নি।' });
            }

            const person = result.rows[0];

            if (person.email && person.email.toLowerCase() !== email.toLowerCase()) {
                return res.status(403).json({
                    success: false,
                    message: `এই প্রোফাইলে অন্য Gmail (${person.email}) দিয়ে আগে login করা আছে।`,
                    error_code: 'EMAIL_LOCKED',
                });
            }

            if (!person.email) {
                await query(
                    'UPDATE persons SET email = $1, updated_at = NOW() WHERE id = $2',
                    [email.toLowerCase(), person.id]
                );
                person.email = email.toLowerCase();
            }

            personOnly = person;
        } else {
            // ── ২C. পরের বার: Gmail দিয়ে customer খোঁজো, না পেলে person ──
            const result = await query(
                `SELECT c.id, c.shop_name, c.owner_name, c.customer_code, c.email, c.whatsapp,
                        c.current_credit, c.credit_limit, c.credit_balance, c.person_id
                 FROM customers c
                 LEFT JOIN customer_portal_tokens cpt ON cpt.customer_id = c.id
                 WHERE (LOWER(c.email) = LOWER($1) OR LOWER(cpt.bound_email) = LOWER($1))
                   AND c.is_active = true
                 LIMIT 1`,
                [email]
            );

            if (result.rows.length > 0) {
                customer = result.rows[0];
            } else {
                // ✅ FIX: কোনো customer না পেলে persons-এও খুঁজো, যাতে
                // company-বিহীন person-রাও দ্বিতীয়বার Gmail দিয়ে ফিরে আসতে পারে
                const personResult = await query(
                    `SELECT id, full_name, shop_name, email, whatsapp FROM persons WHERE LOWER(email) = LOWER($1) LIMIT 1`,
                    [email]
                );
                if (personResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: `এই Gmail (${email}) দিয়ে কোনো প্রোফাইল নেই। প্রথমে রেজিস্ট্রেশন করুন অথবা SR-এর পাঠানো লিংক থেকে প্রবেশ করুন।`,
                    });
                }
                personOnly = personResult.rows[0];
            }
        }

        // ============================================================
        // পথ ১: customer আছে (কোনো একটা কোম্পানির সাথে connected) —
        // device/token bookkeeping ও JWT অপরিবর্তিত (শুধু person_id যোগ হলো)
        // ============================================================
        if (customer) {
            const userAgent    = req.headers['user-agent'] || '';
            const hashedDevice = hashDeviceId(`${device_id}::${userAgent}`);
            const deviceLabel  = guessDeviceLabel(userAgent);

            // ── portal_tokens row আছে কিনা চেক ──────────────────
            const tokenResult = await query(
                'SELECT bound_email, token_version FROM customer_portal_tokens WHERE customer_id = $1',
                [customer.id]
            );

            const existingRow  = tokenResult.rows[0];
            const boundEmail   = existingRow?.bound_email;
            const tokenVersion = existingRow?.token_version || 1;
            const isFirstLogin = !boundEmail;

            // ── Device whitelist-এ add / update ─────────────────
            await query(
                `INSERT INTO customer_portal_devices (customer_id, device_hash, google_email, device_label)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (customer_id, device_hash) DO UPDATE SET
                    last_used_at = NOW(), is_active = true, device_label = EXCLUDED.device_label`,
                [customer.id, hashedDevice, email.toLowerCase(), deviceLabel]
            );

            // ── portal_tokens row তৈরি বা আপডেট ────────────────
            if (isFirstLogin) {
                await query(
                    `INSERT INTO customer_portal_tokens
                        (customer_id, token, redirect_id, expires_at, token_version, bound_email, last_login, google_email)
                     VALUES ($1, $2, $3, NOW() + INTERVAL '10 years', 1, $4, NOW(), $5)
                     ON CONFLICT (customer_id) DO UPDATE SET
                        bound_email  = $4,
                        google_email = $5,
                        last_login   = NOW()`,
                    [customer.id, generatePortalToken(), generateRedirectId(), email.toLowerCase(), email.toLowerCase()]
                );

                // customers.email খালি থাকলে সেভ করো
                if (!customer.email) {
                    await query(
                        'UPDATE customers SET email = $1, updated_at = NOW() WHERE id = $2',
                        [email, customer.id]
                    );
                }
            } else {
                await query(
                    'UPDATE customer_portal_tokens SET last_login = NOW() WHERE customer_id = $1',
                    [customer.id]
                );
            }

            const jwtPayload_direct = {
                customer_id:    customer.id,
                customer_code:  customer.customer_code,
                person_id:      customer.person_id || null,  // ✅ নতুন — getPersonId lookup সহজ করে
                email,
                google_name:    name,
                google_picture: picture,
                type:           'customer_portal',
                token_version:  tokenVersion,
            };

            // ✅ 15-মিনিট access token → response body → frontend memory
            const accessJWT_direct = jwt.sign(
                jwtPayload_direct,
                process.env.JWT_PORTAL_SECRET,
                { expiresIn: '15m', algorithm: 'HS256' }
            );

            // ✅ 30-দিন refresh token → HttpOnly cookie → JS পড়তে পারে না
            const refreshJWT_direct = jwt.sign(
                { ...jwtPayload_direct, type: 'customer_portal_refresh' },
                process.env.JWT_PORTAL_SECRET,
                { expiresIn: '30d', algorithm: 'HS256' }
            );
            setRefreshCookie(res, refreshJWT_direct);

            // ✅ device + location ট্র্যাকিং — fire-and-forget, response ব্লক করে না
            recordLoginEvent({
                ownerType: 'customer', ownerId: customer.id, loginMethod: 'google',
                deviceFingerprint: device_id || null,
                ipAddress: req.ip, userAgent: req.get('user-agent'),
                email: customer.email || email, phone: customer.whatsapp, name: customer.owner_name,
            });

            return res.status(200).json({
                success: true,
                message: isFirstLogin
                    ? 'প্রথমবার লগইন সফল! ৩০ দিন একই লিংকে ঢুকতে পারবেন।'
                    : 'লগইন সফল!',
                data: {
                    portal_jwt: accessJWT_direct,
                    expires_in: 900,
                    has_company: true,
                    customer: {
                        id:             customer.id,
                        shop_name:      customer.shop_name,
                        owner_name:     customer.owner_name,
                        customer_code:  customer.customer_code,
                        email,
                        google_name:    name,
                        google_picture: picture,
                        current_credit: customer.current_credit,
                        credit_limit:   customer.credit_limit,
                        credit_balance: customer.credit_balance,
                    }
                }
            });
        }

        // ============================================================
        // পথ ২: personOnly — এখনো কোনো কোম্পানির সাথে connection নেই।
        // ⚠️ customer_portal_tokens/customer_portal_devices টেবিলে
        // customer_id NOT NULL, তাই এখানে সেগুলোতে কিছু লেখা হয় না
        // (device-revoke সুবিধা এই পর্যায়ে প্রযোজ্য না — প্রথম কোম্পানির
        // সাথে connect হওয়ার পর switchCompany দিয়ে স্বাভাবিক customer
        // flow-এ চলে যাবে, তখন থেকে device/token bookkeeping শুরু হবে)।
        // ============================================================
        const jwtPayload_person = {
            customer_id:    null,
            person_id:      personOnly.id,
            email,
            google_name:    name,
            google_picture: picture,
            type:           'customer_portal',
            token_version:  1,
        };

        const accessJWT_person = jwt.sign(
            jwtPayload_person,
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '15m', algorithm: 'HS256' }
        );

        const refreshJWT_person = jwt.sign(
            { ...jwtPayload_person, type: 'customer_portal_refresh' },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '30d', algorithm: 'HS256' }
        );
        setRefreshCookie(res, refreshJWT_person);

        // ✅ device + location ট্র্যাকিং — fire-and-forget, response ব্লক করে না
        recordLoginEvent({
            ownerType: 'person', ownerId: personOnly.id, loginMethod: 'google',
            deviceFingerprint: device_id || null,
            ipAddress: req.ip, userAgent: req.get('user-agent'),
            email: personOnly.email || email, phone: personOnly.whatsapp, name: personOnly.full_name,
        });

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল! এখন কোম্পানি খুঁজে সংযোগের অনুরোধ পাঠান।',
            data: {
                portal_jwt: accessJWT_person,
                expires_in: 900,
                person: {
                    id:             personOnly.id,
                    shop_name:      personOnly.shop_name,
                    full_name:      personOnly.full_name,
                    email,
                    google_name:    name,
                    google_picture: picture,
                },
                has_company: false,
            }
        });

    } catch (error) {
        logger.error('❌ Direct Google Auth Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// REFRESH PORTAL TOKEN
// POST /api/portal/refresh
// HttpOnly cookie → token_version চেক → নতুন 15-মিনিট access JWT
// Authorization header লাগে না — browser cookie auto-পাঠায়
// ============================================================
const refreshPortalToken = async (req, res) => {
    const refreshToken = req.cookies?.portal_rt;

    if (!refreshToken) {
        return res.status(401).json({
            success: false,
            message: 'Session নেই। Google দিয়ে লগইন করুন।',
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(refreshToken, process.env.JWT_PORTAL_SECRET, {
            algorithms: ['HS256'],
        });
    } catch {
        res.clearCookie('portal_rt', { path: '/api/portal' });
        return res.status(401).json({
            success: false,
            message: 'Session মেয়াদোত্তীর্ণ। পুনরায় লগইন করুন।',
        });
    }

    if (decoded.type !== 'customer_portal_refresh') {
        return res.status(401).json({ success: false, message: 'অবৈধ token।' });
    }

    // ⚠️ FIX: আগে শুধু customer_id-ভিত্তিক ছিল — company-বিহীন person-only
    // refresh token (customer_id: null) হলে ভুলভাবে "অ্যাকাউন্ট নিষ্ক্রিয়"
    // দেখাতো। এখন দুই path আলাদা করা হলো।
    let personIdForToken = decoded.person_id || null;

    if (!decoded.customer_id && decoded.person_id) {
        // ── person-only session — persons টেবিলে সত্যিই আছে কিনা যাচাই ──
        try {
            const personCheck = await query(`SELECT id FROM persons WHERE id = $1`, [decoded.person_id]);
            if (personCheck.rows.length === 0) {
                res.clearCookie('portal_rt', { path: '/api/portal' });
                return res.status(403).json({ success: false, message: 'প্রোফাইল পাওয়া যায়নি।' });
            }
        } catch (dbErr) {
            logger.error('❌ refreshPortalToken person check error:', dbErr.message);
            return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
        }

        const accessJWT_person = jwt.sign(
            {
                customer_id:    null,
                person_id:      decoded.person_id,
                email:          decoded.email,
                google_name:    decoded.google_name,
                google_picture: decoded.google_picture,
                type:           'customer_portal',
                token_version:  1,
            },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '15m', algorithm: 'HS256' }
        );

        return res.status(200).json({
            success: true,
            data: { portal_jwt: accessJWT_person, expires_in: 900, has_company: false },
        });
    }

    // ── customer-bound session — আগের মতোই, শুধু person_id-ও সাথে আনা হচ্ছে ──
    try {
        const authCheck = await query(
            `SELECT c.is_active, c.person_id, cpt.token_version AS current_version
             FROM customers c
             LEFT JOIN customer_portal_tokens cpt ON cpt.customer_id = c.id
             WHERE c.id = $1`,
            [decoded.customer_id]
        );

        if (authCheck.rows.length === 0 || !authCheck.rows[0].is_active) {
            res.clearCookie('portal_rt', { path: '/api/portal' });
            return res.status(403).json({
                success: false,
                message: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।',
            });
        }

        const currentVersion = authCheck.rows[0].current_version || 1;
        if ((decoded.token_version || 1) !== currentVersion) {
            res.clearCookie('portal_rt', { path: '/api/portal' });
            return res.status(401).json({
                success:    false,
                message:    'নতুন লিংক ইস্যু হয়েছে। পুনরায় লগইন করুন।',
                error_code: 'TOKEN_REVOKED',
            });
        }

        personIdForToken = authCheck.rows[0].person_id || null;
    } catch (dbErr) {
        logger.error('❌ refreshPortalToken DB error:', dbErr.message);
        return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
    }

    // নতুন 15-মিনিট access token
    const accessJWT = jwt.sign(
        {
            customer_id:    decoded.customer_id,
            customer_code:  decoded.customer_code,
            person_id:      personIdForToken,  // ✅ নতুন — getPersonId lookup সহজ করে
            email:          decoded.email,
            google_name:    decoded.google_name,
            google_picture: decoded.google_picture,
            type:           'customer_portal',
            token_version:  decoded.token_version || 1,
        },
        process.env.JWT_PORTAL_SECRET,
        { expiresIn: '15m', algorithm: 'HS256' }
    );

    return res.status(200).json({
        success: true,
        data: { portal_jwt: accessJWT, expires_in: 900, has_company: true },
    });
};


// ============================================================
// LOGOUT PORTAL
// POST /api/portal/logout
// HttpOnly cookie মুছে দেয় — frontend memory নিজেই clear করে
// ============================================================
const logoutPortal = (req, res) => {
    res.clearCookie('portal_rt', {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path:     '/api/portal',
    });
    return res.status(200).json({ success: true, message: 'লগআউট সফল।' });
};


module.exports = {
    sendPortalLink,
    getPublicCustomerByCode, // ✅ NEW: c= কোড দিয়ে shop_name/owner_name/shop_photo — কনফার্ম স্ক্রিনের জন্য
    sendLoginOtp,           // ✅ NEW: WhatsApp OTP লগইন ধাপ ১ (পাঠানো)
    verifyLoginOtp,         // ✅ NEW: WhatsApp OTP লগইন ধাপ ২ (যাচাই → সীমিত setup টোকেন অথবা পূর্ণ JWT)
    completePasswordSetup,  // ✅ NEW: OTP-এর পর পাসওয়ার্ড সেট → পূর্ণ সেশন ইস্যু (SECURITY FIX)
    selfRegisterCustomer,  // ✅ NEW: কাস্টমার নিজে সাইন-আপ
    verifyEmailToken,       // ✅ NEW: রেজিস্ট্রেশন ইমেইল magic-link ভেরিফাই
    sendRegisterOtp,        // ✅ NEW: রেজিস্ট্রেশনে WhatsApp OTP ধাপ ১
    verifyRegisterOtp,      // ✅ NEW: রেজিস্ট্রেশনে WhatsApp OTP ধাপ ২
    passwordLogin,         // ✅ NEW: identifier + password লগইন (Google-এর বিকল্প)
    portalForgotPassword,  // ✅ NEW: পাসওয়ার্ড OTP ধাপ ১ (পাঠানো — email/WhatsApp)
    portalVerifyResetOtp,  // ✅ NEW: পাসওয়ার্ড OTP ধাপ ২ (যাচাই)
    portalResetPassword,   // ✅ NEW: পাসওয়ার্ড OTP ধাপ ৩ (সেট করা)
    resolveLink,           // backward compat — পুরনো link কাজ করবে
    verifyPortalToken,     // backward compat
    deviceLogin,           // backward compat
    googleAuth,            // backward compat
    directGoogleAuth,      // permanent link system
    refreshPortalToken,    // ✅ NEW: HttpOnly cookie → নতুন access token
    logoutPortal,          // ✅ NEW: cookie clear
    listCustomerDevices,
    revokeDevice,
    revokeAllDevices,
    getCustomerDashboard,
    getCustomerInvoices,
    getPaymentHistory,
    getMonthlySummary,
    getCreditOverview,
    getCustomerStatement,
    submitCreditLimitRequest,
    getMyLimitRequests,
    submitComplaint,
    getMyComplaints,
};
