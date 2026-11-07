const logger = require('../config/logger');
const { getDB } = require('../config/firebase');
const { uploadToCloudinary } = require('../services/employee.service');
const { generateOTP } = require('../config/encryption');
const { sendSRApplicationConfirmEmail, sendSRApplicationAdminNotifyEmail } = require('../services/email.service');
const { query } = require('../config/db');
const { getTenantBySlug, getTenantById } = require('../middlewares/tenantResolver');
const {
    loadTenantConfig,
    saveTenantConfig,
    resetTenantConfig,
} = require('../services/recruitmentFormConfig');

// ✅ Multi-tenant: প্রতিটি আবেদন একটি tenant (কোম্পানি)-এর।
// tenant_id ছাড়া পুরোনো আবেদন DEFAULT tenant (Novatech)-এর ধরা হবে।
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const appTenantId = (a) => (a && a.tenant_id) || DEFAULT_TENANT_ID;

// ✅ কোম্পানির যোগাযোগ তথ্য — admin "Settings → কোম্পানি তথ্য" (system_settings) থেকে,
// না থাকলে tenants টেবিল থেকে। DEFAULT tenant-এর জন্য শেষ ভরসা পুরনো নম্বর।
const LEGACY_DEFAULT_CONTACT = { phone: '01836-191102', email: 'inf.novatechbd@gmail.com' };
const getTenantContact = async (tenantId) => {
    const out = { name: null, name_bn: null, phone: null, email: null };
    try {
        const t = await query(
            `SELECT company_name, company_name_bn, company_phone, company_email
               FROM tenants WHERE id = $1`, [tenantId]);
        const s = await query(
            `SELECT key, value FROM system_settings
              WHERE tenant_id = $1
                AND key IN ('company_name','company_phone','company_email')`, [tenantId]);
        // নতুন কোম্পানির settings-এ আগে default (Novatech)-এর মান কপি হয়ে যেত —
        // default-এর হুবহু একই মান হলে সেটা "অসম্পাদিত কপি" ধরে বাদ দাও।
        let defVals = {};
        if (tenantId !== DEFAULT_TENANT_ID) {
            const d = await query(
                `SELECT key, value FROM system_settings
                  WHERE tenant_id = $1
                    AND key IN ('company_name','company_phone','company_email')`,
                [DEFAULT_TENANT_ID]);
            d.rows.forEach(r => { defVals[r.key] = String(r.value || '').trim(); });
        }
        const set = {};
        s.rows.forEach(r => {
            const v = r.value ? String(r.value).trim() : '';
            if (v && v !== defVals[r.key]) set[r.key] = v;
        });
        const row = t.rows[0] || {};
        out.name    = set.company_name  || row.company_name  || null;
        out.name_bn = row.company_name_bn || null;
        out.phone   = set.company_phone || row.company_phone || null;
        out.email   = set.company_email || row.company_email || null;
    } catch (e) {
        logger.warn('⚠️ getTenantContact:', e.message);
    }
    if (tenantId === DEFAULT_TENANT_ID) {
        out.phone = out.phone || LEGACY_DEFAULT_CONTACT.phone;
        out.email = out.email || LEGACY_DEFAULT_CONTACT.email;
    }
    return out;
};

// ── WhatsApp OTP (SR Recruitment — public) ───────────────────
// আবেদনকারীর মোবাইল নম্বর WhatsApp OTP দিয়ে যাচাই হয়। ইমেইল এখন ঐচ্ছিক।
// OTP in-memory রাখা হয় (১০ মিনিট)। যাচাই সফল হলে একটা সাইন করা
// verify_token ফেরত যায় — /apply তে এই টোকেন ছাড়া আবেদন জমা হয় না,
// ফলে ফ্রন্টএন্ড বাইপাস করে সরাসরি API কল করলেও যাচাই এড়ানো যাবে না।
const jwt = require('jsonwebtoken');
const {
    sendPortalWhatsAppMessage,
    formatPhoneForWhatsApp,
    isWhatsAppLikelyDown,
} = require('../services/portalWhatsapp.service');

// Key: 8801XXXXXXXXX → { otp, expiresAt, sentAt, attempts }
const _srOtpStore = new Map();
const BD_PHONE_RE = /^01[3-9]\d{8}$/;
const VERIFY_TOKEN_TTL = '30m';

// মেমরি লিক রোধ — মেয়াদ শেষ OTP পরিষ্কার
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _srOtpStore) if (now > v.expiresAt) _srOtpStore.delete(k);
}, 5 * 60 * 1000).unref();

const normalizeBDPhone = (phone) => {
    const raw = String(phone || '').replace(/\D/g, '');
    const local = raw.startsWith('880') ? '0' + raw.slice(3) : raw;
    return BD_PHONE_RE.test(local) ? local : null;
};

const signPhoneToken = (localPhone) => {
    if (!process.env.JWT_PORTAL_SECRET) throw new Error('JWT_PORTAL_SECRET সেট নেই');
    return jwt.sign({ phone: localPhone, purpose: 'sr_apply' },
        process.env.JWT_PORTAL_SECRET, { expiresIn: VERIFY_TOKEN_TTL, algorithm: 'HS256' });
};

const phoneTokenValid = (token, localPhone) => {
    try {
        const p = jwt.verify(token, process.env.JWT_PORTAL_SECRET, { algorithms: ['HS256'] });
        return p.purpose === 'sr_apply' && p.phone === localPhone;
    } catch { return false; }
};

// ── POST /api/recruitment/verify-phone/send (Public) ──────────
exports.sendSROTP = async (req, res) => {
    try {
        const phone = normalizeBDPhone(req.body.phone);
        if (!phone) {
            return res.status(400).json({ success: false, message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।' });
        }
        const key = formatPhoneForWhatsApp(phone);

        const existing = _srOtpStore.get(key);
        if (existing && (Date.now() - existing.sentAt) < 60_000) {
            const wait = Math.ceil((60_000 - (Date.now() - existing.sentAt)) / 1000);
            return res.status(429).json({ success: false, message: `অনুগ্রহ করে ${wait} সেকেন্ড অপেক্ষা করুন।` });
        }

        if (isWhatsAppLikelyDown()) {
            return res.status(503).json({ success: false, message: 'WhatsApp সেবা সাময়িক বন্ধ। কিছুক্ষণ পরে চেষ্টা করুন।' });
        }

        const otp = generateOTP(6);
        _srOtpStore.set(key, { otp, expiresAt: Date.now() + 10 * 60 * 1000, sentAt: Date.now(), attempts: 0 });

        const name = (req.body.name || '').toString().trim() || 'আবেদনকারী';

        // কোম্পানির নাম — ফর্ম লিংকের slug থেকে (না পেলে আগের মতো ZovoriX)
        let companyLabel = 'ZovoriX';
        try {
            const slug = (req.body.tenant_slug || '').toString().trim().toLowerCase();
            if (slug) {
                const tenant = await getTenantBySlug(slug);
                if (tenant) {
                    const c = await getTenantContact(tenant.id);
                    companyLabel = (c.name_bn || c.name || tenant.company_name || companyLabel)
                        .toString().replace(/[*_~`\n\r]/g, ' ').trim().slice(0, 60) || companyLabel;
                }
            }
        } catch (e) {
            logger.warn('⚠️ OTP company name resolve:', e.message);
        }

        const message =
            `🔐 *${companyLabel} SR নিয়োগ আবেদন*\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `প্রিয় ${name}, আপনার মোবাইল নম্বর যাচাইয়ের কোড:\n\n` +
            `*${otp}*\n\n` +
            `⏱️ এই কোডটি ১০ মিনিট পর্যন্ত কার্যকর।\n` +
            `কারো সাথে এই কোডটি শেয়ার করবেন না।\n` +
            `━━━━━━━━━━━━━━━━`;

        const result = await sendPortalWhatsAppMessage(phone, message, 'sr_apply_otp');
        if (!result.success) {
            _srOtpStore.delete(key);
            logger.warn(`⚠️ SR WhatsApp OTP ব্যর্থ (${key}): ${result.reason}`);
            const msg = result.reason === 'not_configured'
                ? 'WhatsApp সেবা এখনো চালু করা হয়নি। অ্যাডমিনের সাথে যোগাযোগ করুন।'
                : 'এই নম্বরে WhatsApp OTP পাঠানো যায়নি। নম্বরটি WhatsApp-এ চালু আছে কিনা দেখুন।';
            return res.status(502).json({ success: false, message: msg });
        }

        return res.status(200).json({ success: true, message: 'WhatsApp-এ OTP পাঠানো হয়েছে।' });
    } catch (err) {
        logger.error('❌ sendSROTP:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── POST /api/recruitment/verify-phone/confirm (Public) ───────
exports.confirmSROTP = async (req, res) => {
    try {
        const phone = normalizeBDPhone(req.body.phone);
        const otp   = (req.body.otp || '').toString().trim();
        if (!phone || !otp) {
            return res.status(400).json({ success: false, message: 'মোবাইল নম্বর ও OTP দিন।' });
        }
        const key    = formatPhoneForWhatsApp(phone);
        const record = _srOtpStore.get(key);

        if (!record) {
            return res.status(400).json({ success: false, message: 'OTP পাঠানো হয়নি। প্রথমে OTP পাঠান।' });
        }
        if (record.attempts >= 5) {
            _srOtpStore.delete(key);
            return res.status(400).json({ success: false, message: 'বেশি ভুল চেষ্টা। নতুন OTP নিন।' });
        }
        if (Date.now() > record.expiresAt) {
            _srOtpStore.delete(key);
            return res.status(400).json({ success: false, message: 'OTP মেয়াদ শেষ হয়েছে। নতুন OTP নিন।' });
        }
        if (record.otp !== otp) {
            record.attempts += 1;
            return res.status(400).json({
                success: false,
                message: `OTP ভুল হয়েছে। আরও ${5 - record.attempts}টি সুযোগ বাকি।`,
            });
        }

        _srOtpStore.delete(key);
        return res.status(200).json({
            success: true,
            message: 'মোবাইল নম্বর যাচাই সফল ✅',
            data: { verify_token: signPhoneToken(phone) },
        });
    } catch (err) {
        logger.error('❌ confirmSROTP:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// Application ID generator: SR-YYYYMMDD-XXXX
const generateAppId = () => {
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    // Firebase key এ hyphen(-) ব্যবহার করা যাবে না — nested path হিসেবে ব্যবহার হয়
    return `SR_${date}_${rand}`;
};

// ── POST /api/recruitment/apply (Public — no auth) ────────────
exports.submitApplication = async (req, res) => {
    try {
        const db = getDB();
        const d  = req.body;

        const localPhone = normalizeBDPhone(d.phone);
        if (!localPhone) {
            return res.status(400).json({ success: false, message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।' });
        }

        // ✅ Tenant resolve — ফর্ম লিংক /apply/sr/:tenantSlug থেকে slug আসে।
        // slug না দিলে DEFAULT tenant (আগের আচরণ বজায় রাখতে)।
        const slug = (d.tenant_slug || '').toString().trim().toLowerCase();
        let tenantId = DEFAULT_TENANT_ID;
        if (slug) {
            const tenant = await getTenantBySlug(slug);
            if (!tenant) {
                return res.status(404).json({ success: false, message: 'কোম্পানি পাওয়া যায়নি। লিংকটি যাচাই করুন।' });
            }
            if (['suspended', 'cancelled'].includes(tenant.status)) {
                return res.status(403).json({ success: false, message: 'এই কোম্পানি এখন আবেদন নিচ্ছে না।' });
            }
            tenantId = tenant.id;
        }

        // ✅ Admin-এর ফর্ম সেটিংস (সার্ভার-সাইড প্রয়োগ — ফ্রন্টএন্ড বাইপাস করলেও)
        const formCfg = await loadTenantConfig(query, tenantId);
        if (!formCfg.accepting) {
            return res.status(403).json({ success: false, message: formCfg.closed_message });
        }

        // ✅ WhatsApp যাচাইয়ের প্রমাণ — Admin বন্ধ না করলে বাধ্যতামূলক
        if (formCfg.require_otp) {
            if (!d.verify_token || !phoneTokenValid(d.verify_token, localPhone)) {
                return res.status(401).json({ success: false, message: 'মোবাইল নম্বর WhatsApp OTP দিয়ে যাচাই করুন।' });
            }
        }

        // Duplicate check by phone, NID এবং device_id — শুধু একই tenant-এর ভেতরে
        const allSnap = await db.ref('sr_applications').once('value');
        let alreadyApplied = false;
        let nidUsed = false;
        let deviceUsed = false;
        allSnap.forEach(child => {
            const val = child.val();
            if (!val || appTenantId(val) !== tenantId) return;
            if (val.phone === d.phone) alreadyApplied = true;
            if (d.nid && val.nid === d.nid) nidUsed = true;
            if (d.device_id && val.device_id === d.device_id) deviceUsed = true;
        });

        if (alreadyApplied) {
            return res.status(409).json({
                success: false,
                message: 'এই ফোন নম্বরে আগেই আবেদন করা হয়েছে।',
            });
        }
        if (nidUsed) {
            return res.status(409).json({
                success: false,
                message: 'এই NID দিয়ে আগেই আবেদন করা হয়েছে।',
            });
        }
        if (deviceUsed) {
            return res.status(409).json({
                success: false,
                message: 'এই ডিভাইস থেকে আগেই আবেদন করা হয়েছে।',
            });
        }

        // Upload photo to Cloudinary
        let photo_url = null;
        if (req.file) {
            const filename = `sr_${Date.now()}`;
            photo_url = await uploadToCloudinary(req.file.buffer, 'recruitment', filename, req.file.mimetype);
            if (!photo_url) {
                logger.warn('⚠️ ছবি আপলোড হয়নি। CLOUDINARY env সেট আছে কিনা দেখুন।');
            }
        }

        const application_id = generateAppId();
        const now = Date.now();

        const appData = {
            application_id,
            tenant_id:        tenantId,
            name_bn:          d.name_bn        || null,
            name_en:          d.name_en        || null,
            father_name:      d.father_name    || null,
            mother_name:      d.mother_name    || null,
            dob:              d.dob            || null,
            gender:           d.gender         || null,
            marital_status:   d.marital_status || null,
            nid:              d.nid            || null,
            phone:            d.phone          || null,
            email:            d.email          || null,
            permanent_address: d.permanent_address || null,
            current_address:   d.current_address   || null,
            district:          d.district          || null,
            thana:             d.thana             || null,
            edu_ssc_board:      d.edu_ssc_board      || null,
            edu_ssc_year:       d.edu_ssc_year       || null,
            edu_ssc_gpa:        d.edu_ssc_gpa        || null,
            edu_hsc_board:      d.edu_hsc_board      || null,
            edu_hsc_year:       d.edu_hsc_year       || null,
            edu_hsc_gpa:        d.edu_hsc_gpa        || null,
            edu_degree_board:   d.edu_degree_board   || null,
            edu_degree_year:    d.edu_degree_year    || null,
            edu_degree_gpa:     d.edu_degree_gpa     || null,
            edu_other_edu_board: d.edu_other_edu_board || null,
            edu_other_edu_year:  d.edu_other_edu_year  || null,
            edu_other_edu_gpa:   d.edu_other_edu_gpa   || null,
            exp_0_company:  d.exp_0_company  || null,
            exp_0_position: d.exp_0_position || null,
            exp_0_duration: d.exp_0_duration || null,
            exp_0_duties:   d.exp_0_duties   || null,
            exp_1_company:  d.exp_1_company  || null,
            exp_1_position: d.exp_1_position || null,
            exp_1_duration: d.exp_1_duration || null,
            exp_1_duties:   d.exp_1_duties   || null,
            exp_2_company:  d.exp_2_company  || null,
            exp_2_position: d.exp_2_position || null,
            exp_2_duration: d.exp_2_duration || null,
            exp_2_duties:   d.exp_2_duties   || null,
            total_exp_years:  d.total_exp_years  || null,
            total_exp_months: d.total_exp_months || null,
            skill_bangla:     d.skill_bangla     || null,
            skill_english:    d.skill_english    || null,
            skill_smartphone: d.skill_smartphone || null,
            skill_computer:   d.skill_computer   || null,
            has_bike:         d.has_bike         || null,
            emergency_name:     d.emergency_name     || null,
            emergency_relation: d.emergency_relation || null,
            emergency_phone:    d.emergency_phone    || null,
            emergency_address:  d.emergency_address  || null,
            ref1_name:       d.ref1_name       || null,
            ref1_profession: d.ref1_profession || null,
            ref1_phone:      d.ref1_phone      || null,
            ref1_address:    d.ref1_address    || null,
            ref2_name:       d.ref2_name       || null,
            ref2_profession: d.ref2_profession || null,
            ref2_phone:      d.ref2_phone      || null,
            ref2_address:    d.ref2_address    || null,
            photo_url:      photo_url || null,
            device_id:      d.device_id || null,
            status:         'pending',
            admin_comment:  null,
            interview_date: null,
            created_at:     now,
            updated_at:     now,
        };

        await db.ref('sr_applications').push(appData);

        // ── Confirmation Email — আবেদনকারী ও Admin উভয়কে ──
        try {
            const emailData = {
                name:           d.name_bn || d.name_en || 'আবেদনকারী',
                application_id,
                phone:          d.phone    || null,
                email:          d.email    || null,
                district:       d.district || null,
                nid:            d.nid      || null,
                created_at:     now,
            };
            const contact = await getTenantContact(tenantId);
            emailData.company_name  = contact.name_bn || contact.name || null;
            emailData.contact_phone = contact.phone;
            emailData.contact_email = contact.email;

            // আবেদনকারীকে Confirmation Email
            if (d.email) {
                sendSRApplicationConfirmEmail(d.email, emailData, { tenant_id: tenantId }).catch(err =>
                    logger.warn('⚠️ আবেদনকারী confirmation email ব্যর্থ:', err.message)
                );
            }

            // Admin-দের Notification Email
            const adminResult = await query(
                `SELECT email FROM users
                 WHERE role = 'admin' AND status = 'active'
                   AND tenant_id = $1
                   AND email IS NOT NULL AND email != ''`,
                [tenantId]
            );
            const adminEmails = adminResult.rows.map(r => r.email);
            if (adminEmails.length > 0) {
                sendSRApplicationAdminNotifyEmail(adminEmails, emailData, { tenant_id: tenantId }).catch(err =>
                    logger.warn('⚠️ Admin notification email ব্যর্থ:', err.message)
                );
            }
        } catch (emailErr) {
            // Email ব্যর্থ হলেও আবেদন জমা সফল ধরা হবে
            logger.warn('⚠️ SR application email error:', emailErr.message);
        }

        res.status(201).json({
            success: true,
            message: 'আবেদন সফলভাবে জমা হয়েছে।',
            data: { application_id },
        });
    } catch (err) {
        logger.error('Recruitment apply error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment (Admin) ──────────────────────────────
exports.getApplications = async (req, res) => {
    try {
        const db = getDB();
        const { search = '', status = '', page = 1, limit = 20 } = req.query;

        // orderByChild এর বদলে সরাসরি সব data নিয়ে JS এ sort করা হচ্ছে
        // কারণ Firebase index না থাকলে orderByChild ঠিকমতো কাজ করে না
        const snap = await db.ref('sr_applications').once('value');

        let apps = [];
        snap.forEach(child => {
            const val = child.val();
            // null বা object না হলে skip করো
            // ✅ শুধু নিজের tenant-এর আবেদন
            if (val && typeof val === 'object' && appTenantId(val) === req.tenantId) {
                apps.push({ _id: child.key, ...val });
            }
        });
        logger.info(`[Recruitment] Firebase থেকে ${apps.length}টি আবেদন পাওয়া গেছে`);

        // created_at দিয়ে sort — নতুন আগে
        apps.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        // Stats আলাদা query ছাড়াই এখান থেকেই নেওয়া হচ্ছে
        const stats = {
            total:    apps.length,
            pending:  apps.filter(a => a.status === 'pending').length,
            reviewed: apps.filter(a => a.status === 'reviewed').length,
            selected: apps.filter(a => a.status === 'selected').length,
            rejected: apps.filter(a => a.status === 'rejected').length,
        };

        // Filter by status
        let filtered = [...apps];
        if (status) filtered = filtered.filter(a => a.status === status);

        // Search
        if (search) {
            const s = search.toLowerCase();
            filtered = filtered.filter(a =>
                (a.name_bn        || '').toLowerCase().includes(s) ||
                (a.name_en        || '').toLowerCase().includes(s) ||
                (a.phone          || '').includes(s) ||
                (a.nid            || '').includes(s) ||
                (a.application_id || '').toLowerCase().includes(s)
            );
        }

        // Pagination
        const total     = filtered.length;
        const startIdx  = (Number(page) - 1) * Number(limit);
        const paginated = filtered.slice(startIdx, startIdx + Number(limit));

        res.json({
            success: true,
            data: { applications: paginated, total, stats },
        });
    } catch (err) {
        logger.error('Get applications error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment/:id (Admin) ─────────────────────────
exports.getApplication = async (req, res) => {
    try {
        const db   = getDB();
        const snap = await db.ref(`sr_applications/${req.params.id}`).once('value');
        // ✅ অন্য tenant-এর আবেদন হলে 404 (existence leak এড়াতে)
        if (!snap.exists() || appTenantId(snap.val()) !== req.tenantId) {
            return res.status(404).json({ success: false, message: 'আবেদন পাওয়া যায়নি।' });
        }
        res.json({ success: true, data: { _id: snap.key, ...snap.val() } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── PUT /api/recruitment/:id/status (Admin) ───────────────────
exports.updateStatus = async (req, res) => {
    try {
        const db = getDB();
        const { status, admin_comment, interview_date } = req.body;
        const ref = db.ref(`sr_applications/${req.params.id}`);

        const snap = await ref.once('value');
        // ✅ অন্য tenant-এর আবেদন হলে 404
        if (!snap.exists() || appTenantId(snap.val()) !== req.tenantId) {
            return res.status(404).json({ success: false, message: 'আবেদন পাওয়া যায়নি।' });
        }

        const existing = snap.val();

        // Firebase undefined value দিলে crash করে — সব null/string নিশ্চিত করতে হবে
        const updateData = {
            status: (status !== undefined && status !== null && status !== '')
                        ? String(status)
                        : existing.status,
            admin_comment: (admin_comment !== undefined && admin_comment !== null)
                        ? String(admin_comment)
                        : (existing.admin_comment || null),
            interview_date: (interview_date !== undefined && interview_date !== null && interview_date !== '')
                        ? String(interview_date)
                        : (existing.interview_date || null),
            updated_at: Date.now(),
        };

        await ref.update(updateData);

        const updated = await ref.once('value');
        res.json({
            success: true,
            message: 'স্ট্যাটাস আপডেট হয়েছে।',
            data: { _id: updated.key, ...updated.val() },
        });
    } catch (err) {
        logger.error('updateStatus error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment/export (Admin — CSV) ─────────────────
exports.exportCSV = async (req, res) => {
    try {
        const db   = getDB();
        const snap = await db.ref('sr_applications').once('value');

        let apps = [];
        snap.forEach(c => {
            const v = c.val();
            if (v && appTenantId(v) === req.tenantId) apps.push(v);
        });
        apps.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        const headers = [
            'আবেদন নং','আবেদনের তারিখ','বাংলায় নাম','ইংরেজিতে নাম',
            'পিতার নাম','মাতার নাম','জন্ম তারিখ','লিঙ্গ','বৈবাহিক অবস্থা',
            'NID','মোবাইল','ইমেইল','জেলা','থানা',
            'SSC বোর্ড','SSC বছর','SSC জিপিএ',
            'HSC বোর্ড','HSC বছর','HSC জিপিএ',
            'স্নাতক বোর্ড','স্নাতক বছর','স্নাতক জিপিএ',
            'অভিজ্ঞতা (বছর)','মোটরসাইকেল',
            'বাংলা দক্ষতা','ইংরেজি দক্ষতা','স্মার্টফোন','কম্পিউটার',
            'জরুরি যোগাযোগ','জরুরি ফোন',
            'স্ট্যাটাস','মন্তব্য',
        ];

        const rows = apps.map(a => [
            a.application_id,
            a.created_at ? new Date(a.created_at).toLocaleDateString('bn-BD') : '',
            a.name_bn, a.name_en, a.father_name, a.mother_name,
            a.dob, a.gender, a.marital_status, a.nid, a.phone, a.email || '',
            a.district, a.thana,
            a.edu_ssc_board||'', a.edu_ssc_year||'', a.edu_ssc_gpa||'',
            a.edu_hsc_board||'', a.edu_hsc_year||'', a.edu_hsc_gpa||'',
            a.edu_degree_board||'', a.edu_degree_year||'', a.edu_degree_gpa||'',
            a.total_exp_years || '০',
            a.has_bike === 'yes' ? 'হ্যাঁ' : 'না',
            a.skill_bangla||'', a.skill_english||'', a.skill_smartphone||'', a.skill_computer||'',
            a.emergency_name||'', a.emergency_phone||'',
            a.status, a.admin_comment || '',
        ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));

        const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="SR_Applications_${Date.now()}.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Export করতে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment/tenant/:slug (Public) ────────────────
// আবেদন ফর্মে কোম্পানির নাম ও যোগাযোগ নম্বর দেখানোর জন্য।
// slug = "_default" হলে DEFAULT tenant (slug ছাড়া /apply/sr লিংকের জন্য)।
exports.getPublicTenantInfo = async (req, res) => {
    try {
        const slug = String(req.params.slug || '').toLowerCase();
        const tenant = slug === '_default'
            ? await getTenantById(DEFAULT_TENANT_ID)
            : await getTenantBySlug(slug);
        if (!tenant || ['suspended', 'cancelled'].includes(tenant.status)) {
            return res.status(404).json({ success: false, message: 'কোম্পানি পাওয়া যায়নি।' });
        }
        const c = await getTenantContact(tenant.id);
        res.json({
            success: true,
            data: {
                slug: tenant.slug,
                company_name: c.name || tenant.company_name,
                company_name_bn: c.name_bn,
                contact_phone: c.phone,
                contact_email: c.email,
                form_config: await loadTenantConfig(query, tenant.id),
            },
        });
    } catch (err) {
        logger.error('getPublicTenantInfo error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment/apply-link (Admin) ───────────────────
// Admin-এর নিজের কোম্পানির আবেদন লিংকের slug।
exports.getApplyLink = async (req, res) => {
    try {
        const tenant = await getTenantById(req.tenantId);
        res.json({ success: true, data: { slug: tenant?.slug || null } });
    } catch (err) {
        logger.error('getApplyLink error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── GET /api/recruitment/form-config (Admin) ──────────────────
// Admin-এর কোম্পানির ফর্ম সেটিংস (সেভ না থাকলে default)।
exports.getFormConfig = async (req, res) => {
    try {
        const config = await loadTenantConfig(query, req.tenantId);
        res.json({ success: true, data: { config } });
    } catch (err) {
        logger.error('getFormConfig error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// ── PUT /api/recruitment/form-config (Admin) ──────────────────
// body: { config: {...} } — সার্ভারে sanitize হয়ে সেভ হয়।
exports.saveFormConfig = async (req, res) => {
    try {
        const input = req.body && req.body.config;
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            return res.status(400).json({ success: false, message: 'config অবজেক্ট দিন।' });
        }
        const config = await saveTenantConfig(query, req.tenantId, req.user.id, input);

        try {
            await query(
                `INSERT INTO audit_logs (user_id, action, table_name, new_value, tenant_id)
                 VALUES ($1, 'UPDATE_RECRUITMENT_FORM', 'system_settings', $2, $3)`,
                [req.user.id, JSON.stringify(config), req.tenantId]
            );
        } catch (auditErr) {
            logger.warn('⚠️ recruitment form audit log ব্যর্থ:', auditErr.message);
        }

        res.json({ success: true, message: 'ফর্ম সেটিংস সংরক্ষিত হয়েছে।', data: { config } });
    } catch (err) {
        logger.error('saveFormConfig error:', err);
        res.status(500).json({ success: false, message: 'সেটিংস সংরক্ষণে সমস্যা হয়েছে।' });
    }
};

// ── DELETE /api/recruitment/form-config (Admin) ───────────────
// কাস্টম সেটিংস মুছে ডিফল্টে ফেরা।
exports.resetFormConfig = async (req, res) => {
    try {
        const config = await resetTenantConfig(query, req.tenantId);
        res.json({ success: true, message: 'ডিফল্ট সেটিংসে ফেরানো হয়েছে।', data: { config } });
    } catch (err) {
        logger.error('resetFormConfig error:', err);
        res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};
