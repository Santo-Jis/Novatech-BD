/**
 * supplierImport.utils.js
 * ─────────────────────────────────────────────────────────────
 * Supplier bulk CSV import-এর validation/normalization যুক্তি।
 * গঠন productImport.utils.js থেকে হুবহু নেওয়া — preview ও
 * commit দুটো ধাপই একই normalizeRow() ব্যবহার করে।
 * ─────────────────────────────────────────────────────────────
 */

const ALLOWED_SUPPLIER_TYPES  = ['raw_material', 'finished_goods', 'service', 'other'];
const ALLOWED_PAYMENT_TERMS   = ['cod', 'net_15', 'net_30', 'net_45', 'net_60'];
const ALLOWED_MFS_PROVIDERS   = ['bkash', 'nagad', 'rocket', 'upay', 'other', ''];

// CSV টেমপ্লেটের কলাম অর্ডার
const TEMPLATE_HEADERS = [
    'name', 'contact_person', 'phone', 'email',
    'supplier_type', 'payment_terms',
    'tin_number', 'bin_number', 'trade_license_no',
    'bank_name', 'bank_account_no', 'bank_branch',
    'mfs_provider', 'mfs_number',
    'address', 'notes',
];

const REQUIRED_HEADERS = ['name'];

const MAX_IMPORT_ROWS = 1000;

// ফাইলে দেখানো টেবিলে-সংরক্ষিত সাপ্লায়ার টাইপ মান — ইংরেজি লেবেল → DB value
const SUPPLIER_TYPE_MAP = {
    'raw_material': 'raw_material', 'কাঁচামাল': 'raw_material',
    'finished_goods': 'finished_goods', 'তৈরি পণ্য': 'finished_goods',
    'service': 'service', 'সার্ভিস': 'service',
    'other': 'other', 'অন্যান্য': 'other',
};
const PAYMENT_TERMS_MAP = {
    'cod': 'cod', 'cash on delivery': 'cod', 'ক্যাশ অন ডেলিভারি': 'cod',
    'net_15': 'net_15', 'net 15': 'net_15', 'নেট ১৫': 'net_15',
    'net_30': 'net_30', 'net 30': 'net_30', 'নেট ৩০': 'net_30',
    'net_45': 'net_45', 'net 45': 'net_45', 'নেট ৪৫': 'net_45',
    'net_60': 'net_60', 'net 60': 'net_60', 'নেট ৬০': 'net_60',
};

/**
 * একটা raw CSV record কে validate ও normalize করে।
 *
 * @param {object} raw - { __row, name, phone, ... } (সব স্ট্রিং)
 * @param {object} ctx
 * @param {Map<string,string>} ctx.existingNamePhoneMap - lowercase(name+phone) → supplier_id (ডুপ্লিকেট ধরতে)
 * @param {Set<string>} ctx.seenInFile - এই ফাইলে দেখা composite key (ডুপ্লিকেট ধরতে)
 * @returns {object} normalized row result
 */
const normalizeRow = (raw, ctx) => {
    const { existingNamePhoneMap, seenInFile } = ctx;
    const errors   = [];
    const warnings = [];

    // ── নাম ──
    const name = String(raw.name || '').trim();
    if (!name) errors.push('সাপ্লায়ারের নাম আবশ্যক।');

    // ── ফোন ──
    const phone = String(raw.phone || '').trim();

    // ── ডুপ্লিকেট চেক: name+phone মিলিয়ে unique key ──
    const compositeKey = `${name.toLowerCase()}|${phone.toLowerCase()}`;
    if (name && seenInFile.has(compositeKey)) {
        errors.push('এই সাপ্লায়ার (নাম+ফোন) ফাইলে একাধিকবার আছে।');
    } else if (name) {
        seenInFile.add(compositeKey);
    }

    // ── বিদ্যমান কিনা ──
    const existingId = existingNamePhoneMap.get(compositeKey) || null;
    const action     = existingId ? 'update' : 'create';
    if (existingId) {
        warnings.push('এই নাম+ফোনের সাপ্লায়ার আগে থেকেই আছে — আপডেট হবে।');
    }

    // ── সাপ্লায়ারের ধরন ──
    const supplierTypeRaw = String(raw.supplier_type || '').trim().toLowerCase();
    const supplier_type = SUPPLIER_TYPE_MAP[supplierTypeRaw] || 'other';
    if (supplierTypeRaw && !SUPPLIER_TYPE_MAP[supplierTypeRaw]) {
        warnings.push(`supplier_type "${raw.supplier_type}" চেনা যায়নি — "other" ধরা হলো।`);
    }

    // ── পেমেন্ট শর্ত ──
    const paymentTermsRaw = String(raw.payment_terms || '').trim().toLowerCase();
    const payment_terms = PAYMENT_TERMS_MAP[paymentTermsRaw] || 'net_30';
    if (paymentTermsRaw && !PAYMENT_TERMS_MAP[paymentTermsRaw]) {
        warnings.push(`payment_terms "${raw.payment_terms}" চেনা যায়নি — "net_30" ধরা হলো।`);
    }

    // ── MFS provider ──
    const mfsRaw = String(raw.mfs_provider || '').trim().toLowerCase();
    const mfs_provider = ALLOWED_MFS_PROVIDERS.includes(mfsRaw) ? (mfsRaw || null) : null;
    if (mfsRaw && !ALLOWED_MFS_PROVIDERS.includes(mfsRaw)) {
        warnings.push(`mfs_provider "${raw.mfs_provider}" চেনা যায়নি — খালি রাখা হলো।`);
    }

    return {
        row:             raw.__row,
        name,
        phone,
        action,
        status:          errors.length > 0 ? 'error' : 'ok',
        errors,
        warnings,
        existing_id:     existingId,
        data: {
            name,
            contact_person:  String(raw.contact_person || '').trim() || null,
            phone:           phone || null,
            email:           String(raw.email || '').trim() || null,
            supplier_type,
            payment_terms,
            tin_number:      String(raw.tin_number || '').trim() || null,
            bin_number:      String(raw.bin_number || '').trim() || null,
            trade_license_no: String(raw.trade_license_no || '').trim() || null,
            bank_name:       String(raw.bank_name || '').trim() || null,
            bank_account_no: String(raw.bank_account_no || '').trim() || null,
            bank_branch:     String(raw.bank_branch || '').trim() || null,
            mfs_provider,
            mfs_number:      String(raw.mfs_number || '').trim() || null,
            address:         String(raw.address || '').trim() || null,
            notes:           String(raw.notes || '').trim() || null,
        }
    };
};

module.exports = { TEMPLATE_HEADERS, REQUIRED_HEADERS, MAX_IMPORT_ROWS, normalizeRow };
