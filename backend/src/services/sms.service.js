const axios = require('axios');

// ============================================================
// SMS Service — SSL Wireless Adapter
// NovaTechBD Management System
// ============================================================
// যদি পরে অন্য provider ব্যবহার করতে চান,
// শুধু এই ফাইলের sendSMS() ফাংশন বদলালেই হবে
// ============================================================

// ============================================================
// CORE SMS SENDER
// SSL Wireless API দিয়ে SMS পাঠানো
// ============================================================

const sendSMS = async (phone, message) => {
    try {
        // ফোন নম্বর ফরম্যাট করো (88 prefix যোগ)
        let formattedPhone = phone.replace(/\D/g, ''); // শুধু সংখ্যা রাখো
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '88' + formattedPhone;
        }
        if (!formattedPhone.startsWith('88')) {
            formattedPhone = '88' + formattedPhone;
        }

        const apiKey   = process.env.SMS_API_KEY;
        const senderId = process.env.SMS_SENDER_ID || 'NovaTechBD';

        // SMS API Key না থাকলে লগ করো (Development mode)
        if (!apiKey) {
            console.log(`📱 SMS (Dev Mode) → ${formattedPhone}: ${message}`);
            return { success: true, dev: true };
        }

        // SSL Wireless API
        const response = await axios.post(
            'https://smsc.sslwireless.com/api/v3/send-sms',
            {
                api_token: apiKey,
                sid:       senderId,
                sms:       message,
                msisdn:    formattedPhone,
                csmsid:    `NTB_${Date.now()}`
            },
            { timeout: 10000 }
        );

        if (response.data?.status_code === 1000) {
            console.log(`✅ SMS পাঠানো সফল → ${formattedPhone}`);
            return { success: true, data: response.data };
        }

        throw new Error(response.data?.status_message || 'SMS পাঠানো ব্যর্থ');

    } catch (error) {
        console.error(`❌ SMS Error → ${phone}:`, error.message);
        return { success: false, error: error.message };
    }
};

// ============================================================
// OTP পাঠানো (বিক্রয়ে Invoice যাচাইয়ের জন্য)
// ============================================================

const sendOTP = async (phone, otp, shopName) => {
    const message =
        `NovaTechBD\n` +
        `দোকান: ${shopName}\n` +
        `OTP: ${otp}\n` +
        `মেয়াদ: ১০ মিনিট\n` +
        `এই কোড কাউকে দেবেন না।`;

    return await sendSMS(phone, message);
};

// ============================================================
// Invoice পাঠানো (WhatsApp লিংক সহ)
// ============================================================

const sendInvoice = async (phone, invoiceNumber, totalAmount, shopName) => {
    const message =
        `NovaTechBD Invoice\n` +
        `দোকান: ${shopName}\n` +
        `Invoice: ${invoiceNumber}\n` +
        `মোট: ৳${totalAmount.toLocaleString('bn-BD')}\n` +
        `ধন্যবাদ আমাদের সাথে থাকার জন্য।`;

    return await sendSMS(phone, message);
};

// ============================================================
// নতুন কর্মচারীর Login Credentials পাঠানো
// ============================================================

const sendLoginCredentials = async (phone, employeeCode, password, name) => {
    const message =
        `NovaTechBD\n` +
        `স্বাগতম ${name}!\n` +
        `আপনার লগইন তথ্য:\n` +
        `ID: ${employeeCode}\n` +
        `Password: ${password}\n` +
        `প্রথম লগইনে পাসওয়ার্ড পরিবর্তন করুন।`;

    return await sendSMS(phone, message);
};

// ============================================================
// WhatsApp এ Invoice পাঠানো
// (WhatsApp API না থাকলে wa.me লিংক ব্যবহার করো)
// ============================================================

const getWhatsAppInvoiceLink = (phone, invoiceNumber, totalAmount, shopName, items) => {
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '88' + formattedPhone;
    }

    // Items list তৈরি
    const itemsList = items
        .map(item => `• ${item.name}: ${item.qty} × ৳${item.price} = ৳${item.subtotal}`)
        .join('\n');

    const message =
        `🧾 *NovaTech BD Invoice*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🏪 দোকান: *${shopName}*\n` +
        `📋 Invoice: *${invoiceNumber}*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `${itemsList}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💰 মোট: *৳${totalAmount.toLocaleString('bn-BD')}*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `_NovaTech BD (Ltd.)_\n` +
        `_জানকি সিংহ রোড, বরিশাল_`;

    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
};

module.exports = {
    sendSMS,
    sendOTP,
    sendInvoice,
    sendLoginCredentials,
    getWhatsAppInvoiceLink
};
