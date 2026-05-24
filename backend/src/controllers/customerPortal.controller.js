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

const { query }  = require('../config/db');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const axios      = require('axios');

// ── portalAuth cache invalidation (circular require এড়াতে lazy load) ──
const invalidateAuthCache = (customerId) => {
    try {
        const { invalidatePortalAuthCache } = require('../routes/customerPortal.routes');
        invalidatePortalAuthCache(customerId);
    } catch { /* routes লোড না হলে silent fail */ }
};

// ============================================================
// HELPERS
// ============================================================

// 64-char hex token (cryptographically secure)
const generatePortalToken = () => crypto.randomBytes(32).toString('hex');

// Short opaque redirect ID — URL-এ এটা যাবে, token নয়
const generateRedirectId = () => crypto.randomBytes(16).toString('base64url');

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
            'SELECT id, shop_name, owner_name, whatsapp, email, customer_code FROM customers WHERE id = $1 AND is_active = true',
            [customerId]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি।' });
        }

        const cust = customer.rows[0];

        if (!cust.whatsapp) {
            return res.status(400).json({ success: false, message: 'কাস্টমারের WhatsApp নম্বর নেই।' });
        }

        const token      = generatePortalToken();
        const redirectId = generateRedirectId();
        const expiresAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // ৭ দিন

        // নতুন লিংক পাঠালে:
        //   - token ও redirect_id রিসেট হয়
        //   - token_version বাড়ে (সব device-এর পুরনো JWT invalid)
        //   - bound_email রিসেট হয় (কাস্টমার নতুন Google account দিয়ে login করতে পারবে)
        //   - device whitelist আলাদা টেবিলে — এই query-তে অটো clear হয় না
        //     admin চাইলে GET /api/portal/devices/:customerId দিয়ে manage করবে
        await query(
            `INSERT INTO customer_portal_tokens
                (customer_id, token, redirect_id, expires_at, token_version, bound_email, last_login, google_email)
             VALUES ($1, $2, $3, $4, 1, NULL, NULL, NULL)
             ON CONFLICT (customer_id) DO UPDATE SET
                token         = $2,
                redirect_id   = $3,
                expires_at    = $4,
                token_version = COALESCE(customer_portal_tokens.token_version, 0) + 1,
                created_at    = NOW(),
                bound_email   = NULL,
                last_login    = NULL,
                google_email  = NULL`,
            [customerId, token, redirectId, expiresAt]
        );

        // নতুন token_version — cache-এ পুরনো version বাতিল
        invalidateAuthCache(customerId);

        const frontendUrl = process.env.FRONTEND_URL || 'https://novatech-bd-kqrn.vercel.app';
        const portalLink  = `${frontendUrl}/customer/portal?r=${redirectId}`;

        const rawPhone = cust.whatsapp.replace(/\D/g, '');
        const phone    = rawPhone.startsWith('880') ? rawPhone : '880' + rawPhone.replace(/^0/, '');
        const message  = encodeURIComponent(
            `আস্সালামু আলাইকুম ${cust.owner_name} ভাই,\n\n` +
            `আপনার *${cust.shop_name}* এর সকল ক্রয় তথ্য, বাকি ও পেমেন্ট ইতিহাস দেখতে নিচের লিংকে ক্লিক করুন:\n\n` +
            `🔗 ${portalLink}\n\n` +
            `👆 Google দিয়ে লগইন করুন\n` +
            `_(এই লিংক ৭ দিন কার্যকর থাকবে)_\n\n` +
            `_NovaTech BD_`
        );

        const whatsappUrl = `https://wa.me/${phone}?text=${message}`;

        return res.status(200).json({
            success: true,
            message: 'পোর্টাল লিংক তৈরি হয়েছে।',
            data: {
                portal_link:   portalLink,
                whatsapp_url:  whatsappUrl,
                expires_at:    expiresAt,
                customer_name: cust.owner_name,
                shop_name:     cust.shop_name,
            }
        });

    } catch (error) {
        console.error('❌ Send Portal Link Error:', error.message);
        return res.status(500).json({ success: false, message: 'লিংক তৈরিতে সমস্যা হয়েছে।' });
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

        return res.status(200).json({
            success: true,
            data: {
                portal_token:  row.token,
                expires_at:    row.expires_at,
                is_bound:      !!row.bound_email,   // Google account আগে bind হয়েছে কিনা
                shop_name:     row.shop_name,
                owner_name:    row.owner_name,
                customer_code: row.customer_code,
            }
        });

    } catch (error) {
        console.error('❌ Resolve Link Error:', error.message);
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

        const result = await query(
            `SELECT cpt.customer_id, cpt.expires_at, cpt.bound_email,
                    c.shop_name, c.owner_name, c.customer_code
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1
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
                shop_name:      record.shop_name,
                owner_name:     record.owner_name,
                customer_code:  record.customer_code,
                expires_at:     record.expires_at,
                is_bound:       !!record.bound_email,   // Google account আগে bind হয়েছে
                can_skip_google,                         // এই device whitelisted কিনা
            }
        });

    } catch (error) {
        console.error('❌ Verify Token Error:', error.message);
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
        const { portal_token, device_id } = req.body;

        if (!portal_token || !device_id) {
            return res.status(400).json({ success: false, message: 'portal_token ও device_id দেওয়া হয়নি।' });
        }

        const userAgent    = req.headers['user-agent'] || '';
        const compositeRaw = `${device_id}::${userAgent}`;
        const hashedDevice = hashDeviceId(compositeRaw);

        // Token যাচাই + customer info
        const tokenResult = await query(
            `SELECT cpt.customer_id, cpt.token_version, cpt.bound_email,
                    c.shop_name, c.owner_name, c.customer_code,
                    c.current_credit, c.credit_limit, c.credit_balance, c.email
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1
               AND cpt.expires_at > NOW()
               AND c.is_active = true`,
            [portal_token]
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

        // last_used_at আপডেট করো
        await Promise.all([
            query(
                'UPDATE customer_portal_devices SET last_used_at = NOW() WHERE customer_id = $1 AND device_hash = $2',
                [record.customer_id, hashedDevice]
            ),
            query(
                'UPDATE customer_portal_tokens SET last_login = NOW() WHERE token = $1',
                [portal_token]
            ),
        ]);

        if (!process.env.JWT_PORTAL_SECRET) {
            return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
        }

        const portalJWT = jwt.sign(
            {
                customer_id:   record.customer_id,
                email:         record.bound_email,
                type:          'customer_portal',
                token_version: record.token_version || 1,
            },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '30d', algorithm: 'HS256' }
        );

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল!',
            data: {
                portal_jwt: portalJWT,
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
        console.error('❌ Device Login Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 4. GOOGLE OAUTH CALLBACK
// POST /api/portal/google-auth
// body: { google_token, portal_token, device_id }
// প্রথমবার: email lock + device whitelist-এ add
// পরের device: same email verify + device whitelist-এ add
// ============================================================
const googleAuth = async (req, res) => {
    try {
        const { google_token, portal_token, device_id } = req.body;

        if (!google_token || !portal_token) {
            return res.status(400).json({ success: false, message: 'Google token এবং portal token দেওয়া হয়নি।' });
        }

        if (!device_id) {
            return res.status(400).json({ success: false, message: 'Device ID পাওয়া যায়নি।' });
        }

        // Portal token যাচাই + existing info
        const tokenResult = await query(
            `SELECT cpt.*, c.id AS cid, c.shop_name, c.owner_name, c.customer_code,
                    c.email, c.whatsapp, c.current_credit, c.credit_limit, c.credit_balance
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1 AND cpt.expires_at > NOW()`,
            [portal_token]
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

            // audience verify — এই app-এর Google Client ID-এর জন্য issued হতে হবে
            const expectedClientId = process.env.GOOGLE_CLIENT_ID;
            if (expectedClientId) {
                const aud = tokeninfoRes.data.aud || tokeninfoRes.data.azp || '';
                if (aud !== expectedClientId) {
                    console.warn(`❌ Google token aud mismatch: got "${aud}", expected "${expectedClientId}"`);
                    return res.status(401).json({
                        success: false,
                        message: 'Google token অবৈধ — ভিন্ন app-এর token গ্রহণযোগ্য নয়।'
                    });
                }
            } else {
                console.warn('⚠️ GOOGLE_CLIENT_ID .env-এ নেই — aud check skip হচ্ছে।');
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

        if (isFirstLogin) {
            await query(
                `UPDATE customer_portal_tokens SET
                    bound_email   = $1,
                    last_login    = NOW(),
                    google_email  = $2
                 WHERE token = $3`,
                [email.toLowerCase(), email.toLowerCase(), portal_token]
            );

            // কাস্টমারের email DB-তে সেভ (প্রথমবার — email ফিল্ড খালি থাকলে)
            if (!customerData.email) {
                await query(
                    'UPDATE customers SET email = $1, updated_at = NOW() WHERE id = $2',
                    [email, customerData.cid]
                );
            }
        } else {
            // পুনরায় login — শুধু last_login আপডেট
            await query(
                'UPDATE customer_portal_tokens SET last_login = NOW() WHERE token = $1',
                [portal_token]
            );
        }

        if (!process.env.JWT_PORTAL_SECRET) {
            console.error('❌ JWT_PORTAL_SECRET is not set in environment variables.');
            return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
        }

        const portalJWT = jwt.sign(
            {
                customer_id:    customerData.cid,
                email,
                google_name:    name,
                google_picture: picture,
                type:           'customer_portal',
                token_version:  customerData.token_version || 1,
            },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '30d', algorithm: 'HS256' }
        );

        // Device count — কতটি device এখন whitelisted
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
                portal_jwt:   portalJWT,
                device_added: true,
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
        console.error('❌ Google Auth Error:', error.message);
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
        console.error('❌ List Devices Error:', error.message);
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

        return res.status(200).json({
            success: true,
            message: `"${result.rows[0].device_label}" revoke করা হয়েছে।`,
        });

    } catch (error) {
        console.error('❌ Revoke Device Error:', error.message);
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

        return res.status(200).json({
            success: true,
            message: `${result.rows.length}টি device revoke করা হয়েছে।`,
            revoked_count: result.rows.length,
        });

    } catch (error) {
        console.error('❌ Revoke All Devices Error:', error.message);
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
        console.error('❌ Customer Dashboard Error:', error.message);
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
            filters.push(`st.payment_method = '${payment_method}'`);
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
        const limitIdx  = params.length - 1;
        const offsetIdx = params.length;

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
        console.error('❌ Invoice List Error:', error.message);
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
        console.error('❌ Payment History Error:', error.message);
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
        console.error('❌ Monthly Summary Error:', error.message);
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
        console.error('❌ Credit Overview Error:', error.message);
        return res.status(500).json({ success: false, message: 'ক্রেডিট তথ্য আনতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// CREDIT LIMIT INCREASE REQUEST
// POST /api/portal/credit-limit-request
// GET  /api/portal/credit-limit-request (নিজের আবেদন দেখো)
// ============================================================
const submitCreditLimitRequest = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { requested_amount, reason } = req.body;

        if (!requested_amount || isNaN(requested_amount) || parseFloat(requested_amount) <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ দিন।' });
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
            [customer_id, cust.credit_limit, parseFloat(requested_amount), reason || null]
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
                `আপনার ৳${parseFloat(requested_amount).toLocaleString()} ক্রেডিট লিমিট বৃদ্ধির আবেদন জমা হয়েছে। Manager অনুমোদন দিলে আপনাকে জানানো হবে।`
            ]
        );

        return res.status(201).json({
            success: true,
            message: 'আবেদন সফলভাবে জমা হয়েছে।',
            data: { id: result.rows[0].id, created_at: result.rows[0].created_at }
        });

    } catch (error) {
        console.error('❌ Credit Limit Request Error:', error.message);
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
        console.error('❌ Get Limit Requests Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};


// ============================================================
// COMPLAINT / FEEDBACK SYSTEM
// POST /api/portal/complaint         — নতুন অভিযোগ/ফিডব্যাক
// GET  /api/portal/complaint         — নিজের অভিযোগগুলো দেখো
// ============================================================
const submitComplaint = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const { type, subject, description } = req.body;
        // type: 'complaint' | 'feedback' | 'delivery_issue' | 'product_issue' | 'payment_issue' | 'other'

        if (!subject || !description) {
            return res.status(400).json({ success: false, message: 'বিষয় ও বিস্তারিত বিবরণ দিন।' });
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
        console.error('❌ Submit Complaint Error:', error.message);
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
        console.error('❌ Get Complaints Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    sendPortalLink,
    resolveLink,
    verifyPortalToken,
    deviceLogin,
    googleAuth,
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

// ============================================================
// STATEMENT PDF DOWNLOAD
// GET /api/portal/statement?from=2025-01-01&to=2025-12-31
// কাস্টমারের পুরো হিসাবের PDF statement
// ============================================================
const getCustomerStatement = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;
        const date_from = req.query.from || null;
        const date_to   = req.query.to   || null;

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
            query(
                `SELECT cp.amount, cp.notes, cp.created_at, u.name_bn AS collected_by
                 FROM credit_payments cp
                 JOIN users u ON cp.worker_id = u.id
                 WHERE cp.customer_id = $1
                   ${date_from ? `AND cp.created_at >= '${date_from}'::date` : ''}
                   ${date_to   ? `AND cp.created_at < ('${date_to}'::date + INTERVAL '1 day')` : ''}
                 ORDER BY cp.created_at ASC`,
                [customer_id]
            ),
        ]);

        const sales    = salesRes.rows;
        const payments = paymentsRes.rows;

        // Summary হিসাব
        const totalPurchase       = sales.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
        const totalCash           = sales.reduce((s, r) => s + parseFloat(r.cash_received || 0), 0);
        const totalCredit         = sales.reduce((s, r) => s + parseFloat(r.credit_used || 0), 0);
        const totalCreditPaid     = payments.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

        // PDFKit দিয়ে তৈরি
        const PDFDocument = require('pdfkit');
        const doc    = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks = [];

        doc.on('data', c => chunks.push(c));
        doc.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const label  = date_from && date_to
                ? `${date_from}_to_${date_to}`
                : 'full';
            res.set({
                'Content-Type':        'application/pdf',
                'Content-Disposition': `attachment; filename="statement_${cust.customer_code}_${label}.pdf"`,
                'Content-Length':      buffer.length,
            });
            res.send(buffer);
        });

        const fmt = (n) => parseFloat(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-BD', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

        // ── Header ──────────────────────────────────────────
        doc.fontSize(18).font('Helvetica-Bold').text('NovaTech BD (Ltd.)', { align: 'center' });
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
           .text('NovaTech BD (Ltd.) — Barisal, Bangladesh', { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('❌ Statement PDF Error:', error.message);
        return res.status(500).json({ success: false, message: 'Statement তৈরি করতে সমস্যা হয়েছে।' });
    }
};
