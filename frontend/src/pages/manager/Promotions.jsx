import { useState, useEffect } from 'react';
import { FiTag } from 'react-icons/fi';
import api from '../../api/axios';

// Manager-এর জন্য read-only promotions view। GET /promotions permission
// আগে থেকেই manager role-কে দেওয়া ছিল (backend routes.js), কিন্তু এটা
// দেখানোর কোনো UI পেজ ছিল না — এটাই সেই পেজ। কোনো create/edit/delete
// বাটন নেই ইচ্ছাকৃতভাবে; শুধু visibility, Admin-ই একমাত্র কর্তৃত্বপ্রাপ্ত।

const TYPE_LABEL = {
    percent_off:     '% ছাড়',
    flat_off:        '৳ ছাড়',
    buy_x_get_y:     'কিনলে পাবেন',
    min_order:       'ন্যূনতম অর্ডার',
    tiered_discount: 'স্ল্যাব/টায়ার্ড ছাড়',
};

export default function ManagerPromotions() {
    const [promos,  setPromos]  = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab,     setTab]     = useState('active');

    useEffect(() => {
        api.get('/promotions')
            .then(r => setPromos(r.data.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const filtered = promos.filter(p =>
        tab === 'active'  ? p.is_active :
        tab === 'pending' ? p.approval_status === 'pending' : true
    );

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
    );

    return (
        <div className="p-4 max-w-2xl mx-auto pb-10">
            <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <FiTag className="text-blue-600" /> অফার / প্রমোশন
            </h2>
            <p className="text-xs text-gray-400 mb-4">শুধু দেখার জন্য — নতুন অফার তৈরি/পরিবর্তন Admin করে থাকেন।</p>

            <div className="flex gap-2 mb-4">
                {[['active', 'সক্রিয়'], ['pending', 'অনুমোদনের অপেক্ষায়'], ['all', 'সব']].map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium border transition
                            ${tab === k ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-200'}`}>
                        {l}
                    </button>
                ))}
            </div>

            <div className="space-y-3">
                {filtered.map(p => (
                    <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-semibold text-gray-800">{p.name}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {TYPE_LABEL[p.type] || p.type} ·{' '}
                                    {new Date(p.start_date).toLocaleDateString('bn-BD')} —{' '}
                                    {new Date(p.end_date).toLocaleDateString('bn-BD')}
                                </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
                                p.approval_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                p.is_active                     ? 'bg-green-100 text-green-700' :
                                                                   'bg-gray-100 text-gray-500'
                            }`}>
                                {p.approval_status === 'pending' ? 'অনুমোদনের অপেক্ষায়' : p.is_active ? 'সক্রিয়' : 'বন্ধ'}
                            </span>
                        </div>
                        {p.description && <p className="text-sm text-gray-500 mt-2">{p.description}</p>}
                        <p className="text-xs text-gray-400 mt-2">
                            ব্যবহার: {p.use_count || 0} বার · মোট ছাড়: ৳{Number(p.total_discount_given || 0).toLocaleString('bn-BD')}
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
        </div>
    );
}
