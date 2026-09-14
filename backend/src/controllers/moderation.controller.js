// ============================================================
// moderation.controller.js
// ✅ NEW (Redesign Phase ১.৮ — মডারেশন কিউ)
//
// feed_reports (feedEngagement.controller.js-এ তৈরি, Phase ১) থেকে
// pending (reviewed_at IS NULL) রিপোর্টগুলো admin-কে দেখানো, আর
// dismiss/hide/restore অ্যাকশন।
//
// স্কোপিং সিদ্ধান্ত (গুরুত্বপূর্ণ):
//  • company_posts: tenant-owned, তাই সহজ — admin শুধু নিজের tenant-এর
//    পোস্টের রিপোর্ট দেখবে (cp.tenant_id = req.tenantId)
//  • customer_posts: এগুলো কোনো tenant-এর "মালিকানাধীন" না (person-owned,
//    network-wide) — কিন্তু is_active একটাই global flag, প্রতি-tenant
//    আলাদা visibility state নেই। তাই "কে দেখবে" আর "কে হাইড করতে পারবে"
//    আলাদা প্রশ্ন। এখানে admin দেখবে সেই কাস্টমার পোস্টগুলো যাদের author
//    তার নিজের tenant-এর সাথে connected (নিজের কাস্টমারের পোস্ট রিপোর্ট
//    হলে distributor হিসেবে সেটা দেখা/সাহায্য করা স্বাভাবিক)। hide/restore
//    অ্যাকশন কিন্তু গ্লোবাল — অন্য tenant-এর কাস্টমারদের কাছেও পোস্টটা
//    হাইড/দেখা হয়ে যাবে। এটা এখনকার সীমিত স্কোপ, পুরোপুরি per-tenant
//    visibility (customer_posts-এ tenant_id যোগ করা) একটা বড় পরের ধাপ।
// ============================================================

const logger = require('../config/logger');
const { query } = require('../config/db');

const REPORTS_SUBQUERY = (postType) => `
    COALESCE((
        SELECT json_agg(json_build_object(
                   'reason', fr.reason,
                   'created_at', fr.created_at,
                   'reporter_name', rp.full_name
               ) ORDER BY fr.created_at)
        FROM feed_reports fr
        JOIN persons rp ON rp.id = fr.reporter_person_id
        WHERE fr.post_type = '${postType}' AND fr.post_id = base.id AND fr.reviewed_at IS NULL
    ), '[]'::json) AS reports,
    (
        SELECT COUNT(*)::int FROM feed_reports
        WHERE post_type = '${postType}' AND post_id = base.id AND reviewed_at IS NULL
    ) AS pending_report_count
`;

const getModerationQueue = async (req, res) => {
    try {
        const companyPosts = await query(
            `SELECT base.id, base.title, base.body, base.image_url, base.video_url, base.media,
                    base.is_active, base.created_at,
                    ${REPORTS_SUBQUERY('company_post')}
             FROM company_posts base
             WHERE base.tenant_id = $1
               AND EXISTS (SELECT 1 FROM feed_reports WHERE post_type = 'company_post' AND post_id = base.id AND reviewed_at IS NULL)
             ORDER BY base.created_at DESC`,
            [req.tenantId]
        );

        const customerPosts = await query(
            `SELECT base.id, base.body, base.image_url, base.video_url, base.media,
                    base.is_active, base.created_at, p.full_name AS author_name,
                    ${REPORTS_SUBQUERY('customer_post')}
             FROM customer_posts base
             JOIN persons p ON p.id = base.person_id
             WHERE EXISTS (SELECT 1 FROM feed_reports WHERE post_type = 'customer_post' AND post_id = base.id AND reviewed_at IS NULL)
               AND EXISTS (
                     SELECT 1 FROM customer_company_connections cc
                     WHERE cc.tenant_id = $1 AND cc.status = 'connected' AND cc.person_id = base.person_id
                   )
             ORDER BY base.created_at DESC`,
            [req.tenantId]
        );

        return res.json({
            success: true,
            data: { company_posts: companyPosts.rows, customer_posts: customerPosts.rows },
        });
    } catch (err) {
        logger.error('[Moderation] getModerationQueue error:', err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

// পোস্টটা এই admin-এর মডারেশন-এখতিয়ারে আছে কিনা — company_post: tenant
// মালিকানা; customer_post: author connected কিনা (getModerationQueue-এর
// একই নিয়ম, দেখুন উপরের কমেন্ট)
async function assertModeratable(postType, postId, tenantId) {
    if (postType === 'company_post') {
        const r = await query(`SELECT id FROM company_posts WHERE id = $1 AND tenant_id = $2`, [postId, tenantId]);
        return r.rows.length > 0;
    }
    const r = await query(
        `SELECT cp.id FROM customer_posts cp
         WHERE cp.id = $1 AND EXISTS (
             SELECT 1 FROM customer_company_connections cc
             WHERE cc.tenant_id = $2 AND cc.status = 'connected' AND cc.person_id = cp.person_id
         )`,
        [postId, tenantId]
    );
    return r.rows.length > 0;
}

const markReportsReviewed = (postType, postId, adminId) => query(
    `UPDATE feed_reports SET reviewed_at = NOW(), reviewed_by = $1
     WHERE post_type = $2 AND post_id = $3 AND reviewed_at IS NULL`,
    [adminId, postType, postId]
);

const makeActionHandler = (postType, action) => async (req, res) => {
    try {
        const { id } = req.params;
        const allowed = await assertModeratable(postType, id, req.tenantId);
        if (!allowed) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি বা এখতিয়ারে নেই।' });
        }

        const table = postType === 'company_post' ? 'company_posts' : 'customer_posts';

        if (action === 'hide') {
            await query(`UPDATE ${table} SET is_active = false WHERE id = $1`, [id]);
        } else if (action === 'restore') {
            await query(`UPDATE ${table} SET is_active = true WHERE id = $1`, [id]);
        }
        // 'dismiss' পোস্টের is_active ছোঁয় না — শুধু রিপোর্ট রিভিউড মার্ক হয়

        await markReportsReviewed(postType, id, req.user.id);

        const messages = { dismiss: 'রিপোর্ট বাতিল করা হয়েছে।', hide: 'পোস্টটি হাইড করা হয়েছে।', restore: 'পোস্টটি আবার দেখানো হচ্ছে।' };
        return res.json({ success: true, message: messages[action] });
    } catch (err) {
        logger.error(`[Moderation] ${action} (${postType}) error:`, err.message);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে।' });
    }
};

module.exports = {
    getModerationQueue,
    dismissCompanyPost: makeActionHandler('company_post', 'dismiss'),
    hideCompanyPost:     makeActionHandler('company_post', 'hide'),
    restoreCompanyPost:  makeActionHandler('company_post', 'restore'),
    dismissCustomerPost: makeActionHandler('customer_post', 'dismiss'),
    hideCustomerPost:     makeActionHandler('customer_post', 'hide'),
    restoreCustomerPost:  makeActionHandler('customer_post', 'restore'),
};
