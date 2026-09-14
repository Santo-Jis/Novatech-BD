import { useState, useEffect } from 'react';
import { FiShield, FiFlag, FiEyeOff, FiEye, FiCheck, FiClock } from 'react-icons/fi';
import api from '../../api/axios';

// ✅ NEW (Redesign Phase ১.৮ — মডারেশন কিউ)
//
// feed_reports (Phase ১) থেকে pending রিপোর্ট — company_posts (নিজের
// tenant-এর) আর customer_posts (নিজের connected কাস্টমারদের) দুটো
// সেকশনে। স্কোপিং নিয়ম moderation.controller.js-এর কমেন্টে ব্যাখ্যা করা।

function timeAgo(iso) {
    const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diffMin < 60) return `${diffMin} মিনিট আগে`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr} ঘণ্টা আগে`;
    return `${Math.round(diffHr / 24)} দিন আগে`;
}

function QueueItem({ post, postType, onAction }) {
    const [busy, setBusy] = useState(false);
    const title = postType === 'company_post' ? post.title : (post.author_name || 'কাস্টমার');
    const media = post.media?.length > 0 ? post.media[0].url : (post.video_url || post.image_url);

    const act = async (action) => {
        setBusy(true);
        try {
            await api.post(`/moderation/${postType === 'company_post' ? 'company-posts' : 'customer-posts'}/${post.id}/${action}`);
            onAction();
        } catch (e) {
            alert(e.response?.data?.message || 'সমস্যা হয়েছে।');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="p-4 flex gap-3">
                {media && (
                    <img src={media} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-800 text-sm truncate">{title}</p>
                        {!post.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium flex-shrink-0">
                                হাইড করা আছে
                            </span>
                        )}
                    </div>
                    {post.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{post.body}</p>}
                    <p className="text-[10.5px] text-gray-400 mt-1 flex items-center gap-1">
                        <FiClock size={10} /> পোস্ট {timeAgo(post.created_at)}
                    </p>
                </div>
            </div>

            {/* রিপোর্টগুলো */}
            <div className="px-4 pb-3 border-t border-gray-100 pt-2">
                <p className="text-[11px] font-semibold text-red-500 flex items-center gap-1 mb-1.5">
                    <FiFlag size={11} /> {post.pending_report_count}টা রিপোর্ট
                </p>
                <div className="space-y-1">
                    {post.reports.map((r, i) => (
                        <p key={i} className="text-[11px] text-gray-500">
                            <span className="font-medium text-gray-600">{r.reporter_name}</span>
                            {r.reason ? ` — "${r.reason}"` : ' (কারণ উল্লেখ করেননি)'}
                            <span className="text-gray-300"> · {timeAgo(r.created_at)}</span>
                        </p>
                    ))}
                </div>
            </div>

            {/* অ্যাকশন */}
            <div className="flex border-t border-gray-100">
                <button
                    disabled={busy}
                    onClick={() => act('dismiss')}
                    className="flex-1 py-2.5 text-xs font-medium text-gray-600 flex items-center justify-center gap-1 disabled:opacity-40"
                >
                    <FiCheck size={13} /> ঠিক আছে, রাখুন
                </button>
                {post.is_active ? (
                    <button
                        disabled={busy}
                        onClick={() => act('hide')}
                        className="flex-1 py-2.5 text-xs font-medium text-red-600 border-l border-gray-100 flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                        <FiEyeOff size={13} /> হাইড করুন
                    </button>
                ) : (
                    <button
                        disabled={busy}
                        onClick={() => act('restore')}
                        className="flex-1 py-2.5 text-xs font-medium text-blue-600 border-l border-gray-100 flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                        <FiEye size={13} /> আবার দেখান
                    </button>
                )}
            </div>
        </div>
    );
}

export default function ModerationQueue() {
    const [queue, setQueue] = useState({ company_posts: [], customer_posts: [] });
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        api.get('/moderation/queue')
            .then(r => setQueue(r.data.data || { company_posts: [], customer_posts: [] }))
            .catch(() => setQueue({ company_posts: [], customer_posts: [] }))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const total = queue.company_posts.length + queue.customer_posts.length;

    return (
        <div className="p-4 max-w-3xl mx-auto pb-10">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <FiShield className="text-blue-600" /> মডারেশন কিউ
                </h2>
                {total > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-semibold">
                        {total}টা পেন্ডিং
                    </span>
                )}
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2].map(i => <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />)}
                </div>
            ) : total === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <FiShield size={36} className="mx-auto mb-3 opacity-40" />
                    <p>কোনো পেন্ডিং রিপোর্ট নেই — সব ঠিক আছে।</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {queue.company_posts.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">কোম্পানির পোস্ট</h3>
                            <div className="space-y-3">
                                {queue.company_posts.map(p => (
                                    <QueueItem key={p.id} post={p} postType="company_post" onAction={load} />
                                ))}
                            </div>
                        </div>
                    )}
                    {queue.customer_posts.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">কাস্টমার পোস্ট (নেটওয়ার্ক)</h3>
                            <div className="space-y-3">
                                {queue.customer_posts.map(p => (
                                    <QueueItem key={p.id} post={p} postType="customer_post" onAction={load} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
