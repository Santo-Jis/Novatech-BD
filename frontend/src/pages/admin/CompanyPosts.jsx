import { useState, useEffect, useRef } from 'react';
import { FiVolume2, FiPlus, FiEdit2, FiImage, FiX, FiVideo } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../api/axios';

// ─── ছবি আপলোড কম্পোনেন্ট ──────────────────────────
// ✅ REDESIGN (Phase ১.৫ — মিডিয়া পাইপলাইন): আগে base64 বানিয়ে সরাসরি
// DB-তে পাঠানো হতো (বড় payload, কোনো CDN/thumbnail নেই)। এখন
// promotion.controller.js-এর banner আপলোডের ঠিক একই প্যাটার্নে আসল
// Cloudinary আপলোড — কিন্তু সেটার জন্য পোস্টের id লাগে। তাই দুইটা মোড:
//  • postId থাকলে (এডিট): ফাইল বাছার সাথে সাথেই আপলোড হয়ে যায়
//  • postId না থাকলে (নতুন পোস্ট): ফাইলটা "pending" হিসেবে রাখা হয়,
//    preview local ObjectURL দিয়ে, আসল আপলোড হবে save()-এ পোস্ট তৈরির পরে
function ImageUpload({ postId, imageUrl, pendingFile, uploading, onPickPending, onPickUpload, onRemove }) {
    const inputRef = useRef();
    const previewUrl = pendingFile ? URL.createObjectURL(pendingFile) : imageUrl;

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('শুধু ছবি ফাইল আপলোড করুন।');
            return;
        }
        if (postId) onPickUpload(file);
        else onPickPending(file);
    };

    return (
        <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">পোস্টের ছবি (ঐচ্ছিক)</label>
            {previewUrl ? (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={previewUrl} alt="preview" className="w-full h-full object-contain" />
                    {uploading && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-medium">
                            আপলোড হচ্ছে...
                        </div>
                    )}
                    <button type="button" onClick={onRemove}
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
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
    );
}

// ✅ NEW (Redesign Phase ১.৫ — অডিয়েন্স): Facebook/LinkedIn-স্টাইল visibility
const VISIBILITY_OPTIONS = [
    { value: 'public',      label: 'সবাই দেখবে',        hint: 'যেকোনো কানেক্টেড পোর্টাল কাস্টমার' },
    { value: 'connections', label: 'শুধু আমার কাস্টমার',  hint: 'শুধু আমার সাথে কানেক্টেড' },
    { value: 'select',      label: 'নির্বাচিত কাস্টমার',  hint: 'নিজে বেছে দেব' },
    { value: 'private',     label: 'শুধু আমি (ড্রাফট)',   hint: 'কেউ দেখবে না, পরে পাবলিশ করব' },
];

const empty = { title: '', body: '', image_url: '', video_url: '', link_url: '', is_active: true, visibility: 'public' };

export default function CompanyPosts() {
    const [posts,    setPosts]    = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form,     setForm]     = useState(empty);
    const [saving,   setSaving]   = useState(false);
    const [tab,      setTab]      = useState('active');

    // ✅ NEW (Redesign Phase ১.৫ — মিডিয়া পাইপলাইন)
    const [pendingImageFile, setPendingImageFile] = useState(null); // নতুন পোস্টে বাছা ফাইল, id না থাকায় আপলোড pending
    const [uploadingImage,   setUploadingImage]   = useState(false);
    // ✅ NEW (Redesign Phase ১.৬ — ভিডিও)
    const [pendingVideoFile, setPendingVideoFile] = useState(null);
    const [uploadingVideo,   setUploadingVideo]   = useState(false);
    const videoInputRef = useRef();
    // ✅ NEW (Redesign Phase ১.৭ — মাল্টি-ইমেজ গ্যালারি)
    const [pendingGalleryFiles, setPendingGalleryFiles] = useState([]);
    const [uploadingGallery,    setUploadingGallery]    = useState(false);
    const galleryInputRef = useRef();

    // ✅ NEW (Redesign Phase ১.৫ — অডিয়েন্স): visibility='select'-এ কাদের দেখানো হবে
    const [audienceIds,          setAudienceIds]          = useState([]);
    const [customerSearch,       setCustomerSearch]       = useState('');
    const [customerResults,      setCustomerResults]      = useState([]);
    const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
    const [audienceDetails,      setAudienceDetails]      = useState({}); // id -> {shop_name, owner_name}, চিপ দেখানোর জন্য

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
        if (form.visibility === 'select' && audienceIds.length === 0) {
            return alert('"নির্বাচিত কাস্টমার" ভিজিবিলিটির জন্য অন্তত একজন বেছে নিন।');
        }
        setSaving(true);
        try {
            const payload = { ...form };
            if (form.visibility === 'select') payload.audience_customer_ids = audienceIds;

            let postId = form.id;
            if (postId) {
                await api.put(`/company-posts/${postId}`, payload);
            } else {
                const r = await api.post('/company-posts', payload);
                postId = r.data.data.id;
            }

            // ✅ NEW (Redesign Phase ১.৫): নতুন পোস্টে ছবি বাছা থাকলে (id না
            // থাকায় তখন আপলোড করা যায়নি) এখন postId পাওয়ার পর আপলোড
            if (pendingImageFile && postId) {
                const fd = new FormData();
                fd.append('image', pendingImageFile, pendingImageFile.name);
                await api.post(`/company-posts/${postId}/image`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else if (pendingVideoFile && postId) {
                // ✅ NEW (Redesign Phase ১.৬)
                const fd = new FormData();
                fd.append('video', pendingVideoFile, pendingVideoFile.name);
                await api.post(`/company-posts/${postId}/video`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else if (pendingGalleryFiles.length > 0 && postId) {
                // ✅ NEW (Redesign Phase ১.৭)
                const fd = new FormData();
                pendingGalleryFiles.forEach(f => fd.append('images', f, f.name));
                await api.post(`/company-posts/${postId}/gallery`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            load();
            setShowForm(false);
            setForm(empty);
            setPendingImageFile(null);
            setPendingVideoFile(null);
            setPendingGalleryFiles([]);
            setAudienceIds([]);
            setAudienceDetails({});
        } catch (e) {
            alert(e.response?.data?.message || 'সমস্যা হয়েছে।');
        } finally { setSaving(false); }
    };

    // ✅ NEW (Redesign Phase ১.৫): এডিট মোডে (id আছে) ছবি বাছার সাথে সাথেই আপলোড
    const uploadExistingPostImage = async (file) => {
        setUploadingImage(true);
        try {
            const fd = new FormData();
            fd.append('image', file, file.name);
            const r = await api.post(`/company-posts/${form.id}/image`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            set('image_url', r.data.data.image_url);
            set('video_url', ''); // mutually exclusive — সার্ভারেও ক্লিয়ার হয়
        } catch (e) {
            alert(e.response?.data?.message || 'ছবি আপলোড ব্যর্থ হয়েছে।');
        } finally {
            setUploadingImage(false);
        }
    };

    // ✅ NEW (Redesign Phase ১.৬): ভিডিও — একই প্যাটার্ন, ২০MB লিমিট
    const uploadExistingPostVideo = async (file) => {
        if (file.size > 20 * 1024 * 1024) {
            return alert('ভিডিও সর্বোচ্চ ২০MB পর্যন্ত হতে পারে।');
        }
        setUploadingVideo(true);
        try {
            const fd = new FormData();
            fd.append('video', file, file.name);
            const r = await api.post(`/company-posts/${form.id}/video`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            set('video_url', r.data.data.video_url);
            set('image_url', '');
        } catch (e) {
            alert(e.response?.data?.message || 'ভিডিও আপলোড ব্যর্থ হয়েছে।');
        } finally {
            setUploadingVideo(false);
        }
    };

    // ✅ NEW (Redesign Phase ১.৭): গ্যালারি — একই প্যাটার্ন, সর্বোচ্চ ৪টা ছবি
    const uploadExistingPostGallery = async (files) => {
        setUploadingGallery(true);
        try {
            const fd = new FormData();
            files.forEach(f => fd.append('images', f, f.name));
            const r = await api.post(`/company-posts/${form.id}/gallery`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            set('media', r.data.data.media);
            set('image_url', ''); set('video_url', '');
        } catch (e) {
            alert(e.response?.data?.message || 'গ্যালারি আপলোড ব্যর্থ হয়েছে।');
        } finally {
            setUploadingGallery(false);
        }
    };

    // ✅ NEW (Redesign Phase ১.৫): "নির্বাচিত কাস্টমার" অডিয়েন্স পিকারের জন্য —
    // বিদ্যমান GET /customers এন্ডপয়েন্ট পুনঃব্যবহার, নতুন কিছু বানাতে হয়নি
    const searchCustomers = async () => {
        setCustomerSearchLoading(true);
        try {
            const r = await api.get('/customers', { params: { search: customerSearch, limit: 20 } });
            setCustomerResults(r.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setCustomerSearchLoading(false);
        }
    };

    const toggleAudience = (customer) => {
        setAudienceIds(ids => ids.includes(customer.id) ? ids.filter(x => x !== customer.id) : [...ids, customer.id]);
        setAudienceDetails(d => ({ ...d, [customer.id]: customer }));
    };

    // এডিট খোলার সময় visibility='select' হলে audienceIds প্রি-ফিল করা
    const openEdit = (p) => {
        setForm({ ...p });
        setAudienceIds(p.audience_customer_ids || []);
        setAudienceDetails({});
        setPendingImageFile(null);
        setPendingVideoFile(null);
        setPendingGalleryFiles([]);
        setShowForm(true);
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
                    onClick={() => { setForm(empty); setAudienceIds([]); setAudienceDetails({}); setPendingImageFile(null); setPendingVideoFile(null); setPendingGalleryFiles([]); setShowForm(true); }}
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
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <p className="text-xs text-gray-400">
                                                {new Date(p.created_at).toLocaleDateString('bn-BD')}
                                            </p>
                                            {p.visibility && p.visibility !== 'public' && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                                    {VISIBILITY_OPTIONS.find(v => v.value === p.visibility)?.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button onClick={() => toggle(p)}
                                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        {p.is_active ? 'সক্রিয়' : 'বন্ধ'}
                                    </button>
                                    <button onClick={() => openEdit(p)}
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
                        <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
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
                                <ImageUpload
                                    postId={form.id}
                                    imageUrl={form.image_url}
                                    pendingFile={pendingImageFile}
                                    uploading={uploadingImage}
                                    onPickPending={file => setPendingImageFile(file)}
                                    onPickUpload={uploadExistingPostImage}
                                    onRemove={() => { set('image_url', ''); setPendingImageFile(null); }}
                                />

                                {/* ✅ NEW (Redesign Phase ১.৬ — ভিডিও): image-এর ঠিক একই
                                    pending/immediate লজিক, কিন্তু ছোট আলাদা ব্লক — image আর
                                    video mutually exclusive বলে দুটোকে একটা কম্পোনেন্টে
                                    জোর করে মেশানোর চেয়ে আলাদা রাখা পরিষ্কার */}
                                {(form.video_url || pendingVideoFile) ? (
                                    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 bg-black">
                                        <video
                                            src={pendingVideoFile ? URL.createObjectURL(pendingVideoFile) : form.video_url}
                                            className="w-full h-full object-contain"
                                            controls
                                        />
                                        {uploadingVideo && (
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-medium">
                                                আপলোড হচ্ছে...
                                            </div>
                                        )}
                                        <button type="button" onClick={() => { set('video_url', ''); setPendingVideoFile(null); }}
                                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                                            <FiX size={12} />
                                        </button>
                                    </div>
                                ) : !form.image_url && !pendingImageFile && (
                                    <button
                                        type="button"
                                        onClick={() => videoInputRef.current.click()}
                                        className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-gray-400 text-xs hover:border-primary hover:bg-primary/5"
                                    >
                                        <FiVideo size={14} /> অথবা ভিডিও যোগ করুন (সর্বোচ্চ ২০MB)
                                    </button>
                                )}
                                <input
                                    ref={videoInputRef}
                                    type="file" accept="video/*" className="hidden"
                                    onChange={e => {
                                        const file = e.target.files[0];
                                        if (!file) return;
                                        if (file.size > 20 * 1024 * 1024) { alert('ভিডিও সর্বোচ্চ ২০MB পর্যন্ত হতে পারে।'); return; }
                                        if (form.id) uploadExistingPostVideo(file);
                                        else { setPendingVideoFile(file); setPendingImageFile(null); }
                                    }}
                                />

                                {/* ✅ NEW (Redesign Phase ১.৭ — মাল্টি-ইমেজ গ্যালারি) */}
                                {(form.media?.length > 0 || pendingGalleryFiles.length > 0) ? (
                                    <div>
                                        <div className="flex gap-1.5 overflow-x-auto">
                                            {(pendingGalleryFiles.length > 0
                                                ? pendingGalleryFiles.map(f => URL.createObjectURL(f))
                                                : (form.media || []).map(m => m.url)
                                            ).map((src, i) => (
                                                <img key={i} src={src} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                                            ))}
                                        </div>
                                        {uploadingGallery && <p className="text-[10.5px] text-gray-400 mt-1">আপলোড হচ্ছে...</p>}
                                        <button type="button" onClick={() => { set('media', null); setPendingGalleryFiles([]); }}
                                            className="text-[10.5px] text-red-500 mt-1">গ্যালারি সরান</button>
                                    </div>
                                ) : !form.image_url && !pendingImageFile && !form.video_url && !pendingVideoFile && (
                                    <button
                                        type="button"
                                        onClick={() => galleryInputRef.current.click()}
                                        className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-gray-400 text-xs hover:border-primary hover:bg-primary/5"
                                    >
                                        <FiImage size={14} /> অথবা একাধিক ছবির গ্যালারি (সর্বোচ্চ ৪টা)
                                    </button>
                                )}
                                <input
                                    ref={galleryInputRef}
                                    type="file" accept="image/*" multiple className="hidden"
                                    onChange={e => {
                                        const files = Array.from(e.target.files || []).slice(0, 4);
                                        if (files.length === 0) return;
                                        if (form.id) uploadExistingPostGallery(files);
                                        else { setPendingGalleryFiles(files); setPendingImageFile(null); setPendingVideoFile(null); }
                                    }}
                                />
                                <input
                                    placeholder="লিংক (ঐচ্ছিক, যেমন একটা প্রোডাক্ট পেজ)"
                                    value={form.link_url}
                                    onChange={e => set('link_url', e.target.value)}
                                    className="w-full border rounded-xl px-4 py-2.5 text-sm"
                                />

                                {/* ✅ NEW (Redesign Phase ১.৫ — অডিয়েন্স): visibility selector */}
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1.5">কারা দেখবে?</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {VISIBILITY_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => set('visibility', opt.value)}
                                                className={`text-left border rounded-xl px-3 py-2 transition-colors ${
                                                    form.visibility === opt.value
                                                        ? 'border-blue-600 bg-blue-50'
                                                        : 'border-gray-200'
                                                }`}
                                            >
                                                <p className="text-xs font-semibold text-gray-800">{opt.label}</p>
                                                <p className="text-[10.5px] text-gray-400 mt-0.5">{opt.hint}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {form.visibility === 'select' && (
                                    <div className="border border-gray-200 rounded-xl p-3">
                                        <p className="text-xs font-medium text-gray-600 mb-2">কাস্টমার খুঁজুন ও বেছে নিন</p>
                                        <div className="flex gap-1.5 mb-2">
                                            <input
                                                placeholder="দোকানের নাম / মালিকের নাম"
                                                value={customerSearch}
                                                onChange={e => setCustomerSearch(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && searchCustomers()}
                                                className="flex-1 border rounded-lg px-3 py-2 text-xs"
                                            />
                                            <button
                                                type="button" onClick={searchCustomers} disabled={customerSearchLoading}
                                                className="px-3 py-2 bg-gray-100 rounded-lg text-xs font-medium text-gray-600"
                                            >
                                                {customerSearchLoading ? '...' : 'খুঁজুন'}
                                            </button>
                                        </div>

                                        {customerResults.length > 0 && (
                                            <div className="max-h-32 overflow-y-auto border-t border-gray-100 divide-y divide-gray-50 mb-2">
                                                {customerResults.map(c => (
                                                    <label key={c.id} className="flex items-center gap-2 py-1.5 text-xs cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={audienceIds.includes(c.id)}
                                                            onChange={() => toggleAudience(c)}
                                                        />
                                                        {c.shop_name} <span className="text-gray-400">({c.owner_name})</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}

                                        {audienceIds.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {audienceIds.map(id => (
                                                    <span key={id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10.5px] px-2 py-1 rounded-full">
                                                        {audienceDetails[id]?.shop_name || `#${id.slice(0, 6)}`}
                                                        <button type="button" onClick={() => setAudienceIds(ids => ids.filter(x => x !== id))}>
                                                            <FiX size={10} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-[10px] text-gray-400 mt-1.5">{audienceIds.length} জন বেছে নেওয়া হয়েছে</p>
                                    </div>
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
        </div>
    );
}
