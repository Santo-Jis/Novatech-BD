// backend/src/services/notification.service.js
// ============================================================
// Notification Platform — Phase 1: একটাই dispatch() entrypoint
//
// (এই repo-র নিজস্ব চলমান "Phase N" কমিট-লেবেলিং থেকে আলাদা একটা
// numbering — বিভ্রান্তি এড়াতে এখানে সবসময় "Notification Platform
// Phase N" বলা হয়েছে।)
//
// আগে (Phase 0-এর আগে): ২০+ জায়গা থেকে সরাসরি sendEmail()/
// sendCustomerPush() কল হতো, কোনো কেন্দ্রীয় log/preference-check/retry
// ছিল না। Phase 0-এ customerNotification.controller.js-এ preference-check
// যোগ হয়েছিল (শুধু সেই একটা ফাইলে)। এখন Phase 1: সেই লজিকটা এখানে
// centralize করা হলো, সাথে notification_events/notification_deliveries
// টেবিলে audit trail, আর BullMQ queue integration (queue.js-এর
// isQueueAvailable() কনভেনশন অনুসরণ করে — Redis না থাকলে সরাসরি sync
// process, app ভাঙে না)।
//
// customerNotification.controller.js-এর sendCustomerNotification() export
// (৯টা ফাইল থেকে কল হয় — grep করে verify করা) এখন ভেতরে এই dispatch()
// কল করে, signature অপরিবর্তিত — কোনো caller বদলাতে হয়নি।
//
// স্কোপ বাউন্ডারি (ইচ্ছাকৃতভাবে এই Phase-এর বাইরে):
//   • recipientType শুধু 'customer' সাপোর্ট করে। 'user' (staff)
//     এখনো কোনো real call-site নেই যাচাই করার জন্য — অনুমান করে
//     আধা-বানানোর চেয়ে বাদ রাখা ভালো।
//   • channel শুধু in_app/push/email। SMS/WhatsApp person_preferences-এ
//     কোনো key-ই নেই এখনো (schema flexible, JSONB — যোগ করা সহজ, কিন্তু
//     WhatsApp সিদ্ধান্ত অফিসিয়াল API migration-এর (Phase 2) সাথে
//     একসাথে নেওয়াই ভালো, এখানে আলাদাভাবে আধা-সিদ্ধান্ত নেওয়ার দরকার নেই)।
//   • idempotency_key কলাম আছে (schema-তে), কিন্তু dispatch()-এ এখনো
//     enforce করা হয়নি — প্রথম যে caller-এর সত্যিকারের duplicate-send
//     সমস্যা আছে, তখন ON CONFLICT DO NOTHING যোগ করা যাবে।
// ============================================================

const { query } = require('../config/db');
const logger = require('../config/logger');
const { sendEmail } = require('./email.service');
const { sendCustomerPush } = require('./fcm.service');
const { notificationQueue, isQueueAvailable } = require('../config/queue');
const { renderEmailLayout, stringsFor } = require('./emailTemplates');

// notification event_type → { email subject emoji, preference category }
// category null মানে person_preferences-এ কোনো ম্যাচিং ক্যাটাগরি নেই —
// তখন allowance চেক না করেই সবসময় allowed (নিরাপদ ডিফল্ট, Phase 0-এর
// মতোই — silently block করা হয় না)।
const TYPE_META = {
    payment_received: { emoji: '💳', category: 'invoice' },
    new_invoice:       { emoji: '🧾', category: 'invoice' },
    order_request:     { emoji: '📦', category: 'order'   },
    credit_reminder:   { emoji: '⚠️', category: 'invoice' },
    general:           { emoji: '🔔', category: null      },
};
const metaFor = (eventType) => TYPE_META[eventType] || TYPE_META.general;


// ── Recipient resolve ───────────────────────────────────────
// recipientType অনুযায়ী আলাদা resolver — এখন শুধু 'customer' বাস্তবায়িত।
const resolveRecipient = async (recipientType, recipientId) => {
    if (recipientType !== 'customer') return null;

    const { rows } = await query(
        `SELECT tenant_id, fcm_token, email, person_id, owner_name, shop_name
         FROM customers WHERE id = $1`,
        [recipientId]
    );
    return rows[0] || null;
};

// শুধু tenant_id লাগবে dispatch()-এর event-insert-এর জন্য — পুরো
// resolveRecipient() না চালিয়ে হালকা targeted lookup।
const resolveTenantId = async (recipientType, recipientId) => {
    if (recipientType !== 'customer') return null;
    const { rows } = await query(`SELECT tenant_id FROM customers WHERE id = $1`, [recipientId]);
    return rows[0]?.tenant_id ?? null;
};


// ── Preference check (Phase 0-এ customerNotification.controller.js-এ
// প্রথম লেখা হয়েছিল, এখানে centralize করা হলো — আচরণ অপরিবর্তিত) ──
const getChannelAllowance = async (personId, category) => {
    if (!category || !personId) return { push: true, email: true };

    try {
        const { rows } = await query(
            `SELECT notification_prefs FROM person_preferences WHERE person_id = $1`,
            [personId]
        );
        const catPrefs = rows[0]?.notification_prefs?.[category];
        if (!catPrefs) return { push: true, email: true }; // row/category নেই — DB ডিফল্ট (সবই true)

        return {
            push:  catPrefs.push  !== false,
            email: catPrefs.email !== false,
        };
    } catch (e) {
        logger.warn('[Notify] prefs lookup ব্যর্থ (allowed ধরে এগোচ্ছে):', e.message);
        return { push: true, email: true }; // lookup fail করলেও notification আটকাবে না
    }
};


// ── Email রেন্ডার — Notification Platform Phase 2: শেয়ার্ড
// renderEmailLayout()-এ migrate করা হলো। আগে (Phase 0/1) এটাই ছিল
// email.service.js-এর ৮টা টেমপ্লেটের বাইরে একমাত্র email যেটা একটা
// আলাদা, div-based (কম email-client-safe — অনেক ক্লায়েন্ট, বিশেষত
// পুরনো Outlook, div-based CSS ভালোভাবে সাপোর্ট করে না), header-এ
// সামঞ্জস্যপূর্ণ "ZovoriX" ব্র্যান্ডিং ছাড়া একটা স্টাইল ব্যবহার করত। এখন
// বাকি সব email-এর মতোই table-based কাঠামো, নিজস্ব ইন্ডিগো/পার্পল রং
// বজায় রেখে (এই একটা ইচ্ছাকৃত, দৃশ্যমান পরিবর্তন — বাকি সবকিছুর মতো
// "byte-identical" রাখা হয়নি, কারণ এটাই ছিল সেই inconsistency যেটা
// ঠিক করার কথা ছিল)।
const renderCustomerEmail = ({ lang = 'bn', emoji, title, body, toName }) => {
    const s = stringsFor(lang);
    const bodyHtml = `
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">
            প্রিয় ${toName},
        </p>
        <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px">
            ${body}
        </p>
    `;
    const footerHtml = `<p style="color:#6b7280;font-size:12px;margin:0">${s.footerNote}</p>`;

    const html = renderEmailLayout({
        lang,
        headerGradientFrom: '#6366f1',
        headerGradientTo:   '#7c3aed',
        headerTitle:    'ZovoriX',
        headerSubtitle: `${emoji} ${title}`,
        subtitleColor:  '#e0e7ff',
        bodyHtml,
        footerHtml,
        width: 480,
    });
    const text = `${title}\n\n${body}`;
    return { html, text };
};


// ── একটা delivery attempt লগ করা (notification_deliveries) ──
const logDelivery = async ({ eventId, tenantId, channel, status, provider = null, errorMessage = null }) => {
    try {
        await query(
            `INSERT INTO notification_deliveries (event_id, tenant_id, channel, status, provider, error_message)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [eventId, tenantId, channel, status, provider, errorMessage]
        );
    } catch (e) {
        // delivery-log ব্যর্থ হলেও আসল notification পাঠানো আটকাবে না —
        // এটা শুধু audit trail, best-effort।
        logger.warn('[Notify] delivery log করতে ব্যর্থ (non-fatal):', e.message);
    }
};


// ============================================================
// processNotificationEvent — eventId নিয়ে আসল কাজ করে।
// BullMQ worker (queued path) আর dispatch()-এর sync fallback path —
// দুটোই এটা কল করে, একটাই সোর্স অফ ট্রুথ।
// ============================================================
const processNotificationEvent = async (eventId) => {
    const { rows } = await query(`SELECT * FROM notification_events WHERE id = $1`, [eventId]);
    const event = rows[0];
    if (!event) {
        logger.warn(`[Notify] event ${eventId} পাওয়া যায়নি (processNotificationEvent)`);
        return;
    }

    if (event.recipient_type !== 'customer') {
        // স্কোপ বাউন্ডারি — উপরের কমেন্ট দেখো
        logger.warn(`[Notify] recipient_type '${event.recipient_type}' এখনো সাপোর্টেড না — event ${eventId} skip`);
        return;
    }

    const customer = await resolveRecipient('customer', event.recipient_id);
    if (!customer) return;

    const { title, body } = event.payload || {};
    const meta = metaFor(event.event_type);
    const tenantId = customer.tenant_id;

    // ১. In-app (সবসময় — bell/inbox এন্ট্রি, প্রেফারেন্সের আওতার বাইরে)
    await query(
        `INSERT INTO customer_notifications (customer_id, title, body, type, tenant_id) VALUES ($1, $2, $3, $4, $5)`,
        [event.recipient_id, title, body, event.event_type, tenantId]
    );
    await logDelivery({ eventId, tenantId, channel: 'in_app', status: 'sent' });

    const allowance = await getChannelAllowance(customer.person_id, meta.category);

    // ২. Push
    let pushSuccess = false;
    if (!allowance.push) {
        await logDelivery({ eventId, tenantId, channel: 'push', status: 'skipped', errorMessage: 'preference_off' });
    } else if (!customer.fcm_token) {
        await logDelivery({ eventId, tenantId, channel: 'push', status: 'skipped', errorMessage: 'no_token' });
    } else {
        const pushResult = await sendCustomerPush(customer.fcm_token, { title, body, type: event.event_type });
        pushSuccess = pushResult?.success === true;
        await logDelivery({
            eventId, tenantId, channel: 'push',
            status: pushSuccess ? 'sent' : 'failed',
            provider: 'fcm',
            errorMessage: pushSuccess ? null : (pushResult?.reason || 'unknown'),
        });
    }

    // ৩. Email fallback — শুধু push ব্যর্থ/skip হলে
    if (pushSuccess) {
        await logDelivery({ eventId, tenantId, channel: 'email', status: 'skipped', errorMessage: 'push_succeeded' });
        return;
    }
    if (!allowance.email) {
        await logDelivery({ eventId, tenantId, channel: 'email', status: 'skipped', errorMessage: 'preference_off' });
        return;
    }
    if (!customer.email) {
        await logDelivery({ eventId, tenantId, channel: 'email', status: 'skipped', errorMessage: 'no_email' });
        return;
    }

    const toName = customer.owner_name || customer.shop_name || 'কাস্টমার';
    const { html, text } = renderCustomerEmail({ emoji: meta.emoji, title, body, toName });

    const emailResult = await sendEmail(customer.email, `${meta.emoji} ${title}`, html, text, {
        type: `customer_notify_${event.event_type}`,
        tenant_id: tenantId,
    });
    await logDelivery({
        eventId, tenantId, channel: 'email',
        status: emailResult?.success ? 'sent' : 'failed',
        provider: 'brevo',
        errorMessage: emailResult?.success ? null : (emailResult?.error || 'unknown'),
    });
};


// ============================================================
// dispatch — একটাই entrypoint। event তৈরি করে, queue থাকলে queue করে
// (attempts:3, exponential backoff — creditReminder.controller.js-এর
// প্যাটার্ন অনুসরণ করে), না থাকলে সরাসরি process করে (queue.js-এর
// direct-send fallback কনভেনশন — Redis ছাড়া environment-এ ফিচার ভাঙে
// না)।
//
// { eventType, recipientType, recipientId, data } — data = { title, body }
// (Phase 1-এ payload structure অপরিবর্তিত রাখা হয়েছে, caller-রাই এখনো
// টেক্সট বানায়; সার্ভার-সাইড টেমপ্লেট রেন্ডারিং Phase 2-এর কাজ)
// ============================================================
const dispatch = async ({ eventType, recipientType, recipientId, data }) => {
    try {
        const tenantId = await resolveTenantId(recipientType, recipientId);

        const { rows } = await query(
            `INSERT INTO notification_events (tenant_id, event_type, recipient_type, recipient_id, payload)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [tenantId, eventType, recipientType, recipientId, JSON.stringify(data || {})]
        );
        const eventId = rows[0].id;

        if (isQueueAvailable()) {
            await notificationQueue.add('process-notification-event', { eventId }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { age: 86400 },   // ১ দিন পর cleanup
                removeOnFail: { age: 604800 },        // ৭ দিন পর cleanup (debug-এর জন্য রাখা)
            });
        } else {
            await processNotificationEvent(eventId);
        }

        return { eventId };
    } catch (e) {
        logger.error('[Notify] dispatch ব্যর্থ:', e.message);
        return { eventId: null, error: e.message };
    }
};

module.exports = { dispatch, processNotificationEvent };
