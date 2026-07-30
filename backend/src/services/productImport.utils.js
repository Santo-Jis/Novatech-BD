/**
 * productImport.utils.js
 * ─────────────────────────────────────────────────────────────
 * Bulk CSV import-এর সব validation/normalization যুক্তি এখানে —
 * preview ও commit দুটো ধাপই একই ফাংশন ব্যবহার করে, তাই
 * "প্রিভিউতে যা দেখানো হলো, কমিটেও ঠিক তাই হবে" — নিশ্চিত থাকে।
 * ─────────────────────────────────────────────────────────────
 */

const ALLOWED_UNITS         = ['pcs', 'kg', 'g', 'box', 'ltr', 'set', 'pair'];
const ALLOWED_DISCOUNT_TYPE = ['flat', 'percent'];

// CSV টেমপ্লেটের কলাম অর্ডার — ডাউনলোড ও আপলোড দুটোতেই এই ক্রম অনুসরণ করা হয়
const TEMPLATE_HEADERS = [
    'name', 'sku', 'category', 'brand', 'unit',
    'price', 'cost_price', 'stock', 'reorder_point',
    'discount', 'discount_type', 'vat', 'tax',
    'description', 'image_url'
];

const REQUIRED_HEADERS = ['name', 'sku', 'price'];

const MAX_IMPORT_ROWS = 2000;

/**
 * একটা raw CSV record (rowsToObjects থেকে আসা) কে validate ও normalize করে।
 *
 * @param {object} raw - { __row, name, sku, price, ... } (সব স্ট্রিং)
 * @param {object} ctx
 * @param {Map<string,{id:string}>} ctx.existingSkuMap      - lowercase(sku) → { id }  (বিদ্যমান প্রডাক্ট)
 * @param {Map<string,{id:string}>} ctx.existingCategoryMap - lowercase(name/name_bn) → { id, name }
 * @param {Set<string>} ctx.seenSkusInFile                  - এই ফাইলে ইতিমধ্যে দেখা SKU (lowercase) — duplicate ধরতে
 * @returns {object} normalized row result (নিচে shape দেখুন)
 */
const normalizeRow = (raw, ctx) => {
    const { existingSkuMap, existingCategoryMap, seenSkusInFile } = ctx;
    const errors   = [];
    const warnings = [];

    // ── নাম ──
    const name = String(raw.name || '').trim();
    if (!name) errors.push('পণ্যের নাম আবশ্যক।');

    // ── SKU ──
    const sku = String(raw.sku || '').trim();
    if (!sku) {
        errors.push('SKU আবশ্যক।');
    } else if (seenSkusInFile.has(sku.toLowerCase())) {
        errors.push('এই SKU ফাইলে একাধিকবার আছে।');
    } else {
        seenSkusInFile.add(sku.toLowerCase());
    }

    // ── মূল্য ──
    const priceNum = parseFloat(raw.price);
    if (raw.price === undefined || raw.price === '' || isNaN(priceNum) || priceNum < 0) {
        errors.push('মূল্য (price) আবশ্যক এবং ০ বা তার বেশি একটি সংখ্যা হতে হবে।');
    }

    // ── ক্রয়মূল্য ──
    let costPriceNum = 0;
    if (raw.cost_price !== undefined && raw.cost_price !== '') {
        costPriceNum = parseFloat(raw.cost_price);
        if (isNaN(costPriceNum) || costPriceNum < 0) {
            errors.push('ক্রয়মূল্য (cost_price) সংখ্যা হতে হবে (০ বা বেশি)।');
            costPriceNum = 0;
        } else if (!isNaN(priceNum) && costPriceNum > priceNum) {
            warnings.push('ক্রয়মূল্য বিক্রয়মূল্যের চেয়ে বেশি — মার্জিন নেগেটিভ হবে।');
        }
    }

    // ── স্টক (শুধু নতুন পণ্যের জন্য প্রযোজ্য) ──
    let stockNum = 0;
    if (raw.stock !== undefined && raw.stock !== '') {
        stockNum = parseInt(raw.stock, 10);
        if (isNaN(stockNum) || stockNum < 0) {
            errors.push('স্টক (stock) একটি অ-ঋণাত্মক পূর্ণসংখ্যা হতে হবে।');
            stockNum = 0;
        }
    }

    // ── একক ──
    let unit = String(raw.unit || '').trim().toLowerCase();
    if (!unit) {
        unit = 'pcs';
    } else if (!ALLOWED_UNITS.includes(unit)) {
        warnings.push(`একক "${raw.unit}" চেনা যায়নি — pcs ধরা হলো। বৈধ মান: ${ALLOWED_UNITS.join(', ')}`);
        unit = 'pcs';
    }

    // ── ব্র্যান্ড ──
    const brand = String(raw.brand || '').trim();

    // ── ক্যাটাগরি ──
    const categoryText = String(raw.category || '').trim();
    let category_id = null;
    let willCreateCategory = false;
    if (categoryText) {
        const match = existingCategoryMap.get(categoryText.toLowerCase());
        if (match) {
            category_id = match.id;
        } else {
            willCreateCategory = true; // commit-এর সময় নতুন ক্যাটাগরি তৈরি হবে
            warnings.push(`ক্যাটাগরি "${categoryText}" পাওয়া যায়নি — নতুন ক্যাটাগরি হিসেবে তৈরি হবে।`);
        }
    }

    // ── রি-অর্ডার পয়েন্ট ──
    let reorderPointNum = 0;
    if (raw.reorder_point !== undefined && raw.reorder_point !== '') {
        reorderPointNum = parseInt(raw.reorder_point, 10);
        if (isNaN(reorderPointNum) || reorderPointNum < 0) {
            errors.push('রি-অর্ডার পয়েন্ট একটি অ-ঋণাত্মক পূর্ণসংখ্যা হতে হবে।');
            reorderPointNum = 0;
        }
    }

    // ── ছাড় ──
    let discountNum = 0;
    if (raw.discount !== undefined && raw.discount !== '') {
        discountNum = parseFloat(raw.discount);
        if (isNaN(discountNum) || discountNum < 0) {
            errors.push('ছাড় (discount) একটি অ-ঋণাত্মক সংখ্যা হতে হবে।');
            discountNum = 0;
        }
    }
    let discountType = String(raw.discount_type || '').trim().toLowerCase();
    if (!discountType) {
        discountType = 'flat';
    } else if (!ALLOWED_DISCOUNT_TYPE.includes(discountType)) {
        warnings.push(`discount_type "${raw.discount_type}" অবৈধ — flat ধরা হলো। বৈধ মান: flat, percent`);
        discountType = 'flat';
    }

    // ── VAT / Tax ──
    let vatNum = 0;
    if (raw.vat !== undefined && raw.vat !== '') {
        vatNum = parseFloat(raw.vat);
        if (isNaN(vatNum) || vatNum < 0) {
            errors.push('VAT একটি অ-ঋণাত্মক সংখ্যা হতে হবে।');
            vatNum = 0;
        } else if (vatNum > 100) {
            warnings.push('VAT ১০০%-এর বেশি — মান আবার যাচাই করুন।');
        }
    }
    let taxNum = 0;
    if (raw.tax !== undefined && raw.tax !== '') {
        taxNum = parseFloat(raw.tax);
        if (isNaN(taxNum) || taxNum < 0) {
            errors.push('Tax একটি অ-ঋণাত্মক সংখ্যা হতে হবে।');
            taxNum = 0;
        } else if (taxNum > 100) {
            warnings.push('Tax ১০০%-এর বেশি — মান আবার যাচাই করুন।');
        }
    }

    // ── বিবরণ / ছবি ──
    const description = String(raw.description || '').trim();
    const image_url    = String(raw.image_url || '').trim();
    if (image_url && !/^https?:\/\//i.test(image_url)) {
        warnings.push('image_url সাধারণত http:// বা https:// দিয়ে শুরু হয় — লিংকটি যাচাই করুন।');
    }

    // ── create নাকি update ──
    const existing = sku ? existingSkuMap.get(sku.toLowerCase()) : null;
    const action = existing ? 'update' : 'create';
    if (existing && stockNum > 0) {
        warnings.push('বিদ্যমান পণ্যের জন্য stock কলাম উপেক্ষা করা হবে — স্টক পরিবর্তনের জন্য "স্টক এডজাস্ট" ব্যবহার করুন।');
    }

    return {
        row:    raw.__row,
        sku,
        name,
        action,
        status: errors.length > 0 ? 'error' : 'ok',
        errors,
        warnings,
        existing_product_id: existing?.id || null,
        willCreateCategory,
        data: {
            name, sku,
            price:         isNaN(priceNum) ? 0 : priceNum,
            cost_price:    costPriceNum,
            stock:         stockNum,
            unit,
            brand,
            category_name: categoryText,
            category_id,
            reorder_point: reorderPointNum,
            discount:      discountNum,
            discount_type: discountType,
            vat:           vatNum,
            tax:           taxNum,
            description,
            image_url,
        }
    };
};

module.exports = {
    ALLOWED_UNITS,
    ALLOWED_DISCOUNT_TYPE,
    TEMPLATE_HEADERS,
    REQUIRED_HEADERS,
    MAX_IMPORT_ROWS,
    normalizeRow,
};
