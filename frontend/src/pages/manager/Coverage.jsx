import { useState, useEffect } from 'react';
import { FiGrid, FiPackage, FiTrendingUp } from 'react-icons/fi';
import api from '../../api/axios';

export default function Coverage() {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/coverage/team-summary')
            .then(r => setData(r.data.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
    );

    const total    = data?.summary?.total_customers || 0;
    const products = data?.by_product || [];

    return (
        <div className="p-4 max-w-2xl mx-auto pb-10">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FiGrid className="text-blue-600" /> পণ্য কভারেজ রিপোর্ট
            </h2>

            <p className="text-sm text-gray-500 mb-4">মোট {total}টি দোকান বিশ্লেষণ</p>

            {!products.length ? (
                <div className="text-center py-16 text-gray-400">
                    <FiPackage size={40} className="mx-auto mb-3 opacity-30" />
                    <p>ডেটা পাওয়া যায়নি।</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {products.map(p => (
                        <div key={p.product_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <FiPackage size={16} className="text-gray-400" />
                                    <span className="font-medium text-gray-800 text-sm">{p.product_name}</span>
                                </div>
                                <span className={`text-sm font-bold ${
                                    p.pct >= 75 ? 'text-green-600' :
                                    p.pct >= 50 ? 'text-yellow-600' : 'text-red-500'
                                }`}>{p.pct}%</span>
                            </div>

                            <div className="bg-gray-100 rounded-full h-2 mb-2">
                                <div
                                    className={`rounded-full h-2 transition-all ${
                                        p.pct >= 75 ? 'bg-green-500' :
                                        p.pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                                    }`}
                                    style={{ width: `${p.pct}%` }}
                                />
                            </div>

                            <p className="text-xs text-gray-400">
                                {p.covered}/{p.total} দোকানে বিক্রি হয়েছে
                                {p.pct < 50 && ' — ⚠️ মনোযোগ দরকার'}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
