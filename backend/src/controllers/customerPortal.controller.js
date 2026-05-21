// ============================================================
// CUSTOMER PORTAL CONTROLLER
// Google OAuth দিয়ে কাস্টমার লগইন করবে
// WhatsApp-এ পাঠানো unique link → Google Login → Dashboard
// ============================================================

const { query }  = require('../config/db');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const axios      = require('axios');

// ── portalAuth cache invalidation (circular require এড়াতে lazy load) ──
// sendPortalLink বা customer deactivation-এ call করলে
// পরবর্তী request-এ DB থেকে fresh token_version আনা হবে।
const invalidateAuthCache = (customerId) => {
    try {
        const { invalidatePortalAuthCache } = require('../routes/customerPortal.routes');
        invalidatePortalAuthCache(customerId);
    } catch { /* routes লোড না হলে silent fail — cache TTL-এই expire হবে */ }
};

// ============================================================
// HELPER: Unique Token তৈরি (64-char hex, cryptographically secure)
// ============================================================
const generatePortalToken = () => crypto.randomBytes(32).toString('hex');

// ============================================================
// HELPER: Short redirect ID তৈরি — URL-এ শুধু এটা যাবে
// এটা দিয়ে সরাসরি dashboard access হবে না;
// frontend এটা দিয়ে POST /api/portal/resolve-link call করবে,
// তারপর actual portal_token পাবে (POST body-তে, URL-এ নয়)।
// ============================================================
const generateRedirectId = () => crypto.randomBytes(16).toString('base64url');

// ============================================================
// HELPER: Device Fingerprint — browser info থেকে consistent ID
// Frontend পাঠায়, backend hash করে store করে
// ============================================================
const hashDeviceId = (raw) => {
    if (!raw) return null;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
};

// ============================================================
// 1. SEND PORTAL LINK (WhatsApp)
// POST /api/portal/send-link/:customerId
// SR বা System call করবে — কাস্টমারের WhatsApp-এ লিংক যাবে
// নতুন লিংক পাঠালে আগের device lock সম্পূর্ণ রিসেট হয়
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
        const redirectId = generateRedirectId(); // ✅ Fix 1: URL-এ শুধু redirect_id যাবে, token নয়
        const expiresAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // নতুন লিংক পাঠালে bound_email ও bound_device_id সম্পূর্ণ রিসেট
        // redirect_id আলাদা — URL-এ এটা দেখায়, token শুধু DB-তে থাকে
        await query(
            `INSERT INTO customer_portal_tokens
                (customer_id, token, redirect_id, expires_at, token_version, bound_email, bound_device_id, bound_at)
             VALUES ($1, $2, $3, $4, 1, NULL, NULL, NULL)
             ON CONFLICT (customer_id) DO UPDATE SET
                token           = $2,
                redirect_id     = $3,
                expires_at      = $4,
                -- ✅ Fix 1: নতুন লিংক পাঠালে token_version বাড়ে।
                -- আগের JWT-এ পুরনো version থাকবে → portalAuth-এ reject হবে।
                -- 30-দিনের পুরনো JWT আর কাজ করবে না।
                token_version   = COALESCE(customer_portal_tokens.token_version, 0) + 1,
                created_at      = NOW(),
                bound_email     = NULL,
                bound_device_id = NULL,
                bound_at        = NULL,
                last_login      = NULL,
                google_email    = NULL`,
            [customerId, token, redirectId, expiresAt]
        );

        // নতুন লিংকে token_version বাড়লো — cache-এ পুরনো version বাতিল করো
        // পরের request-এ DB থেকে নতুন version আনা হবে, পুরনো JWT reject হবে
        invalidateAuthCache(customerId);

        const frontendUrl = process.env.FRONTEND_URL || 'https://novatech-bd-kqrn.vercel.app';
        // ✅ Fix 1: URL-এ শুধু redirect_id (opaque, short-lived lookup key)
        // Frontend POST /api/portal/resolve-link { redirect_id } → actual portal_token পাবে
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
                // ✅ Fix 1: token response-এ নেই — শুধু admin দেখার জন্য redirect_id
                expires_at:    expiresAt,
                customer_name: cust.owner_name,
                shop_name:     cust.shop_name
            }
        });

    } catch (error) {
        console.error('❌ Send Portal Link Error:', error.message);
        return res.status(500).json({ success: false, message: 'লিংক তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 1b. RESOLVE LINK (Fix 1 — token URL থেকে সরানো)
// POST /api/portal/resolve-link
// body: { redirect_id }
// Frontend URL-এ শুধু redirect_id থাকে (?r=xxx)।
// Client POST করে এই endpoint-এ → actual portal_token পায় (body-তে)।
// token কখনো URL-এ যায় না → browser history / server log / WhatsApp preview safe।
// ============================================================
const resolveLink = async (req, res) => {
    try {
        const { redirect_id } = req.body;

        if (!redirect_id) {
            return res.status(400).json({ success: false, message: 'redirect_id দেওয়া হয়নি।' });
        }

        const result = await query(
            `SELECT cpt.token, cpt.expires_at, c.shop_name, c.owner_name, c.customer_code
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.redirect_id = $1`,
            [redirect_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'লিংক পাওয়া যায়নি বা মেয়াদ শেষ।' });
        }

        const record = result.rows[0];

        if (new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ success: false, message: 'লিংকের মেয়াদ শেষ হয়ে গেছে। SR-কে নতুন লিংক পাঠাতে বলুন।' });
        }

        // ✅ portal_token শুধু HTTPS response body-তে যাচ্ছে — URL-এ নয়
        return res.status(200).json({
            success:      true,
            portal_token: record.token,
            shop_name:    record.shop_name,
            owner_name:   record.owner_name,
        });

    } catch (error) {
        console.error('❌ Resolve Link Error:', error.message);
        return res.status(500).json({ success: false, message: 'লিংক যাচাইতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2. VERIFY TOKEN (লিংক ক্লিক করলে)
// GET /api/portal/verify-token?token=xxx&device_id=xxx
// Frontend এ লিংক খুললে এই API call হবে
// device lock থাকলে জানাবে — Google login skip করা যাবে
// ============================================================
const verifyPortalToken = async (req, res) => {
    try {
        const { token, device_id } = req.query;

        if (!token) {
            return res.status(400).json({ success: false, message: 'টোকেন দেওয়া হয়নি।' });
        }

        const result = await query(
            `SELECT cpt.*, c.shop_name, c.owner_name, c.customer_code, c.email, c.whatsapp
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'লিংক পাওয়া যায়নি বা মেয়াদ শেষ।' });
        }

        const record = result.rows[0];

        if (new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ success: false, message: 'লিংকের মেয়াদ শেষ হয়ে গেছে। SR-কে নতুন লিংক পাঠাতে বলুন।' });
        }

        // ── Device Lock চেক ──────────────────────────────────
        // এই লিংক আগে কোনো ডিভাইসে lock হয়েছে কিনা
        const isLocked = !!record.bound_device_id;

        if (isLocked) {
            // device_id না পাঠালে সম্পূর্ণ block — can_skip_google:false
            // দিলেও Google login দিয়ে re-lock করা যেত, তাই এখানেই থামাও।
            if (!device_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Device ID পাওয়া যায়নি। Browser থেকে লিংকটি খুলুন।',
                    error_code: 'DEVICE_ID_MISSING'
                });
            }

            // Composite fingerprint — googleAuth ও deviceLogin-এর মতোই
            const userAgent      = req.headers['user-agent'] || '';
            // ✅ Fix 3: IP বাদ দেওয়া হয়েছে — বাংলাদেশে মোবাইল ডেটায় IP প্রতি session-এ বদলায়।
            // IP থাকলে বৈধ কাস্টমার নিজের ফোনেই DEVICE_LOCKED পাবেন।
            // device_id (browser fingerprint) + User-Agent যথেষ্ট stable।
            const compositeRaw   = `${device_id}::${userAgent}`;
            const hashedIncoming = hashDeviceId(compositeRaw);
            const isSameDevice   = hashedIncoming === record.bound_device_id;

            if (!isSameDevice) {
                return res.status(403).json({
                    success: false,
                    message: 'এই লিংক অন্য একটি ডিভাইসে ব্যবহার করা হয়েছে। নতুন লিংকের জন্য SR-এর সাথে যোগাযোগ করুন।',
                    error_code: 'DEVICE_LOCKED'
                });
            }

            // same device confirmed — can_skip_google দেওয়া যাবে
        } else {
            // এখনো lock হয়নি — device_id আসুক বা না আসুক,
            // Google login mandatory। can_skip_google কখনো true হবে না।
        }

        return res.status(200).json({
            success: true,
            data: {
                customer_id:    record.customer_id,
                shop_name:      record.shop_name,
                owner_name:     record.owner_name,
                customer_code:  record.customer_code,
                email_linked:   !!record.email,
                token_valid:    true,
                // isLocked && same device verified হলেই true — অন্য সব ক্ষেত্রে false
                is_device_locked: isLocked,
                can_skip_google:  isLocked,   // এখানে পৌঁছানো মানে device check passed
            }
        });

    } catch (error) {
        console.error('❌ Verify Token Error:', error.message);
        return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 2b. DEVICE RE-LOGIN (Google ছাড়া)
// POST /api/portal/device-login
// আগে lock হওয়া ডিভাইস → server-side fingerprint match → সরাসরি JWT
//
// ⚠️ FIX #2: device_id client থেকে আসে, তাই এটাকে একমাত্র
// পরিচয় হিসেবে বিশ্বাস করা যাবে না।
// Server-side তথ্য (User-Agent, IP) মিশিয়ে composite fingerprint
// তৈরি করা হয় — শুধু device_id চুরি করে login করা যাবে না।
// ============================================================
const deviceLogin = async (req, res) => {
    try {
        const { portal_token, device_id } = req.body;

        if (!portal_token || !device_id) {
            return res.status(400).json({ success: false, message: 'portal_token ও device_id দেওয়া হয়নি।' });
        }

        // ✅ Fix 3: Composite fingerprint — IP বাদ, শুধু device_id + User-Agent
        // IP বাদ দেওয়ার কারণ: বাংলাদেশে মোবাইল ডেটায় প্রতি session-এ নতুন IP আসে।
        const userAgent  = req.headers['user-agent'] || '';
        const compositeRaw = `${device_id}::${userAgent}`;
        const hashedIncoming = hashDeviceId(compositeRaw);

        const result = await query(
            `SELECT cpt.*, c.id as cid, c.shop_name, c.owner_name, c.customer_code,
                    c.email, c.current_credit, c.credit_limit, c.credit_balance
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1 AND cpt.expires_at > NOW()`,
            [portal_token]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।' });
        }

        const record = result.rows[0];

        if (!record.bound_device_id) {
            return res.status(400).json({ success: false, message: 'এই লিংকে আগে Google login করা হয়নি।' });
        }

        if (hashedIncoming !== record.bound_device_id) {
            return res.status(403).json({
                success: false,
                message: 'এই লিংক অন্য একটি ডিভাইসে lock করা আছে।',
                error_code: 'DEVICE_LOCKED'
            });
        }

        // ── bound_email অবশ্যই থাকতে হবে ────────────────────
        // device lock আছে কিন্তু email নেই — corrupted state,
        // Google re-login করতে বলো।
        if (!record.bound_email) {
            return res.status(400).json({
                success: false,
                message: 'এই লিংকে Google login সম্পূর্ণ হয়নি। নতুন করে Google দিয়ে login করুন।',
                error_code: 'EMAIL_NOT_BOUND'
            });
        }

        if (!process.env.JWT_PORTAL_SECRET) {
            return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
        }

        // ✅ Fix 1: JWT-এ token_version যোগ — নতুন লিংক পাঠালে version বাড়বে
        // portalAuth middleware এই version DB-এর সাথে মিলিয়ে দেখবে
        const portalJWT = jwt.sign(
            {
                customer_id:    record.cid,
                email:          record.bound_email,
                google_name:    record.owner_name,
                type:           'customer_portal',
                token_version:  record.token_version || 1,
            },
            process.env.JWT_PORTAL_SECRET,
            { expiresIn: '30d', algorithm: 'HS256' }
        );

        await query(
            'UPDATE customer_portal_tokens SET last_login = NOW() WHERE token = $1',
            [portal_token]
        );

        return res.status(200).json({
            success: true,
            message: 'লগইন সফল!',
            data: {
                portal_jwt: portalJWT,
                customer: {
                    id:             record.cid,
                    shop_name:      record.shop_name,
                    owner_name:     record.owner_name,
                    customer_code:  record.customer_code,
                    email:          record.bound_email,
                    current_credit: record.current_credit,
                    credit_limit:   record.credit_limit,
                    credit_balance: record.credit_balance
                }
            }
        });

    } catch (error) {
        console.error('❌ Device Login Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 3. GOOGLE OAUTH CALLBACK
// POST /api/portal/google-auth
// প্রথমবার login — Google email + device fingerprint lock হয়
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

        // Portal token যাচাই + existing lock চেক
        const tokenResult = await query(
            `SELECT cpt.*, c.id as cid, c.shop_name, c.owner_name, c.customer_code,
                    c.email, c.whatsapp, c.current_credit, c.credit_limit, c.credit_balance
             FROM customer_portal_tokens cpt
             JOIN customers c ON cpt.customer_id = c.id
             WHERE cpt.token = $1 AND cpt.expires_at > NOW()`,
            [portal_token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'অবৈধ বা মেয়াদোত্তীর্ণ লিংক।' });
        }

        const customerData   = tokenResult.rows[0];
        // Composite fingerprint: client device_id + server-side User-Agent + IP
        // এটি deviceLogin-এর সাথে হুবহু মিলতে হবে
        // ✅ Fix 3: IP বাদ — device_id + User-Agent দিয়ে fingerprint
        const userAgent      = req.headers['user-agent'] || '';
        const compositeRaw   = `${device_id}::${userAgent}`;
        const hashedDeviceId = hashDeviceId(compositeRaw);

        // ── Device Lock চেক ──────────────────────────────────
        if (customerData.bound_device_id) {
            // এই লিংক আগে lock হয়েছে
            if (hashedDeviceId !== customerData.bound_device_id) {
                return res.status(403).json({
                    success: false,
                    message: 'এই লিংক অন্য একটি ডিভাইসে ব্যবহার করা হয়েছে। নতুন লিংকের জন্য SR-এর সাথে যোগাযোগ করুন।',
                    error_code: 'DEVICE_LOCKED'
                });
            }
            // একই ডিভাইস কিন্তু Google login আবার করছে — Email চেক করো
            // (Google account বদলে login করার চেষ্টা রোধ)
        }

        // ── Google token যাচাই — userinfo + audience (aud) check ──
        // শুধু userinfo দিয়ে validate করলে অন্য Google app-এর
        // valid token দিয়েও login করা যায় (token substitution attack)।
        // tokeninfo endpoint দিয়ে aud field verify করা হচ্ছে —
        // token অবশ্যই এই app-এর GOOGLE_CLIENT_ID-এর জন্য issued হতে হবে।
        let googleUser;
        try {
            // Step 1: userinfo — email, name, picture নাও
            const [userinfoRes, tokeninfoRes] = await Promise.all([
                axios.get(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    { headers: { Authorization: `Bearer ${google_token}` } }
                ),
                // ✅ Fix 2: tokeninfo — POST body দিয়ে access_token পাঠানো
                // GET query param-এ token গেলে Google-এর নিজস্ব server log-এ পড়ে।
                // URLSearchParams দিয়ে application/x-www-form-urlencoded body করা হচ্ছে।
                axios.post(
                    'https://www.googleapis.com/oauth2/v3/tokeninfo',
                    new URLSearchParams({ access_token: google_token }).toString(),
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                ),
            ]);

            googleUser = userinfoRes.data;

            // aud মিলছে কিনা verify — GOOGLE_CLIENT_ID .env-এ থাকতে হবে
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

        // ── Email Lock চেক ───────────────────────────────────
        // একই ডিভাইস কিন্তু ভিন্ন Gmail দিয়ে login করার চেষ্টা
        if (customerData.bound_email && email.toLowerCase() !== customerData.bound_email.toLowerCase()) {
            return res.status(403).json({
                success: false,
                message: `এই লিংকে অন্য Gmail (${customerData.bound_email}) দিয়ে আগে login করা হয়েছে। একই Gmail ব্যবহার করুন।`,
                error_code: 'EMAIL_LOCKED'
            });
        }

        // ── প্রথমবার login → lock করো ────────────────────────
        const isFirstLogin = !customerData.bound_device_id;

        if (isFirstLogin) {
            await query(
                `UPDATE customer_portal_tokens SET
                    bound_email     = $1,
                    bound_device_id = $2,
                    bound_at        = NOW(),
                    last_login      = NOW(),
                    google_email    = $4
                 WHERE token = $3`,
                [email.toLowerCase(), hashedDeviceId, portal_token, email.toLowerCase()]
            );

            // কাস্টমারের email DB-তে সেভ (প্রথমবার)
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

        // ── Portal JWT issue ─────────────────────────────────
        // JWT_PORTAL_SECRET অবশ্যই .env-এ আলাদা থাকতে হবে।
        // JWT_ACCESS_SECRET fallback বাদ দেওয়া হয়েছে — দুটো secret
        // একই হলে employee token দিয়ে portal access সম্ভব ছিল।
        if (!process.env.JWT_PORTAL_SECRET) {
            console.error('❌ JWT_PORTAL_SECRET is not set in environment variables.');
            return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
        }

        // ✅ Fix 1: JWT-এ token_version embed করা হচ্ছে
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

        return res.status(200).json({
            success: true,
            message: isFirstLogin ? 'প্রথমবার লগইন সফল! এই ডিভাইসে লক করা হয়েছে।' : 'লগইন সফল!',
            data: {
                portal_jwt: portalJWT,
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
                    credit_balance: customerData.credit_balance
                }
            }
        });

    } catch (error) {
        console.error('❌ Google Auth Error:', error.message);
        return res.status(500).json({ success: false, message: 'লগইনে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// 4. CUSTOMER DASHBOARD DATA
// GET /api/portal/dashboard
// ============================================================
const getCustomerDashboard = async (req, res) => {
    try {
        const { customer_id } = req.portalUser;

        // ── আগে: ৫টি আলাদা sequential query (N+1 pattern)
        // ── এখন: ২টি query — একটি Promise.all-এ parallel
        //
        // Query 1 — customer info (single row, fast)
        // Query 2 — একটি CTE দিয়ে sales + payments + দুটো summary একসাথে
        //
        // কেন ২টি query, ১টি নয়?
        // sales ও payments দুটো আলাদা table থেকে আসে, দুটোরই
        // LIMIT আছে। একটি query-তে JOIN করলে Cartesian product হবে —
        // 30 sales × 20 payments = 600 row fetch হবে, তারপর
        // application layer-এ আলাদা করতে হবে। সেটা আরো slow।
        // আলাদা query কিন্তু parallel চালানোই optimal।

        // ── Query 1: Customer info ────────────────────────────
        const customerResult = await query(
            `SELECT c.shop_name, c.owner_name, c.customer_code, c.email,
                    c.credit_limit, c.current_credit, c.credit_balance,
                    c.business_type, c.whatsapp,
                    r.name AS route_name
             FROM customers c
             LEFT JOIN routes r ON c.route_id = r.id
             WHERE c.id = $1`,
            [customer_id]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'তথ্য পাওয়া যায়নি।' });
        }

        // ── Query 2: CTE দিয়ে sales + payments + দুটো summary —
        // WITH clause-এ চারটি subquery define করা হয়েছে।
        // PostgreSQL এগুলো একটি execution plan-এ চালায় —
        // sales_transactions table একবারই scan হয় (monthlySummary
        // ও totalSummary-এর জন্য আলাদা scan নেই)।
        // Query 3 (payments) আলাদা table তাই parallel চালানো হচ্ছে।
        const [mainResult, paymentsResult] = await Promise.all([
            query(
                `WITH
                 -- শেষ ৩০টি invoice (replacement info সহ)
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
                 -- এই মাসের summary (replacement সহ)
                 monthly AS (
                     SELECT
                         COUNT(*)                              AS total_invoices,
                         COALESCE(SUM(net_amount), 0)          AS total_purchase,
                         COALESCE(SUM(cash_received), 0)       AS total_cash,
                         COALESCE(SUM(credit_used), 0)         AS total_credit,
                         COALESCE(SUM(replacement_value), 0)   AS total_replacement,
                         COALESCE(SUM(credit_balance_added), 0) AS total_credit_earned
                     FROM sales_transactions
                     WHERE customer_id = $1
                       AND (otp_verified = true OR otp_skipped = true)
                       AND date_trunc('month', created_at) = date_trunc('month', NOW())
                 ),
                 -- সর্বকালীন summary (replacement সহ)
                 overall AS (
                     SELECT
                         COUNT(*)                              AS total_invoices,
                         COALESCE(SUM(net_amount), 0)          AS total_purchase,
                         COALESCE(SUM(cash_received), 0)       AS total_cash,
                         COALESCE(SUM(credit_used), 0)         AS total_credit,
                         COALESCE(SUM(replacement_value), 0)   AS total_replacement,
                         COALESCE(SUM(credit_balance_added), 0) AS total_credit_earned
                     FROM sales_transactions
                     WHERE customer_id = $1
                       AND (otp_verified = true OR otp_skipped = true)
                 ),
                 -- রিটার্ন ইতিহাস — replacement_value > 0 এমন sale গুলো
                 -- কাস্টমার কোন invoice-এ কী ফেরত দিয়েছে এবং কত credit পেয়েছে
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
            // payments আলাদা table — parallel চালাও
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
                // sales: শেষ ৩০টি invoice (replacement_items ও credit_balance_added সহ)
                // সব invoice দেখতে GET /api/portal/invoices ব্যবহার করুন।
                sales:           salesPreview,
                sales_note: salesPreview.length === 30 && totalInvoices > 30
                    ? `সর্বশেষ ৩০টি দেখানো হচ্ছে। মোট ${totalInvoices}টি ইনভয়েস আছে।`
                    : null,
                // returns: যেসব invoice-এ পণ্য ফেরত দেওয়া হয়েছে (শেষ ২০টি)
                // replacement_items → কী কী ফেরত গেছে
                // replacement_value → মোট মূল্য
                // credit_balance_added → এই return থেকে কত credit balance পেয়েছে
                returns:         returnsData,
                credit_payments: paymentsResult.rows,
                monthly_summary: monthly_summary || {},
                total_summary:   total_summary   || {}
            }
        });

    } catch (error) {
        console.error('❌ Customer Dashboard Error:', error.message);
        return res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// ============================================================
// GET /api/portal/invoices
// Query params:
//   page          — পেজ নম্বর (default: 1)
//   limit         — প্রতি পেজে কতটি (default: 15, max: 50)
//   search        — invoice_number বা sr_name দিয়ে খোঁজ (optional)
//   payment_method— 'cash' | 'credit' | 'mixed' ফিল্টার (optional)
//   date_from     — শুরুর তারিখ YYYY-MM-DD (optional)
//   date_to       — শেষের তারিখ YYYY-MM-DD (optional)
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

        // ── Dynamic WHERE clause builder ───────────────────────
        // customer_id সবসময় থাকবে ($1)। বাকি filters optional।
        // params array-এ sequentially push করে $N placeholder বাড়াই।
        const params  = [customer_id];
        const filters = [
            'st.customer_id = $1',
            '(st.otp_verified = true OR st.otp_skipped = true)',
        ];

        // invoice_number বা SR নামে free-text সার্চ
        // ILIKE case-insensitive; % দুই দিকে = substring match
        if (search) {
            params.push(`%${search}%`);
            filters.push(`(st.invoice_number ILIKE $${params.length} OR u.name_bn ILIKE $${params.length})`);
        }

        // payment_method ফিল্টার
        // 'mixed' মানে cash_received > 0 AND credit_used > 0
        if (payment_method === 'cash') {
            filters.push(`st.payment_method = 'cash'`);
        } else if (payment_method === 'credit') {
            filters.push(`st.payment_method = 'credit'`);
        } else if (payment_method === 'mixed') {
            filters.push(`st.payment_method = 'mixed'`);
        }

        // তারিখ রেঞ্জ ফিল্টার — date_from এবং date_to উভয়ই optional
        if (date_from) {
            params.push(date_from);
            filters.push(`st.created_at >= $${params.length}::date`);
        }
        if (date_to) {
            params.push(date_to);
            // date_to দিনটি inclusive করতে পরের দিনের শুরু পর্যন্ত
            filters.push(`st.created_at < ($${params.length}::date + INTERVAL '1 day')`);
        }

        const whereClause = filters.join(' AND ');

        // LIMIT ও OFFSET params-এ যোগ করো
        params.push(limit, offset);
        const limitIdx  = params.length - 1;
        const offsetIdx = params.length;

        // COUNT(*) OVER() — একটি query-তেই total count ও data
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

        // total_count response-এ পাঠানোর দরকার নেই — pagination-এ আছে
        const rows = result.rows.map(({ total_count, ...rest }) => rest);

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
// GET /api/portal/payment-history
// নগদ ও credit উভয় ধরনের পেমেন্ট একসাথে দেখাবে।
// Query params:
//   page      — পেজ নম্বর (default: 1)
//   limit     — প্রতি পেজে কতটি (default: 20, max: 50)
//   type      — 'cash' | 'credit' — ফিল্টার (optional, সব দেখাতে বাদ দিন)
//   date_from — শুরুর তারিখ YYYY-MM-DD (optional)
//   date_to   — শেষের তারিখ YYYY-MM-DD (optional)
//
// কেন আলাদা endpoint?
//   Dashboard-এ শুধু credit_payments দেখাতো।
//   নগদ পেমেন্ট sales_transactions-এ cash_received হিসেবে থাকে।
//   এই endpoint দুটো source UNION করে chronological order-এ দেখায়।
// ============================================================
const getPaymentHistory = async (req, res) => {
    try {
        const customer_id = req.portalUser.customer_id;
        const page        = Math.max(1, parseInt(req.query.page)  || 1);
        const limit       = Math.min(50, parseInt(req.query.limit) || 20);
        const offset      = (page - 1) * limit;
        const typeFilter  = (req.query.type || '').trim().toLowerCase(); // 'cash' | 'credit' | ''
        const date_from   = req.query.date_from || null;
        const date_to     = req.query.date_to   || null;

        // ── তারিখ filter clause (উভয় branch-এ একই প্যাটার্ন) ──
        // params শুরু করব $1 = customer_id দিয়ে।
        // date filter params shared হবে — তাই আলাদা করে build করি।
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

        // ── UNION query তৈরি ───────────────────────────────────
        // Branch A: নগদ পেমেন্ট — sales_transactions থেকে cash_received
        //   শুধু সেই invoices যেখানে কিছু নগদ দেওয়া হয়েছে
        // Branch B: credit পেমেন্ট — credit_payments table থেকে
        //   SR যখন বাকি আদায় করেছে
        //
        // typeFilter দিয়ে শুধু একটি branch active রাখা যায়।
        // উভয় branch-এ একই column structure: amount, type, note, collected_by, created_at

        const cashBranch = `
            SELECT
                st.cash_received         AS amount,
                'cash'                   AS payment_type,
                st.invoice_number        AS reference,
                u.name_bn                AS collected_by,
                st.created_at
            FROM sales_transactions st
            JOIN users u ON st.worker_id = u.id
            WHERE st.customer_id = $1
              AND (st.otp_verified = true OR st.otp_skipped = true)
              AND st.cash_received > 0
              ${dateClause}`;

        const creditBranch = `
            SELECT
                cp.amount                AS amount,
                'credit'                 AS payment_type,
                cp.notes                 AS reference,
                u.name_bn                AS collected_by,
                cp.created_at
            FROM credit_payments cp
            JOIN users u ON cp.worker_id = u.id
            WHERE cp.customer_id = $1
              ${dateClause}`;

        // typeFilter অনুযায়ী branch নির্বাচন
        let unionSQL;
        if (typeFilter === 'cash') {
            unionSQL = cashBranch;
        } else if (typeFilter === 'credit') {
            unionSQL = creditBranch;
        } else {
            unionSQL = `${cashBranch} UNION ALL ${creditBranch}`;
        }

        // LIMIT ও OFFSET যোগ করো
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

        // ── Summary: মোট নগদ ও credit আদায় ──────────────────
        // Frontend chart বা summary card-এর জন্য aggregate দেওয়া হচ্ছে
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
// GET /api/portal/monthly-summary
// কাস্টমার নির্দিষ্ট মাসের বা সর্বশেষ N মাসের summary দেখবে।
// Query params:
//   months — কতটি মাস দেখাবে (default: 6, max: 24)
//   year   — নির্দিষ্ট বছর (optional)
//   month  — নির্দিষ্ট মাস 1-12 (optional, year সহ দিলে শুধু সেই মাস)
//
// Response: প্রতিটি মাসের purchase, cash, credit, replacement summary
// ============================================================
const getMonthlySummary = async (req, res) => {
    try {
        const customer_id  = req.portalUser.customer_id;
        const monthsBack   = Math.min(24, Math.max(1, parseInt(req.query.months) || 6));
        const specificYear = req.query.year  ? parseInt(req.query.year)  : null;
        const specificMonth= req.query.month ? parseInt(req.query.month) : null;

        // ── নির্দিষ্ট মাস বা সর্বশেষ N মাস ─────────────────────
        // specificYear + specificMonth দিলে শুধু সেই একটি মাস।
        // অন্যথায় সর্বশেষ monthsBack মাস।
        let whereExtra = '';
        const params   = [customer_id];

        if (specificYear && specificMonth) {
            // নির্দিষ্ট মাস: যেমন year=2025&month=3 → March 2025
            params.push(specificYear, specificMonth);
            whereExtra = `AND EXTRACT(YEAR  FROM created_at) = $${params.length - 1}
                          AND EXTRACT(MONTH FROM created_at) = $${params.length}`;
        } else {
            // সর্বশেষ N মাস: এই মাস সহ পেছনে N মাস
            params.push(monthsBack - 1);
            whereExtra = `AND date_trunc('month', created_at) >=
                              date_trunc('month', NOW()) - ($${params.length} * INTERVAL '1 month')`;
        }

        const result = await query(
            `SELECT
                 date_trunc('month', created_at)              AS month_start,
                 TO_CHAR(created_at, 'YYYY-MM')               AS month_label,
                 COUNT(*)                                      AS total_invoices,
                 COALESCE(SUM(net_amount), 0)                  AS total_purchase,
                 COALESCE(SUM(cash_received), 0)               AS total_cash,
                 COALESCE(SUM(credit_used), 0)                 AS total_credit,
                 COALESCE(SUM(discount_amount), 0)             AS total_discount,
                 COALESCE(SUM(replacement_value), 0)           AS total_replacement,
                 COALESCE(SUM(credit_balance_added), 0)        AS total_credit_earned,
                 COALESCE(SUM(credit_balance_used), 0)         AS total_credit_balance_used
             FROM sales_transactions
             WHERE customer_id = $1
               AND (otp_verified = true OR otp_skipped = true)
               ${whereExtra}
             GROUP BY date_trunc('month', created_at), TO_CHAR(created_at, 'YYYY-MM')
             ORDER BY month_start DESC`,
            params
        );

        // ── Credit payment আদায় (মাস অনুযায়ী) ─────────────────
        // credit_payments table-এ SR-এর আদায় আছে।
        // sales-এর সাথে মাস মেলাতে আলাদা query।
        const creditPaymentsResult = await query(
            `SELECT
                 TO_CHAR(created_at, 'YYYY-MM')   AS month_label,
                 COALESCE(SUM(amount), 0)          AS total_credit_collected
             FROM credit_payments
             WHERE customer_id = $1
             GROUP BY TO_CHAR(created_at, 'YYYY-MM')`,
            [customer_id]
        );

        // credit_payments map তৈরি করো: month_label → total_credit_collected
        const creditMap = {};
        for (const row of creditPaymentsResult.rows) {
            creditMap[row.month_label] = parseFloat(row.total_credit_collected);
        }

        // Sales summary-তে credit_collected merge করো
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
// GET /api/portal/credit-overview
// Credit limit, বর্তমান বাকি ও available credit একসাথে দেখাবে।
// Dashboard-এ এককভাবে credit_limit দেখাতো; এটি comparative view।
//
// Response fields:
//   credit_limit       — অনুমোদিত সর্বোচ্চ বাকির সীমা
//   current_credit     — বর্তমানে মোট বাকি (outstanding)
//   available_credit   — আরো কত বাকিতে কিনতে পারবে = limit - current
//   credit_balance     — return থেকে পাওয়া credit balance (খরচযোগ্য)
//   utilization_pct    — ব্যবহারের শতাংশ = (current / limit) × 100
//   recent_payments    — সর্বশেষ ৫টি credit payment (quick view)
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
                     -- available = limit - current (কখনো negative নয়)
                     GREATEST(0, credit_limit - current_credit) AS available_credit,
                     -- utilization percentage (limit = 0 হলে 0%)
                     CASE
                         WHEN credit_limit > 0
                         THEN ROUND((current_credit::numeric / credit_limit) * 100, 1)
                         ELSE 0
                     END AS utilization_pct
                 FROM customers
                 WHERE id = $1`,
                [customer_id]
            ),
            // সর্বশেষ ৫টি credit payment — quick summary card-এর জন্য
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

        // ── Status tag — frontend badge-এর জন্য ────────────────
        // utilization_pct অনুযায়ী রঙিন badge দেখাতে সহায়তা করে
        let status;
        const pct = parseFloat(creditInfo.utilization_pct);
        if (pct >= 100)       status = 'exceeded';   // সীমা পেরিয়ে গেছে
        else if (pct >= 80)   status = 'critical';   // বিপজ্জনক
        else if (pct >= 50)   status = 'warning';    // সতর্কতা
        else                  status = 'healthy';     // স্বাভাবিক

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

module.exports = {
    sendPortalLink,
    resolveLink,
    verifyPortalToken,
    deviceLogin,
    googleAuth,
    getCustomerDashboard,
    getCustomerInvoices,
    getPaymentHistory,
    getMonthlySummary,
    getCreditOverview,
};
