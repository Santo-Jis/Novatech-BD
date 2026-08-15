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
  const { id: userId, role, tenant_id: tenantId } = req.user

  try {
    let rows
    if (type === 'support') {
      const canSeeSupport = role === 'admin' || (
        await query(`SELECT 1 FROM tenant_support_agents WHERE tenant_id=$1 AND user_id=$2`, [tenantId, userId])
      ).rowCount > 0
      if (!canSeeSupport) return res.json({ success: true, data: [] })

      ;({ rows } = await query(
        `SELECT ct.id, ct.last_message_at, ct.last_message_preview, c.shop_name, c.owner_name,
                (ct.last_message_at IS NOT NULL AND (ct.last_read_by_staff_at IS NULL OR ct.last_message_at > ct.last_read_by_staff_at)) AS unread
         FROM chat_threads ct JOIN customers c ON c.id = ct.customer_id
         WHERE ct.tenant_id = $1 AND ct.thread_type = 'support'
         ORDER BY ct.last_message_at DESC NULLS LAST`,
        [tenantId]
      ))
    } else if (FULL_VISIBILITY_ROLES.includes(role)) {
      ;({ rows } = await query(
        `SELECT ct.id, ct.last_message_at, ct.last_message_preview, c.shop_name, c.owner_name,
                (ct.last_message_at IS NOT NULL AND (ct.last_read_by_staff_at IS NULL OR ct.last_message_at > ct.last_read_by_staff_at)) AS unread
         FROM chat_threads ct JOIN customers c ON c.id = ct.customer_id
         WHERE ct.tenant_id = $1 AND ct.thread_type = 'personal'
         ORDER BY ct.last_message_at DESC NULLS LAST`,
        [tenantId]
      ))
    } else if (TEAM_VISIBILITY_ROLES.includes(role)) {
      ;({ rows } = await query(
        `SELECT ct.id, ct.last_message_at, ct.last_message_preview, c.shop_name, c.owner_name,
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
        `SELECT ct.id, ct.last_message_at, ct.last_message_preview, c.shop_name, c.owner_name,
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
      [req.params.id, req.user.tenant_id]
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
    const { rows } = await query(
      `UPDATE chat_threads
       SET last_message_at = NOW(), last_message_preview = $1, last_sender_type = 'staff'
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, thread_type, customer_id, tenant_id, person_id`,
      [String(preview || '').slice(0, 200), req.params.id, req.user.tenant_id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })
    const thread = rows[0]

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

// ── Support agent management (admin-only, route-level allowRoles দিয়ে গার্ড করা) ──

const listSupportAgents = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT tsa.user_id, u.name_bn, u.name_en, u.role
       FROM tenant_support_agents tsa JOIN users u ON u.id = tsa.user_id
       WHERE tsa.tenant_id = $1`,
      [req.user.tenant_id]
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
      [req.user.tenant_id, userId, req.user.id]
    )
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] addSupportAgent error:', e.message)
    res.status(500).json({ success: false, message: 'যোগ করা যায়নি' })
  }
}

const removeSupportAgent = async (req, res) => {
  try {
    await query(`DELETE FROM tenant_support_agents WHERE tenant_id = $1 AND user_id = $2`, [req.user.tenant_id, req.params.userId])
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] removeSupportAgent error:', e.message)
    res.status(500).json({ success: false, message: 'বাদ দেওয়া যায়নি' })
  }
}

module.exports = {
  getFirebaseToken, listThreads, markRead, notifyNewMessage,
  listSupportAgents, addSupportAgent, removeSupportAgent,
}
