// backend/src/config/publicAppUrl.js
// ============================================================
// PUBLIC APP URL — কাস্টমার-facing লিংক (WhatsApp/Email/Invoice PDF)
// তৈরির জন্য single, clean URL রিটার্ন করে।
//
// সমস্যা যেটা এই ফাইল সমাধান করছে:
//   FRONTEND_URL env variable server.js-এ CORS-এর জন্য ব্যবহৃত হয়,
//   যেখানে comma দিয়ে একাধিক origin এবং wildcard (*) সাপোর্ট করা হয়:
//     FRONTEND_URL=https://novatech-bd-kqrn.vercel.app,https://novatech-bd*.vercel.app
//
//   কিন্তু customerPortal/sales/creditReminder/email/invoice controller-এ
//   এই একই variable সরাসরি ব্যবহার করে একটা মাত্র লিংক বানানো হতো —
//   ফলে উপরের মতো value সেট থাকলে লিংক হয়ে যেত:
//     https://novatech-bd-kqrn.vercel.app,https://novatech-bd*.vercel.app/customer-login?c=...
//   — যেটা ভাঙা এবং click করলে 404 দেয় (কারণ "novatech-bd*.vercel.app"
//   টা literal domain না, ওটা শুধু CORS regex wildcard)।
//
// সমাধান:
//   1. PUBLIC_APP_URL env var সেট থাকলে সেটাই ব্যবহার হবে (recommended —
//      Render → Environment → PUBLIC_APP_URL=https://novatech-bd-kqrn.vercel.app)
//   2. না থাকলে, FRONTEND_URL থেকে প্রথম non-wildcard, comma-বিহীন origin
//      বেছে নেওয়া হয় (self-healing fallback, misconfiguration হলেও লিংক ভাঙবে না)।
//   3. কিছুই না থাকলে হার্ডকোডেড default।
// ============================================================

const DEFAULT_PUBLIC_APP_URL = 'https://novatech-bd-kqrn.vercel.app';

const getPublicAppUrl = (fallback = DEFAULT_PUBLIC_APP_URL) => {
    const explicit = (process.env.PUBLIC_APP_URL || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');

    const raw = process.env.FRONTEND_URL || '';
    const firstConcreteOrigin = raw
        .split(',')
        .map(url => url.trim())
        .filter(Boolean)
        .find(url => !url.includes('*'));

    return (firstConcreteOrigin || fallback).replace(/\/$/, '');
};

module.exports = { getPublicAppUrl, DEFAULT_PUBLIC_APP_URL };
