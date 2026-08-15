// ============================================================
// backend/src/services/chatFirebase.service.js
//
// চ্যাটের জন্য Firebase-নির্দিষ্ট হেল্পার — দুটো কাজ:
//
// 1) mintChatToken — customers টেবিলে firebase_uid নেই (শুধু users/staff-দের
//    আছে), তাই client-side সরাসরি RTDB-তে লিখতে হলে customer-দেরও একটা
//    Firebase Auth সেশন দরকার। এই ফাংশন backend-এ portalAuth/auth যাচাই
//    হওয়ার পর একটা custom token ইস্যু করে — frontend সেটা দিয়ে Firebase-এ
//    sign in করবে, তারপরই auth.uid RTDB rules-এ ব্যবহারযোগ্য হবে।
//    namespace স্কিম: 'customer:<customerId>' / 'staff:<userId>'
//
// 2) syncThreadParticipants — কোন থ্রেডে (personal/support) কে কে অংশগ্রহণকারী
//    সেটা RTDB-র chats/{threadId}/meta/participants-এ লিখে রাখে, যাতে
//    security rules client-side check করতে পারে। এটা Admin SDK দিয়ে হয় বলে
//    rules বাইপাস হয় — client কখনো meta পাথে লিখতে পারে না (rules দেখুন)।
//    ensureThreads ও notify — দুই জায়গা থেকেই কল হয়, তাই assignment/support-
//    agent বদলালে পরের মেসেজেই আপডেট হয়ে যায়, আলাদা sync job লাগে না।
// ============================================================

const admin = require('firebase-admin')
const logger = require('../config/logger')
const { query } = require('../config/db')
const { initializeFirebase, getDB } = require('../config/firebase')

const mintChatToken = async (namespacedUid) => {
  initializeFirebase()
  return admin.auth().createCustomToken(namespacedUid)
}

// এই কাস্টমারের current assigned SR + সেই SR-এর route manager (personal থ্রেডের জন্য)
const resolvePersonalStaffIds = async (tenantId, customerId) => {
  const { rows } = await query(
    `SELECT ca.worker_id, r.manager_id
     FROM customer_assignments ca
     LEFT JOIN routes r ON r.id = ca.route_id
     WHERE ca.customer_id = $1 AND ca.tenant_id = $2 AND ca.is_active = true
     LIMIT 1`,
    [customerId, tenantId]
  )
  if (!rows.length) return []
  const ids = [rows[0].worker_id, rows[0].manager_id].filter(Boolean)
  return [...new Set(ids)]
}

// এই tenant-এর support agent-রা + admin (admin সবসময় implicit, টেবিলে না থাকলেও)
const resolveSupportStaffIds = async (tenantId) => {
  const { rows } = await query(
    `SELECT id FROM users WHERE tenant_id = $1 AND role = 'admin' AND status = 'active'
     UNION
     SELECT user_id AS id FROM tenant_support_agents WHERE tenant_id = $1`,
    [tenantId]
  )
  return rows.map(r => r.id)
}

// staff userId[] → firebase_uid থাকলে 'staff:<firebase_uid>', নাহলে ফলব্যাক 'staff:<id>'
const namespaceStaffIds = async (userIds) => {
  if (!userIds.length) return []
  const { rows } = await query(
    `SELECT id, firebase_uid FROM users WHERE id = ANY($1::uuid[])`,
    [userIds]
  )
  return rows.map(r => `staff:${r.firebase_uid || r.id}`)
}

const syncThreadParticipants = async ({ threadId, threadType, tenantId, customerId, personId }) => {
  try {
    const staffIds = threadType === 'support'
      ? await resolveSupportStaffIds(tenantId)
      : await resolvePersonalStaffIds(tenantId, customerId)

    const staffNamespaced = await namespaceStaffIds(staffIds)
    const participants = {}
    // person_id দিয়ে — একই কাস্টমার একাধিক কোম্পানিতে আলাদা customer_id পায়,
    // কিন্তু Firebase identity একটাই থাকা দরকার (সব কোম্পানির থ্রেডেই যেন কাজ করে)
    participants[`customer:${personId}`] = true
    staffNamespaced.forEach(id => { participants[id] = true })

    await getDB().ref(`chats/${threadId}/meta/participants`).set(participants)
  } catch (e) {
    logger.error('[chatFirebase] syncThreadParticipants error:', e.message)
  }
}

module.exports = {
  mintChatToken,
  resolvePersonalStaffIds,
  resolveSupportStaffIds,
  syncThreadParticipants,
}
