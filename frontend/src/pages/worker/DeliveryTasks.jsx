import { useState, useEffect } from 'react';
import { FiPackage, FiMapPin, FiCamera, FiCheck, FiX, FiNavigation } from 'react-icons/fi';
import api from '../../api/axios';

const statusLabel = {
    pending    : { label: 'অপেক্ষমান',  color: 'bg-yellow-100 text-yellow-700' },
    in_transit : { label: 'রাস্তায়',    color: 'bg-blue-100 text-blue-700' },
    arrived    : { label: 'পৌঁছেছি',    color: 'bg-purple-100 text-purple-700' },
    delivered  : { label: 'সম্পন্ন ✅', color: 'bg-green-100 text-green-700' },
    failed     : { label: 'ব্যর্থ ❌',  color: 'bg-red-100 text-red-700' },
};

export default function DeliveryTasks() {
    const [tasks, setTasks]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [active, setActive]   = useState(null);
    const [otp, setOtp]         = useState('');
    const [busy, setBusy]       = useState(false);
    const [reason, setReason]   = useState('');

    const load = () => {
        setLoading(true);
        api.get('/deliveries/my-tasks')
            .then(r => setTasks(r.data.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const action = async (id, endpoint, body = {}) => {
        setBusy(true);
        try {
            await api.put(`/deliveries/${id}/${endpoint}`, body);
            load();
            setActive(null);
        } catch (e) {
            alert(e.response?.data?.message || 'সমস্যা হয়েছে।');
        } finally { setBusy(false); }
    };

    const getLocation = () => new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(
            p => res({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            rej, { enableHighAccuracy: true }
        )
    );

    const handleArrive = async (id) => {
        try {
            const loc = await getLocation();
            await action(id, 'arrive', loc);
        } catch { alert('GPS চালু করুন।'); }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
    );

    return (
        <div className="p-4 max-w-lg mx-auto pb-24">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FiPackage className="text-blue-600" /> ডেলিভারি টাস্ক
            </h2>

            {!tasks.length ? (
                <div className="text-center py-16 text-gray-400">
                    <FiPackage size={40} className="mx-auto mb-3 opacity-30" />
                    <p>কোনো pending ডেলিভারি নেই।</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tasks.map(task => (
                        <div key={task.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-800">{task.shop_name}</h3>
                                    <p className="text-sm text-gray-500">{task.owner_name}</p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusLabel[task.status]?.color}`}>
                                    {statusLabel[task.status]?.label}
                                </span>
                            </div>

                            <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
                                <FiMapPin size={13} />
                                <span>মোট: ৳{Number(task.total_amount).toLocaleString('bn-BD')}</span>
                            </div>

                            {/* Action buttons */}
                            <div className="mt-3 flex gap-2">
                                {task.status === 'pending' && (
                                    <button onClick={() => action(task.id, 'start')} disabled={busy}
                                        className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-medium">
                                        🚚 শুরু করুন
                                    </button>
                                )}
                                {task.status === 'in_transit' && (
                                    <>
                                        <button onClick={() => handleArrive(task.id)} disabled={busy}
                                            className="flex-1 bg-purple-600 text-white py-2 rounded-xl text-sm font-medium">
                                            <FiMapPin className="inline mr-1" size={14} />
                                            পৌঁছেছি
                                        </button>
                                        {task.lat && task.lng && (
                                            <a href={`https://maps.google.com/?q=${task.lat},${task.lng}`}
                                                target="_blank" rel="noreferrer"
                                                className="px-3 bg-gray-100 rounded-xl flex items-center">
                                                <FiNavigation size={16} className="text-blue-600" />
                                            </a>
                                        )}
                                    </>
                                )}
                                {task.status === 'arrived' && (
                                    <>
                                        <button onClick={() => setActive({ id: task.id, mode: 'complete' })}
                                            className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-medium">
                                            <FiCheck className="inline mr-1" size={14} />
                                            সম্পন্ন
                                        </button>
                                        <button onClick={() => setActive({ id: task.id, mode: 'fail' })}
                                            className="px-3 bg-red-100 text-red-600 rounded-xl text-sm font-medium">
                                            <FiX size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Complete modal */}
            {active?.mode === 'complete' && (
                <div className="fixed inset-0 bg-black/50 flex items-end z-50">
                    <div className="bg-white w-full rounded-t-3xl p-6">
                        <h3 className="font-bold text-gray-800 mb-3">ডেলিভারি নিশ্চিত করুন</h3>
                        <input
                            type="text" inputMode="numeric" maxLength={6}
                            placeholder="দোকানদারের OTP (যদি থাকে)"
                            value={otp} onChange={e => setOtp(e.target.value)}
                            className="w-full border rounded-xl px-4 py-3 mb-3 text-center text-xl tracking-widest"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setActive(null)}
                                className="flex-1 border border-gray-200 py-3 rounded-xl text-gray-600">
                                বাতিল
                            </button>
                            <button disabled={busy}
                                onClick={() => action(active.id, 'complete', { customer_otp: otp || undefined })}
                                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-medium">
                                ✅ সম্পন্ন
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fail modal */}
            {active?.mode === 'fail' && (
                <div className="fixed inset-0 bg-black/50 flex items-end z-50">
                    <div className="bg-white w-full rounded-t-3xl p-6">
                        <h3 className="font-bold text-gray-800 mb-3">ডেলিভারি ব্যর্থ</h3>
                        <textarea
                            placeholder="কারণ লিখুন..."
                            value={reason} onChange={e => setReason(e.target.value)}
                            className="w-full border rounded-xl px-4 py-3 mb-3 h-24 resize-none"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setActive(null)}
                                className="flex-1 border border-gray-200 py-3 rounded-xl text-gray-600">
                                বাতিল
                            </button>
                            <button disabled={busy || !reason}
                                onClick={() => action(active.id, 'fail', { reason })}
                                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-medium">
                                ❌ ব্যর্থ চিহ্নিত
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
