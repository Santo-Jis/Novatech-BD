// backend/src/services/emailTemplates.js
// ============================================================
// Notification Platform Phase 2: শেয়ার্ড email layout
//
// email.service.js-এর ৮টা template ফাংশনে (sendOTPEmail, sendInvoiceEmail,
// sendOTPWithInvoiceEmail, sendOrderNotificationEmail, sendWelcomeEmail,
// sendSRApplicationOTPEmail, sendSRApplicationConfirmEmail,
// sendSRApplicationAdminNotifyEmail) verify করা হয়েছে — সবগুলোতেই একই
// <!DOCTYPE html>...<table>...wrapper আলাদাভাবে কপি-পেস্ট করা ছিল, শুধু
// header gradient color আর table width সামান্য আলাদা। এখন এই একটা
// renderEmailLayout()-এ centralize — লোগো/ফন্ট/কাঠামো একবার বদলালে সব
// জায়গায় বদলাবে।
//
// এই পাসে migrate করা হয়েছে: email.service.js-এর sendOTPEmail, আর
// notification.service.js-এর renderCustomerEmail (Phase 1-এ যেটা লেখা
// হয়েছিল একটা সম্পূর্ণ আলাদা, কম email-client-safe div-based স্টাইলে —
// এখন বাকি সব email-এর মতো একই table-based স্টাইলে, ZovoriX ব্র্যান্ডিং
// সহ যেটা আগে ছিল না)।
//
// বাকি ৬টা টেমপ্লেট ইচ্ছাকৃতভাবে migrate করা হয়নি এই পাসে — প্রতিটাই বড়,
// multi-part (invoice line-items table, order items ইত্যাদি), visually
// render করে verify করার উপায় নেই বলে ঝুঁকিপূর্ণ mechanical rewrite
// এড়ানো হয়েছে। migrate করার রেফারেন্স (বর্তমান gradient/width):
//   sendInvoiceEmail                   #1a73e8→#0d47a1
//   sendOTPWithInvoiceEmail            #1a73e8→#0d47a1
//   sendOrderNotificationEmail         #e65100→#bf360c
//   sendWelcomeEmail                   #1a73e8→#0d47a1   width 540
//   sendSRApplicationOTPEmail          #1565c0→#0d47a1   width 540
//   sendSRApplicationConfirmEmail      #1b5e20→#2e7d32
//   sendSRApplicationAdminNotifyEmail  #1a237e→#283593
//
// i18n: lang parameter + ছোট STRINGS ডিকশনারি (bn/en) আছে, কিন্তু এখনো
// কোনো caller person_preferences.language থেকে আসল ভাষা resolve করে
// পাস করে না — সবখানে ডিফল্ট 'bn' (আচরণে কোনো পরিবর্তন নেই)। প্রতিটা
// caller থেকে customer-এর ভাষা বের করে পাঠানো আলাদা, পরের কাজ।
// ============================================================

const STRINGS = {
    bn: {
        footerNote:  'ZovoriX • স্বয়ংক্রিয় বার্তা — উত্তর দেওয়ার দরকার নেই',
        companyLine: 'ZovoriX (Ltd.) | inf.novatechbd@gmail.com | বরিশাল সদর – ১২০০',
    },
    en: {
        footerNote:  'ZovoriX • Automated message — no reply needed',
        companyLine: 'ZovoriX (Ltd.) | inf.novatechbd@gmail.com | Barisal Sadar – 1200',
    },
};
const stringsFor = (lang) => STRINGS[lang] || STRINGS.bn;

/**
 * renderEmailLayout — সব email-এর শেয়ার্ড DOCTYPE/table wrapper।
 * bodyHtml (আর ইচ্ছা করলে footerHtml) caller নিজে বানায় — unique content
 * এখানে আসে না, শুধু কাঠামোটা centralize করা।
 */
const renderEmailLayout = ({
    lang = 'bn',
    headerGradientFrom = '#1a73e8',
    headerGradientTo   = '#0d47a1',
    headerTitle    = 'ZovoriX',
    headerSubtitle = 'Management System',
    subtitleColor  = '#bbdefb',
    bodyHtml,
    footerHtml = null,   // না দিলে ডিফল্ট company-line ফুটার
    width = 500,
}) => {
    const s = stringsFor(lang);
    const footer = footerHtml ?? `<p style="color:#999;font-size:11px;margin:0;">${s.companyLine}</p>`;

    return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:30px 0;">
<tr><td align="center">
<table width="${width}" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1);">
  <tr>
    <td style="background:linear-gradient(135deg,${headerGradientFrom},${headerGradientTo});padding:28px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">${headerTitle}</h1>
      <p style="color:${subtitleColor};margin:4px 0 0;font-size:12px;">${headerSubtitle}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:35px 40px;">
      ${bodyHtml}
    </td>
  </tr>
  <tr>
    <td style="background:#f8f9fa;padding:15px;text-align:center;border-top:1px solid #e0e0e0;">
      ${footer}
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

module.exports = { renderEmailLayout, STRINGS, stringsFor };
