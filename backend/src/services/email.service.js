const { query } = require('../config/db');
// nodemailer বাদ — Render SMTP block করে, তাই Brevo HTTP API ব্যবহার করা হচ্ছে

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
            host:    raw.email_host    || process.env.EMAIL_HOST    || 'smtp-relay.brevo.com',
            port:    parseInt(raw.email_port || process.env.EMAIL_PORT || '587'),
            user:    raw.email_user    || process.env.EMAIL_USER    || '',
            pass:    raw.email_pass    || process.env.EMAIL_PASS    || '',
            from:    raw.email_from    || process.env.EMAIL_FROM    || 'NovaTech BD <noreply@novatechbd.com>',
            enabled: raw.email_enabled !== 'false',
        };
    } catch {
        // DB ফেল হলে .env থেকে নাও
        _emailConfigCache = {
            host:    process.env.EMAIL_HOST    || 'smtp-relay.brevo.com',
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

        // ✅ Brevo HTTP API (SMTP এর বদলে — Render SMTP block করে)
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': config.pass
            },
            body: JSON.stringify({
                sender:      { name: 'NovaTech BD', email: config.user },
                to:          [{ email: to }],
                subject,
                htmlContent: html,
                textContent: text || subject
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || `Brevo API Error: ${response.status}`);
        }

        console.log(`✅ Email সফল → ${to} [${result.messageId}]`);
        return { success: true, messageId: result.messageId };

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
          <p style="color:#555;font-size:12px;margin:3px 0 0;">👤 SR: ${worker.name_bn || worker.name_en} (${worker.employee_code})</p>
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

// ============================================================
// OTP + INVOICE একসাথে — একটাই Email
// ============================================================

const sendOTPWithInvoiceEmail = async (email, otp, expiryMinutes = 10, sale, customer, worker, items) => {
    const subject = `NovaTechBD - OTP: ${otp} | Invoice ${sale.invoice_number}`;

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

  <!-- Header -->
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

  <!-- OTP Section -->
  <tr>
    <td style="background:#e8f0fe;border-bottom:2px dashed #1a73e8;padding:22px 35px;">
      <p style="color:#333;font-size:14px;font-weight:bold;margin:0 0 5px;">🔐 বিক্রয় যাচাইয়ের OTP কোড</p>
      <p style="color:#555;font-size:12px;margin:0 0 15px;"><strong>${customer.shop_name}</strong>-এর বিক্রয় নিশ্চিত করতে SR-কে এই কোড দিন:</p>
      <div style="display:inline-block;background:#fff;border:2px solid #1a73e8;border-radius:10px;padding:14px 30px;text-align:center;">
        <p style="color:#888;font-size:11px;margin:0 0 5px;">OTP কোড</p>
        <h2 style="color:#1a73e8;font-size:40px;letter-spacing:12px;margin:0;font-family:'Courier New',monospace;font-weight:bold;">${otp}</h2>
        <p style="color:#e53935;font-size:11px;margin:8px 0 0;">⏱️ মেয়াদ: ${expiryMinutes} মিনিট</p>
      </div>
      <p style="color:#e53935;font-size:12px;margin:12px 0 0;">⚠️ <strong>এই কোড কাউকে দেবেন না।</strong> NovaTechBD কর্তৃপক্ষ কখনো OTP জিজ্ঞেস করে না।</p>
    </td>
  </tr>

  <!-- Customer & Sale Info -->
  <tr>
    <td style="padding:18px 35px 0;">
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
          <p style="color:#555;font-size:12px;margin:3px 0 0;">👤 SR: ${worker.name_bn || worker.name_en} (${worker.employee_code})</p>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- Items Table -->
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

  <!-- Summary -->
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

    const text = `NovaTechBD - OTP: ${otp} (মেয়াদ: ${expiryMinutes} মিনিট)\nInvoice: ${sale.invoice_number}\nদোকান: ${customer.shop_name}\nমোট: ৳${sale.net_amount}\nপেমেন্ট: ${paymentLabels[sale.payment_method] || sale.payment_method}\nএই কোড কাউকে দেবেন না।`;
    return sendEmail(email, subject, html, text);
};

// ============================================================
// ORDER NOTIFICATION EMAIL — Admin ও Manager কে নোটিফাই করা
// SR/কর্মি নতুন অর্ডার দিলে সাথে সাথে Email যাবে
// ============================================================

const sendOrderNotificationEmail = async (toEmails, orderData) => {
    const {
        orderId,
        workerName,
        workerCode,
        workerPhone,
        managerName,
        items,
        totalAmount,
        note,
        requestedAt
    } = orderData;

    const subject = `📦 নতুন অর্ডার: ${workerName} (${workerCode}) — ৳${(totalAmount || 0).toLocaleString('bn-BD')}`;

    const itemsHTML = (items || []).map((item, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
            <td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;color:#333;font-size:13px;">${item.product_name}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px;text-align:center;">${item.requested_qty} পিস</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;color:#555;font-size:13px;text-align:center;">৳${(item.price || 0).toLocaleString('bn-BD')}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;color:#1a73e8;font-size:13px;text-align:right;font-weight:bold;">৳${((item.price || 0) * (item.requested_qty || 0)).toLocaleString('bn-BD')}</td>
        </tr>`
    ).join('');

    const dateStr = new Date(requestedAt || Date.now()).toLocaleString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const html = `<!DOCTYPE html>
<html lang="bn">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:30px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#e65100,#bf360c);padding:26px 35px;">
      <table width="100%"><tr>
        <td>
          <h1 style="color:#fff;margin:0;font-size:20px;">📦 নতুন অর্ডার</h1>
          <p style="color:#ffccbc;margin:5px 0 0;font-size:12px;">NovaTech BD — অর্ডার নোটিফিকেশন</p>
        </td>
        <td style="text-align:right;">
          <p style="color:#ffccbc;margin:0;font-size:11px;">অর্ডার আইডি</p>
          <p style="color:#fff;margin:4px 0 0;font-size:18px;font-weight:bold;font-family:monospace;">#${orderId}</p>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- Alert Banner -->
  <tr>
    <td style="background:#fff3e0;padding:12px 35px;border-bottom:2px solid #ffe0b2;">
      <p style="margin:0;color:#e65100;font-size:13px;font-weight:bold;">
        ⚠️ একটি নতুন অর্ডার অনুমোদনের অপেক্ষায় আছে। অনুগ্রহ করে দ্রুত পর্যালোচনা করুন।
      </p>
    </td>
  </tr>

  <!-- Worker Info -->
  <tr>
    <td style="padding:22px 35px 0;">
      <table width="100%">
        <tr>
          <td width="50%" style="vertical-align:top;">
            <p style="color:#888;font-size:10px;text-transform:uppercase;margin:0 0 8px;letter-spacing:1px;">SR / কর্মির তথ্য</p>
            <p style="color:#222;font-size:15px;font-weight:bold;margin:0;">${workerName}</p>
            <p style="color:#555;font-size:13px;margin:4px 0 0;">🪪 কোড: <strong>${workerCode}</strong></p>
            ${workerPhone ? `<p style="color:#555;font-size:13px;margin:4px 0 0;">📱 ফোন: ${workerPhone}</p>` : ''}
            ${managerName ? `<p style="color:#555;font-size:13px;margin:4px 0 0;">👔 ম্যানেজার: ${managerName}</p>` : ''}
          </td>
          <td width="50%" style="vertical-align:top;text-align:right;">
            <p style="color:#888;font-size:10px;text-transform:uppercase;margin:0 0 8px;letter-spacing:1px;">অর্ডারের সময়</p>
            <p style="color:#333;font-size:13px;margin:0;">📅 ${dateStr}</p>
            <p style="color:#e65100;font-size:12px;margin:8px 0 0;font-weight:bold;">🕐 অনুমোদন বাকি</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Items Table -->
  <tr>
    <td style="padding:18px 35px;">
      <p style="color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">পণ্যের বিবরণ</p>
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#fbe9e7;">
            <th style="padding:10px 14px;text-align:left;color:#bf360c;font-size:12px;">পণ্যের নাম</th>
            <th style="padding:10px 14px;text-align:center;color:#bf360c;font-size:12px;">পরিমাণ</th>
            <th style="padding:10px 14px;text-align:center;color:#bf360c;font-size:12px;">একক মূল্য</th>
            <th style="padding:10px 14px;text-align:right;color:#bf360c;font-size:12px;">মোট</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
      </table>
    </td>
  </tr>

  <!-- Total -->
  <tr>
    <td style="padding:0 35px 22px;">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#e8f5e9;border-radius:8px;padding:16px 20px;">
        <tr><td>
          <table width="100%">
            <tr>
              <td style="color:#2e7d32;font-size:16px;font-weight:bold;">💰 সর্বমোট অর্ডার মূল্য</td>
              <td style="color:#1b5e20;font-size:20px;font-weight:bold;text-align:right;">৳${(totalAmount || 0).toLocaleString('bn-BD')}</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>

  ${note ? `
  <tr>
    <td style="padding:0 35px 22px;">
      <div style="background:#fff8e1;border-left:4px solid #ffc107;padding:12px 16px;border-radius:0 8px 8px 0;">
        <p style="color:#f57f17;font-size:12px;font-weight:bold;margin:0 0 5px;">📝 SR-এর নোট</p>
        <p style="color:#555;font-size:13px;margin:0;">${note}</p>
      </div>
    </td>
  </tr>` : ''}

  <!-- Footer -->
  <tr>
    <td style="background:#fbe9e7;padding:14px 35px;text-align:center;border-top:2px solid #ffccbc;">
      <p style="color:#bf360c;font-size:13px;font-weight:bold;margin:0;">অনুগ্রহ করে সিস্টেমে লগইন করে অর্ডারটি অনুমোদন বা বাতিল করুন।</p>
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

    const text = `নতুন অর্ডার #${orderId}\nকর্মি: ${workerName} (${workerCode})\nমোট: ৳${totalAmount}\nসময়: ${dateStr}\nঅনুগ্রহ করে সিস্টেমে লগইন করে অর্ডারটি অনুমোদন করুন।`;

    // একাধিক email এ পাঠানো (Admin + Manager)
    const results = [];
    for (const email of (Array.isArray(toEmails) ? toEmails : [toEmails])) {
        if (email) {
            const result = await sendEmail(email, subject, html, text);
            results.push({ email, ...result });
        }
    }
    return results;
};

// ============================================================
// WELCOME EMAIL TEMPLATE — নতুন কাস্টমার নিবন্ধন সম্পন্ন হলে
// ============================================================

const sendWelcomeEmail = async (email, customer, worker) => {
    const subject = `🎉 স্বাগতম NovaTech BD পরিবারে! | ${customer.shop_name}`;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:30px 0;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#1a73e8,#0d47a1);padding:30px 35px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:1px;">NovaTech BD</h1>
      <p style="color:#bbdefb;margin:6px 0 0;font-size:13px;">Management System</p>
    </td>
  </tr>

  <!-- Welcome Banner -->
  <tr>
    <td style="background:#e8f5e9;padding:20px 35px;text-align:center;border-bottom:2px solid #c8e6c9;">
      <p style="margin:0;font-size:28px;">🎉</p>
      <h2 style="color:#2e7d32;font-size:20px;margin:8px 0 4px;">স্বাগতম NovaTech BD পরিবারে!</h2>
      <p style="color:#388e3c;font-size:13px;margin:0;">আপনার নিবন্ধন সফলভাবে সম্পন্ন হয়েছে।</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:30px 35px;">

      <p style="color:#333;font-size:15px;margin:0 0 6px;">প্রিয় <strong>${customer.owner_name}</strong>,</p>
      <p style="color:#555;font-size:13px;margin:0 0 25px;line-height:1.8;">
        <strong>${customer.shop_name}</strong> দোকানটি আমাদের সিস্টেমে সফলভাবে যুক্ত হয়েছে।
        আমরা আপনাকে আমাদের পরিবারের নতুন সদস্য হিসেবে স্বাগত জানাচ্ছি।
        আপনার সাথে কাজ করতে পেরে আমরা আনন্দিত।
      </p>

      <!-- Customer Info Card -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#e8f0fe;border-radius:10px;border:1px solid #c5d8f8;margin:0 0 22px;">
        <tr>
          <td style="padding:18px 22px;">
            <p style="color:#1a73e8;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;font-weight:bold;">আপনার অ্যাকাউন্টের তথ্য</p>
            <table width="100%">
              <tr>
                <td style="color:#555;font-size:13px;padding:5px 0;">🏪 দোকানের নাম</td>
                <td style="color:#222;font-size:13px;font-weight:bold;text-align:right;padding:5px 0;">${customer.shop_name}</td>
              </tr>
              <tr>
                <td style="color:#555;font-size:13px;padding:5px 0;">👤 মালিকের নাম</td>
                <td style="color:#222;font-size:13px;text-align:right;padding:5px 0;">${customer.owner_name}</td>
              </tr>
              <tr>
                <td style="color:#555;font-size:13px;padding:5px 0;">🆔 কাস্টমার কোড</td>
                <td style="text-align:right;padding:5px 0;">
                  <span style="background:#1a73e8;color:#fff;font-size:13px;font-weight:bold;padding:3px 10px;border-radius:12px;font-family:monospace;">${customer.customer_code}</span>
                </td>
              </tr>
              ${customer.business_type ? `<tr>
                <td style="color:#555;font-size:13px;padding:5px 0;">🏷️ ব্যবসার ধরন</td>
                <td style="color:#222;font-size:13px;text-align:right;padding:5px 0;">${customer.business_type}</td>
              </tr>` : ''}
              ${customer.credit_limit > 0 ? `<tr>
                <td style="color:#555;font-size:13px;padding:5px 0;">💳 ক্রেডিট সীমা</td>
                <td style="color:#2e7d32;font-size:13px;font-weight:bold;text-align:right;padding:5px 0;">৳${parseFloat(customer.credit_limit).toLocaleString('bn-BD')}</td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
      </table>

      <!-- SR Info -->
      ${worker ? `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#fff8e1;border-radius:10px;border:1px solid #ffe082;margin:0 0 22px;">
        <tr>
          <td style="padding:16px 22px;">
            <p style="color:#f57f17;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;font-weight:bold;">আপনার সেলস রিপ্রেজেন্টেটিভ</p>
            <p style="color:#333;font-size:14px;font-weight:bold;margin:0;">👤 ${worker.name_bn || worker.name_en}</p>
            ${worker.phone ? `<p style="color:#555;font-size:13px;margin:5px 0 0;">📱 ${worker.phone}</p>` : ''}
            <p style="color:#777;font-size:12px;margin:5px 0 0;">যেকোনো প্রয়োজনে তার সাথে যোগাযোগ করুন।</p>
          </td>
        </tr>
      </table>` : ''}

      <!-- Credit Policy -->
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#fff3e0;border-radius:10px;border:1px solid #ffe0b2;margin:0 0 22px;">
        <tr>
          <td style="padding:18px 22px;">
            <p style="color:#e65100;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;font-weight:bold;">💳 বাকি ও ক্রেডিট নীতিমালা</p>
            <table width="100%">
              <tr>
                <td style="padding:5px 0;vertical-align:top;width:20px;">✅</td>
                <td style="padding:5px 0 5px 8px;color:#555;font-size:12.5px;line-height:1.7;">
                  প্রথম অর্ডারে সর্বোচ্চ <strong style="color:#bf360c;">২০% বাকি</strong> রাখা যাবে — বাকি অংশ নগদে পরিশোধ করতে হবে।
                </td>
              </tr>
              <tr><td colspan="2"><div style="border-top:1px dashed #ffe0b2;margin:4px 0;"></div></td></tr>
              <tr>
                <td style="padding:5px 0;vertical-align:top;">📅</td>
                <td style="padding:5px 0 5px 8px;color:#555;font-size:12.5px;line-height:1.7;">
                  বাকি পরিমাণ <strong style="color:#bf360c;">৩০ দিনের মধ্যে</strong> পরিশোধ করতে হবে।
                </td>
              </tr>
              <tr><td colspan="2"><div style="border-top:1px dashed #ffe0b2;margin:4px 0;"></div></td></tr>
              <tr>
                <td style="padding:5px 0;vertical-align:top;">🔄</td>
                <td style="padding:5px 0 5px 8px;color:#555;font-size:12.5px;line-height:1.7;">
                  পরবর্তী অর্ডার থেকে <strong style="color:#bf360c;">ফুল পেমেন্ট</strong> প্রযোজ্য হবে।
                </td>
              </tr>
              <tr><td colspan="2"><div style="border-top:1px dashed #ffe0b2;margin:4px 0;"></div></td></tr>
              <tr>
                <td style="padding:5px 0;vertical-align:top;">⚠️</td>
                <td style="padding:5px 0 5px 8px;color:#555;font-size:12.5px;line-height:1.7;">
                  বাকি পরিশোধ না হলে পরবর্তী অর্ডারে <strong style="color:#bf360c;">মাল সরবরাহ বন্ধ</strong> থাকবে।
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Message -->
      <div style="background:#f3e5f5;border-left:4px solid #7b1fa2;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 10px;">
        <p style="color:#6a1b9a;font-size:13px;margin:0;line-height:1.8;">
          🌟 <strong>আমাদের প্রতিশ্রুতি:</strong> আমরা সর্বদা আপনাকে সেরা পণ্য ও সেবা প্রদানে প্রতিশ্রুতিবদ্ধ।
          যেকোনো সমস্যায় আমাদের সাথে যোগাযোগ করুন।
        </p>
      </div>

    </td>
  </tr>

  <!-- Footer Banner -->
  <tr>
    <td style="background:#e8f0fe;padding:16px 35px;text-align:center;border-top:2px solid #bbdefb;">
      <p style="color:#1a73e8;font-size:14px;font-weight:bold;margin:0;">🙏 আমাদের সাথে থাকার জন্য আন্তরিক ধন্যবাদ!</p>
    </td>
  </tr>
  <tr>
    <td style="background:#f8f9fa;padding:14px 35px;text-align:center;border-top:1px solid #e0e0e0;">
      <p style="color:#999;font-size:11px;margin:0;">NovaTech BD (Ltd.) | inf.novatechbd@gmail.com | বরিশাল সদর – ১২০০</p>
      <p style="color:#bbb;font-size:10px;margin:4px 0 0;">এই Email স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে। সরাসরি রিপ্লাই করবেন না।</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `স্বাগতম NovaTech BD পরিবারে!\nদোকান: ${customer.shop_name}\nমালিক: ${customer.owner_name}\nকাস্টমার কোড: ${customer.customer_code}\nধন্যবাদ আমাদের সাথে থাকার জন্য।`;

    return sendEmail(email, subject, html, text);
};

// ============================================================
// SR নিয়োগ আবেদন — Email যাচাইয়ের OTP টেম্পলেট
// আবেদনকারীকে "গ্রাহক" না বলে সঠিকভাবে সম্বোধন করা হয়েছে
// ============================================================

const sendSRApplicationOTPEmail = async (email, otp, applicantName, expiryMinutes = 10) => {
    const subject = `NovaTech BD — SR আবেদন যাচাই কোড: ${otp}`;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>SR আবেদন যাচাই</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:40px 0;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0"
       style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 30px rgba(0,0,0,.10);">

  <!-- ══ HEADER ══ -->
  <tr>
    <td style="background:linear-gradient(135deg,#1565c0 0%,#0d47a1 100%);padding:32px 40px;text-align:center;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="text-align:center;">
          <div style="display:inline-block;background:rgba(255,255,255,.15);border-radius:50%;width:56px;height:56px;line-height:56px;font-size:26px;margin-bottom:12px;">🏢</div>
          <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:.5px;">NovaTech BD</h1>
          <p style="color:#90caf9;margin:6px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Management System</p>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- ══ BADGE ══ -->
  <tr>
    <td style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#e3f2fd;border-bottom:2px solid #bbdefb;padding:14px 40px;text-align:center;">
            <span style="display:inline-block;background:#1565c0;color:#fff;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:5px 18px;border-radius:20px;text-transform:uppercase;">SR নিয়োগ আবেদন যাচাইকরণ</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══ BODY ══ -->
  <tr>
    <td style="padding:36px 40px 28px;">

      <!-- Greeting -->
      <p style="color:#1a1a2e;font-size:16px;font-weight:600;margin:0 0 6px;">
        প্রিয় ${applicantName ? applicantName : 'আবেদনকারী'},
      </p>
      <p style="color:#546e7a;font-size:13.5px;margin:0 0 28px;line-height:1.7;">
        আপনার <strong style="color:#1565c0;">SR (Sales Representative) নিয়োগ আবেদন</strong> প্রক্রিয়া শুরু হয়েছে।
        নিচের ওয়ান-টাইম পাসওয়ার্ড (OTP) ব্যবহার করে আপনার ইমেইল ঠিকানা যাচাই করুন।
      </p>

      <!-- OTP Box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background:linear-gradient(135deg,#e8f0fe,#dce8fd);border:2px solid #1a73e8;border-radius:14px;padding:30px 20px;text-align:center;">
            <p style="color:#5c7cfa;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">আপনার যাচাই কোড</p>
            <div style="display:inline-block;">
              <span style="color:#1565c0;font-size:48px;font-weight:800;letter-spacing:16px;font-family:'Courier New',Courier,monospace;display:block;line-height:1;">${otp}</span>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>
              <td align="center">
                <span style="display:inline-block;background:#fff3e0;border:1px solid #ffe0b2;border-radius:20px;padding:5px 16px;">
                  <span style="color:#e65100;font-size:12px;font-weight:600;">⏱ মেয়াদ: ${expiryMinutes} মিনিট</span>
                </span>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>

      <!-- Steps -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
        <tr>
          <td>
            <p style="color:#37474f;font-size:12.5px;font-weight:700;margin:0 0 12px;letter-spacing:.5px;">📋 পরবর্তী ধাপ:</p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;vertical-align:top;">
                  <span style="display:inline-block;background:#1565c0;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;font-size:11px;font-weight:700;margin-right:10px;">১</span>
                </td>
                <td style="padding:4px 0;color:#546e7a;font-size:12.5px;">আবেদন ফর্মে ফিরে যান</td>
              </tr>
              <tr>
                <td style="padding:4px 0;vertical-align:top;">
                  <span style="display:inline-block;background:#1565c0;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;font-size:11px;font-weight:700;margin-right:10px;">২</span>
                </td>
                <td style="padding:4px 0;color:#546e7a;font-size:12.5px;">উপরের ৬-সংখ্যার কোডটি নির্ধারিত ঘরে প্রবেশ করান</td>
              </tr>
              <tr>
                <td style="padding:4px 0;vertical-align:top;">
                  <span style="display:inline-block;background:#1565c0;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;font-size:11px;font-weight:700;margin-right:10px;">৩</span>
                </td>
                <td style="padding:4px 0;color:#546e7a;font-size:12.5px;">${expiryMinutes} মিনিটের মধ্যে যাচাই সম্পন্ন করুন</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Warning -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#fff8e1;border-left:4px solid #f9a825;border-radius:0 8px 8px 0;padding:14px 18px;">
            <p style="color:#e65100;font-size:12.5px;font-weight:700;margin:0 0 4px;">⚠️ সতর্কতা</p>
            <p style="color:#6d4c41;font-size:12px;margin:0;line-height:1.6;">
              এই কোডটি <strong>কাউকে শেয়ার করবেন না</strong> — ফোন, মেসেজ বা অন্য কোনো মাধ্যমে।
              NovaTech BD কর্তৃপক্ষ কখনো আপনার কাছে OTP চাইবে না।
            </p>
          </td>
        </tr>
      </table>

      <p style="color:#b0bec5;font-size:11px;margin:22px 0 0;text-align:center;">
        এই ইমেইলটি আপনি আবেদন না করলে নিরাপদে উপেক্ষা করুন।
      </p>
    </td>
  </tr>

  <!-- ══ FOOTER ══ -->
  <tr>
    <td style="background:#f4f6f9;border-top:1px solid #e0e0e0;padding:18px 40px;text-align:center;">
      <p style="color:#78909c;font-size:11.5px;margin:0 0 4px;font-weight:600;">NovaTech BD (Ltd.)</p>
      <p style="color:#b0bec5;font-size:10.5px;margin:0;">inf.novatechbd@gmail.com &nbsp;|&nbsp; বরিশাল সদর – ১২০০</p>
      <p style="color:#cfd8dc;font-size:10px;margin:6px 0 0;">এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে। সরাসরি রিপ্লাই করবেন না।</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `NovaTech BD — SR নিয়োগ আবেদন যাচাই\nআবেদনকারী: ${applicantName || 'আবেদনকারী'}\nOTP কোড: ${otp}\nমেয়াদ: ${expiryMinutes} মিনিট\nএই কোড কাউকে দেবেন না।`;
    return sendEmail(email, subject, html, text);
};

// ============================================================
// SR আবেদন সফল — আবেদনকারীকে Confirmation Email
// ============================================================

const sendSRApplicationConfirmEmail = async (email, applicantData) => {
    const { name, application_id, phone, district, created_at } = applicantData;

    const subject = `✅ আবেদন সফল হয়েছে — ${application_id} | NovaTech BD`;

    const dateStr = new Date(created_at || Date.now()).toLocaleString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:40px 0;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 30px rgba(0,0,0,.10);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#1b5e20 0%,#2e7d32 100%);padding:32px 40px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">✅</div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">আবেদন সফলভাবে জমা হয়েছে!</h1>
      <p style="color:#a5d6a7;margin:6px 0 0;font-size:12px;letter-spacing:1px;">NovaTech BD — SR নিয়োগ বিভাগ</p>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:32px 40px;">

      <p style="color:#1a1a2e;font-size:16px;font-weight:600;margin:0 0 6px;">প্রিয় ${name},</p>
      <p style="color:#546e7a;font-size:13.5px;margin:0 0 28px;line-height:1.8;">
        আপনার <strong style="color:#2e7d32;">SR (Sales Representative)</strong> পদের জন্য আবেদন সফলভাবে জমা হয়েছে।
        আমাদের নিয়োগ দল শীঘ্রই আপনার আবেদন পর্যালোচনা করবে এবং যোগাযোগ করবে।
      </p>

      <!-- Application ID Box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr>
          <td style="background:linear-gradient(135deg,#e8f5e9,#f1f8e9);border:2px solid #66bb6a;border-radius:14px;padding:24px;text-align:center;">
            <p style="color:#388e3c;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">আবেদন নম্বর</p>
            <p style="color:#1b5e20;font-size:26px;font-weight:800;font-family:'Courier New',monospace;margin:0;letter-spacing:3px;">${application_id}</p>
            <p style="color:#81c784;font-size:11px;margin:8px 0 0;">এই নম্বরটি সংরক্ষণ করুন — পরবর্তী যোগাযোগে প্রয়োজন হবে</p>
          </td>
        </tr>
      </table>

      <!-- Info Grid -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:12px;padding:20px;margin:0 0 24px;">
        <tr>
          <td>
            <p style="color:#37474f;font-size:12px;font-weight:700;margin:0 0 14px;letter-spacing:.5px;">📋 আবেদনের সারসংক্ষেপ</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;color:#78909c;font-size:12.5px;width:45%;">আবেদনকারীর নাম</td>
                <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:600;">${name}</td>
              </tr>
              <tr>
                <td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:4px 0;"></div></td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#78909c;font-size:12.5px;">মোবাইল নম্বর</td>
                <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:600;">${phone || '—'}</td>
              </tr>
              <tr>
                <td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:4px 0;"></div></td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#78909c;font-size:12.5px;">জেলা</td>
                <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:600;">${district || '—'}</td>
              </tr>
              <tr>
                <td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:4px 0;"></div></td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#78909c;font-size:12.5px;">আবেদনের সময়</td>
                <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:600;">${dateStr}</td>
              </tr>
              <tr>
                <td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:4px 0;"></div></td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#78909c;font-size:12.5px;">বর্তমান অবস্থা</td>
                <td style="padding:6px 0;">
                  <span style="background:#fff8e1;color:#f57f17;font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;border:1px solid #ffe082;">⏳ পর্যালোচনাধীন</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Next Steps -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#e3f2fd;border-radius:12px;padding:20px;margin:0 0 20px;">
        <tr>
          <td>
            <p style="color:#1565c0;font-size:12px;font-weight:700;margin:0 0 12px;">📌 পরবর্তী ধাপ</p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:5px 0;vertical-align:top;">
                  <span style="display:inline-block;background:#1565c0;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;font-size:10px;font-weight:700;margin-right:10px;">১</span>
                </td>
                <td style="padding:5px 0;color:#37474f;font-size:12.5px;">আবেদন পর্যালোচনায় <strong>৩-৫ কার্যদিবস</strong> সময় লাগতে পারে</td>
              </tr>
              <tr>
                <td style="padding:5px 0;vertical-align:top;">
                  <span style="display:inline-block;background:#1565c0;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;font-size:10px;font-weight:700;margin-right:10px;">২</span>
                </td>
                <td style="padding:5px 0;color:#37474f;font-size:12.5px;">নির্বাচিত হলে আপনার মোবাইলে কল বা SMS করা হবে</td>
              </tr>
              <tr>
                <td style="padding:5px 0;vertical-align:top;">
                  <span style="display:inline-block;background:#1565c0;color:#fff;border-radius:50%;width:20px;height:20px;text-align:center;line-height:20px;font-size:10px;font-weight:700;margin-right:10px;">৩</span>
                </td>
                <td style="padding:5px 0;color:#37474f;font-size:12.5px;">মোবাইল নম্বর সবসময় চালু রাখুন</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Contact -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#fff8e1;border-left:4px solid #f9a825;border-radius:0 8px 8px 0;padding:14px 18px;">
            <p style="color:#e65100;font-size:12px;font-weight:700;margin:0 0 4px;">📞 যোগাযোগ</p>
            <p style="color:#6d4c41;font-size:12px;margin:0;line-height:1.7;">
              আবেদন সম্পর্কে জানতে: <strong>01836-191102</strong><br>
              ইমেইল: <strong>inf.novatechbd@gmail.com</strong>
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f4f6f9;border-top:1px solid #e0e0e0;padding:18px 40px;text-align:center;">
      <p style="color:#78909c;font-size:11.5px;margin:0 0 4px;font-weight:600;">NovaTech BD (Ltd.)</p>
      <p style="color:#b0bec5;font-size:10.5px;margin:0;">inf.novatechbd@gmail.com &nbsp;|&nbsp; বরিশাল সদর – ১২০০</p>
      <p style="color:#cfd8dc;font-size:10px;margin:6px 0 0;">এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে। সরাসরি রিপ্লাই করবেন না।</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `আবেদন সফল! আবেদন নম্বর: ${application_id}\nনাম: ${name}\nমোবাইল: ${phone}\nজেলা: ${district}\nসময়: ${dateStr}\nযোগাযোগ: 01836-191102`;
    return sendEmail(email, subject, html, text);
};

// ============================================================
// SR আবেদন সফল — Admin কে Notification Email
// ============================================================

const sendSRApplicationAdminNotifyEmail = async (toEmails, applicantData) => {
    const { name, application_id, phone, email: applicantEmail, district, nid, created_at } = applicantData;

    const subject = `📋 নতুন SR আবেদন: ${name} (${application_id})`;

    const dateStr = new Date(created_at || Date.now()).toLocaleString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:40px 0;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 30px rgba(0,0,0,.10);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#1a237e 0%,#283593 100%);padding:28px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <p style="color:#9fa8da;font-size:11px;margin:0 0 4px;letter-spacing:1px;text-transform:uppercase;">NovaTech BD — নিয়োগ বিভাগ</p>
          <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">📋 নতুন SR আবেদন এসেছে</h1>
        </td>
        <td style="text-align:right;white-space:nowrap;">
          <span style="display:inline-block;background:#ff6f00;color:#fff;font-size:11px;font-weight:700;padding:5px 14px;border-radius:20px;">নতুন আবেদন</span>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- ALERT -->
  <tr>
    <td style="background:#fff8e1;border-bottom:2px solid #ffe082;padding:12px 40px;">
      <p style="margin:0;color:#e65100;font-size:13px;font-weight:600;">
        ⚡ একটি নতুন SR আবেদন জমা পড়েছে। অনুগ্রহ করে পর্যালোচনা করুন।
      </p>
    </td>
  </tr>

  <!-- APPLICATION ID -->
  <tr>
    <td style="padding:28px 40px 0;">
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#e8eaf6;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <tr>
          <td style="color:#3949ab;font-size:12px;font-weight:700;letter-spacing:1px;">আবেদন নম্বর</td>
          <td style="text-align:right;">
            <span style="color:#1a237e;font-size:20px;font-weight:800;font-family:'Courier New',monospace;letter-spacing:2px;">${application_id}</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="color:#7986cb;font-size:11px;padding-top:4px;">জমার সময়: ${dateStr}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- APPLICANT INFO -->
  <tr>
    <td style="padding:0 40px 28px;">
      <p style="color:#37474f;font-size:12px;font-weight:700;margin:0 0 14px;letter-spacing:.5px;">👤 আবেদনকারীর তথ্য</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;padding:16px 18px;">
        <tr>
          <td style="padding:6px 0;color:#78909c;font-size:12.5px;width:40%;">নাম</td>
          <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:700;">${name}</td>
        </tr>
        <tr><td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:2px 0;"></div></td></tr>
        <tr>
          <td style="padding:6px 0;color:#78909c;font-size:12.5px;">মোবাইল</td>
          <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:600;">${phone || '—'}</td>
        </tr>
        <tr><td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:2px 0;"></div></td></tr>
        <tr>
          <td style="padding:6px 0;color:#78909c;font-size:12.5px;">ইমেইল</td>
          <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:600;">${applicantEmail || '—'}</td>
        </tr>
        <tr><td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:2px 0;"></div></td></tr>
        <tr>
          <td style="padding:6px 0;color:#78909c;font-size:12.5px;">NID</td>
          <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:600;">${nid || '—'}</td>
        </tr>
        <tr><td colspan="2"><div style="border-top:1px dashed #e0e0e0;margin:2px 0;"></div></td></tr>
        <tr>
          <td style="padding:6px 0;color:#78909c;font-size:12.5px;">জেলা</td>
          <td style="padding:6px 0;color:#263238;font-size:12.5px;font-weight:600;">${district || '—'}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f4f6f9;border-top:1px solid #e0e0e0;padding:18px 40px;text-align:center;">
      <p style="color:#78909c;font-size:11.5px;margin:0 0 4px;font-weight:600;">NovaTech BD (Ltd.) — Admin Panel</p>
      <p style="color:#cfd8dc;font-size:10px;margin:4px 0 0;">এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে।</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `নতুন SR আবেদন!\nআবেদন নম্বর: ${application_id}\nনাম: ${name}\nমোবাইল: ${phone}\nজেলা: ${district}\nসময়: ${dateStr}`;

    for (const email of (Array.isArray(toEmails) ? toEmails : [toEmails])) {
        await sendEmail(email, subject, html, text);
    }
};

module.exports = {
    sendEmail,
    sendOTPEmail,
    sendOTPWithInvoiceEmail,
    sendSRApplicationOTPEmail,
    sendSRApplicationConfirmEmail,
    sendSRApplicationAdminNotifyEmail,
    sendInvoiceEmail,
    sendOrderNotificationEmail,
    sendWelcomeEmail,
    clearEmailConfigCache,
};
