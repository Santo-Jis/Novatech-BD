require('dotenv').config();

const { query, pool } = require('../config/db');
const { uploadToCloudinary } = require('../services/employee.service');

// ============================================================
// ONE-TIME SCRIPT: বিদ্যমান base64 product image_url গুলো Cloudinary-তে
// আপলোড করে ছোট্ট URL দিয়ে replace করে।
//
// প্রেক্ষাপট: প্রোডাক্ট তৈরি/এডিটের সময় admin/Products.jsx FileReader
// দিয়ে ছবি base64 বানিয়ে সরাসরি products.image_url কলামে সেভ করতো —
// গড়ে ~২৭৩ KB, সর্বোচ্চ ১.৬ MB প্রতি ছবি। ফলে /portal/products লিস্ট,
// ডিটেইল, related — প্রতিটা API রেসপন্স কয়েকশ KB থেকে কয়েক MB হয়ে
// যাচ্ছিল, আর স্লো/অস্থির মোবাইল নেটওয়ার্কে frontend-এর ১৫s timeout
// পার হয়ে product detail sheet ক্র্যাশ করছিল।
//
// controllers/product.controller.js ফিক্স হয়ে গেছে — নতুন কোনো ছবি
// আর base64 হিসেবে সেভ হবে না। কিন্তু আগে থেকে DB-তে থাকা রো-গুলো এই
// স্ক্রিপ্ট না চালালে ঠিক হবে না, তাই এই এক-বারের মাইগ্রেশন।
//
// চালানোর নিয়ম — আসল DB + Cloudinary env-সহ যেখানে ব্যাকএন্ড চলে
// (যেমন Render Shell), সরাসরি লোকালে না (base64 রাইট SSL/env লাগবে):
//
//   cd backend
//   node src/scripts/migrate-base64-product-images.js            # আসল মাইগ্রেশন
//   node src/scripts/migrate-base64-product-images.js --dry-run  # শুধু প্রিভিউ, কিছু বদলাবে না
// ============================================================

const BASE64_IMAGE_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;
const isDryRun = process.argv.includes('--dry-run');

const run = async () => {
    console.log(isDryRun
        ? '🔍 DRY RUN — কিছু বদলানো হবে না, শুধু কী পাওয়া গেছে দেখানো হবে\n'
        : '🚀 base64 → Cloudinary মাইগ্রেশন শুরু হচ্ছে...\n');

    const { rows } = await query(
        `SELECT id, sku, name, image_url
         FROM products
         WHERE image_url LIKE 'data:image%'
         ORDER BY name ASC`
    );

    if (rows.length === 0) {
        console.log('✅ কোনো base64 ছবি পাওয়া যায়নি — সব প্রোডাক্টের ছবি আগে থেকেই ঠিকঠাক URL হিসেবে আছে।');
        await pool.end();
        return;
    }

    console.log(`📦 ${rows.length}টা প্রোডাক্টে base64 ছবি পাওয়া গেছে:\n`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const product of rows) {
        const sizeKB = Math.round(Buffer.byteLength(product.image_url, 'utf8') / 1024);
        process.stdout.write(`  → ${product.name}  (${product.sku || product.id})  ~${sizeKB} KB ... `);

        if (isDryRun) {
            console.log('স্কিপ (dry-run)');
            skipped++;
            continue;
        }

        try {
            const match = BASE64_IMAGE_RE.exec(product.image_url);
            if (!match) {
                console.log('⚠️  base64 প্যাটার্নের সাথে মিলছে না, স্কিপ করা হলো');
                skipped++;
                continue;
            }

            const [, mimetype, base64Payload] = match;
            const buffer = Buffer.from(base64Payload, 'base64');
            const safeSku = String(product.sku || product.id).replace(/[^a-zA-Z0-9_-]/g, '_');

            const newUrl = await uploadToCloudinary(buffer, 'products', `${safeSku}-migrated`, mimetype);

            if (!newUrl) {
                console.log('❌ Cloudinary আপলোড ব্যর্থ (env var চেক করুন: CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET)');
                failed++;
                continue;
            }

            await query(
                `UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2`,
                [newUrl, product.id]
            );
            console.log(`✅ ${newUrl}`);
            success++;

        } catch (err) {
            console.log(`❌ Error: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n📊 সারাংশ: ${success} সফল, ${failed} ব্যর্থ, ${skipped} স্কিপ — মোট ${rows.length}টা।`);
    await pool.end();
};

run().catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
