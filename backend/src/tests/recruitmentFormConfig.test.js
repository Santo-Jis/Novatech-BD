/**
 * SR নিয়োগ ফর্ম config — unit test (DB ছাড়া, query mock)
 */
const {
    RECRUITMENT_CONFIG_KEY,
    DEFAULT_CONFIG,
    LIMITS,
    sanitizeConfig,
    parseStoredConfig,
    loadTenantConfig,
    saveTenantConfig,
    resetTenantConfig,
} = require('../services/recruitmentFormConfig');

describe('sanitizeConfig', () => {
    test('ফাঁকা/ভুল ইনপুটে default ফেরে', () => {
        expect(sanitizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
        expect(sanitizeConfig(null)).toEqual(DEFAULT_CONFIG);
        expect(sanitizeConfig('x')).toEqual(DEFAULT_CONFIG);
        expect(sanitizeConfig([])).toEqual(DEFAULT_CONFIG);
        expect(sanitizeConfig({})).toEqual(DEFAULT_CONFIG);
    });

    test('default config নিজেই sanitize-এ অপরিবর্তিত (idempotent)', () => {
        expect(sanitizeConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)))).toEqual(DEFAULT_CONFIG);
    });

    test('বৈধ পরিবর্তন প্রয়োগ হয়, বাকিটা default থাকে', () => {
        const c = sanitizeConfig({
            job: { work_area: 'ঢাকা', salary: '১৫,০০০ – ২০,০০০' },
            require_otp: false,
        });
        expect(c.job.work_area).toBe('ঢাকা');
        expect(c.job.salary).toBe('১৫,০০০ – ২০,০০০');
        expect(c.job.title).toBe(DEFAULT_CONFIG.job.title);
        expect(c.require_otp).toBe(false);
        expect(c.accepting).toBe(true);
    });

    test('HTML ট্যাগ ও control character বাদ যায়', () => {
        const c = sanitizeConfig({
            job: { title: '<script>alert(1)</script>SR\u0000 পদ' },
            header: { subtitle: '<b>ফর্ম</b>\nনতুন' },
        });
        expect(c.job.title).not.toMatch(/[<>\u0000]/);
        expect(c.job.title).toContain('SR');
        expect(c.header.subtitle).not.toMatch(/[<>\n]/);
    });

    test('আবশ্যিক লেখা ফাঁকা পাঠালে default-এ ফেরে', () => {
        const c = sanitizeConfig({
            job: { title: '   ' },
            header: { subtitle: '' },
            declaration: { text: '' },
            success: { title: '', message: '' },
        });
        expect(c.job.title).toBe(DEFAULT_CONFIG.job.title);
        expect(c.header.subtitle).toBe(DEFAULT_CONFIG.header.subtitle);
        expect(c.declaration.text).toBe(DEFAULT_CONFIG.declaration.text);
        expect(c.success.title).toBe(DEFAULT_CONFIG.success.title);
        expect(c.success.message).toBe(DEFAULT_CONFIG.success.message);
    });

    test('ঐচ্ছিক লেখা (কর্মএলাকা, বেতন, ব্যাজ) ফাঁকা রাখা যায়', () => {
        const c = sanitizeConfig({
            job: { work_area: '', salary: '' },
            header: { status_badge: '' },
        });
        expect(c.job.work_area).toBe('');
        expect(c.job.salary).toBe('');
        expect(c.header.status_badge).toBe('');
    });

    test('দৈর্ঘ্যের সীমা প্রয়োগ হয়', () => {
        const c = sanitizeConfig({
            job: { title: 'ক'.repeat(500) },
            declaration: { text: 'খ'.repeat(5000) },
        });
        expect(c.job.title.length).toBeLessThanOrEqual(LIMITS.short);
        expect(c.declaration.text.length).toBeLessThanOrEqual(LIMITS.long);
    });

    test('ভুল ধরনের মান (boolean ছাড়া) উপেক্ষিত', () => {
        const c = sanitizeConfig({ accepting: 'false', require_otp: 0, job: { show_banner: 'no' } });
        expect(c.accepting).toBe(true);
        expect(c.require_otp).toBe(true);
        expect(c.job.show_banner).toBe(true);
    });

    test('অজানা key বাদ যায়', () => {
        const c = sanitizeConfig({ evil: 1, job: { title: 'SR', __proto__: { x: 1 }, extra: 'y' } });
        expect(c.evil).toBeUndefined();
        expect(c.job.extra).toBeUndefined();
        expect({}.x).toBeUndefined();
    });

    describe('শর্তাবলী', () => {
        test('ফাঁকা text বাদ, সর্বোচ্চ সংখ্যা সীমিত', () => {
            const items = Array.from({ length: 20 }, (_, i) => ({ icon: '✅', text: `শর্ত ${i + 1}` }));
            items.splice(2, 0, { icon: '❌', text: '   ' }, 'not-an-object', null);
            const c = sanitizeConfig({ terms: { items } });
            expect(c.terms.items).toHaveLength(LIMITS.termsMax);
            expect(c.terms.items.every(i => i.text)).toBe(true);
            expect(c.terms.items[2].text).toBe('শর্ত 3');
        });

        test('ফাঁকা আইকন হলে • বসে', () => {
            const c = sanitizeConfig({ terms: { items: [{ icon: '', text: 'শর্ত' }] } });
            expect(c.terms.items[0].icon).toBe('•');
        });

        test('সব শর্ত মুছলে সেকশন নিজে বন্ধ হয়', () => {
            const c = sanitizeConfig({ terms: { items: [] } });
            expect(c.terms.items).toEqual([]);
            expect(c.terms.enabled).toBe(false);
        });

        test('items না পাঠালে default শর্ত থাকে', () => {
            const c = sanitizeConfig({ terms: { title: 'নতুন শিরোনাম' } });
            expect(c.terms.title).toBe('নতুন শিরোনাম');
            expect(c.terms.items).toEqual(DEFAULT_CONFIG.terms.items);
        });
    });

    test('ঠিকানা নোট ফাঁকা হলে বন্ধ', () => {
        const c = sanitizeConfig({ address_note: { enabled: true, text: '' } });
        expect(c.address_note.enabled).toBe(false);
    });
});

describe('parseStoredConfig', () => {
    test('null / ভাঙা JSON → default', () => {
        expect(parseStoredConfig(null)).toEqual(DEFAULT_CONFIG);
        expect(parseStoredConfig('')).toEqual(DEFAULT_CONFIG);
        expect(parseStoredConfig('{not json')).toEqual(DEFAULT_CONFIG);
    });

    test('বৈধ JSON string পার্স হয়', () => {
        const c = parseStoredConfig(JSON.stringify({ job: { work_area: 'চট্টগ্রাম' } }));
        expect(c.job.work_area).toBe('চট্টগ্রাম');
    });
});

describe('DB helpers (query mock)', () => {
    test('loadTenantConfig — row না থাকলে default', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [] });
        const c = await loadTenantConfig(query, 'T1');
        expect(c).toEqual(DEFAULT_CONFIG);
        expect(query.mock.calls[0][1]).toEqual(['T1', RECRUITMENT_CONFIG_KEY]);
    });

    test('loadTenantConfig — সেভ করা মান পড়ে', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [{ value: JSON.stringify({ job: { salary: '২০০০০' } }) }] });
        const c = await loadTenantConfig(query, 'T1');
        expect(c.job.salary).toBe('২০০০০');
    });

    test('saveTenantConfig — UPDATE হলে INSERT হয় না', async () => {
        const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [] });
        const saved = await saveTenantConfig(query, 'T1', 'U1', { job: { work_area: 'সিলেট' } });
        expect(saved.job.work_area).toBe('সিলেট');
        expect(query).toHaveBeenCalledTimes(1);
        const [sql, params] = query.mock.calls[0];
        expect(sql).toMatch(/UPDATE system_settings/);
        expect(params[2]).toBe('T1');                 // tenant_id বাধ্যতামূলক WHERE-এ
        expect(JSON.parse(params[0]).job.work_area).toBe('সিলেট');
    });

    test('saveTenantConfig — row না থাকলে INSERT', async () => {
        const query = jest.fn()
            .mockResolvedValueOnce({ rowCount: 0, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] });
        await saveTenantConfig(query, 'T1', 'U1', {});
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[1][0]).toMatch(/INSERT INTO system_settings/);
        expect(query.mock.calls[1][1][3]).toBe('T1');
    });

    test('saveTenantConfig — অযাচিত মান sanitize হয়ে সেভ হয়', async () => {
        const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [] });
        await saveTenantConfig(query, 'T1', 'U1', { job: { title: '<img src=x onerror=1>SR' }, evil: 1 });
        const stored = JSON.parse(query.mock.calls[0][1][0]);
        expect(stored.job.title).toBe('SR');
        expect(stored.evil).toBeUndefined();
    });

    test('resetTenantConfig — শুধু নিজের tenant-এর row মোছে', async () => {
        const query = jest.fn().mockResolvedValue({ rowCount: 1 });
        const c = await resetTenantConfig(query, 'T1');
        expect(c).toEqual(DEFAULT_CONFIG);
        expect(query.mock.calls[0][0]).toMatch(/DELETE FROM system_settings WHERE tenant_id = \$1 AND key = \$2/);
        expect(query.mock.calls[0][1]).toEqual(['T1', RECRUITMENT_CONFIG_KEY]);
    });
});
