// components/dashboard/HomeFeed.jsx
// ═══════════════════════════════════════════════════════════════
// ধাপ ২ — হোম ফিড (Facebook-স্টাইল সোশ্যাল ফিড)
//
// এখন যা আছে (real data):
//   • সাম্প্রতিক ইনভয়েসগুলো "পোস্ট"-এর মতো কার্ড আকারে (InvoiceCard পুনঃব্যবহার)
//   • মার্কেটিং অফার (Phase ৫ — promotions engine)
//   • কোম্পানি কর্তৃক পোস্ট (company_posts টেবিল, admin/CompanyPosts.jsx থেকে তৈরি)
// এখন যা এখনো ব্যাকএন্ডে কোড হয়নি (placeholder — স্পষ্টভাবে "শীঘ্রই আসছে" দেখানো হচ্ছে,
// যাতে ব্যবহারকারী ভুল না বোঝেন যে ফিচারটা ভাঙা):
//   • কাস্টমার কর্তৃক পোস্ট
//
// এই ফাইল self-contained — নিজের ইনভয়েস/পোস্ট/অফার fetch নিজেই করে, শুধু
// portalJWT prop নেয় (InvoicesTab.jsx / OrderRequestTab.jsx-এর একই প্যাটার্ন অনুসরণ করে)।
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { FiFileText, FiVolume2, FiTag, FiUsers, FiExternalLink, FiSend, FiTrash2 } from 'react-icons/fi'
import { portalFetch } from '../../utils/api'
import { fmtDate } from '../../utils/helpers'
import InvoiceCard from '../InvoiceCard'
import SectionLabel from './SectionLabel'

function ComingSoonCard({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-dashed border-cp-border-strong bg-cp-bg-alt/60 px-4 py-5 flex flex-col items-center text-center gap-1.5">
      <div className="w-11 h-11 rounded-full bg-cp-trust-100 text-cp-trust-500 flex items-center justify-center">
        <Icon size={19} />
      </div>
      <p className="text-[12.5px] font-bold text-cp-text-primary font-cp-head">{title}</p>
      <p className="text-[11px] text-cp-text-muted leading-relaxed max-w-[240px]">{desc}</p>
      <span className="mt-1 text-[9.5px] font-bold text-cp-warmth-600 bg-cp-warmth-100 px-2.5 py-1 rounded-full">শীঘ্রই আসছে</span>
    </div>
  )
}

function PostHeader({ icon: Icon, tone = 'trust', title, subtitle }) {
  const toneMap = {
    trust:      { bg: 'bg-cp-trust-100',      text: 'text-cp-trust-500' },
    confidence: { bg: 'bg-cp-confidence-100',  text: 'text-cp-confidence-600' },
  }
  const t = toneMap[tone] || toneMap.trust
  return (
    <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
      <div className={`w-8 h-8 rounded-full ${t.bg} ${t.text} flex items-center justify-center flex-shrink-0`}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-cp-text-primary font-cp-head leading-tight truncate">{title}</p>
        <p className="text-[10px] text-cp-text-muted leading-tight">{subtitle}</p>
      </div>
    </div>
  )
}

export default function HomeFeed({ portalJWT }) {
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // ✅ NEW (Phase ৫): "মার্কেটিং অফার" আগে placeholder ছিল, এখন আসল ডেটা
  const [offers,        setOffers]        = useState([])
  const [offersLoading, setOffersLoading] = useState(true)

  // ✅ NEW (ফেজ ১) — কোম্পানির পোস্ট
  const [posts,        setPosts]        = useState([])
  const [postsLoading, setPostsLoading] = useState(true)

  // ✅ NEW (Phase 5 — কোড অডিট): কাস্টমার পোস্ট — আগে placeholder ছিল
  const [custPosts,        setCustPosts]        = useState([])
  const [custPostsLoading, setCustPostsLoading] = useState(true)
  const [composerText,     setComposerText]     = useState('')
  const [posting,          setPosting]          = useState(false)

  const loadCustomerPosts = () => {
    setCustPostsLoading(true)
    return portalFetch('/portal/customer-posts?limit=15', {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
      .then(res => setCustPosts(res.data || []))
      .catch(() => setCustPosts([]))
      .finally(() => setCustPostsLoading(false))
  }

  const submitPost = async () => {
    const body = composerText.trim()
    if (!body) return
    setPosting(true)
    try {
      await portalFetch('/portal/customer-posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      setComposerText('')
      await loadCustomerPosts() // নতুন পোস্টসহ ফিড রিফ্রেশ
    } catch {
      // চুপচাপ — নিচের কম্পোজার নিজেই থেকে যাবে, ব্যবহারকারী আবার চেষ্টা করতে পারবে
    } finally {
      setPosting(false)
    }
  }

  const deletePost = async (id) => {
    // ✅ optimistic — সাথে সাথে সরিয়ে দাও, ব্যর্থ হলে ফিরিয়ে আনো
    const prev = custPosts
    setCustPosts(p => p.filter(x => x.id !== id))
    try {
      await portalFetch(`/portal/customer-posts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${portalJWT}` },
      })
    } catch {
      setCustPosts(prev) // ব্যর্থ হলে ফিরিয়ে আনো
    }
  }

  useEffect(() => {
    let cancelled = false
    setOffersLoading(true)
    portalFetch('/portal/promotions/active', {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
      .then(res => { if (!cancelled) setOffers(res.data || []) })
      .catch(() => { if (!cancelled) setOffers([]) }) // চুপচাপ খালি — feed-এর বাকি অংশ যেন আটকে না যায়
      .finally(() => { if (!cancelled) setOffersLoading(false) })
    return () => { cancelled = true }
  }, [portalJWT])

  // ✅ NEW (ফেজ ১)
  useEffect(() => {
    let cancelled = false
    setPostsLoading(true)
    portalFetch('/portal/company-posts?limit=10', {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
      .then(res => { if (!cancelled) setPosts(res.data || []) })
      .catch(() => { if (!cancelled) setPosts([]) })
      .finally(() => { if (!cancelled) setPostsLoading(false) })
    return () => { cancelled = true }
  }, [portalJWT])

  // ✅ NEW (Phase 5): কাস্টমার পোস্ট ফিড
  useEffect(() => {
    loadCustomerPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalJWT])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    portalFetch(`/portal/connections/all-invoices?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
      .then(res => { if (!cancelled) setInvoices(res.data || []) })
      .catch(() => { if (!cancelled) setErrorMsg('ফিড লোড করতে সমস্যা হয়েছে।') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [portalJWT])

  return (
    <div className="flex flex-col gap-3.5">

      {/* ── কোম্পানির পোস্ট (✅ ফেজ ১ — এখন real data) ── */}
      <div>
        <SectionLabel label="কোম্পানির পোস্ট" tone="trust" />

        {postsLoading && (
          <div className="rounded-2xl bg-cp-bg-alt animate-pulse" style={{ height: 76 }} />
        )}

        {!postsLoading && posts.length === 0 && (
          <ComingSoonCard icon={FiVolume2} title="এখনো কোনো পোস্ট নেই" desc="আপনার কানেক্টেড কোম্পানিগুলো নতুন পণ্য, আপডেট বা ঘোষণা পোস্ট করলে এখানে দেখতে পাবেন।" />
        )}

        {!postsLoading && posts.length > 0 && (
          <div className="flex flex-col gap-3">
            {posts.map(post => (
              <div key={post.id} className="rounded-2xl bg-cp-bg-surface border border-cp-border overflow-hidden">
                <PostHeader
                  icon={FiVolume2}
                  tone="trust"
                  title={post.company_name_bn || post.company_name}
                  subtitle={fmtDate(post.created_at)}
                />
                {post.image_url && (
                  <img src={post.image_url} alt="" className="w-full max-h-56 object-cover" />
                )}
                <div className="px-4 pb-3.5 pt-1">
                  <p className="text-[13px] font-bold text-cp-text-primary font-cp-head mb-1">{post.title}</p>
                  {post.body && (
                    <p className="text-[12px] text-cp-text-muted leading-relaxed">{post.body}</p>
                  )}
                  {post.link_url && (
                    <a href={post.link_url} target="_blank" rel="noopener noreferrer"
                       className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-cp-trust-600">
                      বিস্তারিত দেখুন <FiExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── মার্কেটিং অফার (Phase ৫ — আসল ডেটা) ── */}
      <div>
        <SectionLabel label="মার্কেটিং অফার" tone="warmth" />

        {offersLoading && (
          <div className="rounded-2xl bg-cp-bg-alt animate-pulse" style={{ height: 76 }} />
        )}

        {!offersLoading && offers.length === 0 && (
          <ComingSoonCard icon={FiTag} title="এই মুহূর্তে কোনো অফার নেই" desc="বিশেষ ছাড় ও প্রমোশনাল অফার এলে এই জায়গায় কার্ড আকারে দেখানো হবে।" />
        )}

        {!offersLoading && offers.length > 0 && (
          <div className="flex flex-col gap-3">
            {offers.map(offer => (
              <div key={offer.id} className="rounded-2xl bg-cp-bg-surface border border-cp-border overflow-hidden">
                <PostHeader icon={FiTag} tone="confidence" title={offer.name} subtitle="চলমান অফার" />
                {offer.banner_image_url && (
                  <img src={offer.banner_image_url} alt={offer.name} className="w-full h-32 object-cover" />
                )}
                <div className="px-4 pb-3.5 pt-1">
                  {offer.description && (
                    <p className="text-[11.5px] text-cp-text-muted leading-relaxed mb-1.5">{offer.description}</p>
                  )}
                  <p className="text-[12.5px] font-bold text-cp-warmth-700">
                    {offer.type === 'buy_x_get_y'
                      ? `🎁 ${offer.buy_quantity}টা কিনলে ${offer.free_quantity}টা ${offer.free_product_name || 'পণ্য'} ফ্রি`
                      : offer.type === 'percent_off'
                      ? `💰 ${offer.discount_value}% ছাড়${offer.min_order_amount > 0 ? ` (ন্যূনতম ৳${offer.min_order_amount})` : ''}`
                      : offer.type === 'flat_off'
                      ? `💵 ৳${offer.discount_value} ছাড়${offer.min_order_amount > 0 ? ` (ন্যূনতম ৳${offer.min_order_amount})` : ''}`
                      : offer.type === 'min_order'
                      ? `🛒 ৳${offer.min_order_amount}+ অর্ডারে বিশেষ সুবিধা`
                      : offer.type === 'tiered_discount'
                      ? '📊 যত বেশি কিনবেন, তত বেশি ছাড়'
                      : 'বিশেষ অফার'}
                  </p>
                  <p className="text-[10px] text-cp-text-muted mt-1">
                    {fmtDate(offer.start_date)} — {fmtDate(offer.end_date)} পর্যন্ত
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── সাম্প্রতিক ইনভয়েস (real feed) ── */}
      <div>
        <SectionLabel label="সাম্প্রতিক ইনভয়েস" tone="success" />

        {loading && (
          <div className="flex flex-col gap-2.5">
            {[0, 1].map(i => (
              <div key={i} className="rounded-2xl bg-cp-bg-alt animate-pulse" style={{ height: 76 }} />
            ))}
          </div>
        )}

        {!loading && errorMsg && (
          <p className="text-[12px] text-cp-error text-center py-4">{errorMsg}</p>
        )}

        {!loading && !errorMsg && invoices.length === 0 && (
          <ComingSoonCard icon={FiFileText} title="এখনো কোনো ইনভয়েস নেই" desc="নতুন কেনাকাটা হলে সেটার ইনভয়েস এখানে পোস্টের মতো দেখা যাবে।" />
        )}

        {!loading && !errorMsg && invoices.length > 0 && (
          <div className="flex flex-col gap-3">
            {invoices.map(sale => (
              <div key={sale.id} className="rounded-2xl bg-cp-bg-surface border border-cp-border overflow-hidden">
                <PostHeader
                  icon={FiFileText}
                  tone="trust"
                  title="নতুন ইনভয়েস তৈরি হয়েছে"
                  subtitle={`${sale.company_name || 'কোম্পানি'} • ${fmtDate(sale.created_at)}`}
                />
                <InvoiceCard sale={sale} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── কাস্টমার পোস্ট (✅ Phase 5 — এখন real data) ── */}
      <div>
        <SectionLabel label="কাস্টমার পোস্ট" tone="trust" />

        {/* কম্পোজার */}
        <div className="rounded-2xl bg-cp-bg-surface border border-cp-border p-3 mb-3">
          <textarea
            value={composerText}
            onChange={e => setComposerText(e.target.value)}
            placeholder="আপনার নেটওয়ার্কে কিছু শেয়ার করুন..."
            rows={2}
            maxLength={1000}
            className="w-full text-[12.5px] text-cp-text-primary placeholder:text-cp-text-muted resize-none bg-transparent outline-none"
          />
          <div className="flex items-center justify-end mt-1.5">
            <button
              onClick={submitPost}
              disabled={posting || !composerText.trim()}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-white bg-cp-trust-500 rounded-full px-3.5 py-1.5 disabled:opacity-40"
            >
              <FiSend size={11} /> {posting ? 'পোস্ট হচ্ছে...' : 'পোস্ট করুন'}
            </button>
          </div>
        </div>

        {custPostsLoading && (
          <div className="rounded-2xl bg-cp-bg-alt animate-pulse" style={{ height: 76 }} />
        )}

        {!custPostsLoading && custPosts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-cp-border-strong bg-cp-bg-alt/60 px-4 py-5 flex flex-col items-center text-center gap-1.5">
            <div className="w-11 h-11 rounded-full bg-cp-trust-100 text-cp-trust-500 flex items-center justify-center">
              <FiUsers size={19} />
            </div>
            <p className="text-[12.5px] font-bold text-cp-text-primary font-cp-head">এখনো কোনো পোস্ট নেই</p>
            <p className="text-[11px] text-cp-text-muted leading-relaxed max-w-[240px]">
              আপনার নেটওয়ার্কের কাস্টমাররা (যাদের সাথে অন্তত একটা কোম্পানি কমন) কিছু শেয়ার করলে এখানে দেখা যাবে — অথবা উপরে নিজেই প্রথম পোস্ট লিখুন।
            </p>
          </div>
        )}

        {!custPostsLoading && custPosts.length > 0 && (
          <div className="flex flex-col gap-3">
            {custPosts.map(post => (
              <div key={post.id} className="rounded-2xl bg-cp-bg-surface border border-cp-border overflow-hidden">
                <div className="flex items-center justify-between">
                  <PostHeader
                    icon={FiUsers}
                    tone="trust"
                    title={post.author_name || 'কাস্টমার'}
                    subtitle={fmtDate(post.created_at)}
                  />
                  {post.is_mine && (
                    <button onClick={() => deletePost(post.id)} className="text-cp-text-muted p-1.5 mr-3 flex-shrink-0">
                      <FiTrash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="px-4 pb-3.5">
                  <p className="text-[12.5px] text-cp-text-primary leading-relaxed whitespace-pre-wrap">{post.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
