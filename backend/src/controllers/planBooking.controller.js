const planBookingService = require('../services/planBooking.service');

// ─── নতুন কাস্টমার — পাবলিক, লগইন লাগে না ───────────────────────
// POST /api/plan-bookings
const submitPublicBooking = async (req, res) => {
  try {
    const booking = await planBookingService.createBooking({
      ...req.body,
      tenant_id: null, // পাবলিক এন্ট্রি — কখনো client-supplied tenant_id বিশ্বাস করা হয় না
    });
    return res.status(201).json({
      success: true,
      message: 'রিকোয়েস্ট জমা হয়েছে। TrxID যাচাই করে দ্রুতই যোগাযোগ করা হবে।',
      data: { id: booking.id, status: booking.status },
    });
  } catch (err) {
    const status = err.status || 500;
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'এই Slug আগেই ব্যবহার হয়েছে, অন্য একটা দিন।' });
    }
    if (status >= 500) console.error('[planBooking.submitPublicBooking]', err);
    return res.status(status).json({ success: false, message: err.message || 'সার্ভারে সমস্যা হয়েছে।' });
  }
};

// ─── বিদ্যমান tenant upgrade — লগইন করা tenant admin-ই পাঠাতে পারবে ───
// POST /api/plan-bookings/upgrade  (auth, isAdmin middleware দিয়ে সুরক্ষিত)
// ⚠️ tenant_id কখনো req.body থেকে নেওয়া হয় না — req.tenantId (auth
// middleware-এ JWT থেকে সেট হয়, middlewares/auth.js দেখো) থেকেই আসে,
// নাহলে যেকোনো tenant admin অন্য tenant-এর হয়ে upgrade রিকোয়েস্ট
// পাঠাতে পারতো।
const submitTenantUpgradeBooking = async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, message: 'Tenant শনাক্ত করা যায়নি।' });
    }

    const booking = await planBookingService.createBooking({
      ...req.body,
      tenant_id: tenantId,
      company_name: null, // existing tenant — company info tenants টেবিল থেকেই পাওয়া যাবে
      slug: null,
    });
    return res.status(201).json({
      success: true,
      message: 'আপগ্রেড রিকোয়েস্ট জমা হয়েছে। TrxID যাচাই করে দ্রুতই activate করা হবে।',
      data: { id: booking.id, status: booking.status },
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[planBooking.submitTenantUpgradeBooking]', err);
    return res.status(status).json({ success: false, message: err.message || 'সার্ভারে সমস্যা হয়েছে।' });
  }
};

module.exports = { submitPublicBooking, submitTenantUpgradeBooking };
