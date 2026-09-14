// ============================================================
// feedEngagement.controller.js
// ✅ NEW (Redesign Phase ১ — ফিড এনগেজমেন্ট)
//
// company_posts আর customer_posts দুটোর জন্যই react/report — একটাই
// পলিমরফিক feed_reactions/feed_reports টেবিল (migration_feed_engagement.sql)।
// companyPost.controller.js আর customerPost.controller.js-এ আলাদা করে
// একই লজিক কপি-পেস্ট না করে এখানে একবার লেখা হলো।
// ============================================================

const logger = require('../config/logger');
const { query } = require('../config/db');
const { getPersonId } = require('../services/portalPerson.service');

// "এই person কি আসলেই পোস্টটা দেখতে/react/comment করতে পারে?" — post_type-ভেদে
// আলাদা visibility rule।
//
// ⚠️ FIX (Redesign Phase ১.৯): company_post-এর চেক আগে শুধু is_active
// দেখত, visibility (public/connections/select/private) একদম ধরত না —
// migration_company_post_visibility.sql (Phase ১.৫) আসার পর এটা একটা
// real gap হয়ে দাঁড়িয়েছিল (কেউ 'private'/'select' পোস্টেও react/report
// করতে পারত যদি id আন্দাজ করতে পারত, যদিও ফিডে দেখতই না)। এখন
// getPortalCompanyPosts-এর ঠিক same visibility রুল এখানেও।
// customer_post: getNetworkFeed-এর সাথে identical rule (অপরিবর্তিত)।
async function assertVisible(postType, postId, personId) {
    if (postType === 'company_post') {
        const r = await query(
            `SELECT cp.id FROM company_posts cp
             WHERE cp.id = $1 AND cp.is_active = true
               AND (
                     cp.visibility = 'public'
                     OR (cp.visibility = 'connections' AND EXISTS (
                            SELECT 1 FROM customer_company_connections cc
                            WHERE cc.tenant_id = cp.tenant_id AND cc.person_id = $2 AND cc.status = 'connected'
                          ))
                     OR (cp.visibility = 'select' AND EXISTS (
                            SELECT 1 FROM company_post_audience cpa
                            JOIN customers c ON c.id = cpa.customer_id
                            WHERE cpa.post_id = cp.id AND c.person_id = $2
                          ))
                   )`,
            [postId, personId]
        );
        return r.rows.length > 0;
    }

    const r = await query(
        `SELECT cp.id FROM customer_posts cp
         WHERE cp.id = $1 AND cp.is_active = true
           AND (
                 cp.person_id = $2
                 OR EXISTS (
                      SELECT 1 FROM customer_company_connections mine
                      JOIN customer_company_connections theirs
                             ON theirs.tenant_id = mine.tenant_id AND theirs.status = 'connected'
                      WHERE mine.person_id = $2 AND mine.status = 'connected'
                        AND theirs.person_id = cp.person_id
                    )
               )`,
        [postId, personId]
    );
    return r.rows.length > 0;
}

// ============================================================
// POST /:id/react — toggle like/unlike, idempotent (UNIQUE constraint-এর
// ওপর ভরসা করে দুইবার ক্লিকে দুইটা row তৈরি হবে না)
// ============================================================
const makeReactHandler = (postType) => async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const postId   = req.params.id;

        const visible = await assertVisible(postType, postId, personId);
        if (!visible) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const existing = await query(
            `SELECT id FROM feed_reactions WHERE post_type = $1 AND post_id = $2 AND person_id = $3`,
            [postType, postId, personId]
        );

        let reacted;
        if (existing.rows.length > 0) {
            await query(`DELETE FROM feed_reactions WHERE id = $1`, [existing.rows[0].id]);
            reacted = false;
        } else {
            await query(
                `INSERT INTO feed_reactions (post_type, post_id, person_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (post_type, post_id, person_id) DO NOTHING`,
                [postType, postId, personId]
            );
            reacted = true;
        }

        const countRes = await query(
            `SELECT COUNT(*)::int AS count FROM feed_reactions WHERE post_type = $1 AND post_id = $2`,
            [postType, postId]
        );

        res.json({ success: true, data: { reacted, count: countRes.rows[0].count } });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error(`❌ react (${postType}) error:`, err.message);
        res.status(500).json({ success: false, message: 'রিঅ্যাক্ট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /:id/report   { reason?: string }
//
// ⚠️ ইচ্ছাকৃত সিদ্ধান্ত: শুধু customer_post (open user-generated, কোনো
// gatekeeping নেই) auto-hide হবে threshold-এ পৌঁছালে। company_post
// admin-composed অফিসিয়াল কনটেন্ট — কয়েকজনের রিপোর্টে নিজে থেকে
// লুকিয়ে ফেলা ঠিক হবে না, ওটা admin queue-তে গিয়ে মানুষ রিভিউ করুক
// (Phase ২ — moderation UI, এখনো বানানো হয়নি)। আপাতত company_post-এর
// রিপোর্ট শুধু টেবিলে জমা থাকবে, ভবিষ্যতের সেই queue-এর জন্য প্রস্তুত ডেটা।
// ============================================================
const AUTO_HIDE_REPORT_THRESHOLD = 3;

const makeReportHandler = (postType) => async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const postId   = req.params.id;
        const reason   = (req.body?.reason || '').trim().slice(0, 300) || null;

        const visible = await assertVisible(postType, postId, personId);
        if (!visible) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const already = await query(
            `SELECT id FROM feed_reports WHERE post_type = $1 AND post_id = $2 AND reporter_person_id = $3`,
            [postType, postId, personId]
        );
        if (already.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'আপনি ইতিমধ্যে এই পোস্টটি রিপোর্ট করেছেন।' });
        }

        await query(
            `INSERT INTO feed_reports (post_type, post_id, reporter_person_id, reason)
             VALUES ($1, $2, $3, $4)`,
            [postType, postId, personId, reason]
        );

        if (postType === 'customer_post') {
            const countRes = await query(
                `SELECT COUNT(*)::int AS count FROM feed_reports WHERE post_type = $1 AND post_id = $2`,
                [postType, postId]
            );
            if (countRes.rows[0].count >= AUTO_HIDE_REPORT_THRESHOLD) {
                await query(`UPDATE customer_posts SET is_active = false WHERE id = $1`, [postId]);
                logger.info(`🚩 customer_post ${postId} auto-hidden — ${countRes.rows[0].count} reports`);
            }
        }

        res.status(201).json({ success: true, message: 'রিপোর্ট জমা হয়েছে। ধন্যবাদ।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error(`❌ report (${postType}) error:`, err.message);
        res.status(500).json({ success: false, message: 'রিপোর্ট করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// কমেন্ট — GET/POST/:id/comments, DELETE/:id/comments/:commentId
// ✅ NEW (Redesign Phase ১.৯) — মূল ভিশন ডকে ছিল, Phase ১ বাস্তবায়নে
// বাদ পড়ে গিয়েছিল। parent_comment_id স্কিমায় আছে (ভবিষ্যতের thread-এর
// জন্য) কিন্তু UI এখন flat — কেউ replied-to-reply দেখাচ্ছি না এখনো।
// ============================================================
const MAX_COMMENT_LENGTH = 500;

const makeGetCommentsHandler = (postType) => async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const postId   = req.params.id;

        const visible = await assertVisible(postType, postId, personId);
        if (!visible) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const result = await query(
            `SELECT fc.id, fc.body, fc.created_at, fc.person_id, p.full_name AS author_name,
                    (fc.person_id = $1) AS is_mine
             FROM feed_comments fc
             JOIN persons p ON p.id = fc.person_id
             WHERE fc.post_type = $2 AND fc.post_id = $3 AND fc.is_active = true
             ORDER BY fc.created_at ASC`,
            [personId, postType, postId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error(`❌ getComments (${postType}) error:`, err.message);
        res.status(500).json({ success: false, message: 'কমেন্ট আনতে সমস্যা হয়েছে।' });
    }
};

const makeCreateCommentHandler = (postType) => async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const postId   = req.params.id;
        const body     = (req.body?.body || '').trim();

        if (!body) {
            return res.status(400).json({ success: false, message: 'কমেন্ট লিখুন।' });
        }
        if (body.length > MAX_COMMENT_LENGTH) {
            return res.status(400).json({ success: false, message: `কমেন্ট সর্বোচ্চ ${MAX_COMMENT_LENGTH} অক্ষর হতে পারে।` });
        }

        const visible = await assertVisible(postType, postId, personId);
        if (!visible) {
            return res.status(404).json({ success: false, message: 'পোস্ট পাওয়া যায়নি।' });
        }

        const result = await query(
            `INSERT INTO feed_comments (post_type, post_id, person_id, body)
             VALUES ($1, $2, $3, $4) RETURNING id, body, created_at, person_id`,
            [postType, postId, personId, body]
        );

        // author_name/is_mine যোগ করেই ফেরত — frontend-এ আলাদা GET লাগবে না
        const personRow = await query(`SELECT full_name FROM persons WHERE id = $1`, [personId]);
        res.status(201).json({
            success: true,
            data: { ...result.rows[0], author_name: personRow.rows[0]?.full_name || null, is_mine: true },
        });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error(`❌ createComment (${postType}) error:`, err.message);
        res.status(500).json({ success: false, message: 'কমেন্ট করতে সমস্যা হয়েছে।' });
    }
};

const makeDeleteCommentHandler = (postType) => async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        const { commentId } = req.params;

        // ⚠️ নিজের কমেন্ট ছাড়া মুছতে দেওয়া হয় না — post_id চেক করার দরকার
        // নেই, comment-এর owner হওয়াই যথেষ্ট শর্ত
        const result = await query(
            `UPDATE feed_comments SET is_active = false
             WHERE id = $1 AND post_type = $2 AND person_id = $3
             RETURNING id`,
            [commentId, postType, personId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'কমেন্ট পাওয়া যায়নি।' });
        }
        res.json({ success: true, message: 'কমেন্ট সরানো হয়েছে।' });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error(`❌ deleteComment (${postType}) error:`, err.message);
        res.status(500).json({ success: false, message: 'সরাতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /feed/mark-seen
// ✅ NEW (Redesign Phase ১.৯ — unread ট্র্যাকিং)
// ফিড লোড হওয়ার পর ফ্রন্টএন্ড এটা কল করবে — পরের ভিজিটে কোন পোস্টগুলো
// "নতুন" (last_seen_at-এর পরে তৈরি) তা বোঝাতে। এই কলের আগেই ফিড লোড
// হতে হবে, নাহলে এই মুহূর্তে দেখানো পোস্টগুলোও পরের বার "পুরনো" হয়ে যাবে।
// ============================================================
const markFeedSeen = async (req, res) => {
    try {
        const personId = await getPersonId(req.portalUser);
        await query(
            `INSERT INTO feed_view_state (person_id, last_seen_at) VALUES ($1, NOW())
             ON CONFLICT (person_id) DO UPDATE SET last_seen_at = NOW()`,
            [personId]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.message === 'PERSON_NOT_LINKED') {
            return res.status(404).json({ success: false, message: 'প্রোফাইল লিংক পাওয়া যায়নি।' });
        }
        logger.error('❌ markFeedSeen error:', err.message);
        res.status(500).json({ success: false, message: 'সমস্যা হয়েছে।' });
    }
};

module.exports = {
    reactToCompanyPost:  makeReactHandler('company_post'),
    reactToCustomerPost: makeReactHandler('customer_post'),
    reportCompanyPost:   makeReportHandler('company_post'),
    reportCustomerPost:  makeReportHandler('customer_post'),
    getCompanyPostComments:    makeGetCommentsHandler('company_post'),
    createCompanyPostComment:  makeCreateCommentHandler('company_post'),
    deleteCompanyPostComment:  makeDeleteCommentHandler('company_post'),
    getCustomerPostComments:   makeGetCommentsHandler('customer_post'),
    createCustomerPostComment: makeCreateCommentHandler('customer_post'),
    deleteCustomerPostComment: makeDeleteCommentHandler('customer_post'),
    markFeedSeen,
};
