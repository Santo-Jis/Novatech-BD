// ============================================================
// CUSTOMER PORTAL PROFILE CONTROLLER — নিজের এরিয়া/ফিল্ড/ঠিকানা
// Base: /api/portal/profile   (req.portalUser.customer_id)
// ============================================================

const { query } = require('../config/db');
const logger    = require('../config/logger');
const bcrypt    = require('bcryptjs');
const { uploadToCloudinary } = require('../services/employee.service');
const { invalidatePortalAuthCache } = require('../services/portalCache.service');

// ⚠️ FIX: person_id সরাসরি JWT-তে থাকলে (নতুন token) সেটাই ব্যবহার করে,
// না থাকলে (পুরনো token) customer_id দিয়ে DB lookup fallback করে।
async function getPersonId(portalUser) {
    if (portalUser?.person_id) {
        return portalUser.person_id;
    }
    if (!portalUser?.customer_id) {
        throw new Error('PERSON_NOT_LINKED');
    }
    const r = await query(`SELECT person_id FROM customers WHERE id = $1`, [portalUser.customer_id]);
    if (r.rows.length === 0 || !r.rows[0].person_id) {
        throw new Error('PERSON_NOT_LINKED');
    }
    return r.rows[0].person_id;
}

// ============================================================
// GET /api/portal/profile/area-field
// ============================================================
const getMyAreaAndField = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);

        const p = await query(
            `SELECT shop_name, address, division_id, district_id, discoverable,
                    phone, whatsapp, email, full_name, shop_photo, profile_photo, qr_code, bio
             FROM persons WHERE id = $1`,
            [personId]
        );
        const fields = await query(
            `SELECT bf.id, bf.name_bn, bf.name_en
             FROM entity_business_fields ebf
             JOIN business_fields bf ON bf.id = ebf.business_field_id
             WHERE ebf.entity_type = 'person' AND ebf.entity_id = $1
             ORDER BY bf.sort_order`,
            [personId]
        );

        // is_verified customers টেবিলে (per-tenant-connection), persons-এ না —
        // একজন person একাধিক তেনন্টের সাথে connected থাকতে পারে, প্রতিটার
        // verification আলাদা হতে পারে। এখানে শুধু বর্তমান সক্রিয় সেশনের
        // customer_id (portalUser থেকে) অনুযায়ী verified স্ট্যাটাস দেখানো হচ্ছে —
        // "গ্লোবাল verified" বলে কিছু নেই এই ডেটা মডেলে।
        let isVerified = null;
        if (req.portalUser?.customer_id) {
            const v = await query(
                `SELECT is_verified FROM customers WHERE id = $1`,
                [req.portalUser.customer_id]
            );
            isVerified = v.rows[0]?.is_verified ?? null;
        }

        res.json({
            success: true,
            data: { ...p.rows[0], business_fields: fields.rows, is_verified: isVerified },
        });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getMyAreaAndField error:', err.message);
        res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// PUT /api/portal/profile/area-field
// { shop_name, address, division_id, district_id, discoverable,
//   business_field_ids: [], phone, whatsapp, email, bio }
// সব ফিল্ড optional — যা পাঠানো হবে শুধু তা আপডেট হবে
// ============================================================
const updateMyAreaAndField = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const { shop_name, address, division_id, district_id, discoverable, business_field_ids, phone, whatsapp, email, bio } = req.body;

        await query(
            `UPDATE persons SET
                shop_name    = COALESCE($2, shop_name),
                address      = COALESCE($3, address),
                division_id  = COALESCE($4, division_id),
                district_id  = COALESCE($5, district_id),
                discoverable = COALESCE($6, discoverable),
                phone        = COALESCE($7, phone),
                whatsapp     = COALESCE($8, whatsapp),
                email        = COALESCE($9, email),
                bio          = COALESCE($10, bio),
                updated_at   = NOW()
             WHERE id = $1`,
            [personId, shop_name, address, division_id, district_id, discoverable, phone, whatsapp, email, bio]
        );

        if (Array.isArray(business_field_ids)) {
            await query(
                `DELETE FROM entity_business_fields WHERE entity_type = 'person' AND entity_id = $1`,
                [personId]
            );
            if (business_field_ids.length > 0) {
                const values = business_field_ids.map((_, i) => `('person', $1, $${i + 2})`).join(',');
                await query(
                    `INSERT INTO entity_business_fields (entity_type, entity_id, business_field_id) VALUES ${values}
                     ON CONFLICT DO NOTHING`,
                    [personId, ...business_field_ids]
                );
            }
        }

        res.json({ success: true, message: 'প্রোফাইল আপডেট হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ updateMyAreaAndField error:', err.message);
        res.status(500).json({ success: false, message: 'আপডেট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/profile/photo
// multipart/form-data — ফিল্ড নাম 'shop_photo' এবং/অথবা 'profile_photo',
// দুটোর যেকোনো একটা বা দুটোই একসাথে পাঠানো যাবে (route-এ multer .fields()
// দিয়ে registration-flow-এর মতোই সেটআপ করা)।
// ============================================================
const updateMyPhoto = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);

        const shopFile    = req.files?.shop_photo?.[0];
        const profileFile = req.files?.profile_photo?.[0];

        if (!shopFile && !profileFile) {
            return res.status(400).json({ success: false, message: 'কোনো ছবি পাওয়া যায়নি।' });
        }

        let shopPhotoUrl    = null;
        let profilePhotoUrl = null;

        if (shopFile) {
            shopPhotoUrl = await uploadToCloudinary(
                shopFile.buffer, 'shops', `shop_${personId}_${Date.now()}`, shopFile.mimetype
            );
        }
        if (profileFile) {
            profilePhotoUrl = await uploadToCloudinary(
                profileFile.buffer, 'customer_profiles', `profile_${personId}_${Date.now()}`, profileFile.mimetype
            );
        }

        // Cloudinary কনফিগ না থাকলে uploadToCloudinary null রিটার্ন করে
        // (দেখুন employee.service.js) — সেক্ষেত্রে persons.shop_photo/profile_photo
        // ভুলবশত null দিয়ে ওভাররাইট না হয়ে যায়, তাই শুধু সফল আপলোডই COALESCE করছি।
        await query(
            `UPDATE persons SET
                shop_photo    = COALESCE($2, shop_photo),
                profile_photo = COALESCE($3, profile_photo),
                updated_at    = NOW()
             WHERE id = $1`,
            [personId, shopPhotoUrl, profilePhotoUrl]
        );

        if ((shopFile && !shopPhotoUrl) || (profileFile && !profilePhotoUrl)) {
            return res.status(502).json({
                success: false,
                message: 'ছবি আপলোড করা যায়নি, একটু পর আবার চেষ্টা করুন।',
            });
        }

        res.json({
            success: true,
            message: 'ছবি আপডেট হয়েছে।',
            data: { shop_photo: shopPhotoUrl, profile_photo: profilePhotoUrl },
        });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ updateMyPhoto error:', err.message);
        res.status(500).json({ success: false, message: 'ছবি আপলোড করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/profile/security
// লগইন-হিস্ট্রি + সংযুক্ত ডিভাইস — দুটোই একসাথে।
//
// login_events: person_id দিয়েই query হয় (customer_portal_login_events-এ
// customer_id/person_id দুটোর একটা কলাম ব্যবহৃত হয় recordLoginEvent-এ),
// কিন্তু person_id সবসময় resolve করা যায় getPersonId দিয়ে, তাই এখানে
// সবসময় person_id দিয়েই খোঁজা — customer-type আর person-type দুই account-ই
// covers করে, কারণ customer-type লগইনেও ownerType='customer' হলে সেটা
// customer_id কলামে যায়, person_id কলামে না। তাই person_id দিয়ে খোঁজা
// শুধু person-type অ্যাকাউন্টের ইতিহাস দেখাবে — customer-type অ্যাকাউন্টের
// জন্য customer_id কলামেও খুঁজতে হবে req.portalUser.customer_id দিয়ে।
//
// devices: customer_portal_devices.customer_id NOT NULL (দেখুন
// customerPortal.controller.js-এর পথ ২ কমেন্ট) — person-only অবস্থায়
// (customer_id null) কোনো device row-ই থাকে না, তাই সেক্ষেত্রে data.devices
// খালি array থাকবে, এটাই প্রত্যাশিত আচরণ, এরর না।
// ============================================================
const getMySecurityInfo = async (req, res) => {
    try {
        const personId   = await getPersonId(req.portalUser);
        const customerId = req.portalUser?.customer_id || null;

        // login_events — person_id এবং (থাকলে) customer_id দুটো কলামেই
        // ঘটতে পারা রো একত্রে, সাম্প্রতিক ১০টা
        const events = await query(
            `SELECT id, login_method, device_fingerprint, ip_address, city, country,
                    user_agent, is_new_device, created_at
             FROM customer_portal_login_events
             WHERE (person_id = $1 ${customerId ? 'OR customer_id = $2' : ''})
             ORDER BY created_at DESC
             LIMIT 10`,
            customerId ? [personId, customerId] : [personId]
        );

        // devices — শুধু customer-connected অবস্থায়
        let devices = [];
        if (customerId) {
            const d = await query(
                `SELECT id, device_label, google_email, is_active, added_at, last_used_at
                 FROM customer_portal_devices
                 WHERE customer_id = $1 AND is_active = true
                 ORDER BY last_used_at DESC NULLS LAST, added_at DESC`,
                [customerId]
            );
            devices = d.rows;
        }

        res.json({ success: true, data: { login_events: events.rows, devices } });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getMySecurityInfo error:', err.message);
        res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/profile/password
// { current_password, new_password }
//
// resolvePortalOwner-এর ঠিক একই dispatch-নিয়ম — req.portalUser.customer_id
// truthy হলে customers.password_hash, নাহলে persons.password_hash। JWT
// payload-এ customer_id/person_id দুটোই থাকে (login handler গুলো দেখুন),
// একটা সবসময় null — এখান থেকেই dispatch করা যায়, আলাদা DB lookup লাগে না।
//
// ⚠️ SECURITY FIX: আগে password_hash না থাকলে এই এন্ডপয়েন্ট সরাসরি
// "Google লগইন ব্যবহার করুন" বলে আটকে দিতো — WhatsApp OTP দিয়ে ঢোকা
// কাস্টমার (SR-এর তৈরি করা, যাদের Google bind করা নাও থাকতে পারে)
// প্রথমবার পাসওয়ার্ড সেটই করতে পারতো না। এখন: password_hash না
// থাকলে current_password যাচাই স্কিপ হয় (first-time set), থাকলে আগের
// মতোই current_password verify হয় (change flow, অপরিবর্তিত)। এই
// একই এন্ডপয়েন্ট এখন post-OTP "পাসওয়ার্ড সেট করুন" পেজেও ব্যবহার হয়
// (SetPasswordView.jsx → submitPasswordSetup)।
// ============================================================
const changeMyPassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!new_password) {
            return res.status(400).json({ success: false, message: 'নতুন পাসওয়ার্ড দিন।' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ success: false, message: 'ন্যূনতম ৬ ডিজিট/অক্ষরের পাসওয়ার্ড দিন।' });
        }

        const isCustomerType = !!req.portalUser?.customer_id;
        const table = isCustomerType ? 'customers' : 'persons';
        const ownerId = isCustomerType ? req.portalUser.customer_id : await getPersonId(req.portalUser);

        const owner = await query(`SELECT password_hash FROM ${table} WHERE id = $1`, [ownerId]);
        if (owner.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'প্রোফাইল পাওয়া যায়নি।' });
        }

        const hasExistingPassword = !!owner.rows[0].password_hash;

        if (hasExistingPassword) {
            // ── আগের পাসওয়ার্ড আছে → change flow, current_password লাগবেই ──
            if (!current_password) {
                return res.status(400).json({ success: false, message: 'বর্তমান পাসওয়ার্ড দিন।' });
            }
            const isValid = await bcrypt.compare(current_password, owner.rows[0].password_hash);
            if (!isValid) {
                return res.status(400).json({ success: false, message: 'বর্তমান পাসওয়ার্ড ভুল।' });
            }
        }
        // ── password_hash না থাকলে → first-time set, current_password লাগবে না ──

        const newHash = await bcrypt.hash(new_password, 10);
        await query(`UPDATE ${table} SET password_hash = $1 WHERE id = $2`, [newHash, ownerId]);

        logger.info(`✅ Password ${hasExistingPassword ? 'changed' : 'set (first-time)'} (self-service, ${table}): ${ownerId}`);
        res.json({ success: true, message: hasExistingPassword ? 'পাসওয়ার্ড পরিবর্তন হয়েছে।' : 'পাসওয়ার্ড সেট হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ changeMyPassword error:', err.message);
        res.status(500).json({ success: false, message: 'পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/profile/devices/:deviceId/revoke
// নিজের ডিভাইস নিজে revoke — path-এ deviceId নিলেও query-তে সবসময়
// customer_id = req.portalUser.customer_id দিয়ে scope করা হয়, তাই কেউ
// অন্য কারো device_id পাঠালেও সেই রো UPDATE-এ ধরা পড়বে না (admin-side
// revokeDevice-এর মতো path-param থেকে customerId নেওয়া হচ্ছে না — এখানে
// customerId সবসময় JWT থেকে, কখনো client-supplied না)।
// ============================================================
const revokeMyDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const customerId = req.portalUser?.customer_id;

        if (!customerId) {
            return res.status(400).json({ success: false, message: 'এই অ্যাকাউন্টে কোনো ডিভাইস-তালিকা নেই।' });
        }

        const result = await query(
            `UPDATE customer_portal_devices
             SET is_active = false
             WHERE id = $1 AND customer_id = $2
             RETURNING id, device_label`,
            [deviceId, customerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ডিভাইস পাওয়া যায়নি।' });
        }

        res.json({ success: true, message: `"${result.rows[0].device_label}" মুছে ফেলা হয়েছে।` });
    } catch (err) {
        logger.error('❌ revokeMyDevice error:', err.message);
        res.status(500).json({ success: false, message: 'ডিভাইস মুছতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// GET /api/portal/profile/deletion-preview
// ডিলিট করার আগে — connected কোম্পানিগুলোতে বকেয়া ক্রেডিট থাকলে
// দেখায় (transparency-এর জন্য, block করে না — কাস্টমার নিজেই সিদ্ধান্ত
// নেবে)।
// ============================================================
const getDeletionPreview = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);

        const balances = await query(
            `SELECT c.credit_balance, t.company_name
             FROM customers c
             JOIN tenants t ON t.id = c.tenant_id
             WHERE c.person_id = $1 AND c.is_active = true AND c.credit_balance != 0`,
            [personId]
        );

        res.json({ success: true, data: { outstanding_balances: balances.rows } });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ getDeletionPreview error:', err.message);
        res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/portal/profile/delete-account
// { reason? }
//
// ✅ সরাসরি এখনই কার্যকর — কোনো admin/SR রিভিউ/অপেক্ষা নেই। এটা
// কাস্টমারের নিজের স্বাধীন অ্যাকাউন্ট, নিজের সিদ্ধান্ত।
//
// লগইন আটকাতে নতুন কোনো মেকানিজম বানাতে হয়নি — is_active=false
// ইতিমধ্যে passwordLogin/verifyLoginOtp/deviceLogin সব জায়গায়
// WHERE-ক্লজে চেক করা হয় (existing, বহু জায়গায় ব্যবহৃত)। person-only
// সেশনের জন্য passwordLogin-এর persons lookup-এ এখন
// deletion_requested_at IS NULL চেক যোগ করা হয়েছে।
// ============================================================
const deleteMyAccount = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const { reason } = req.body;

        const custRows = await query(
            `SELECT id FROM customers WHERE person_id = $1 AND is_active = true`,
            [personId]
        );

        await query(`UPDATE customers SET is_active = false WHERE person_id = $1 AND is_active = true`, [personId]);
        await query(`UPDATE persons SET deletion_requested_at = NOW(), deletion_reason = $2 WHERE id = $1`, [personId, reason || null]);

        for (const row of custRows.rows) {
            await invalidatePortalAuthCache(row.id);
        }

        logger.info(`🗑️ Account self-deleted: person ${personId} (${custRows.rows.length}টা connection deactivated)`);

        res.json({ success: true, message: 'আপনার অ্যাকাউন্ট ডিলিট করা হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ deleteMyAccount error:', err.message);
        res.status(500).json({ success: false, message: 'ডিলিট করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
    }
};

module.exports = {
    getMyAreaAndField, updateMyAreaAndField, updateMyPhoto,
    getMySecurityInfo, changeMyPassword, revokeMyDevice,
    // ✅ NEW — immediate self-service, admin/SR রিভিউ নেই
    getDeletionPreview, deleteMyAccount,
};
