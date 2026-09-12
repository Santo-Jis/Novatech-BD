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
const { mintChatToken, syncThreadParticipants, setThreadBlockMeta } = require('../services/chatFirebase.service')
const { callAI } = require('../services/ai.service')
const { AIAccessBlockedError } = require('../services/tenantAI.service')
const {
  buildDraftReplyPrompt, buildSummaryPrompt, buildRiskCheckPrompt,
  parseRiskCheckResponse, RISK_CHECK_TOOL, parseRiskCheckToolCall,
} = require('../services/chatAI.service')
const { uploadAudioToCloudinary } = require('../services/chatMedia.service')

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

// POST /api/chat/threads/:id/notify — body: { preview, clientId?, senderName?, text?, kind? }
const notifyNewMessage = async (req, res) => {
  const { preview, clientId, senderName, text, kind } = req.body
  try {
    // Block/report ধাপ — RTDB write ততক্ষণে হয়ে গেছে (client-side, ব্যাকএন্ডকে
    // বাইপাস করে), তাই এই চেক আসল ডেলিভারি আটকায় না — কিন্তু notify() এর পরের
    // সব side-effect (SLA event, dual-write, push notification) আটকে দেয়, আর
    // ফ্রন্টএন্ডকে জানিয়ে দেয় থ্রেড ব্লকড যাতে পরের বার কম্পোজ বক্সই দেখা না যায়।
    const { rows: blockRows } = await query('SELECT 1 FROM chat_blocks WHERE thread_id = $1', [req.params.id])
    if (blockRows.length) {
      return res.status(403).json({ success: false, message: 'এই কথোপকথন ব্লক করা আছে', blocked: true })
    }

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

    // Phase 2 (Foundation) — dual-write: RTDB-ই এখনো আসল ডেলিভারি, এটা শুধু
    // search/audit/AI-grounding-এর জন্য Postgres-এ একটা কপি রাখা। best-effort +
    // ব্যাকওয়ার্ড-কম্প্যাটিবল: clientId না থাকলে (পুরোনো ফ্রন্টএন্ড বান্ডেল থেকে কল
    // হলে) নিঃশব্দে স্কিপ হয়। ON CONFLICT দিয়ে notify() রিট্রাই হলেও ডুপ্লিকেট হবে না।
    if (clientId) {
      query(
        `INSERT INTO chat_messages (thread_id, tenant_id, client_id, sender_type, sender_id, sender_name, kind, text)
         VALUES ($1, $2, $3, 'staff', $4, $5, $6, $7)
         ON CONFLICT (thread_id, client_id) DO NOTHING`,
        [thread.id, thread.tenant_id, clientId, String(req.user.id), senderName || req.user.name_bn || 'স্টাফ', kind || 'text', text != null ? String(text).slice(0, 4000) : null]
      ).catch((e) => logger.error('[chat] message dual-write failed (delivery unaffected):', e.message))
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
// ✅ ২০২৬-০৯-০৩ আপডেট: এই কমেন্টে flagged দুটো ফাংশনই (creditReminder.controller.js-এর
// sendCreditReminder(), delivery.controller.js-এর getCustomerDeliveries()) এখন
// tenant_id = req.tenantId চেক করে ফিক্সড — এই ফাংশনের established pattern-ই
// ওখানে অ্যাপ্লাই করা হয়েছে। বিস্তারিত সেই দুই ফাইলের নিজ নিজ কমেন্টে।
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

    // ✅ ২০২৬-০৯-০৩: credit_risk/complaint যোগ — chat_ai_flags migration-এ DB
    // constraint আগেই আপডেট হয়েছিল, কিন্তু এই validation list পুরনোই থেকে
    // গিয়েছিল। ফলে AICopilotMenu-এর risk-check থেকে "flag করুন" চাপলে DB-তে
    // পৌঁছানোর আগেই এখানে ৪০০ দিয়ে আটকে যেত — AI-detected flag কখনো audit
    // টেবিলে জমা হতো না (দেখুন CHAT_REDESIGN_ROADMAP.md ধাপ ১-এর ফাইন্ডিং)।
    if (!['price_quote', 'payment_promise', 'credit_risk', 'complaint'].includes(flagType)) {
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

// ============================================================
// Phase 4 — ইন্টেলিজেন্স লেয়ার (AI কোপাইলট)
//
// ⚠️ তিনটাই on-demand/staff-triggered — "অটো" না। tenantAI.service.js-এর
// resolveAIAccess() (BYOK/platform-key/wallet) callAI()-এর ভেতরেই হয়,
// প্রতি-মেসেজে অটোমেটিক AI কল হলে wallet নিঃশব্দে শেষ হয়ে যেতে পারত —
// তাই staff স্পষ্ট বাটন চাপলেই কল হয়, ঠিক যেমন customerAiChat.controller.js
// প্যাটার্ন অনুসরণ করে (callAI + AIAccessBlockedError re-throw)।
//
// মেসেজ-হিস্ট্রি RTDB থেকে ব্যাকএন্ড নিজে টানে না — ফ্রন্টএন্ড তার লাইভ
// engine.messages থেকে recentMessages হিসেবে পাঠায় (body-তে)।
// ============================================================

function handleAIError(e, res, label) {
  if (e instanceof AIAccessBlockedError) {
    logger.warn(`[chat-ai] ${label} blocked:`, e.message)
    return res.status(403).json({ success: false, message: e.message, error_code: e.code })
  }
  logger.error(`[chat-ai] ${label} error:`, e.message)
  const status = e.response?.status
  const msg = status === 429 ? 'একটু পরে আবার চেষ্টা করুন।' : 'AI ফিচারে সমস্যা হয়েছে।'
  return res.status(500).json({ success: false, message: msg })
}

// POST /api/chat/ai/draft-reply   body: { recentMessages: [], customerName }
const draftReply = async (req, res) => {
  try {
    const { recentMessages, customerName } = req.body
    if (!Array.isArray(recentMessages) || !recentMessages.length) {
      return res.status(400).json({ success: false, message: 'কথোপকথনের ইতিহাস দিন' })
    }
    const prompt = buildDraftReplyPrompt(recentMessages, customerName)
    const result = await callAI(prompt, 'daily', null, [], { tenantId: req.user.tenantId, userId: req.user.id, source: 'chat_draft_reply' })
    res.json({ success: true, data: { reply: result.text.trim() } })
  } catch (e) {
    handleAIError(e, res, 'draftReply')
  }
}

// POST /api/chat/ai/summarize   body: { recentMessages: [], customerName }
const summarizeThread = async (req, res) => {
  try {
    const { recentMessages, customerName } = req.body
    if (!Array.isArray(recentMessages) || !recentMessages.length) {
      return res.status(400).json({ success: false, message: 'কথোপকথনের ইতিহাস দিন' })
    }
    const prompt = buildSummaryPrompt(recentMessages, customerName)
    const result = await callAI(prompt, 'daily', null, [], { tenantId: req.user.tenantId, userId: req.user.id, source: 'chat_summarize' })
    res.json({ success: true, data: { summary: result.text.trim() } })
  } catch (e) {
    handleAIError(e, res, 'summarizeThread')
  }
}

// POST /api/chat/ai/risk-check   body: { recentMessages: [], customerName }
const checkRisk = async (req, res) => {
  try {
    const { recentMessages, customerName } = req.body
    if (!Array.isArray(recentMessages) || !recentMessages.length) {
      return res.status(400).json({ success: false, message: 'কথোপকথনের ইতিহাস দিন' })
    }
    const prompt = buildRiskCheckPrompt(recentMessages, customerName)
    const result = await callAI(prompt, 'daily', null, [], {
      tenantId: req.user.tenantId, userId: req.user.id, source: 'chat_risk_check',
      tools: [RISK_CHECK_TOOL], // ✅ ২০২৬-০৯-০৩: structured tool-call প্রাইমারি পাথ
    })
    // মডেল tool ব্যবহার করলে সেটাই নির্ভরযোগ্য উৎস; না করলে (কিছু ফ্রি মডেল
    // tool ignore করে শুধু টেক্সট লেখে) regex-ভিত্তিক পুরনো পার্সার fallback —
    // দেখুন chatAI.service.js-এর কমেন্ট।
    const parsed = (result.type === 'tool_calls' && parseRiskCheckToolCall(result.toolCalls))
      || parseRiskCheckResponse(result.text)
    res.json({ success: true, data: parsed })
  } catch (e) {
    handleAIError(e, res, 'checkRisk')
  }
}

// ============================================================
// Phase 1 (দেরিতে সম্পূর্ণ হচ্ছে) — ভয়েস নোট আপলোড
//
// শুধু আপলোড + URL রিটার্ন — RTDB-তে kind:'voice' মেসেজ পাঠানো ফ্রন্টএন্ড
// নিজেই করে (useChatEngine.sendVoice, ঠিক sendCard()-এর প্যাটার্নেই)।
// অফলাইন-কিউ সাপোর্ট নেই ইচ্ছাকৃতভাবে — বাইনারি ফাইল আপলোড অফলাইনে কিউ করা
// (আর পরে রিলায়েবলি রিট্রাই করা) টেক্সট/কার্ডের চেয়ে অনেক বেশি জটিল;
// মাইক বাটন অফলাইনে ডিজেবল থাকবে ফ্রন্টএন্ডে (স্পষ্ট, সৎ সীমাবদ্ধতা)।
// ============================================================

// POST /api/chat/threads/:id/voice   multipart: audio (file), body: { durationSeconds }
const uploadVoiceNote = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'অডিও ফাইল দিন' })
    const { id: threadId } = req.params
    const { tenantId } = req.user
    const durationSeconds = Math.min(600, Math.max(1, parseInt(req.body.durationSeconds) || 0))

    const threadCheck = await query('SELECT id FROM chat_threads WHERE id = $1 AND tenant_id = $2', [threadId, tenantId])
    if (!threadCheck.rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })

    const filename = `voice_${threadId}_${Date.now()}`
    const url = await uploadAudioToCloudinary(req.file.buffer, `chat-voice/${tenantId}`, filename, req.file.mimetype)
    if (!url) return res.status(500).json({ success: false, message: 'আপলোড ব্যর্থ হয়েছে' })

    res.json({ success: true, data: { url, durationSeconds } })
  } catch (e) {
    logger.error('[chat] uploadVoiceNote error:', e.message)
    res.status(500).json({ success: false, message: 'ভয়েস নোট আপলোড করতে সমস্যা হয়েছে' })
  }
}

// ── Block / Report (ধাপ ২, Foundation) ──────────────────────────────────
//
// block: যেকোনো authenticated staff তৈরি করতে পারে (route-এ শুধু `auth`),
// কিন্তু unblock ইচ্ছাকৃতভাবে management-only (route-এ `isManagement` দিয়ে
// গার্ড করা) — যে ব্লক করল সে নিজেই একতরফা আনব্লক করতে পারবে না।
//
// ⚠️ এনফোর্সমেন্ট শুধু notify()-তে (Postgres chat_blocks চেক করে) আর RTDB
// meta-তে (ফ্রন্টএন্ড UI গেট) — আসল RTDB write client-side সরাসরি হয় বলে,
// ম্যালিশাস ক্লায়েন্ট এই দুটোই বাইপাস করতে পারে যদি না Firebase Security
// Rules-এও একই চেক থাকে (সেটা এই টুলসেট দিয়ে কনফিগার করা সম্ভব না)।
const blockThread = async (req, res) => {
  const { reason } = req.body
  try {
    const { rows } = await query(
      'SELECT id, tenant_id FROM chat_threads WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user.tenantId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })
    const thread = rows[0]

    await query(
      `INSERT INTO chat_blocks (thread_id, tenant_id, blocked_by_type, blocked_by_id, blocked_by_name, reason)
       VALUES ($1, $2, 'staff', $3, $4, $5)
       ON CONFLICT (thread_id) DO NOTHING`,
      [thread.id, thread.tenant_id, req.user.id, req.user.name_bn || 'স্টাফ', reason || null]
    )
    await setThreadBlockMeta(thread.id, { by: 'staff', byName: req.user.name_bn || 'স্টাফ', reason: reason || null, at: Date.now() })

    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] blockThread error:', e.message)
    res.status(500).json({ success: false, message: 'ব্লক করা যায়নি' })
  }
}

const unblockThread = async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM chat_blocks WHERE thread_id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.user.tenantId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'এই থ্রেড ব্লকড নেই' })
    await setThreadBlockMeta(req.params.id, null)
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] unblockThread error:', e.message)
    res.status(500).json({ success: false, message: 'আনব্লক করা যায়নি' })
  }
}

const REPORT_CATEGORIES = ['abusive', 'spam', 'harassment', 'other']

const reportThread = async (req, res) => {
  const { category, note, messageClientId } = req.body
  if (!REPORT_CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'সঠিক ক্যাটাগরি দরকার' })
  }
  try {
    const { rows } = await query(
      'SELECT id, tenant_id FROM chat_threads WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user.tenantId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })
    const thread = rows[0]

    await query(
      `INSERT INTO chat_reports (thread_id, tenant_id, message_client_id, reporter_type, reporter_id, reporter_name, category, note)
       VALUES ($1, $2, $3, 'staff', $4, $5, $6, $7)`,
      [thread.id, thread.tenant_id, messageClientId || null, req.user.id, req.user.name_bn || 'স্টাফ', category, note || null]
    )
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] reportThread error:', e.message)
    res.status(500).json({ success: false, message: 'রিপোর্ট পাঠানো যায়নি' })
  }
}

// ── Canned Responses (ধাপ ২, Foundation) ──────────────────────────────
//
// ⚠️ এটা platformSupport.controller.js-এর support_canned_responses থেকে
// ইচ্ছাকৃতভাবে আলাদা টেবিল/ফিচার — ওটা Novatech-BD-এর platform_staff টিমের
// জন্য (tenant ব্যবসাকে সাপোর্ট), এটা tenant-এর নিজের staff-এর জন্য (retail
// কাস্টমারকে চ্যাটে দ্রুত রিপ্লাই)। দুটো ভিন্ন ডোমেইন, conflate করা হয়নি।
//
// list: যেকোনো staff। create/delete: isManagement-only (route-level) —
// unblock-এর মতোই একই যুক্তি, টেমপ্লেট লিস্ট এলোমেলো না হয়ে যাক।
const listCannedResponses = async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, title, body FROM chat_canned_responses WHERE tenant_id = $1 ORDER BY title ASC',
      [req.user.tenantId]
    )
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] listCannedResponses error:', e.message)
    res.status(500).json({ success: false, message: 'লোড করা যায়নি' })
  }
}

const createCannedResponse = async (req, res) => {
  const { title, body } = req.body
  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({ success: false, message: 'title ও body দুটোই দিতে হবে' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO chat_canned_responses (tenant_id, title, body, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, title, body`,
      [req.user.tenantId, title.trim(), body.trim(), req.user.id]
    )
    res.status(201).json({ success: true, data: rows[0] })
  } catch (e) {
    logger.error('[chat] createCannedResponse error:', e.message)
    res.status(500).json({ success: false, message: 'তৈরি করা যায়নি' })
  }
}

const deleteCannedResponse = async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM chat_canned_responses WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.user.tenantId]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'পাওয়া যায়নি' })
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] deleteCannedResponse error:', e.message)
    res.status(500).json({ success: false, message: 'মুছে ফেলা যায়নি' })
  }
}

// ── Message Search (ধাপ ২, Foundation) ──────────────────────────────────
//
// chat_messages-এর dual-write-এর উপর নির্ভরশীল — dual-write ডিপ্লয়ের আগের
// মেসেজগুলো এখানে থাকবে না (RTDB-তে আছে, কিন্তু Postgres-এ কপি হয়নি)। নতুন
// মেসেজ থেকে ধীরে ধীরে সার্চেবল হয়ে উঠবে।
//
// ILIKE (substring, স্বজ্ঞাত) আর pg_trgm-এর % অপারেটর (টাইপো-সহনশীল fuzzy
// match) — দুটোই OR করা, দুটোই chat_messages-এর GIN trgm ইনডেক্স ব্যবহার
// করে (সিকোয়েনশিয়াল স্ক্যান হয় না)। similarity() দিয়ে র‍্যাঙ্ক করা, recency
// টাইব্রেকার।
const searchMessages = async (req, res) => {
  const q = String(req.query.q || '').trim()
  const { threadId } = req.query
  if (q.length < 2) return res.status(400).json({ success: false, message: 'অন্তত ২ অক্ষর লিখুন' })

  try {
    const params = [q, req.user.tenantId]
    let threadFilter = ''
    if (threadId) {
      params.push(threadId)
      threadFilter = `AND cm.thread_id = $${params.length}`
    }

    const { rows } = await query(
      `SELECT cm.id, cm.thread_id, cm.sender_type, cm.sender_name, cm.text, cm.created_at,
              ct.thread_type, c.shop_name, c.owner_name
       FROM chat_messages cm
       JOIN chat_threads ct ON ct.id = cm.thread_id
       LEFT JOIN customers c ON c.id = ct.customer_id
       WHERE cm.tenant_id = $2 AND (cm.text ILIKE '%' || $1 || '%' OR cm.text % $1) ${threadFilter}
       ORDER BY similarity(cm.text, $1) DESC, cm.created_at DESC
       LIMIT 30`,
      params
    )
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] searchMessages error:', e.message)
    res.status(500).json({ success: false, message: 'সার্চ করা যায়নি' })
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
  draftReply, summarizeThread, checkRisk,
  uploadVoiceNote,
  blockThread, unblockThread, reportThread,
  listCannedResponses, createCannedResponse, deleteCannedResponse,
  searchMessages,
}
