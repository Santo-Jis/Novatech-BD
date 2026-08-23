// ============================================================
// backend/src/controllers/chat.controller.js
//
// Staff-সাইড চ্যাট। personal থ্রেডে দৃশ্যমানতা role অনুযায়ী:
//   worker  → শুধু নিজের assigned কাস্টমারদের থ্রেড
//   manager/supervisor → নিজের route-এর কাস্টমারদের থ্রেড
//   admin/asm/rsm/superadmin → tenant-এর সব থ্রেড
// support থ্রেডে: admin + tenant_support_agents-এ যাদের access দেওয়া আছে।
//
// ⚠️ role গ্রুপিং একটা reasonable default ধরে লেখা হয়েছে — supervisor/asm/rsm-এর
// ঠিক scope যদি এর চেয়ে আলাদা হয়, এই ফাইলের THREAD_VISIBILITY অংশ বদলে নাও।
// ============================================================

const { query } = require('../config/db')
const logger = require('../config/logger')
const { sendPushToMany } = require('../services/fcm.service')
const { sendCustomerPush } = require('../services/fcm.service')
const { mintChatToken, syncThreadParticipants } = require('../services/chatFirebase.service')

const FULL_VISIBILITY_ROLES = ['admin', 'superadmin', 'asm', 'rsm']
const TEAM_VISIBILITY_ROLES = ['manager', 'supervisor']

// GET /api/chat/firebase-token
const getFirebaseToken = async (req, res) => {
  try {
    const token = await mintChatToken(`staff:${req.user.firebase_uid || req.user.id}`)
    res.json({ success: true, data: { token } })
  } catch (e) {
    logger.error('[chat] getFirebaseToken error:', e.message)
    res.status(500).json({ success: false, message: 'Token issue করা যায়নি' })
  }
}

// GET /api/chat/threads?type=personal|support
const listThreads = async (req, res) => {
  const type = req.query.type === 'support' ? 'support' : 'personal'
  const { id: userId, role, tenantId } = req.user

  try {
    let rows
    if (type === 'support') {
      const canSeeSupport = role === 'admin' || (
        await query(`SELECT 1 FROM tenant_support_agents WHERE tenant_id=$1 AND user_id=$2`, [tenantId, userId])
      ).rowCount > 0
      if (!canSeeSupport) return res.json({ success: true, data: [] })

      ;({ rows } = await query(
        `SELECT ct.id, ct.customer_id, ct.last_message_at, ct.last_message_preview, c.shop_name, c.owner_name,
                (ct.last_message_at IS NOT NULL AND (ct.last_read_by_staff_at IS NULL OR ct.last_message_at > ct.last_read_by_staff_at)) AS unread
         FROM chat_threads ct JOIN customers c ON c.id = ct.customer_id
         WHERE ct.tenant_id = $1 AND ct.thread_type = 'support'
         ORDER BY ct.last_message_at DESC NULLS LAST`,
        [tenantId]
      ))
    } else if (FULL_VISIBILITY_ROLES.includes(role)) {
      ;({ rows } = await query(
        `SELECT ct.id, ct.customer_id, ct.last_message_at, ct.last_message_preview, c.shop_name, c.owner_name,
                (ct.last_message_at IS NOT NULL AND (ct.last_read_by_staff_at IS NULL OR ct.last_message_at > ct.last_read_by_staff_at)) AS unread
         FROM chat_threads ct JOIN customers c ON c.id = ct.customer_id
         WHERE ct.tenant_id = $1 AND ct.thread_type = 'personal'
         ORDER BY ct.last_message_at DESC NULLS LAST`,
        [tenantId]
      ))
    } else if (TEAM_VISIBILITY_ROLES.includes(role)) {
      ;({ rows } = await query(
        `SELECT ct.id, ct.customer_id, ct.last_message_at, ct.last_message_preview, c.shop_name, c.owner_name,
                (ct.last_message_at IS NOT NULL AND (ct.last_read_by_staff_at IS NULL OR ct.last_message_at > ct.last_read_by_staff_at)) AS unread
         FROM chat_threads ct
         JOIN customers c ON c.id = ct.customer_id
         JOIN customer_assignments ca ON ca.customer_id = ct.customer_id AND ca.tenant_id = ct.tenant_id AND ca.is_active = true
         JOIN routes r ON r.id = ca.route_id
         WHERE ct.tenant_id = $1 AND ct.thread_type = 'personal' AND r.manager_id = $2
         ORDER BY ct.last_message_at DESC NULLS LAST`,
        [tenantId, userId]
      ))
    } else { // worker
      ;({ rows } = await query(
        `SELECT ct.id, ct.customer_id, ct.last_message_at, ct.last_message_preview, c.shop_name, c.owner_name,
                (ct.last_message_at IS NOT NULL AND (ct.last_read_by_staff_at IS NULL OR ct.last_message_at > ct.last_read_by_staff_at)) AS unread
         FROM chat_threads ct
         JOIN customers c ON c.id = ct.customer_id
         JOIN customer_assignments ca ON ca.customer_id = ct.customer_id AND ca.tenant_id = ct.tenant_id AND ca.is_active = true
         WHERE ct.tenant_id = $1 AND ct.thread_type = 'personal' AND ca.worker_id = $2
         ORDER BY ct.last_message_at DESC NULLS LAST`,
        [tenantId, userId]
      ))
    }
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] listThreads error:', e.message)
    res.status(500).json({ success: false, message: 'থ্রেড লোড করা যায়নি' })
  }
}

// PATCH /api/chat/threads/:id/read
const markRead = async (req, res) => {
  try {
    const { rowCount } = await query(
      `UPDATE chat_threads SET last_read_by_staff_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user.tenantId]
    )
    if (!rowCount) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] markRead error:', e.message)
    res.status(500).json({ success: false, message: 'আপডেট ব্যর্থ' })
  }
}

// POST /api/chat/threads/:id/notify — body: { preview }
const notifyNewMessage = async (req, res) => {
  const { preview } = req.body
  try {
    // Phase 3 SLA — আপডেট করার আগে আগের state পড়ে নেওয়া, যাতে বোঝা যায়
    // এটা "কাস্টমারের অপেক্ষারত মেসেজের প্রথম রিপ্লাই" কিনা
    const { rows: beforeRows } = await query(
      'SELECT last_sender_type, last_message_at FROM chat_threads WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user.tenantId]
    )
    const before = beforeRows[0]

    const { rows } = await query(
      `UPDATE chat_threads
       SET last_message_at = NOW(), last_message_preview = $1, last_sender_type = 'staff'
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, thread_type, customer_id, tenant_id, person_id`,
      [String(preview || '').slice(0, 200), req.params.id, req.user.tenantId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })
    const thread = rows[0]

    // best-effort — ব্যর্থ হলেও নিচের participants-sync/push/response আটকায় না
    if (before?.last_sender_type === 'customer' && before?.last_message_at) {
      const responseSeconds = Math.max(0, Math.round((Date.now() - new Date(before.last_message_at).getTime()) / 1000))
      query(
        `INSERT INTO chat_response_events (thread_id, tenant_id, customer_message_at, staff_reply_at, response_seconds, replied_by)
         VALUES ($1, $2, $3, NOW(), $4, $5)`,
        [thread.id, thread.tenant_id, before.last_message_at, responseSeconds, req.user.id]
      ).catch((e) => logger.error('[chat] SLA event log failed (reply itself unaffected):', e.message))
    }

    // ⚠️ person_id বাদ পড়লে syncThreadParticipants "customer:undefined" লিখে RTDB-এর
    // participants map পুরোটাই .set() করে ওভাররাইট করে দিত — কাস্টমার নিজের থ্রেড থেকেই
    // লক-আউট হয়ে যেত পরবর্তী স্টাফ রিপ্লাই-এর পর (তাই RETURNING-এ person_id যোগ করা হলো)।
    await syncThreadParticipants({
      threadId: thread.id, threadType: thread.thread_type,
      tenantId: thread.tenant_id, customerId: thread.customer_id, personId: thread.person_id,
    })

    const { rows: custRows } = await query(`SELECT fcm_token FROM customers WHERE id = $1`, [thread.customer_id])
    if (custRows[0]?.fcm_token) {
      await sendCustomerPush(custRows[0].fcm_token, { title: req.user.name_bn || req.user.name_en || 'নতুন মেসেজ', body: preview, type: 'chat' })
    }

    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] notifyNewMessage error:', e.message)
    res.status(500).json({ success: false, message: 'নোটিফাই ব্যর্থ' })
  }
}

// ============================================================
// Phase 2 — চ্যাট বিজনেস কার্ড (Session 1: শুধু "বাকি/ক্রেডিট")
//
// customerPortal.controller.js-এর getCreditOverview()-এর ঠিক একই কুয়েরি/
// শেপ, শুধু req.portalUser.customer_id-এর বদলে :customerId প্যারাম দিয়ে,
// আর স্টাফের নিজের tenant_id দিয়ে verify করা (নিচের নোট দেখুন)।
// ============================================================

// GET /api/chat/cards/due/:customerId
//
// ⚠️ নিরাপত্তা নোট: creditReminder.controller.js-এর sendCreditReminder() আর
// delivery.controller.js-এর getCustomerDeliveries() — এই দুটোতেই customer_id
// লুকআপে tenant_id চেক নেই (শুধু id = $1) — মানে অন্য tenant-এর customer_id
// আন্দাজ/জানা থাকলে সেই কাস্টমারের বাকি/ডেলিভারি তথ্য পড়া সম্ভব। এখানে সেই
// প্যাটার্ন কপি না করে tenant_id = $2 এক্সপ্লিসিট রাখা হলো (chat.controller.js-এর
// বাকি সব ফাংশনের established pattern অনুযায়ী)। sendCreditReminder/
// getCustomerDeliveries-এ একই ফিক্স করা এই সেশনের স্কোপের বাইরে, কিন্তু
// README-তে ফ্ল্যাগ করা আছে।
const getCustomerDueCard = async (req, res) => {
  try {
    const { customerId } = req.params
    const { tenantId } = req.user

    const { rows } = await query(
      `SELECT id, shop_name, owner_name, credit_limit, current_credit,
              GREATEST(0, credit_limit - current_credit) AS available_credit,
              CASE WHEN credit_limit > 0
                   THEN ROUND((current_credit::numeric / credit_limit) * 100, 1)
                   ELSE 0 END AS utilization_pct
       FROM customers
       WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [customerId, tenantId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'কাস্টমার পাওয়া যায়নি' })

    const c = rows[0]
    const pct = parseFloat(c.utilization_pct)
    let status = 'healthy'
    if (pct >= 100) status = 'exceeded'
    else if (pct >= 80) status = 'critical'
    else if (pct >= 50) status = 'warning'

    res.json({ success: true, data: { ...c, status } })
  } catch (e) {
    logger.error('[chat] getCustomerDueCard error:', e.message)
    res.status(500).json({ success: false, message: 'তথ্য আনতে সমস্যা হয়েছে' })
  }
}

// ============================================================
// Phase 3 — টিম লেয়ার (Session 1: ইন্টারনাল নোট/@মেনশন)
//
// ⚠️ ইচ্ছাকৃতভাবে chat_threads/messages (RTDB) থেকে সম্পূর্ণ আলাদা — দেখুন
// migration_chat_internal_notes.sql-এর টপ কমেন্ট। কাস্টমার-facing কোনো
// এন্ডপয়েন্ট/কোড পাথ থেকে এই ফাংশনগুলো কখনো কল হয় না।
// ============================================================

// GET /api/chat/threads/:id/notes
const listInternalNotes = async (req, res) => {
  try {
    const { id: threadId } = req.params
    const { tenantId } = req.user

    const threadCheck = await query('SELECT id FROM chat_threads WHERE id = $1 AND tenant_id = $2', [threadId, tenantId])
    if (!threadCheck.rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })

    const { rows } = await query(
      `SELECT id, author_id, author_name, text, mentioned_user_ids, created_at
       FROM chat_internal_notes WHERE thread_id = $1 ORDER BY created_at ASC`,
      [threadId]
    )
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] listInternalNotes error:', e.message)
    res.status(500).json({ success: false, message: 'নোট আনতে সমস্যা হয়েছে' })
  }
}

// POST /api/chat/threads/:id/notes   body: { text, mentionedUserIds?: string[] }
const addInternalNote = async (req, res) => {
  try {
    const { id: threadId } = req.params
    const { text, mentionedUserIds = [] } = req.body
    const { id: userId, tenantId, name_bn: authorName } = req.user

    if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'নোট খালি রাখা যাবে না' })

    const threadCheck = await query('SELECT id FROM chat_threads WHERE id = $1 AND tenant_id = $2', [threadId, tenantId])
    if (!threadCheck.rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })

    const { rows } = await query(
      `INSERT INTO chat_internal_notes (thread_id, tenant_id, author_id, author_name, text, mentioned_user_ids)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, author_id, author_name, text, mentioned_user_ids, created_at`,
      [threadId, tenantId, userId, authorName || 'স্টাফ', text.trim(), mentionedUserIds]
    )
    const note = rows[0]

    // মেনশন পুশ — নোট সেভ হয়ে যাওয়ার পরে, ব্যর্থ হলেও নোট সেভ থাকে (best-effort)
    if (mentionedUserIds.length) {
      sendPushToMany(mentionedUserIds, {
        title: `${authorName || 'একজন সহকর্মী'} আপনাকে মেনশন করেছেন`,
        body: text.trim().slice(0, 100),
        type: 'chat_note_mention',
        data: { threadId },
      }).catch((e) => logger.error('[chat] mention push failed (note saved regardless):', e.message))
    }

    res.status(201).json({ success: true, data: note })
  } catch (e) {
    logger.error('[chat] addInternalNote error:', e.message)
    res.status(500).json({ success: false, message: 'নোট সেভ করতে সমস্যা হয়েছে' })
  }
}

// GET /api/chat/team-members — @মেনশন অটোকমপ্লিটের জন্য
const listTeamMembers = async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user
    const { rows } = await query(
      `SELECT id, name_bn, name_en, role FROM users
       WHERE tenant_id = $1 AND is_active = true AND id != $2
       ORDER BY name_bn ASC`,
      [tenantId, userId]
    )
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] listTeamMembers error:', e.message)
    res.status(500).json({ success: false, message: 'টিম মেম্বার আনতে সমস্যা হয়েছে' })
  }
}

// ============================================================
// Phase 3, Session 2 — SLA ড্যাশবোর্ড + অডিট ট্রেইল
// ============================================================

// GET /api/chat/sla/stats?days=7
const getSlaStats = async (req, res) => {
  try {
    const { tenantId } = req.user
    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7))

    const { rows: summaryRows } = await query(
      `SELECT
         COUNT(*)::int AS reply_count,
         COALESCE(ROUND(AVG(response_seconds)), 0)::int AS avg_seconds,
         COALESCE((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_seconds)), 0)::int AS median_seconds
       FROM chat_response_events
       WHERE tenant_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval`,
      [tenantId, days]
    )

    const { rows: byStaffRows } = await query(
      `SELECT u.id, u.name_bn, u.name_en,
              COUNT(*)::int AS reply_count,
              COALESCE(ROUND(AVG(cre.response_seconds)), 0)::int AS avg_seconds
       FROM chat_response_events cre
       JOIN users u ON u.id = cre.replied_by
       WHERE cre.tenant_id = $1 AND cre.created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY u.id, u.name_bn, u.name_en
       ORDER BY avg_seconds ASC`,
      [tenantId, days]
    )

    // এখনো-অনুত্তরিত থ্রেড — কতক্ষণ ধরে অপেক্ষা করছে (personal + support দুটোই)
    const { rows: pendingRows } = await query(
      `SELECT ct.id, ct.thread_type, c.shop_name, c.owner_name, ct.last_message_at,
              EXTRACT(EPOCH FROM (NOW() - ct.last_message_at))::int AS waiting_seconds
       FROM chat_threads ct JOIN customers c ON c.id = ct.customer_id
       WHERE ct.tenant_id = $1 AND ct.last_sender_type = 'customer'
       ORDER BY ct.last_message_at ASC LIMIT 20`,
      [tenantId]
    )

    res.json({ success: true, data: { summary: summaryRows[0], byStaff: byStaffRows, pending: pendingRows } })
  } catch (e) {
    logger.error('[chat] getSlaStats error:', e.message)
    res.status(500).json({ success: false, message: 'পরিসংখ্যান আনতে সমস্যা হয়েছে' })
  }
}

// POST /api/chat/threads/:id/flag   body: { clientId, flagType, text }
const flagMessage = async (req, res) => {
  try {
    const { id: threadId } = req.params
    const { clientId, flagType, text } = req.body
    const { id: userId, tenantId, name_bn: staffName } = req.user

    if (!['price_quote', 'payment_promise'].includes(flagType)) {
      return res.status(400).json({ success: false, message: 'অজানা ফ্ল্যাগ টাইপ' })
    }
    if (!clientId || !text) return res.status(400).json({ success: false, message: 'অসম্পূর্ণ তথ্য' })

    const threadCheck = await query('SELECT id FROM chat_threads WHERE id = $1 AND tenant_id = $2', [threadId, tenantId])
    if (!threadCheck.rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })

    const { rows } = await query(
      `INSERT INTO chat_flagged_messages (thread_id, tenant_id, message_client_id, flag_type, message_text, flagged_by, flagged_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, flag_type, message_text, created_at`,
      [threadId, tenantId, clientId, flagType, String(text).slice(0, 1000), userId, staffName || 'স্টাফ']
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (e) {
    logger.error('[chat] flagMessage error:', e.message)
    res.status(500).json({ success: false, message: 'ফ্ল্যাগ করতে সমস্যা হয়েছে' })
  }
}

// GET /api/chat/flagged?days=30 — অডিট/এক্সপোর্ট ভিউ
const listFlaggedMessages = async (req, res) => {
  try {
    const { tenantId } = req.user
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30))

    const { rows } = await query(
      `SELECT fm.id, fm.flag_type, fm.message_text, fm.flagged_by_name, fm.created_at,
              ct.thread_type, c.shop_name, c.owner_name
       FROM chat_flagged_messages fm
       JOIN chat_threads ct ON ct.id = fm.thread_id
       JOIN customers c ON c.id = ct.customer_id
       WHERE fm.tenant_id = $1 AND fm.created_at >= NOW() - ($2 || ' days')::interval
       ORDER BY fm.created_at DESC`,
      [tenantId, days]
    )
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] listFlaggedMessages error:', e.message)
    res.status(500).json({ success: false, message: 'তালিকা আনতে সমস্যা হয়েছে' })
  }
}

// ============================================================
// Phase 3, Session 3 — ব্রডকাস্ট/ক্যাম্পেইন
//
// ⚠️ ডিজাইন সিদ্ধান্ত: শুধু যাদের ইতিমধ্যে personal chat_thread আছে তাদেরই
// পাঠানো যায় — নতুন থ্রেড staff-সাইড থেকে তৈরি করা হয় না (থ্রেড তৈরি হয়
// customer-এর ensureThreads() দিয়ে, assigned-SR resolution লজিক-সহ; সেটা
// staff-সাইডে ডুপ্লিকেট/রিস্ক না নিয়ে, থ্রেড-নেই এমন কাস্টমারদের "স্কিপড"
// হিসেবে দেখানো হয়, ফ্রন্টএন্ডে)। আসল মেসেজ পাঠানো (RTDB write) ক্লায়েন্ট-
// সাইড থেকেই হয়, বাকি চ্যাটের মতোই — ব্যাকএন্ড শুধু recipient resolve +
// audit log করে।
// ============================================================

// POST /api/chat/broadcast/resolve   body: { customerIds: string[] }
const resolveBroadcastRecipients = async (req, res) => {
  try {
    const { customerIds } = req.body
    const { tenantId } = req.user
    if (!Array.isArray(customerIds) || !customerIds.length) {
      return res.status(400).json({ success: false, message: 'কাস্টমার তালিকা দিন' })
    }
    const { rows } = await query(
      `SELECT c.id AS customer_id, c.shop_name, c.owner_name, ct.id AS thread_id
       FROM customers c
       LEFT JOIN chat_threads ct
         ON ct.customer_id = c.id AND ct.tenant_id = c.tenant_id AND ct.thread_type = 'personal'
       WHERE c.id = ANY($1::uuid[]) AND c.tenant_id = $2`,
      [customerIds, tenantId]
    )
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] resolveBroadcastRecipients error:', e.message)
    res.status(500).json({ success: false, message: 'রেসিপিয়েন্ট রিজলভ করতে সমস্যা হয়েছে' })
  }
}

// POST /api/chat/broadcast/log   body: { text, totalRecipients, successCount }
const logBroadcast = async (req, res) => {
  try {
    const { text, totalRecipients, successCount } = req.body
    const { id: userId, tenantId, name_bn: senderName } = req.user
    const { rows } = await query(
      `INSERT INTO chat_broadcasts (tenant_id, sender_id, sender_name, text, total_recipients, success_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [tenantId, userId, senderName || 'স্টাফ', String(text || '').slice(0, 1000), totalRecipients || 0, successCount || 0]
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (e) {
    logger.error('[chat] logBroadcast error:', e.message)
    res.status(500).json({ success: false, message: 'লগ সেভ করতে সমস্যা হয়েছে' })
  }
}

// ── Support agent management (admin-only, route-level allowRoles দিয়ে গার্ড করা) ──

const listSupportAgents = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT tsa.user_id, u.name_bn, u.name_en, u.role
       FROM tenant_support_agents tsa JOIN users u ON u.id = tsa.user_id
       WHERE tsa.tenant_id = $1`,
      [req.user.tenantId]
    )
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] listSupportAgents error:', e.message)
    res.status(500).json({ success: false, message: 'লোড ব্যর্থ' })
  }
}

const addSupportAgent = async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ success: false, message: 'userId দরকার' })
  try {
    await query(
      `INSERT INTO tenant_support_agents (tenant_id, user_id, added_by)
       VALUES ($1,$2,$3) ON CONFLICT (tenant_id, user_id) DO NOTHING`,
      [req.user.tenantId, userId, req.user.id]
    )
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] addSupportAgent error:', e.message)
    res.status(500).json({ success: false, message: 'যোগ করা যায়নি' })
  }
}

const removeSupportAgent = async (req, res) => {
  try {
    await query(`DELETE FROM tenant_support_agents WHERE tenant_id = $1 AND user_id = $2`, [req.user.tenantId, req.params.userId])
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] removeSupportAgent error:', e.message)
    res.status(500).json({ success: false, message: 'বাদ দেওয়া যায়নি' })
  }
}

module.exports = {
  getFirebaseToken, listThreads, markRead, notifyNewMessage,
  listSupportAgents, addSupportAgent, removeSupportAgent,
  getCustomerDueCard,
  listInternalNotes, addInternalNote, listTeamMembers,
  getSlaStats, flagMessage, listFlaggedMessages,
  resolveBroadcastRecipients, logBroadcast,
}
