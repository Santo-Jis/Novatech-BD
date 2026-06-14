import { useState, useEffect } from 'react';
import { FiTag, FiCalendar, FiClock } from 'react-icons/fi';
import api from '../../api/axios';

const typeLabel = {
    buy_x_get_y : '🎁 কিনলে পাবেন',
    percent_off : '% ছাড়',
    flat_off    : '৳ ছাড়',
    bundle      : '📦 বান্ডেল',
    min_order   : '🛒 ন্যূনতম অর্ডার',
};

const typeColor = {
    buy_x_get_y : 'bg-green-100 text-green-700',
    percent_off : 'bg-blue-100 text-blue-700',
    flat_off    : 'bg-purple-100 text-purple-700',
    bundle      : 'bg-orange-100 text-orange-700',
    min_order   : 'bg-yellow-100 text-yellow-700',
};

export default function ActiveOffers() {
    const [offers, setOffers]   = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/promotions/active')
            .then(r => setOffers(r.data.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const daysLeft = (endDate) => {
        const diff = Math.ceil((new Date(endDate) - new Date()) / 86400000);
        return diff > 0 ? diff : 0;
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
    );

    return (
        <div className="p-4 max-w-lg mx-auto pb-24">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FiTag className="text-blue-600" /> সক্রিয় অফার সমূহ
            </h2>

            {!offers.length ? (
                <div className="text-center py-16 text-gray-400">
                    <FiTag size={40} className="mx-auto mb-3 opacity-30" />
                    <p>এখন কোনো অফার নেই।</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {offers.map(offer => (
                        <div key={offer.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-800">{offer.name}</h3>
                                    {offer.description && (
                                        <p className="text-sm text-gray-500 mt-0.5">{offer.description}</p>
                                    )}
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeColor[offer.type] || 'bg-gray-100 text-gray-600'}`}>
                                    {typeLabel[offer.type] || offer.type}
                                </span>
                            </div>

                            {/* Offer details */}
                            <div className="mt-3 bg-gray-50 rounded-xl p-3 text-sm">
                                {offer.type === 'buy_x_get_y' && (
                                    <p className="text-green-700 font-medium">
                                        🎁 {offer.buy_quantity}টা কিনলে {offer.free_quantity}টা ফ্রি পাবেন
                                    </p>
                                )}
                                {offer.type === 'percent_off' && (
                                    <p className="text-blue-700 font-medium">
                                        💰 {offer.discount_value}% ছাড়
                                        {offer.min_order_amount > 0 && ` (ন্যূনতম ৳${offer.min_order_amount})`}
                                    </p>
                                )}
                                {offer.type === 'flat_off' && (
                                    <p className="text-purple-700 font-medium">
                                        💵 ৳{offer.discount_value} ছাড়
                                        {offer.min_order_amount > 0 && ` (ন্যূনতম ৳${offer.min_order_amount})`}
                                    </p>
                                )}
                                {offer.type === 'min_order' && (
                                    <p className="text-yellow-700 font-medium">
                                        🛒 ৳{offer.min_order_amount}-এর উপরে অর্ডারে বিশেষ সুবিধা
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                                <span className="flex items-center gap-1">
                                    <FiCalendar size={12} />
                                    {new Date(offer.start_date).toLocaleDateString('bn-BD')} —
                                    {new Date(offer.end_date).toLocaleDateString('bn-BD')}
                                </span>
                                <span className={`flex items-center gap-1 font-medium ${daysLeft(offer.end_date) <= 3 ? 'text-red-500' : 'text-green-600'}`}>
                                    <FiClock size={12} />
                                    আর {daysLeft(offer.end_date)} দিন
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
