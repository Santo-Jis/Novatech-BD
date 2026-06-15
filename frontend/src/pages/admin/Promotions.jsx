import { useState, useEffect } from 'react';
import { FiTag, FiPlus, FiEdit2, FiBarChart2 } from 'react-icons/fi';
import api from '../../api/axios';

const TYPES = [
    { value: 'percent_off',  label: '% ছাড়' },
    { value: 'flat_off',     label: '৳ ছাড়' },
    { value: 'buy_x_get_y', label: 'কিনলে পাবেন (Buy X Get Y)' },
    { value: 'min_order',    label: 'ন্যূনতম অর্ডার অফার' },
];

const empty = {
    name: '', description: '', type: 'percent_off',
    discount_value: '', buy_quantity: '', free_quantity: '', free_product_id: '',
    min_order_amount: '', start_date: '', end_date: '',
    apply_to: 'all', max_uses: '', is_active: true,
};

export default function Promotions() {
    const [promos,   setPromos]   = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form,     setForm]     = useState(empty);
    const [saving,   setSaving]   = useState(false);
    const [tab,      setTab]      = useState('active');

    const load = () => {
        setLoading(true);
        api.get('/promotions')
            .then(r => setPromos(r.data.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        if (!form.name || !form.type || !form.start_date || !form.end_date) {
            return alert('নাম, ধরন ও তারিখ দিন।');
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

    const filtered = promos.filter(p =>
        tab === 'active'   ? p.is_active :
        tab === 'inactive' ? !p.is_active : true
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
            <div className="flex gap-2 mb-4">
                {[['active', 'সক্রিয়'], ['inactive', 'বন্ধ'], ['all', 'সব']].map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium border transition
                            ${tab === k ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-200'}`}>
                        {l}
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
                        <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-800">{p.name}</h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {new Date(p.start_date).toLocaleDateString('bn-BD')} —{' '}
                                        {new Date(p.end_date).toLocaleDateString('bn-BD')}
                                        {' · '} ব্যবহার: {p.use_count || 0} বার
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => toggle(p)}
                                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            p.is_active
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        {p.is_active ? 'সক্রিয়' : 'বন্ধ'}
                                    </button>
                                    <button onClick={() => { setForm({ ...p }); setShowForm(true); }}
                                        className="p-1.5 text-gray-400 hover:text-blue-600">
                                        <FiEdit2 size={15} />
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 mt-2">
                                মোট ছাড়: ৳{Number(p.total_discount_given || 0).toLocaleString('bn-BD')}
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

                                <input
                                    type="number"
                                    placeholder="সর্বোচ্চ ব্যবহার (blank = unlimited)"
                                    value={form.max_uses}
                                    onChange={e => set('max_uses', e.target.value)}
                                    className="w-full border rounded-xl px-4 py-2.5 text-sm"
                                />
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
        </div>
    );
}
