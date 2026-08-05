// backend/src/controllers/supplierImport.controller.js
// Bulk CSV Import — সাপ্লায়ার।
// productImport.controller.js থেকে হুবহু গঠন নেওয়া:
// downloadTemplate → previewImport → commitImport।
// Preview-commit দুটো ধাপ একই normalizeRow() ব্যবহার করে (supplierImport.utils.js),
// তাই "প্রিভিউতে যা দেখানো হলো, কমিটেও ঠিক তাই হবে" — নিশ্চিত থাকে।

const logger = require('../config/logger');
const { query } = require('../config/db');
const { parseCSV, rowsToObjects, buildCSV } = require('../services/csv.utils');
const {
    TEMPLATE_HEADERS, REQUIRED_HEADERS, MAX_IMPORT_ROWS, normalizeRow
} = require('../services/supplierImport.utils');

// বিদ্যমান সাপ্লায়ারের name+phone map (lowercase) — ডুপ্লিকেট ও update ধরতে
const loadContext = async (tenantId) => {
    const res = await query(`SELECT id, name, phone FROM suppliers WHERE tenant_id = $1`, [tenantId]);
    const existingNamePhoneMap = new Map();
    res.rows.forEach(s => {
        const key = `${(s.name || '').toLowerCase()}|${(s.phone || '').toLowerCase()}`;
        existingNamePhoneMap.set(key, s.id);
    });
    return { existingNamePhoneMap };
};

const parseAndValidateFile = (fileBuffer, ctx) => {
    const rawRows = parseCSV(fileBuffer);
    const { headers, records } = rowsToObjects(rawRows);

    const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
        const err = new Error(`CSV ফাইলে আবশ্যক কলাম নেই: ${missingHeaders.join(', ')}`);
        err.isHeaderError = true;
        throw err;
    }
    if (records.length === 0) {
        const err = new Error('CSV ফাইলে কোনো ডেটা সারি পাওয়া যায়নি।');
        err.isHeaderError = true;
        throw err;
    }
    if (records.length > MAX_IMPORT_ROWS) {
        const err = new Error(`একবারে সর্বোচ্চ ${MAX_IMPORT_ROWS}টি সারি import করা যাবে। আপনার ফাইলে ${records.length}টি সারি আছে।`);
        err.isHeaderError = true;
        throw err;
    }

    const seenInFile = new Set();
    return records.map(raw => normalizeRow(raw, { ...ctx, seenInFile }));
};

// ============================================================
// GET /api/suppliers/import/template
// ============================================================
const downloadTemplate = async (req, res) => {
    try {
        const sampleRows = [
            ['ABC ট্রেডার্স', 'রহিম উদ্দিন', '01711000001', 'abc@example.com', 'raw_material', 'net_30', '123456789', '', 'TRAD-2026-001', 'সোনালী ব্যাংক', '1234567890', 'মতিঝিল শাখা', 'bkash', '01811000001', 'ঢাকা, মতিঝিল', 'পুরনো সাপ্লায়ার'],
            ['XYZ সার্ভিসেস', '', '01922000002', '', 'service', 'cod', '', '', '', '', '', '', '', '', 'চট্টগ্রাম', ''],
        ];
        const csv = buildCSV(TEMPLATE_HEADERS, sampleRows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="supplier_import_template.csv"');
        return res.send(csv);
    } catch (error) {
        logger.error('❌ Supplier Import Template Error:', error.message);
        return res.status(500).json({ success: false, message: 'টেমপ্লেট তৈরিতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/suppliers/import/preview
// শুধু validate করে — কিছু DB-তে সেভ হয় না
// ============================================================
const previewImport = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'CSV ফাইল আপলোড করুন।' });

        const ctx  = await loadContext(req.tenantId);
        const rows = parseAndValidateFile(req.file.buffer, ctx);

        const errorRows = rows.filter(r => r.status === 'error');
        const summary = {
            totalRows: rows.length,
            validRows: rows.length - errorRows.length,
            errorRows: errorRows.length,
            toCreate:  rows.filter(r => r.status === 'ok' && r.action === 'create').length,
            toUpdate:  rows.filter(r => r.status === 'ok' && r.action === 'update').length,
        };

        return res.status(200).json({ success: true, data: { summary, rows } });

    } catch (error) {
        if (error.isHeaderError) return res.status(400).json({ success: false, message: error.message });
        logger.error('❌ Supplier Import Preview Error:', error.message);
        return res.status(500).json({ success: false, message: 'ফাইল প্রসেস করতে সমস্যা হয়েছে।' });
    }
};

// ============================================================
// POST /api/suppliers/import/commit
// body: { rows: [ preview থেকে পাওয়া row objects (শুধু status:'ok') ] }
// ─────────────────────────────────────────────────────────────────
// নিরাপত্তা: client-এর action/existing_id অন্ধভাবে বিশ্বাস করা হয় না —
// fresh DB state দিয়ে আবার resolve করা হয়।
// প্রতিটি সারি আলাদা try/catch — একটা ব্যর্থ হলেও বাকিগুলো চলে।
// ============================================================
const commitImport = async (req, res) => {
    try {
        const inputRows = Array.isArray(req.body.rows) ? req.body.rows : [];
        if (inputRows.length === 0) return res.status(400).json({ success: false, message: 'Import করার মতো কোনো বৈধ সারি নেই।' });
        if (inputRows.length > MAX_IMPORT_ROWS) return res.status(400).json({ success: false, message: `একবারে সর্বোচ্চ ${MAX_IMPORT_ROWS}টি সারি import করা যাবে।` });

        const tenantId = req.tenantId;
        const ctx      = await loadContext(tenantId);

        // Re-validate
        const seenInFile  = new Set();
        const revalidated = inputRows.map(r => normalizeRow(
            { __row: r.row, ...r.data, name: r.name ?? r.data?.name },
            { ...ctx, seenInFile }
        ));

        const okRows   = revalidated.filter(r => r.status === 'ok');
        const rejected = revalidated.filter(r => r.status === 'error')
            .map(r => ({ row: r.row, name: r.name, message: r.errors.join(' ') }));

        if (okRows.length === 0) {
            return res.status(400).json({ success: false, message: 'কোনো সারিই commit করার উপযুক্ত নয়।', data: { created: 0, updated: 0, failed: rejected } });
        }

        let created = 0;
        let updated = 0;
        const failed = [...rejected];

        for (const r of okRows) {
            const d = r.data;
            try {
                if (r.existing_id) {
                    await query(
                        `UPDATE suppliers SET
                            name = $1, contact_person = COALESCE($2, contact_person),
                            phone = COALESCE($3, phone), email = COALESCE($4, email),
                            supplier_type = $5, payment_terms = $6,
                            tin_number = COALESCE($7, tin_number), bin_number = COALESCE($8, bin_number),
                            trade_license_no = COALESCE($9, trade_license_no),
                            bank_name = COALESCE($10, bank_name), bank_account_no = COALESCE($11, bank_account_no),
                            bank_branch = COALESCE($12, bank_branch),
                            mfs_provider = COALESCE($13, mfs_provider), mfs_number = COALESCE($14, mfs_number),
                            address = COALESCE($15, address), notes = COALESCE($16, notes),
                            updated_at = NOW()
                         WHERE id = $17 AND tenant_id = $18`,
                        [
                            d.name, d.contact_person, d.phone, d.email,
                            d.supplier_type, d.payment_terms,
                            d.tin_number, d.bin_number, d.trade_license_no,
                            d.bank_name, d.bank_account_no, d.bank_branch,
                            d.mfs_provider, d.mfs_number,
                            d.address, d.notes,
                            r.existing_id, tenantId
                        ]
                    );
                    updated++;
                } else {
                    await query(
                        `INSERT INTO suppliers (tenant_id, name, contact_person, phone, email,
                            supplier_type, payment_terms,
                            tin_number, bin_number, trade_license_no,
                            bank_name, bank_account_no, bank_branch,
                            mfs_provider, mfs_number, address, notes)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
                        [
                            tenantId, d.name, d.contact_person, d.phone, d.email,
                            d.supplier_type, d.payment_terms,
                            d.tin_number, d.bin_number, d.trade_license_no,
                            d.bank_name, d.bank_account_no, d.bank_branch,
                            d.mfs_provider, d.mfs_number, d.address, d.notes
                        ]
                    );
                    created++;
                }
            } catch (err) {
                logger.error('❌ Supplier Import Row Error:', { row: r.row, name: r.name, err: err.message });
                const message = err.code === '23514'
                    ? 'supplier_type বা payment_terms মান সঠিক নয়।'
                    : 'এই সারিটি সেভ করা যায়নি।';
                failed.push({ row: r.row, name: r.name, message });
            }
        }

        return res.status(200).json({
            success: true,
            message: `আমদানি সম্পন্ন — ${created}টি নতুন, ${updated}টি আপডেট হয়েছে।`,
            data: { created, updated, failed }
        });

    } catch (error) {
        logger.error('❌ Supplier Import Commit Error:', error.message);
        return res.status(500).json({ success: false, message: 'আমদানিতে সমস্যা হয়েছে।' });
    }
};

module.exports = { downloadTemplate, previewImport, commitImport };
