/**
 * tenantSettingsSeed.js
 *
 * নতুন tenant তৈরির সময় default tenant (Novatech)-এর system_settings কপি করা হয় —
 * কিন্তু কোম্পানির নিজস্ব পরিচয় ও পেমেন্ট নম্বর কপি করা চলবে না, নইলে
 * নতুন কোম্পানির Settings, ইনভয়েস, আবেদন ফর্ম ও পেমেন্ট নির্দেশনায়
 * Novatech-এর নাম/ফোন/ইমেইল/bKash/Nagad নম্বর বসে যায়।
 */
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

// এই key গুলো প্রতিটি tenant-এর নিজস্ব — default থেকে কপি হবে না
const TENANT_OWN_KEYS = [
    'company_name', 'company_address', 'company_phone', 'company_email',
    'bkash_number', 'nagad_number',
];

/**
 * @param {(sql:string, params:any[]) => Promise<any>} run  — query বা client.query wrapper
 * @param {string} tenantId
 */
const seedTenantSettings = async (run, tenantId) => {
    // ১. বাকি সব default setting কপি (company/payment key বাদে)
    await run(
        `INSERT INTO system_settings (tenant_id, key, value)
         SELECT $1, key, value FROM system_settings
          WHERE tenant_id = $2 AND key <> ALL($3::text[])
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        [tenantId, DEFAULT_TENANT_ID, TENANT_OWN_KEYS]
    );

    // ২. কোম্পানির নিজের তথ্য tenants টেবিল (signup-এ দেওয়া) থেকে বসাও
    await run(
        `INSERT INTO system_settings (tenant_id, key, value)
         SELECT t.id, v.key, v.value
           FROM tenants t,
                LATERAL (VALUES
                    ('company_name',    t.company_name::text),
                    ('company_address', t.company_address::text),
                    ('company_phone',   t.company_phone::text),
                    ('company_email',   t.company_email::text)
                ) AS v(key, value)
          WHERE t.id = $1 AND v.value IS NOT NULL AND v.value <> ''
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        [tenantId]
    );
};

module.exports = { seedTenantSettings, TENANT_OWN_KEYS, DEFAULT_TENANT_ID };
