import { useState, useEffect, useRef } from 'react';
import { FiVolume2, FiPlus, FiEdit2, FiImage, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../api/axios';

// ─── ছবি আপলোড প্রিভিউ কম্পোনেন্ট ──────────────────────────
// (Products.jsx-এর ImageUpload-এর সাথে হুবহু মিলিয়ে — একই UX,
// file বেছে নিলে base64 preview হিসেবে সেভ হয়, অথবা সরাসরি URL)
function ImageUpload({ value, onChange }) {
    const inputRef = useRef();

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('শুধু ছবি ফাইল আপলোড করুন।');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => onChange(reader.result);
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">পোস্টের ছবি (ঐচ্ছিক)</label>
            {value ? (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={value} alt="preview" className="w-full h-full object-contain" />
                    <button type="button" onClick={() => onChange('')}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                        <FiX size={12} />
                    </button>
                </div>
            ) : (
                <div onClick={() => inputRef.current.click()}
                    className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                    <FiImage className="text-gray-400 mb-2" size={24} />
                    <p className="text-sm text-gray-400">ক্লিক করে ছবি বেছে নিন</p>
                    <p className="text-xs text-gray-300 mt-1">JPG, PNG, WEBP</p>
                </div>
            )}
            <input
                placeholder="অথবা ছবির URL দিন (https://...)"
                value={value && value.startsWith('http') ? value : ''}
                onChange={e => onChange(e.target.value)}
                className="mt-1 w-full border rounded-xl px-4 py-2.5 text-sm"
            />
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
    );
}

const empty = { title: '', body: '', image_url: '', link_url: '', is_active: true };

export default function CompanyPosts() {
    const [posts,    setPosts]    = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form,     setForm]     = useState(empty);
    const [saving,   setSaving]   = useState(false);
    const [tab,      setTab]      = useState('active');

    const load = () => {
        setLoading(true);
        api.get('/company-posts')
            .then(r => setPosts(r.data.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        if (!form.title) return alert('শিরোনাম দিন।');
        setSaving(true);
        try {
            if (form.id) {
                await api.put(`/company-posts/${form.id}`, form);
            } else {
                await api.post('/company-posts', form);
            }
            load();
            setShowForm(false);
            setForm(empty);
        } catch (e) {
            alert(e.response?.data?.message || 'সমস্যা হয়েছে।');
        } finally { setSaving(false); }
    };

    const toggle = async (p) => {
        await api.put(`/company-posts/${p.id}`, { is_active: !p.is_active });
        load();
    };

    const filtered = posts.filter(p =>
        tab === 'active'   ? p.is_active :
        tab === 'inactive' ? !p.is_active : true
    );

    return (
        <div className="p-4 max-w-3xl mx-auto pb-10">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <FiVolume2 className="text-blue-600" /> কোম্পানির পোস্ট
                </h2>
                <button
                    onClick={() => { setForm(empty); setShowForm(true); }}
                    className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
                    <FiPlus size={16} /> নতুন পোস্ট
                </button>
            </div>
            <p className="text-xs text-gray-400 -mt-2 mb-4">
                এখানে যা পোস্ট করবেন তা আপনার কানেক্টেড কাস্টমারদের কাস্টমার পোর্টাল হোম ফিডে দেখা যাবে (নতুন পণ্য, ঘোষণা, আপডেট ইত্যাদির জন্য — ছাড়/অফারের জন্য "অফার/প্রমোশন" পেজ ব্যবহার করুন)।
            </p>

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
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex gap-3 min-w-0">
                                    {p.image_url && (
                                        <img src={p.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                                    )}
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-gray-800 truncate">{p.title}</h3>
                                        {p.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.body}</p>}
                                        <p className="text-xs text-gray-400 mt-1">
                                            {new Date(p.created_at).toLocaleDateString('bn-BD')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button onClick={() => toggle(p)}
                                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        {p.is_active ? 'সক্রিয়' : 'বন্ধ'}
                                    </button>
                                    <button onClick={() => { setForm({ ...p }); setShowForm(true); }}
                                        className="p-1.5 text-gray-400 hover:text-blue-600">
                                        <FiEdit2 size={15} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!filtered.length && (
                        <div className="text-center py-16 text-gray-400">
                            <FiVolume2 size={36} className="mx-auto mb-2 opacity-30" />
                            <p>কোনো পোস্ট নেই।</p>
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
                                {form.id ? 'পোস্ট আপডেট' : 'নতুন পোস্ট'}
                            </h3>

                            <div className="space-y-3">
                                <input
                                    placeholder="শিরোনাম"
                                    value={form.title}
                                    onChange={e => set('title', e.target.value)}
                                    className="w-full border rounded-xl px-4 py-2.5 text-sm"
                                />
                                <textarea
                                    placeholder="বিস্তারিত (ঐচ্ছিক)"
                                    value={form.body}
                                    onChange={e => set('body', e.target.value)}
                                    className="w-full border rounded-xl px-4 py-2.5 text-sm h-20 resize-none"
                                />
                                <ImageUpload value={form.image_url} onChange={val => set('image_url', val)} />
                                <input
                                    placeholder="লিংক (ঐচ্ছিক, যেমন একটা প্রোডাক্ট পেজ)"
                                    value={form.link_url}
                                    onChange={e => set('link_url', e.target.value)}
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
