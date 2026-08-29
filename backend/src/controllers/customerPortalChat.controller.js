// ============================================================
// backend/src/controllers/customerPortalChat.controller.js
//
// Customer portal-এর চ্যাট — personal (assigned SR) + support (company-wide)।
// ✅ ConnectionsTab/ComplaintsTab-এর মতোই প্যাটার্ন: company session switch
// ছাড়াই, person_id + connectionId দিয়ে যেকোনো কোম্পানির থ্রেডে অ্যাক্সেস —
// তাই req.tenantId-এর বদলে connectionId body/param থেকে নেওয়া হয়।
//
// মেসেজ কনটেন্ট RTDB-তে সরাসরি client থেকে লেখা হয় (Firebase custom token
// দিয়ে sign in করে, person_id-ভিত্তিক identity — তাই একই sign-in সব
// কোম্পানির থ্রেডেই কাজ করবে)। এখানে শুধু থ্রেড lifecycle, অথরাইজেশন,
// আর notify-on-message (Postgres metadata sync + push)।
// ============================================================

const { query } = require('../config/db')
const logger = require('../config/logger')
const { sendPushToMany } = require('../services/fcm.service')
const { mintChatToken, syncThreadParticipants, resolveSupportStaffIds, resolvePersonalStaffIds } = require('../services/chatFirebase.service')
const { uploadAudioToCloudinary } = require('../services/chatMedia.service')

// GET /api/portal/chat/firebase-token — person_id-ভিত্তিক, সব কোম্পানিতে একই identity
const getFirebaseToken = async (req, res) => {
  try {
    const token = await mintChatToken(`customer:${req.portalUser.person_id}`)
    res.json({ success: true, data: { token } })
  } catch (e) {
    logger.error('[chat] getFirebaseToken error:', e.message)
    res.status(500).json({ success: false, message: 'Token issue করা যায়নি' })
  }
}

// এই connectionId-র personal+support থ্রেড আছে কিনা দেখে, না থাকলে বানায়
// POST /api/portal/chat/threads/ensure   body: { connectionId }
const ensureThreads = async (req, res) => {
  const { person_id } = req.portalUser
  const { connectionId } = req.body
  if (!connectionId) return res.status(400).json({ success: false, message: 'connectionId দরকার' })

  try {
    // মালিকানা যাচাই — এই connection সত্যিই এই person-এর কিনা
    const { rows: connRows } = await query(
      `SELECT id, tenant_id, customer_id FROM customer_company_connections
       WHERE id = $1 AND person_id = $2`,
      [connectionId, person_id]
    )
    if (!connRows.length) {
      return res.status(403).json({ success: false, message: 'এই connection তোমার না' })
    }
    const { tenant_id: tenantId, customer_id: customerId } = connRows[0]

    const { rows } = await query(
      `INSERT INTO chat_threads (tenant_id, connection_id, customer_id, person_id, thread_type)
       VALUES ($1,$2,$3,$4,'personal'), ($1,$2,$3,$4,'support')
       ON CONFLICT (connection_id, thread_type) DO UPDATE SET thread_type = EXCLUDED.thread_type
       RETURNING id, thread_type`,
      [tenantId, connectionId, customerId, person_id]
    )

    const personal = rows.find(r => r.thread_type === 'personal')
    const support = rows.find(r => r.thread_type === 'support')

    await Promise.all([
      syncThreadParticipants({ threadId: personal.id, threadType: 'personal', tenantId, customerId, personId: person_id }),
      syncThreadParticipants({ threadId: support.id, threadType: 'support', tenantId, customerId, personId: person_id }),
    ])

    // Personal থ্রেডের "contact" হেডারের জন্য assigned SR-এর নাম/ছবি
    const { rows: srRows } = await query(
      `SELECT u.id, u.name_bn, u.name_en, u.profile_photo
       FROM customer_assignments ca
       JOIN users u ON u.id = ca.worker_id
       WHERE ca.customer_id = $1 AND ca.tenant_id = $2 AND ca.is_active = true
       LIMIT 1`,
      [customerId, tenantId]
    )

    res.json({
      success: true,
      data: {
        personalThreadId: personal.id,
        supportThreadId: support.id,
        assignedSr: srRows[0] || null,
      },
    })
  } catch (e) {
    logger.error('[chat] ensureThreads error:', e.message)
    res.status(500).json({ success: false, message: 'থ্রেড তৈরি করা যায়নি' })
  }
}

// GET /api/portal/chat/all-threads — এক ইনবক্স, প্রতি কোম্পানি একটা row
// (personal+support দুটোই sub-mode হিসেবে থাকে, WhatsApp-এর মতো "contact list" ফিলিং)।
// connection থাকলেই row আসবে, chat_threads row না থাকলেও — তাই প্রথমবার
// চ্যাট না করা কোম্পানিও ইনবক্সে দেখা যাবে; থ্রেড তখনই তৈরি হয় যখন ensureThreads কল হয়।
const listAllThreads = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         c.id AS connection_id, c.tenant_id, t.company_name, t.logo_url,
         pt.id AS personal_thread_id, st.id AS support_thread_id,
         GREATEST(pt.last_message_at, st.last_message_at) AS last_message_at,
         CASE WHEN st.last_message_at IS NULL OR pt.last_message_at >= st.last_message_at
              THEN pt.last_message_preview ELSE st.last_message_preview END AS last_message_preview,
         CASE WHEN st.last_message_at IS NULL OR pt.last_message_at >= st.last_message_at
              THEN pt.last_sender_type ELSE st.last_sender_type END AS last_sender_type,
         CASE WHEN st.last_message_at IS NULL OR pt.last_message_at >= st.last_message_at
              THEN 'personal' ELSE 'support' END AS last_thread_type,
         (COALESCE(pt.last_message_at,'-infinity') > COALESCE(pt.last_read_by_customer_at,'-infinity')
          OR COALESCE(st.last_message_at,'-infinity') > COALESCE(st.last_read_by_customer_at,'-infinity')) AS unread
       FROM customer_company_connections c
       JOIN tenants t ON t.id = c.tenant_id
       LEFT JOIN chat_threads pt ON pt.connection_id = c.id AND pt.thread_type = 'personal'
       LEFT JOIN chat_threads st ON st.connection_id = c.id AND st.thread_type = 'support'
       WHERE c.person_id = $1
       ORDER BY GREATEST(pt.last_message_at, st.last_message_at) DESC NULLS LAST`,
      [req.portalUser.person_id]
    )
    res.json({ success: true, data: rows })
  } catch (e) {
    logger.error('[chat] listAllThreads error:', e.message)
    res.status(500).json({ success: false, message: 'থ্রেড লোড করা যায়নি' })
  }
}

// PATCH /api/portal/chat/threads/:id/read
const markRead = async (req, res) => {
  try {
    const { rowCount } = await query(
      `UPDATE chat_threads SET last_read_by_customer_at = NOW()
       WHERE id = $1 AND person_id = $2`,
      [req.params.id, req.portalUser.person_id]
    )
    if (!rowCount) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })
    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] markRead error:', e.message)
    res.status(500).json({ success: false, message: 'আপডেট ব্যর্থ' })
  }
}

// POST /api/portal/chat/threads/:id/notify — RTDB-তে মেসেজ লেখার পর কল হয়
// body: { preview: string }
const notifyNewMessage = async (req, res) => {
  const { preview } = req.body
  try {
    const { rows } = await query(
      `UPDATE chat_threads
       SET last_message_at = NOW(), last_message_preview = $1, last_sender_type = 'customer'
       WHERE id = $2 AND person_id = $3
       RETURNING id, thread_type, tenant_id, customer_id`,
      [String(preview || '').slice(0, 200), req.params.id, req.portalUser.person_id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })
    const thread = rows[0]

    await syncThreadParticipants({
      threadId: thread.id, threadType: thread.thread_type,
      tenantId: thread.tenant_id, customerId: thread.customer_id, personId: req.portalUser.person_id,
    })

    const { rows: shopRows } = await query(`SELECT shop_name FROM customers WHERE id = $1`, [thread.customer_id])
    const staffIds = thread.thread_type === 'support'
      ? await resolveSupportStaffIds(thread.tenant_id)
      : await resolvePersonalStaffIds(thread.tenant_id, thread.customer_id)

    if (staffIds.length) {
      await sendPushToMany(staffIds, {
        title: shopRows[0]?.shop_name || 'নতুন মেসেজ',
        body: preview,
        type: 'chat',
        data: { threadId: thread.id, threadType: thread.thread_type },
      })
    }

    res.json({ success: true })
  } catch (e) {
    logger.error('[chat] notifyNewMessage error:', e.message)
    res.status(500).json({ success: false, message: 'নোটিফাই ব্যর্থ' })
  }
}

// POST /api/portal/chat/threads/:id/voice   multipart: audio (file), body: { durationSeconds }
const uploadVoiceNote = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'অডিও ফাইল দিন' })
    const durationSeconds = Math.min(600, Math.max(1, parseInt(req.body.durationSeconds) || 0))

    const { rows } = await query('SELECT id, tenant_id FROM chat_threads WHERE id = $1 AND person_id = $2', [req.params.id, req.portalUser.person_id])
    if (!rows.length) return res.status(404).json({ success: false, message: 'থ্রেড পাওয়া যায়নি' })

    const filename = `voice_${req.params.id}_${Date.now()}`
    const url = await uploadAudioToCloudinary(req.file.buffer, `chat-voice/${rows[0].tenant_id}`, filename, req.file.mimetype)
    if (!url) return res.status(500).json({ success: false, message: 'আপলোড ব্যর্থ হয়েছে' })

    res.json({ success: true, data: { url, durationSeconds } })
  } catch (e) {
    logger.error('[chat] uploadVoiceNote (portal) error:', e.message)
    res.status(500).json({ success: false, message: 'ভয়েস নোট আপলোড করতে সমস্যা হয়েছে' })
  }
}

module.exports = { getFirebaseToken, ensureThreads, listAllThreads, markRead, notifyNewMessage, uploadVoiceNote }
