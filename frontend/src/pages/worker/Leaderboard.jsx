import { useState, useEffect } from 'react';
import { FiAward, FiTrendingUp, FiUsers, FiShoppingCart, FiMapPin } from 'react-icons/fi';
import api from '../../api/axios';

const taka = (n) => '৳' + Number(n || 0).toLocaleString('bn-BD');

const medals = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab]         = useState('sales'); // sales | visits | invoices

    useEffect(() => {
        api.get('/leaderboard/my-rank')
            .then(r => setData(r.data.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
    );

    if (!data) return (
        <div className="p-4 text-center text-gray-500">ডেটা পাওয়া যায়নি।</div>
    );

    const sorted = [...(data.leaderboard || [])].sort((a, b) => {
        if (tab === 'visits')   return b.total_visits   - a.total_visits;
        if (tab === 'invoices') return b.total_invoices - a.total_invoices;
        return b.total_sales - a.total_sales;
    }).map((r, i) => ({ ...r, rank: i + 1 }));

    const me = sorted.find(r => r.is_me);

    return (
        <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
            {/* আমার position */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-5 text-white shadow-lg">
                <p className="text-blue-200 text-sm mb-1">এই মাসে আপনি</p>
                <div className="flex items-end gap-2">
                    <span className="text-5xl font-bold">{me?.rank || '-'}</span>
                    <span className="text-blue-200 mb-1">নম্বরে</span>
                    <span className="text-blue-200 mb-1">({data.total_members} জনের মধ্যে)</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                        <p className="text-xs text-blue-200">বিক্রয়</p>
                        <p className="font-semibold text-sm">{taka(data.my_sales)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-blue-200">ভিজিট</p>
                        <p className="font-semibold text-sm">{data.my_visits}</p>
                    </div>
                    <div>
                        <p className="text-xs text-blue-200">ইনভয়েস</p>
                        <p className="font-semibold text-sm">{data.my_invoices}</p>
                    </div>
                </div>
                {/* Target progress */}
                {data.my_target > 0 && (
                    <div className="mt-3">
                        <div className="flex justify-between text-xs text-blue-200 mb-1">
                            <span>লক্ষ্য: {taka(data.my_target)}</span>
                            <span>{data.my_sales_pct}%</span>
                        </div>
                        <div className="bg-blue-900 rounded-full h-2">
                            <div
                                className="bg-yellow-400 rounded-full h-2 transition-all"
                                style={{ width: `${data.my_sales_pct}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {[
                    { key: 'sales',    label: 'বিক্রয়',   icon: <FiTrendingUp size={14} /> },
                    { key: 'visits',   label: 'ভিজিট',    icon: <FiMapPin size={14} /> },
                    { key: 'invoices', label: 'ইনভয়েস', icon: <FiShoppingCart size={14} /> },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition
                            ${tab === t.key ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Top 3 Podium */}
            {sorted.length >= 3 && (
                <div className="flex items-end justify-center gap-2 pt-2">
                    {[sorted[1], sorted[0], sorted[2]].map((r, i) => {
                        const heights = ['h-20', 'h-28', 'h-16'];
                        const pos     = [2, 1, 3];
                        return r ? (
                            <div key={r.id} className="flex flex-col items-center">
                                <span className="text-2xl">{medals[pos[i] - 1]}</span>
                                <p className={`text-xs font-medium mt-1 ${r.is_me ? 'text-blue-700' : 'text-gray-700'}`}>
                                    {r.name.split(' ')[0]}
                                </p>
                                <div className={`${heights[i]} w-16 rounded-t-lg mt-1 flex items-center justify-center text-white text-xs font-bold
                                    ${pos[i] === 1 ? 'bg-yellow-400' : pos[i] === 2 ? 'bg-gray-400' : 'bg-orange-400'}
                                    ${r.is_me ? 'ring-2 ring-blue-500' : ''}`}>
                                    {pos[i]}
                                </div>
                            </div>
                        ) : null;
                    })}
                </div>
            )}

            {/* Full List */}
            <div className="space-y-2">
                {sorted.map(r => (
                    <div key={r.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border
                            ${r.is_me
                                ? 'bg-blue-50 border-blue-300 shadow-sm'
                                : 'bg-white border-gray-100'}`}>
                        <span className="text-xl w-8 text-center font-bold text-gray-400">
                            {r.rank <= 3 ? medals[r.rank - 1] : r.rank}
                        </span>
                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                            {r.name?.[0] || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm truncate ${r.is_me ? 'text-blue-700' : ''}`}>
                                {r.name} {r.is_me && '(আপনি)'}
                            </p>
                            <p className="text-xs text-gray-400">
                                {tab === 'sales'    && taka(r.total_sales)}
                                {tab === 'visits'   && `${r.total_visits} ভিজিট`}
                                {tab === 'invoices' && `${r.total_invoices} ইনভয়েস`}
                            </p>
                        </div>
                        {tab === 'sales' && r.monthly_target > 0 && (
                            <div className="w-16">
                                <div className="bg-gray-100 rounded-full h-1.5">
                                    <div
                                        className="bg-green-500 rounded-full h-1.5"
                                        style={{ width: `${Math.min(100, r.monthly_target > 0 ? r.total_sales / r.monthly_target * 100 : 0)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 text-right mt-0.5">
                                    {r.monthly_target > 0 ? Math.round(r.total_sales / r.monthly_target * 100) : 0}%
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
