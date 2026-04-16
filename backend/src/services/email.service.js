const nodemailer = require('nodemailer');
const { query } = require('../config/db');

// ============================================================
// Email Service — NovaTechBD Management System
// ============================================================
// Nodemailer দিয়ে Email পাঠানো (Gmail SMTP / Custom SMTP)
// OTP ও Invoice দুটোই Email-এ পাঠানো যাবে
// ============================================================

// DB থেকে Email কনফিগ পড়া (cached 60s)
let _emailConfigCache = null;
let _emailConfigCacheAt = 0;

const getEmailConfig = async () => {
    if (_emailConfigCache && Date.now() - _emailConfigCacheAt < 60_000) {
        return _emailConfigCache;
    }

    const EMAIL_KEYS = [
        'email_host', 'email_port', 'email_user',
        'email_pass', 'email_from', 'email_enabled'
    ];

    try {
        const result = await query(
            `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
            [EMAIL_KEYS]
        );
        const raw = {};
        result.rows.forEach(r => { raw[r.key] = r.value; });

        _emailConfigCache = {
            host:    raw.email_host    || process.env.EMAIL_HOST    || 'smtp.gmail.com',
            port:    parseInt(raw.email_port || process.env.EMAIL_PORT || '587'),
            user:    raw.email_user    || process.env.EMAIL_USER    || '',
            pass:    raw.email_pass    || process.env.EMAIL_PASS    || '',
            from:    raw.email_from    || process.env.EMAIL_FROM    || 'NovaTech BD <noreply@novatechbd.com>',
            enabled: raw.email_enabled !== 'false',
        };
    } catch {
        // DB ফেল হলে .env থেকে নাও
        _emailConfigCache = {
            host:    process.env.EMAIL_HOST    || 'smtp.gmail.com',
            port:    parseInt(process.env.EMAIL_PORT || '587'),
            user:    process.env.EMAIL_USER    || '',
            pass:    process.env.EMAIL_PASS    || '',
            from:    process.env.EMAIL_FROM    || 'NovaTech BD <noreply@novatechbd.com>',
            enabled: process.env.EMAIL_ENABLED !== 'false',
        };
    }

    _emailConfigCacheAt = Date.now();
    return _emailConfigCache;
};

const clearEmailConfigCache = () => {
    _emailConfigCache = null;
    _emailConfigCacheAt = 0;
};

// ============================================================
// CORE SENDER
// ============================================================

const sendEmail = async (to, subject, html, text = '') => {
    try {
        const config = await getEmailConfig();

        if (!config.enabled) {
            console.log(`📵 Email বন্ধ → ${to}`);
            return { success: true, disabled: true };
        }

        if (!config.user || !config.pass) {
            console.log(`📧 Dev Mode Email → ${to}: ${subject}`);
            return { success: true, dev: true };
        }

        const transporter = nodemailer.createTransport({
            host:   config.host,
            port:   config.port,
            secure: config.port === 465,
            auth:   { user: config.user, pass: config.pass },
            tls:    { rejectUnauthorized: false }
        });

        const info = await transporter.sendMail({
            from:    config.from,
            to,
            subject,
            html,
            text: text || subject,
        });

        console.log(`✅ Email সফল → ${to} [${info.messageId}]`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error(`❌ Email Error → ${to}:`, error.message);
        return { success: false, error: error.message };
    }
};

// ============================================================
// OTP EMAIL TEMPLATE
// ============================================================

const sendOTPEmail = async (email, otp, shopName, expiryMinutes = 10) => {
    const subject = `NovaTechBD - OTP কোড: ${otp}`;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:30px 0;">
<tr><td align="center">
<table width="500" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1);">
  <tr>
    <td style="background:linear-gradient(135deg,#1a73e8,#0d47a1);padding:28px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">NovaTech BD</h1>
      <p style="color:#bbdefb;margin:4px 0 0;font-size:12px;">Management System</p>
    </td>
  </tr>
  <tr>
    <td style="padding:35px 40px;">
      <p style="color:#333;font-size:15px;margin:0 0 8px;">প্রিয় গ্রাহক,</p>
      <p style="color:#555;font-size:13px;margin:0 0 25px;">
        <strong>${shopName}</strong> দোকানের বিক্রয় যাচাইয়ের জন্য আপনার OTP কোড:
      </p>
      <div style="background:#e8f0fe;border:2px dashed #1a73e8;border-radius:10px;padding:22px;text-align:center;margin:0 0 25px;">
        <p style="color:#888;font-size:12px;margin:0 0 8px;">আপনার OTP কোড</p>
        <h2 style="color:#1a73e8;font-size:44px;letter-spacing:12px;margin:0;font-family:'Courier New',monospace;font-weight:bold;">${otp}</h2>
        <p style="color:#e53935;font-size:12px;margin:10px 0 0;">⏱️ মেয়াদ: ${expiryMinutes} মিনিট</p>
      </div>
      <p style="color:#e53935;font-size:13px;background:#fce4ec;border-radius:6px;padding:10px 15px;margin:0 0 15px;">
        ⚠️ <strong>এই কোড কাউকে দেবেন না।</strong> NovaTechBD কর্তৃপক্ষ কখনো OTP জিজ্ঞেস করে না।
      </p>
      <p style="color:#aaa;font-size:11px;margin:0;">এই Email আপনি অনুরোধ না করলে উপেক্ষা করুন।</p>
    </td>
  </tr>
  <tr>
    <td style="background:#f8f9fa;padding:15px;text-align:center;border-top:1px solid #e0e0e0;">
      <p style="color:#999;font-size:11px;margin:0;">NovaTech BD (Ltd.) | inf.novatechbd@gmail.com | বরিশাল সদর – ১২০০</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `NovaTechBD OTP\nদোকান: ${shopName}\nOTP: ${otp}\nমেয়াদ: ${expiryMinutes} মিনিট\nএই কোড কাউকে দেবেন না।`;
    return sendEmail(email, subject, html, text);
};

// ============================================================
// INVOICE EMAIL TEMPLATE
// ============================================================

const sendInvoiceEmail = async (email, sale, customer, worker, items) => {
    const subject = `NovaTechBD Invoice - ${sale.invoice_number} | ${customer.shop_name}`;

    const paymentLabels = { cash: 'নগদ', credit: 'বাকি', replacement: 'রিপ্লেসমেন্ট' };

    const itemsHTML = (items || []).map(i => {
        const subtotal = (i.qty || 0) * (i.price || 0);
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#333;font-size:13px;">${i.product_name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#555;font-size:13px;text-align:center;">${i.qty} × ৳${(i.price || 0).toLocaleString('bn-BD')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;color:#333;font-size:13px;text-align:right;font-weight:bold;">৳${subtotal.toLocaleString('bn-BD')}</td>
        </tr>`;
    }).join('');

    const replacementHTML = (sale.replacement_items || []).length > 0
        ? (sale.replacement_items || []).map(i => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #fce4ec;color:#e53935;font-size:13px;">↩️ ${i.product_name} (রিপ্লেসমেন্ট)</td>
          <td style="padding:8px 12px;border-bottom:1px solid #fce4ec;color:#e53935;font-size:13px;text-align:center;">${i.qty} পিস</td>
          <td style="padding:8px 12px;border-bottom:1px solid #fce4ec;color:#e53935;font-size:13px;text-align:right;">-৳${(i.total || 0).toLocaleString('bn-BD')}</td>
        </tr>`).join('')
        : '';

    const html = `<!DOCTYPE html>
<html lang="bn">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:30px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1);">

  <tr>
    <td style="background:linear-gradient(135deg,#1a73e8,#0d47a1);padding:25px 35px;">
      <table width="100%"><tr>
        <td>
          <h1 style="color:#fff;margin:0;font-size:20px;">NovaTech BD</h1>
          <p style="color:#bbdefb;margin:3px 0 0;font-size:11px;">জানকি সিংহ রোড, বরিশাল সদর – ১২০০</p>
        </td>
        <td style="text-align:right;">
          <p style="color:#fff;margin:0;font-size:12px;">🧾 Invoice</p>
          <p style="color:#e3f2fd;margin:3px 0 0;font-size:17px;font-weight:bold;font-family:monospace;">${sale.invoice_number}</p>
        </td>
      </tr></table>
    </td>
  </tr>

  <tr>
    <td style="padding:22px 35px 0;">
      <table width="100%"><tr>
        <td width="50%" style="vertical-align:top;">
          <p style="color:#888;font-size:10px;text-transform:uppercase;margin:0 0 5px;letter-spacing:1px;">দোকানের তথ্য</p>
          <p style="color:#222;font-size:14px;font-weight:bold;margin:0;">${customer.shop_name}</p>
          <p style="color:#555;font-size:13px;margin:3px 0 0;">${customer.owner_name}</p>
          ${customer.sms_phone ? `<p style="color:#777;font-size:12px;margin:3px 0 0;">📱 ${customer.sms_phone}</p>` : ''}
        </td>
        <td width="50%" style="vertical-align:top;text-align:right;">
          <p style="color:#888;font-size:10px;text-transform:uppercase;margin:0 0 5px;letter-spacing:1px;">বিক্রয় তথ্য</p>
          <p style="color:#555;font-size:12px;margin:0;">📅 ${new Date(sale.created_at || Date.now()).toLocaleDateString('bn-BD')}</p>
          <p style="color:#555;font-size:12px;margin:3px 0 0;">👤 SR: ${worker.name_bn || worker.name} (${worker.employee_code})</p>
          <p style="color:${sale.otp_verified ? '#2e7d32' : '#e65100'};font-size:11px;margin:5px 0 0;font-weight:bold;">
            ${sale.otp_verified ? '✅ OTP যাচাইকৃত' : '⏳ OTP অপেক্ষায়'}
          </p>
        </td>
      </tr></table>
    </td>
  </tr>

  <tr>
    <td style="padding:18px 35px;">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:9px 12px;text-align:left;color:#555;font-size:11px;">পণ্যের নাম</th>
            <th style="padding:9px 12px;text-align:center;color:#555;font-size:11px;">পরিমাণ × মূল্য</th>
            <th style="padding:9px 12px;text-align:right;color:#555;font-size:11px;">মোট</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}${replacementHTML}</tbody>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:0 35px 22px;">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f8f9fa;border-radius:8px;padding:15px;">
        <tr><td style="padding:0 10px;">
          <table width="100%">
            <tr>
              <td style="color:#555;font-size:13px;padding:4px 0;">মোট পরিমাণ</td>
              <td style="color:#333;font-size:13px;text-align:right;padding:4px 0;">৳${(sale.total_amount || 0).toLocaleString('bn-BD')}</td>
            </tr>
            ${(sale.discount_amount > 0) ? `<tr>
              <td style="color:#555;font-size:13px;padding:4px 0;">ক্রেডিট ব্যালেন্স ছাড়</td>
              <td style="color:#e53935;font-size:13px;text-align:right;padding:4px 0;">-৳${(sale.discount_amount || 0).toLocaleString('bn-BD')}</td>
            </tr>` : ''}
            <tr><td colspan="2"><hr style="border:none;border-top:1px solid #ddd;margin:8px 0;"></td></tr>
            <tr>
              <td style="color:#1a73e8;font-size:15px;font-weight:bold;padding:4px 0;">পরিশোধযোগ্য মোট</td>
              <td style="color:#1a73e8;font-size:18px;font-weight:bold;text-align:right;padding:4px 0;">৳${(sale.net_amount || 0).toLocaleString('bn-BD')}</td>
            </tr>
            <tr>
              <td style="color:#777;font-size:12px;padding:8px 0 0;">পেমেন্ট পদ্ধতি</td>
              <td style="color:#333;font-size:12px;text-align:right;padding:8px 0 0;font-weight:bold;">${paymentLabels[sale.payment_method] || sale.payment_method}</td>
            </tr>
            ${sale.cash_received > 0 ? `<tr><td style="color:#777;font-size:12px;padding:3px 0;">নগদ প্রাপ্ত</td><td style="color:#2e7d32;font-size:12px;text-align:right;padding:3px 0;">৳${sale.cash_received}</td></tr>` : ''}
            ${sale.credit_used > 0 ? `<tr><td style="color:#777;font-size:12px;padding:3px 0;">বাকি দেওয়া হয়েছে</td><td style="color:#e65100;font-size:12px;text-align:right;padding:3px 0;">৳${sale.credit_used}</td></tr>` : ''}
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="background:#e8f5e9;padding:15px 35px;text-align:center;border-top:2px solid #4caf50;">
      <p style="color:#2e7d32;font-size:14px;font-weight:bold;margin:0;">🙏 আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ!</p>
    </td>
  </tr>
  <tr>
    <td style="background:#f8f9fa;padding:12px 35px;text-align:center;border-top:1px solid #e0e0e0;">
      <p style="color:#999;font-size:11px;margin:0;">NovaTech BD (Ltd.) | inf.novatechbd@gmail.com | বরিশাল সদর – ১২০০</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `NovaTechBD Invoice\nদোকান: ${customer.shop_name}\nInvoice: ${sale.invoice_number}\nমোট: ৳${sale.net_amount}\nপেমেন্ট: ${paymentLabels[sale.payment_method] || sale.payment_method}\nধন্যবাদ।`;
    return sendEmail(email, subject, html, text);
};

module.exports = {
    sendEmail,
    sendOTPEmail,
    sendInvoiceEmail,
    clearEmailConfigCache,
};
