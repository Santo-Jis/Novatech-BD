import { useState, useEffect } from 'react';
import { FiTag, FiPlus, FiEdit2, FiBarChart2 } from 'react-icons/fi';
import api from '../../api/axios';

const TYPES = [
    { value: 'percent_off',     label: '% ছাড়' },
    { value: 'flat_off',        label: '৳ ছাড়' },
    { value: 'buy_x_get_y',     label: 'কিনলে পাবেন (Buy X Get Y)' },
    { value: 'min_order',       label: 'ন্যূনতম অর্ডার অফার' },
    { value: 'tiered_discount', label: 'স্ল্যাব/টায়ার্ড ছাড় (যত বেশি কিনবেন তত বেশি ছাড়)' },
];

const APPLY_TO = [
    { value: 'all',                label: 'সব পণ্য/সব কাস্টমার' },
    { value: 'specific_products',  label: 'নির্দিষ্ট পণ্য/ক্যাটাগরি' },
    { value: 'specific_routes',    label: 'নির্দিষ্ট রুট' },
    { value: 'specific_customers', label: 'নির্দিষ্ট কাস্টমার' },
];

const empty = {
    name: '', description: '', type: 'percent_off',
    discount_value: '', buy_quantity: '', free_quantity: '', free_product_id: '',
    min_order_amount: '', start_date: '', end_date: '',
    apply_to: 'all', product_ids: [], category_ids: [], route_ids: [], customer_ids: [],
    max_uses: '', max_per_customer: '', is_active: true,
    promo_code: '', stackable: true, priority: 0, tiers: [], budget_cap: '', // ← Phase ২
    banner_image_url: '', // ← Phase ৫
};

// ছোট, reusable checkbox multi-select — mobile-এ native <select multiple> এর চেয়ে সহজ
function MultiPicker({ options, selected, onChange, labelKey = 'label', valueKey = 'value', emptyText }) {
    const toggle = (val) => {
        const s = new Set((selected || []).map(String));
        s.has(String(val)) ? s.delete(String(val)) : s.add(String(val));
        onChange([...s]);
    };
    if (!options.length) {
        return <p className="text-xs text-gray-400 px-1">{emptyText || 'কিছু পাওয়া যায়নি।'}</p>;
    }
    return (
        <div className="border rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
            {options.map(o => (
                <label key={o[valueKey]} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input
                        type="checkbox"
                        checked={(selected || []).map(String).includes(String(o[valueKey]))}
                        onChange={() => toggle(o[valueKey])}
                        className="rounded"
                    />
                    {o[labelKey]}
                </label>
            ))}
        </div>
    );
}

export default function Promotions() {
    const [promos,    setPromos]    = useState([]);
    const [products,  setProducts]  = useState([]);   // buy_x_get_y ফ্রি-প্রোডাক্ট + product targeting
    const [categories, setCategories] = useState([]); // ← নতুন: category targeting
    const [routes,    setRoutes]    = useState([]);   // ← নতুন: route targeting
    const [customers, setCustomers] = useState([]);   // ← নতুন: customer targeting
    const [loading,   setLoading]   = useState(true);
    const [showForm,  setShowForm]  = useState(false);
    const [form,      setForm]      = useState(empty);
    const [saving,    setSaving]    = useState(false);
    const [tab,       setTab]       = useState('active');
    const [reportFor, setReportFor] = useState(null); // ← Phase ৪: রিপোর্ট মোডালের জন্য promotion id
    const [report,    setReport]    = useState(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [bannerUploading, setBannerUploading] = useState(false); // ← Phase ৫

    const load = () => {
        setLoading(true);
        api.get('/promotions')
            .then(r => setPromos(r.data.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(load, []);
    useEffect(() => {
        api.get('/products?is_active=true').then(r => setProducts(r.data.data || [])).catch(console.error);
        api.get('/categories').then(r => setCategories(r.data.data || [])).catch(console.error);
        api.get('/routes').then(r => setRoutes(r.data.data || [])).catch(console.error);
        api.get('/customers?limit=500').then(r => setCustomers(r.data.data || [])).catch(console.error);
    }, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    // ── tiered_discount-এর জন্য dynamic slab row helpers ──
    const addTier = () => set('tiers', [...(form.tiers || []), { min_qty: '', discount_value: '', discount_type: 'percent' }]);
    const updateTier = (i, key, val) => {
        const next = [...(form.tiers || [])];
        next[i] = { ...next[i], [key]: val };
        set('tiers', next);
    };
    const removeTier = (i) => set('tiers', (form.tiers || []).filter((_, idx) => idx !== i));

    const save = async () => {
        if (!form.name || !form.type || !form.start_date || !form.end_date) {
            return alert('নাম, ধরন ও তারিখ দিন।');
        }
        if (form.type === 'buy_x_get_y' && (!form.buy_quantity || !form.free_quantity || !form.free_product_id)) {
            return alert('কতটা কিনলে, কতটা ফ্রি, ও কোন পণ্য ফ্রি — তিনটাই দিন।');
        }
        if (form.type === 'tiered_discount' && (!form.tiers || !form.tiers.length)) {
            return alert('অন্তত একটা স্ল্যাব যোগ করুন (কতটা হলে কত% ছাড়)।');
        }
        setSaving(true);
        try {
            if (form.id) {
                await api.put(`/promotions/${form.id}`, form);
            } else {
                await api.post('/promotions', form);
            }
            load();
            setShowForm(false);
            setForm(empty);
        } catch (e) {
            alert(e.response?.data?.message || 'সমস্যা হয়েছে।');
        } finally { setSaving(false); }
    };

    const toggle = async (p) => {
        await api.put(`/promotions/${p.id}`, { is_active: !p.is_active });
        load();
    };

    // ✅ NEW (Phase ৩): approve/reject/clone
    const approve = async (p) => {
        try {
            await api.post(`/promotions/${p.id}/approve`);
            load();
        } catch (e) { alert(e.response?.data?.message || 'সমস্যা হয়েছে।'); }
    };
    const reject = async (p) => {
        if (!confirm(`"${p.name}" সত্যিই প্রত্যাখ্যান করতে চান?`)) return;
        try {
            await api.post(`/promotions/${p.id}/reject`);
            load();
        } catch (e) { alert(e.response?.data?.message || 'সমস্যা হয়েছে।'); }
    };
    const clone = (p) => {
        const { id, created_at, use_count, total_discount_given, created_by_name,
                approval_status, approval_reason, approved_by, approved_at,
                current_uses, budget_used, banner_image_url, ...rest } = p;
        setForm({
            ...empty, ...rest,
            name: `${p.name} (কপি)`,
            promo_code: '', // কোড ইউনিক হতে হয়, কপিতে ফাঁকা রাখা ভালো
            start_date: '', end_date: '',
        });
        setShowForm(true);
    };

    // ✅ NEW (Phase ৫): banner ছবি আপলোড — শুধু বিদ্যমান promotion-এ (id লাগবে বলে)
    const uploadBanner = async (file) => {
        if (!file || !form.id) return;
        const fd = new FormData();
        fd.append('banner', file, file.name);
        setBannerUploading(true);
        try {
            const r = await api.post(`/promotions/${form.id}/banner`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setForm(f => ({ ...f, banner_image_url: r.data.data.banner_image_url }));
            load();
        } catch (e) {
            alert(e.response?.data?.message || 'ছবি আপলোড ব্যর্থ হয়েছে।');
        } finally {
            setBannerUploading(false);
        }
    };

    // ✅ NEW (Phase ৪): রিপোর্ট মোডাল খোলা
    const openReport = async (p) => {
        setReportFor(p);
        setReport(null);
        setReportLoading(true);
        try {
            const r = await api.get(`/promotions/${p.id}/report`);
            setReport(r.data.data);
        } catch (e) {
            alert('রিপোর্ট আনতে সমস্যা হয়েছে।');
            setReportFor(null);
        } finally {
            setReportLoading(false);
        }
    };

    const filtered = promos.filter(p =>
        tab === 'active'   ? p.is_active :
        tab === 'pending'  ? p.approval_status === 'pending' :
        tab === 'inactive' ? (!p.is_active && p.approval_status !== 'pending') : true
    );

    return (
        <div className="p-4 max-w-3xl mx-auto pb-10">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <FiTag className="text-blue-600" /> Trade Promotion
                </h2>
                <button
                    onClick={() => { setForm(empty); setShowForm(true); }}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
                    <FiPlus size={16} /> নতুন অফার
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {[['active', 'সক্রিয়'], ['pending', 'অনুমোদনের অপেক্ষায়'], ['inactive', 'বন্ধ'], ['all', 'সব']].map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium border transition relative
                            ${tab === k ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-200'}`}>
                        {l}
                        {k === 'pending' && pendingCount > 0 && (
                            <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(p => (
                        <div key={p.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${
                            p.approval_status === 'pending' ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100'
                        }`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-800">{p.name}</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {new Date(p.start_date).toLocaleDateString('bn-BD')} —{' '}
                                        {new Date(p.end_date).toLocaleDateString('bn-BD')}
                                        {' · '} ব্যবহার: {p.use_count || 0} বার
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => toggle(p)}
                                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            p.is_active
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        {p.is_active ? 'সক্রিয়' : 'বন্ধ'}
                                    </button>
                                    <button onClick={() => clone(p)} title="কপি করে নতুন বানান"
                                        className="p-1.5 text-gray-400 hover:text-blue-600 text-xs">
                                        📋
                                    </button>
                                    <button onClick={() => openReport(p)} title="রিপোর্ট দেখুন"
                                        className="p-1.5 text-gray-400 hover:text-blue-600">
                                        <FiBarChart2 size={15} />
                                    </button>
                                    <button onClick={() => { setForm({ ...p }); setShowForm(true); }}
                                        className="p-1.5 text-gray-400 hover:text-blue-600">
                                        <FiEdit2 size={15} />
                                    </button>
                                </div>
                            </div>

                            {/* ✅ NEW (Phase ৩): approval অবস্থা + approve/reject */}
                            {p.approval_status === 'pending' && (
                                <div className="mt-2 bg-amber-100 border border-amber-200 rounded-xl p-2.5">
                                    <p className="text-xs text-amber-800 font-medium">⏳ অনুমোদনের অপেক্ষায়</p>
                                    <p className="text-xs text-amber-700 mt-0.5">{p.approval_reason}</p>
                                    <div className="flex gap-2 mt-2">
                                        <button onClick={() => approve(p)}
                                            className="flex-1 bg-green-600 text-white text-xs py-1.5 rounded-lg font-medium">
                                            ✅ অনুমোদন
                                        </button>
                                        <button onClick={() => reject(p)}
                                            className="flex-1 bg-red-50 text-red-600 text-xs py-1.5 rounded-lg font-medium border border-red-200">
                                            ✕ প্রত্যাখ্যান
                                        </button>
                                    </div>
                                </div>
                            )}
                            {p.approval_status === 'rejected' && (
                                <p className="text-xs text-red-500 mt-2">✕ প্রত্যাখ্যাত</p>
                            )}
                            {p.promo_code && (
                                <p className="text-xs text-purple-600 mt-1.5">🎟️ কোড: {p.promo_code}</p>
                            )}

                            <p className="text-sm text-gray-500 mt-2">
                                মোট ছাড়: ৳{Number(p.total_discount_given || 0).toLocaleString('bn-BD')}
                                {p.budget_cap != null && (
                                    <span className="text-gray-400"> / বাজেট ৳{Number(p.budget_cap).toLocaleString('bn-BD')}</span>
                                )}
                            </p>
                        </div>
                    ))}
                    {!filtered.length && (
                        <div className="text-center py-16 text-gray-400">
                            <FiTag size={36} className="mx-auto mb-2 opacity-30" />
                            <p>কোনো প্রমোশন নেই।</p>
                        </div>
                    )}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 z-50 overflow-auto">
                    <div className="min-h-full flex items-end sm:items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
                            <h3 className="font-bold text-gray-800 mb-4">
                                {form.id ? 'Promotion আপডেট' : 'নতুন Promotion'}
                            </h3>

                            <div className="space-y-3">
                                <input
                                    placeholder="অফারের নাম"
                                    value={form.name}
                                    onChange={e => set('name', e.target.value)}
                                    className="w-full border rounded-xl px-4 py-2.5 text-sm"
                                />
                                <textarea
                                    placeholder="বিবরণ (optional)"
                                    value={form.description}
                                    onChange={e => set('description', e.target.value)}
                                    className="w-full border rounded-xl px-4 py-2.5 text-sm h-20 resize-none"
                                />
                                <select
                                    value={form.type}
                                    onChange={e => set('type', e.target.value)}
                                    className="w-full border rounded-xl px-4 py-2.5 text-sm">
                                    {TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>

                                {(form.type === 'percent_off' || form.type === 'flat_off') && (
                                    <input
                                        type="number"
                                        placeholder={form.type === 'percent_off' ? 'ছাড়ের % (যেমন: 15)' : 'ছাড়ের পরিমাণ ৳'}
                                        value={form.discount_value}
                                        onChange={e => set('discount_value', e.target.value)}
                                        className="w-full border rounded-xl px-4 py-2.5 text-sm"
                                    />
                                )}

                                {form.type === 'buy_x_get_y' && (
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="number" placeholder="কতটা কিনলে"
                                                value={form.buy_quantity}
                                                onChange={e => set('buy_quantity', e.target.value)}
                                                className="border rounded-xl px-4 py-2.5 text-sm"
                                            />
                                            <input
                                                type="number" placeholder="কতটা ফ্রি"
                                                value={form.free_quantity}
                                                onChange={e => set('free_quantity', e.target.value)}
                                                className="border rounded-xl px-4 py-2.5 text-sm"
                                            />
                                        </div>
                                        {/* কোন প্রোডাক্ট ফ্রি — আগে এই input-ই ছিল না, তাই এই টাইপের
                                            অফার তৈরি হলেও কখনো আসলে কার্যকর হতো না */}
                                        <select
                                            value={form.free_product_id}
                                            onChange={e => set('free_product_id', e.target.value)}
                                            className="w-full border rounded-xl px-4 py-2.5 text-sm bg-white">
                                            <option value="">কোন পণ্যটা ফ্রি দেবেন — বাছাই করুন</option>
                                            {products.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name} — ৳{p.price}
                                                </option>
                                            ))}
                                        </select>
                                        {!form.free_product_id && (
                                            <p className="text-xs text-red-500">
                                                ⚠️ ফ্রি পণ্য বাছাই না করলে এই অফার সংরক্ষণ হলেও কার্যকর হবে না।
                                            </p>
                                        )}
                                    </div>
                                )}

                                {form.type === 'tiered_discount' && (
                                    <div className="space-y-2 border rounded-xl p-3 bg-gray-50">
                                        <p className="text-xs text-gray-500">যত বেশি কিনবেন তত বেশি % ছাড় — একাধিক স্ল্যাব যোগ করুন</p>
                                        {(form.tiers || []).map((t, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <input
                                                    type="number" placeholder="কতটা হলে"
                                                    value={t.min_qty}
                                                    onChange={e => updateTier(i, 'min_qty', e.target.value)}
                                                    className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
                                                />
                                                <input
                                                    type="number" placeholder="% ছাড়"
                                                    value={t.discount_value}
                                                    onChange={e => updateTier(i, 'discount_value', e.target.value)}
                                                    className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
                                                />
                                                <button onClick={() => removeTier(i)} className="text-red-400 text-xs px-2">✕</button>
                                            </div>
                                        ))}
                                        <button onClick={addTier} className="text-xs text-blue-600 font-medium">+ স্ল্যাব যোগ করুন</button>
                                    </div>
                                )}

                                <input
                                    type="number"
                                    placeholder="ন্যূনতম অর্ডার পরিমাণ ৳ (optional)"
                                    value={form.min_order_amount}
                                    onChange={e => set('min_order_amount', e.target.value)}
                                    className="w-full border rounded-xl px-4 py-2.5 text-sm"
                                />

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block">শুরুর তারিখ</label>
                                        <input
                                            type="date" value={form.start_date}
                                            onChange={e => set('start_date', e.target.value)}
                                            className="w-full border rounded-xl px-3 py-2.5 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block">শেষের তারিখ</label>
                                        <input
                                            type="date" value={form.end_date}
                                            onChange={e => set('end_date', e.target.value)}
                                            className="w-full border rounded-xl px-3 py-2.5 text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="number"
                                        placeholder="সর্বমোট সর্বোচ্চ ব্যবহার (ফাঁকা = সীমাহীন)"
                                        value={form.max_uses}
                                        onChange={e => set('max_uses', e.target.value)}
                                        className="border rounded-xl px-4 py-2.5 text-sm"
                                    />
                                    <input
                                        type="number"
                                        placeholder="প্রতি কাস্টমার সর্বোচ্চ (ফাঁকা = সীমাহীন)"
                                        value={form.max_per_customer}
                                        onChange={e => set('max_per_customer', e.target.value)}
                                        className="border rounded-xl px-4 py-2.5 text-sm"
                                    />
                                </div>

                                {/* ── টার্গেটিং (Phase ২) ──────────────────────────── */}
                                <div className="border-t border-gray-100 pt-3">
                                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">🎯 কাদের জন্য এই অফার</label>
                                    <select
                                        value={form.apply_to}
                                        onChange={e => set('apply_to', e.target.value)}
                                        className="w-full border rounded-xl px-4 py-2.5 text-sm bg-white mb-2">
                                        {APPLY_TO.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                    </select>

                                    {form.apply_to === 'specific_products' && (
                                        <div className="space-y-2">
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">নির্দিষ্ট পণ্য (যেকোনো একটা মিললেই যথেষ্ট)</p>
                                                <MultiPicker
                                                    options={products.map(p => ({ value: p.id, label: p.name }))}
                                                    selected={form.product_ids}
                                                    onChange={v => set('product_ids', v)}
                                                    emptyText="কোনো পণ্য পাওয়া যায়নি।"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">অথবা পুরো ক্যাটাগরি</p>
                                                <MultiPicker
                                                    options={categories.map(c => ({ value: c.id, label: c.name_bn || c.name }))}
                                                    selected={form.category_ids}
                                                    onChange={v => set('category_ids', v)}
                                                    emptyText="কোনো ক্যাটাগরি পাওয়া যায়নি।"
                                                />
                                            </div>
                                            {!form.product_ids?.length && !form.category_ids?.length && (
                                                <p className="text-xs text-red-500">⚠️ অন্তত একটা পণ্য বা ক্যাটাগরি বাছাই না করলে এই অফার কোনো কার্টেই প্রযোজ্য হবে না।</p>
                                            )}
                                        </div>
                                    )}

                                    {form.apply_to === 'specific_routes' && (
                                        <MultiPicker
                                            options={routes.map(r => ({ value: r.id, label: r.name }))}
                                            selected={form.route_ids}
                                            onChange={v => set('route_ids', v)}
                                            emptyText="কোনো রুট পাওয়া যায়নি।"
                                        />
                                    )}

                                    {form.apply_to === 'specific_customers' && (
                                        <MultiPicker
                                            options={customers.map(c => ({ value: c.id, label: c.shop_name }))}
                                            selected={form.customer_ids}
                                            onChange={v => set('customer_ids', v)}
                                            emptyText="কোনো কাস্টমার পাওয়া যায়নি।"
                                        />
                                    )}
                                </div>

                                {/* ── উন্নত সেটিংস (Phase ২) ──────────────────────── */}
                                <div className="border-t border-gray-100 pt-3 space-y-2">
                                    <label className="text-xs font-semibold text-gray-600 block">⚙️ উন্নত সেটিংস</label>
                                    <div>
                                        <input
                                            placeholder="প্রমো কোড (optional — খালি রাখলে সবার জন্য automatic)"
                                            value={form.promo_code}
                                            onChange={e => set('promo_code', e.target.value.toUpperCase())}
                                            className="w-full border rounded-xl px-4 py-2.5 text-sm uppercase"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">
                                            কোড দিলে SR/কাস্টমারকে সেই কোড লিখেই এই অফার আনতে হবে — সাধারণ Active Offers তালিকায় দেখাবে না।
                                        </p>
                                    </div>
                                    <input
                                        type="number"
                                        placeholder="বাজেট ক্যাপ ৳ (optional — এই ক্যাম্পেইনে সর্বোচ্চ কত টাকা ছাড় দেওয়া যাবে)"
                                        value={form.budget_cap}
                                        onChange={e => set('budget_cap', e.target.value)}
                                        className="w-full border rounded-xl px-4 py-2.5 text-sm"
                                    />
                                    <div className="flex items-center justify-between">
                                        <label className="flex items-center gap-2 text-sm text-gray-600">
                                            <input
                                                type="checkbox"
                                                checked={form.stackable}
                                                onChange={e => set('stackable', e.target.checked)}
                                                className="rounded"
                                            />
                                            অন্য অফারের সাথে একসাথে চলবে (stackable)
                                        </label>
                                    </div>
                                    {!form.stackable && (
                                        <input
                                            type="number"
                                            placeholder="প্রায়োরিটি (সংখ্যা বেশি = গুরুত্ব বেশি, একাধিক non-stackable অফার মিললে সবচেয়ে বেশি প্রায়োরিটিরটাই চলবে)"
                                            value={form.priority}
                                            onChange={e => set('priority', e.target.value)}
                                            className="w-full border rounded-xl px-4 py-2.5 text-sm"
                                        />
                                    )}
                                </div>

                                {/* ── ব্যানার ছবি (Phase ৫) ────────────────────────── */}
                                {form.id ? (
                                    <div className="border-t border-gray-100 pt-3">
                                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">🖼️ ব্যানার ছবি (optional)</label>
                                        {form.banner_image_url && (
                                            <img src={form.banner_image_url} alt="banner" className="w-full h-32 object-cover rounded-xl mb-2" />
                                        )}
                                        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-3 text-sm text-gray-500 cursor-pointer hover:bg-gray-50">
                                            {bannerUploading ? 'আপলোড হচ্ছে...' : (form.banner_image_url ? 'বদলাতে চাইলে নতুন ছবি দিন' : 'ছবি বাছাই করুন')}
                                            <input
                                                type="file" accept="image/*" className="hidden" disabled={bannerUploading}
                                                onChange={e => uploadBanner(e.target.files?.[0])}
                                            />
                                        </label>
                                        <p className="text-xs text-gray-400 mt-1">Worker অ্যাপের Active Offers আর কাস্টমার পোর্টালে দেখাবে।</p>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                                        🖼️ প্রথমে সংরক্ষণ করুন, তারপর ব্যানার ছবি যোগ করতে পারবেন।
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => setShowForm(false)}
                                    className="flex-1 border border-gray-200 py-3 rounded-xl text-gray-600 text-sm">
                                    বাতিল
                                </button>
                                <button
                                    onClick={save} disabled={saving}
                                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium text-sm">
                                    {saving ? 'সংরক্ষণ...' : '✅ সংরক্ষণ'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── রিপোর্ট মোডাল (Phase ৪) ──────────────────────────── */}
            {reportFor && (
                <div className="fixed inset-0 bg-black/50 z-50 overflow-auto">
                    <div className="min-h-full flex items-end sm:items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800">📊 {reportFor.name}</h3>
                                <button onClick={() => setReportFor(null)} className="text-gray-400 text-xl leading-none">✕</button>
                            </div>

                            {reportLoading ? (
                                <div className="flex justify-center py-10">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                                </div>
                            ) : report && (
                                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                                    {/* মূল সংখ্যা */}
                                    <div className="grid grid-cols-2 gap-2 text-center">
                                        <div className="bg-blue-50 rounded-xl p-3">
                                            <p className="text-lg font-bold text-blue-700">{report.stats.total_uses}</p>
                                            <p className="text-xs text-gray-500">মোট ব্যবহার</p>
                                        </div>
                                        <div className="bg-pink-50 rounded-xl p-3">
                                            <p className="text-lg font-bold text-pink-700">৳{Number(report.stats.total_discount).toLocaleString('bn-BD')}</p>
                                            <p className="text-xs text-gray-500">মোট ছাড়</p>
                                        </div>
                                        <div className="bg-purple-50 rounded-xl p-3">
                                            <p className="text-lg font-bold text-purple-700">{report.stats.unique_customers}</p>
                                            <p className="text-xs text-gray-500">কাস্টমার</p>
                                        </div>
                                        <div className="bg-amber-50 rounded-xl p-3">
                                            <p className="text-lg font-bold text-amber-700">{report.stats.unique_workers}</p>
                                            <p className="text-xs text-gray-500">SR</p>
                                        </div>
                                    </div>

                                    {/* Before/After Lift + ROI */}
                                    <div className="border rounded-xl p-3">
                                        <p className="text-xs font-semibold text-gray-600 mb-2">📈 আগে-পরে তুলনা (একই কাস্টমারদের বিক্রি)</p>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-500">প্রমোশনের আগে (baseline)</span>
                                            <span>৳{Number(report.lift.baseline_revenue).toLocaleString('bn-BD')}</span>
                                        </div>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-500">প্রমোশন চলাকালীন</span>
                                            <span className="font-semibold">৳{Number(report.lift.during_revenue).toLocaleString('bn-BD')}</span>
                                        </div>
                                        <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                                            <span className="text-gray-500">Lift</span>
                                            <span className={report.lift.lift_percent > 0 ? 'text-green-600 font-semibold' : 'text-gray-500'}>
                                                {report.lift.lift_percent == null ? 'হিসাব করা যায়নি (baseline-এ বিক্রি ছিল না)' : `${report.lift.lift_percent}%`}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">ROI (ছাড়ের বিপরীতে)</span>
                                            <span className={report.lift.roi_percent > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                                                {report.lift.roi_percent == null ? '—' : `${report.lift.roi_percent}%`}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-400 mt-2">
                                            ⚠️ এটা directional signal — অন্য কারণেও (মৌসুম, ভিন্ন প্রমোশন) বিক্রি বদলাতে পারে, causal প্রমাণ না।
                                        </p>
                                    </div>

                                    {/* SR Leaderboard */}
                                    {report.sr_leaderboard.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-gray-600 mb-1.5">🏆 SR-ভিত্তিক (সেরা ৫)</p>
                                            <div className="space-y-1">
                                                {report.sr_leaderboard.slice(0, 5).map(sr => (
                                                    <div key={sr.worker_id} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                                                        <span>{sr.worker_name || '—'}</span>
                                                        <span className="text-gray-500">{sr.redemptions}x · ৳{Number(sr.total_discount).toLocaleString('bn-BD')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Route Leaderboard */}
                                    {report.route_leaderboard.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-gray-600 mb-1.5">🗺️ রুট-ভিত্তিক (সেরা ৫)</p>
                                            <div className="space-y-1">
                                                {report.route_leaderboard.slice(0, 5).map(r => (
                                                    <div key={r.route_id || 'none'} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                                                        <span>{r.route_name || 'রুট নেই'}</span>
                                                        <span className="text-gray-500">{r.redemptions}x · ৳{Number(r.total_discount).toLocaleString('bn-BD')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
