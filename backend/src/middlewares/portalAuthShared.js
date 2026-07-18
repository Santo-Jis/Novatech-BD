// ============================================================
// portalAuthShared.js — Customer Portal JWT middleware (shared copy)
//
// customerPortal.routes.js ফাইলে একই লজিকের একটা inline কপি আছে।
// সেই ফাইলটা ঝুঁকিহীন রাখতে (edit না করে) এখানে আলাদা করে রাখা হলো,
// যাতে নতুন connection routes (customer-side) একই portal auth ব্যবহার
// করতে পারে। লজিক হুবহু এক — শুধু export করা হয়েছে অন্য ফাইল থেকে
// ব্যবহারের জন্য।
// ============================================================

const jwt     = require('jsonwebtoken');
const logger  = require('../config/logger');
const { query } = require('../config/db');
const { getCached, setCache, invalidatePortalAuthCache } = require('../services/portalCache.service');
const { getTenantById } = require('./tenantResolver'); // ✅ SaaS Phase 1: tenant suspend/cancel enforce

const portalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'লগইন করুন।' });
    }

    if (!process.env.JWT_PORTAL_SECRET) {
        return res.status(500).json({ success: false, message: 'সার্ভার কনফিগারেশন সমস্যা।' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_PORTAL_SECRET, {
            algorithms: ['HS256']
        });

        if (decoded.type !== 'customer_portal') {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন।' });
        }
        if (!decoded.customer_id) {
            return res.status(403).json({ success: false, message: 'অবৈধ টোকেন — customer_id নেই।' });
        }

        const customerId = decoded.customer_id;
        const jwtVersion  = decoded.token_version || 1;

        let cached = await getCached(customerId);

        if (!cached) {
            try {
                const authCheck = await query(
                    `SELECT c.id, c.is_active, c.tenant_id, cpt.token_version AS current_version
                     FROM customers c
                     LEFT JOIN customer_portal_tokens cpt ON cpt.customer_id = c.id
                     WHERE c.id = $1`,
                    [customerId]
                );

                if (authCheck.rows.length === 0 || !authCheck.rows[0].is_active) {
                    return res.status(403).json({
                        success: false,
                        message: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।',
                    });
                }

                // ✅ SaaS Phase 1: প্রতিষ্ঠান (tenant) suspended/cancelled কিনা যাচাই
                // fail-open: tenant row না পাওয়া গেলে বা DB সমস্যা হলে ব্লক করা হবে না।
                try {
                    const tenant = await getTenantById(authCheck.rows[0].tenant_id);
                    if (tenant && (tenant.status === 'suspended' || tenant.status === 'cancelled')) {
                        return res.status(403).json({
                            success: false,
                            message: 'এই প্রতিষ্ঠানের সেবা সাময়িকভাবে বন্ধ আছে।',
                            error_code: 'TENANT_INACTIVE',
                        });
                    }
                } catch (tenantErr) {
                    logger.warn('⚠️ Portal tenant status check failed (fail-open):', tenantErr.message);
                }

                const currentVersion = authCheck.rows[0].current_version || 1;
                cached = { token_version: currentVersion, cachedAt: Date.now() };
                await setCache(customerId, cached);

            } catch (dbErr) {
                logger.error('❌ portalAuthShared DB check error:', dbErr.message);
                return res.status(500).json({ success: false, message: 'যাচাই করতে সমস্যা হয়েছে।' });
            }
        }

        if (jwtVersion !== cached.token_version) {
            await invalidatePortalAuthCache(customerId);
            return res.status(401).json({
                success:    false,
                message:    'নতুন লিংক ইস্যু হয়েছে। পুনরায় লগইন করুন।',
                error_code: 'TOKEN_REVOKED',
            });
        }

        req.portalUser = decoded;
        next();

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success:    false,
                message:    'Token মেয়াদোত্তীর্ণ।',
                error_code: 'TOKEN_EXPIRED',
            });
        }
        return res.status(401).json({ success: false, message: 'অবৈধ টোকেন।' });
    }
};

module.exports = { portalAuth };
