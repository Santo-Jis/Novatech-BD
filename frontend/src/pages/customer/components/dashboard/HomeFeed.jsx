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

import { useState, useEffect, useRef } from 'react'
import { FiFileText, FiVolume2, FiTag, FiUsers, FiExternalLink, FiSend, FiTrash2, FiHeart, FiFlag, FiImage, FiX, FiVideo } from 'react-icons/fi'
import { portalFetch } from '../../utils/api'
import { fmtDate } from '../../utils/helpers'
import InvoiceCard from '../InvoiceCard'
import SectionLabel from './SectionLabel'

// ✅ NEW (Redesign Phase ১.৯ — transparency label): admin প্যানেলের
// VISIBILITY_OPTIONS (CompanyPosts.jsx)-এর সাথে মিলিয়ে, শুধু কাস্টমার-মুখী
// সংক্ষিপ্ত ভাষায়
const VISIBILITY_LABELS = {
  connections: 'শুধু আপনার নেটওয়ার্ক দেখছে',
  select:      'নির্বাচিত কাস্টমাররা দেখছে',
  private:     'শুধু কোম্পানি দেখছে',
}

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

function PostHeader({ icon: Icon, tone = 'trust', title, subtitle, isNew }) {
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[12px] font-bold text-cp-text-primary font-cp-head leading-tight truncate">{title}</p>
          {/* ✅ NEW (Redesign Phase ১.৯ — unread ট্র্যাকিং) */}
          {isNew && (
            <span className="text-[9px] font-bold text-white bg-cp-warmth-500 px-1.5 py-0.5 rounded-full flex-shrink-0">নতুন</span>
          )}
        </div>
        <p className="text-[10px] text-cp-text-muted leading-tight">{subtitle}</p>
      </div>
    </div>
  )
}

// ✅ NEW (Redesign Phase ১ — ফিড এনগেজমেন্ট): like + report — company posts
// আর customer posts দুটোতেই বসবে, তাই একবারই লেখা হলো (পুরো কার্ড একসাথে
// করে ফেলা Phase ২-এর কাজ — এখন শুধু এই একটা নতুন অংশ শেয়ার করা হচ্ছে,
// বাকি কার্ড markup যার যার জায়গায় রাখা হলো, যাতে diff ছোট থাকে)
function PostActions({ type, id, reactionCount, myReaction, reported, confirming, hideReport, onToggleReaction, onReportTap, onReportConfirm, onReportCancel }) {
  return (
    <div className="flex items-center px-4 pb-3 pt-1.5 mt-0.5 border-t border-cp-border/60">
      <button
        onClick={() => onToggleReaction(type, id)}
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
          myReaction ? 'text-cp-warmth-600 bg-cp-warmth-100' : 'text-cp-text-muted'
        }`}
      >
        <FiHeart size={12} className={myReaction ? 'fill-current' : ''} />
        {reactionCount > 0 ? reactionCount : 'পছন্দ'}
      </button>

      {!hideReport && (
      <div className="ml-auto">
        {reported ? (
          <span className="text-[10px] text-cp-text-muted px-1">রিপোর্ট করা হয়েছে</span>
        ) : confirming ? (
          <span className="inline-flex items-center gap-2 text-[10.5px] text-cp-text-muted">
            রিপোর্ট করবেন?
            <button onClick={() => onReportConfirm(type, id)} className="font-bold text-cp-error">হ্যাঁ</button>
            <button onClick={onReportCancel} className="font-semibold">না</button>
          </span>
        ) : (
          <button onClick={onReportTap} className="text-cp-text-muted p-1.5" aria-label="রিপোর্ট করুন">
            <FiFlag size={12} />
          </button>
        )}
      </div>
      )}
    </div>
  )
}

// ✅ NEW (Redesign Phase ১.৭ — মাল্টি-ইমেজ গ্যালারি): হালকা CSS-snap
// ক্যারোসেল, কোনো বাড়তি লাইব্রেরি ছাড়াই — swipe/scroll করলে নিচের ডট
// ইন্ডিকেটর বদলায়।
function MediaCarousel({ items }) {
  const [active, setActive] = useState(0)
  const handleScroll = e => setActive(Math.round(e.target.scrollLeft / e.target.clientWidth))

  return (
    <div>
      <div
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((item, i) => (
          <img key={i} src={item.url} alt="" className="w-full flex-shrink-0 snap-center max-h-64 object-cover" />
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1 py-1.5">
          {items.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === active ? 'bg-cp-trust-500' : 'bg-cp-border'}`} />
          ))}
        </div>
      )}
    </div>
  )
}

// ✅ NEW (Redesign Phase ১.৯ — কমেন্ট): নিজের expand/collapse + lazy-load
// state রাখা হলো এই কম্পোনেন্টেই (parent-এর flat state-এ প্রতি-পোস্ট
// nested array রাখলে জটিল হয়ে যেত) — শুধু portalJWT আর post identity
// বাইরে থেকে আসে।
function CommentsSection({ type, id, commentCount, portalJWT }) {
  const [expanded, setExpanded] = useState(false)
  const [comments, setComments] = useState(null) // null = এখনো লোড হয়নি
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  const endpoint = type === 'company_post' ? 'company-posts' : 'customer-posts'

  const load = () => {
    setLoading(true)
    portalFetch(`/portal/${endpoint}/${id}/comments`, { headers: { Authorization: `Bearer ${portalJWT}` } })
      .then(res => setComments(res.data || []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false))
  }

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next && comments === null) load()
  }

  const submit = async () => {
    const body = text.trim()
    if (!body) return
    setPosting(true)
    try {
      const res = await portalFetch(`/portal/${endpoint}/${id}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      setComments(c => [...(c || []), res.data])
      setText('')
    } catch {
      // চুপচাপ — টেক্সট থেকেই যাবে, আবার চেষ্টা করা যাবে
    } finally {
      setPosting(false)
    }
  }

  const remove = async (commentId) => {
    const prevList = comments
    setComments(c => (c || []).filter(x => x.id !== commentId))
    try {
      await portalFetch(`/portal/${endpoint}/${id}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${portalJWT}` },
      })
    } catch {
      setComments(prevList) // ব্যর্থ হলে ফিরিয়ে আনো
    }
  }

  return (
    <div className="border-t border-cp-border/60">
      <button onClick={toggle} className="w-full text-left px-4 py-2 text-[11px] text-cp-text-muted font-medium">
        {commentCount > 0 ? `${commentCount}টা কমেন্ট` : 'প্রথম কমেন্টটি করুন'}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {loading && <p className="text-[11px] text-cp-text-muted">লোড হচ্ছে...</p>}
          {(comments || []).map(c => (
            <div key={c.id} className="flex items-start justify-between gap-2">
              <p className="text-[11.5px] text-cp-text-primary leading-relaxed">
                <span className="font-semibold">{c.author_name}</span> {c.body}
              </p>
              {c.is_mine && (
                <button onClick={() => remove(c.id)} className="text-cp-text-muted flex-shrink-0 p-0.5">
                  <FiX size={11} />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-1">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="একটা কমেন্ট লিখুন..."
              maxLength={500}
              className="flex-1 text-[11.5px] bg-cp-bg-alt rounded-full px-3 py-1.5 outline-none text-cp-text-primary placeholder:text-cp-text-muted"
            />
            <button onClick={submit} disabled={posting || !text.trim()} className="text-cp-trust-600 disabled:opacity-40 p-1">
              <FiSend size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ✅ NEW (Redesign — শেয়ার্ড <FeedPostCard>): company posts আর customer
// posts-এর কার্ড markup আগে দুই জায়গায় প্রায় হুবহু কপি-পেস্ট ছিল (শেল,
// header, media রেন্ডারিং, actions row) — শুধু টেক্সট-ব্লক আর media-র
// অবস্থান আলাদা ছিল (company: media আগে তারপর title+body+link; customer:
// body আগে তারপর media)। সেই আসল পার্থক্যটুকু `children` দিয়ে বাইরে
// রাখা হলো, বাকি সব এক জায়গায়।
//
// media অগ্রাধিকার: mediaItems (গ্যালারি) > videoUrl > imageUrl —
// migration_feed_gallery.sql-এর কমেন্টে বর্ণিত একই ক্রম, পুরনো পোস্ট
// (শুধু image_url) স্বাভাবিকভাবেই কাজ করে যাবে।
function FeedPostCard({ icon, iconTone = 'trust', title, subtitle, isNew, headerAction, mediaPosition = 'before', imageUrl, videoUrl, mediaItems, actionsProps, commentCount, portalJWT, children }) {
  const hasGallery = Array.isArray(mediaItems) && mediaItems.length > 0
  const hasMedia = hasGallery || Boolean(videoUrl || imageUrl)
  const media = hasMedia && (
    hasGallery
      ? <MediaCarousel items={mediaItems} />
      : videoUrl
        ? <video src={videoUrl} className="w-full max-h-64 object-cover bg-black" controls />
        : <img src={imageUrl} alt="" className="w-full max-h-64 object-cover" />
  )

  return (
    <div className="rounded-2xl bg-cp-bg-surface border border-cp-border overflow-hidden">
      <div className="flex items-center justify-between">
        <PostHeader icon={icon} tone={iconTone} title={title} subtitle={subtitle} isNew={isNew} />
        {headerAction}
      </div>
      {mediaPosition === 'before' && media}
      {children}
      {mediaPosition === 'after' && media}
      <PostActions {...actionsProps} />
      {/* ✅ NEW (Redesign Phase ১.৯ — কমেন্ট) */}
      <CommentsSection type={actionsProps.type} id={actionsProps.id} commentCount={commentCount || 0} portalJWT={portalJWT} />
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
  const [composerImageFile, setComposerImageFile] = useState(null) // ✅ NEW (Redesign Phase ১.৫ — মিডিয়া পাইপলাইন)
  const [composerVideoFile, setComposerVideoFile] = useState(null) // ✅ NEW (Redesign Phase ১.৬ — ভিডিও)
  const [composerGalleryFiles, setComposerGalleryFiles] = useState([]) // ✅ NEW (Redesign Phase ১.৭ — গ্যালারি, ২+ ছবি বাছলে)
  const composerFileInputRef = useRef()
  const composerVideoInputRef = useRef()

  // ✅ NEW (Redesign Phase ১ — ফিড এনগেজমেন্ট)
  const [postsCursor,         setPostsCursor]         = useState(null) // company posts — "আরও দেখুন"-এর জন্য
  const [postsLoadingMore,    setPostsLoadingMore]    = useState(false)
  const [custPostsCursor,     setCustPostsCursor]     = useState(null) // customer posts
  const [custPostsLoadingMore, setCustPostsLoadingMore] = useState(false)
  const [reportConfirmKey,    setReportConfirmKey]    = useState(null) // `${type}:${id}` — কোন পোস্টে "রিপোর্ট করবেন?" দেখানো হচ্ছে
  const [reportedKeys,        setReportedKeys]        = useState(() => new Set())

  // reaction toggle — company_post আর customer_post দুটোতেই কাজ করে, তাই
  // একটাই জেনেরিক হ্যান্ডলার। toggle নিজেই self-inverse বলে ব্যর্থ হলে
  // ঠিক একই ফাংশন আবার চালালেই আগের অবস্থায় ফিরে যায়।
  const toggleReaction = async (type, id) => {
    const setList   = type === 'company_post' ? setPosts : setCustPosts
    const endpoint   = type === 'company_post' ? 'company-posts' : 'customer-posts'
    const flip = list => list.map(p => p.id === id
      ? { ...p, my_reaction: !p.my_reaction, reaction_count: p.reaction_count + (p.my_reaction ? -1 : 1) }
      : p)

    setList(flip) // optimistic
    try {
      await portalFetch(`/portal/${endpoint}/${id}/react`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}` },
      })
    } catch {
      setList(flip) // ব্যর্থ হলে ফিরিয়ে আনো (flip আবার চালালে আগের অবস্থা)
    }
  }

  const submitReport = async (type, id) => {
    const key      = `${type}:${id}`
    const endpoint = type === 'company_post' ? 'company-posts' : 'customer-posts'
    try {
      await portalFetch(`/portal/${endpoint}/${id}/report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setReportedKeys(prev => new Set(prev).add(key))
    } catch {
      // ব্যর্থ হলে চুপচাপ — বাটন থেকেই যাবে, আবার চেষ্টা করা যাবে
    } finally {
      setReportConfirmKey(null)
    }
  }

  const loadMorePosts = async () => {
    if (!postsCursor || postsLoadingMore) return
    setPostsLoadingMore(true)
    try {
      const res = await portalFetch(`/portal/company-posts?limit=10&before=${encodeURIComponent(postsCursor)}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setPosts(prev => [...prev, ...(res.data || [])])
      setPostsCursor(res.next_cursor || null)
    } catch {
      // চুপচাপ — বাটন থেকেই যাবে, আবার ট্যাপ করা যাবে
    } finally {
      setPostsLoadingMore(false)
    }
  }

  const loadMoreCustPosts = async () => {
    if (!custPostsCursor || custPostsLoadingMore) return
    setCustPostsLoadingMore(true)
    try {
      const res = await portalFetch(`/portal/customer-posts?limit=15&before=${encodeURIComponent(custPostsCursor)}`, {
        headers: { Authorization: `Bearer ${portalJWT}` }
      })
      setCustPosts(prev => [...prev, ...(res.data || [])])
      setCustPostsCursor(res.next_cursor || null)
    } catch {
      // চুপচাপ
    } finally {
      setCustPostsLoadingMore(false)
    }
  }

  const loadCustomerPosts = () => {
    setCustPostsLoading(true)
    return portalFetch('/portal/customer-posts?limit=15', {
      headers: { Authorization: `Bearer ${portalJWT}` }
    })
      .then(res => { setCustPosts(res.data || []); setCustPostsCursor(res.next_cursor || null) })
      .catch(() => setCustPosts([]))
      .finally(() => setCustPostsLoading(false))
  }

  const submitPost = async () => {
    const body = composerText.trim()
    if (!body) return

    // ✅ NEW (Redesign Phase ১.৯ — optimistic UI): delete/react-এ যেমন
    // সার্ভার সাড়া দেওয়ার আগেই আপডেট দেখানো হয়, পোস্ট তৈরিতেও এখন তাই —
    // ব্যর্থ হলে temp পোস্ট সরিয়ে কম্পোজার state ফিরিয়ে দেওয়া হবে।
    const tempId = `temp-${Date.now()}`
    const savedText = body, savedImage = composerImageFile, savedVideo = composerVideoFile, savedGallery = composerGalleryFiles
    const optimisticPost = {
      id: tempId,
      body,
      image_url: savedImage ? URL.createObjectURL(savedImage) : null,
      video_url: savedVideo ? URL.createObjectURL(savedVideo) : null,
      media: savedGallery.length > 0 ? savedGallery.map(f => ({ type: 'image', url: URL.createObjectURL(f) })) : null,
      is_mine: true, is_new: false, reaction_count: 0, my_reaction: false, comment_count: 0,
      created_at: new Date().toISOString(), author_name: 'আপনি', _pending: true,
    }

    setCustPosts(prev => [optimisticPost, ...prev])
    setComposerText('')
    setComposerImageFile(null)
    setComposerVideoFile(null)
    setComposerGalleryFiles([])
    setPosting(true)
    try {
      const res = await portalFetch('/portal/customer-posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${portalJWT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: savedText }),
      })

      // ✅ NEW (Redesign Phase ১.৫/১.৬/১.৭ — মিডিয়া পাইপলাইন): ছবি/ভিডিও/গ্যালারি
      // বাছা থাকলে (একসাথে না, composer-এই mutually exclusive রাখা হয়েছে),
      // পোস্ট তৈরির পর তার id দিয়ে আলাদা multipart কলে আপলোড
      // (portalFetch FormData দেখলে নিজে থেকেই JSON content-type বাদ দেয়,
      // দেখুন api.js-এর isFormData চেক)
      if (savedImage && res.data?.id) {
        const fd = new FormData()
        fd.append('image', savedImage, savedImage.name)
        await portalFetch(`/portal/customer-posts/${res.data.id}/image`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${portalJWT}` },
          body: fd,
        })
      } else if (savedVideo && res.data?.id) {
        const fd = new FormData()
        fd.append('video', savedVideo, savedVideo.name)
        await portalFetch(`/portal/customer-posts/${res.data.id}/video`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${portalJWT}` },
          body: fd,
        })
      } else if (savedGallery.length > 0 && res.data?.id) {
        const fd = new FormData()
        savedGallery.forEach(f => fd.append('images', f, f.name))
        await portalFetch(`/portal/customer-posts/${res.data.id}/gallery`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${portalJWT}` },
          body: fd,
        })
      }

      await loadCustomerPosts() // real data দিয়ে reconcile — temp পোস্টও এতেই replace হয়ে যায়
    } catch {
      // ব্যর্থ — temp পোস্ট সরিয়ে ফেলা, কম্পোজার ফিরিয়ে দেওয়া যাতে আবার চেষ্টা করা যায়
      setCustPosts(prev => prev.filter(p => p.id !== tempId))
      setComposerText(savedText)
      setComposerImageFile(savedImage)
      setComposerVideoFile(savedVideo)
      setComposerGalleryFiles(savedGallery)
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
      .then(res => { if (!cancelled) { setPosts(res.data || []); setPostsCursor(res.next_cursor || null) } })
      .catch(() => { if (!cancelled) setPosts([]) })
      .finally(() => { if (!cancelled) setPostsLoading(false) })
    return () => { cancelled = true }
  }, [portalJWT])

  // ✅ NEW (Phase 5): কাস্টমার পোস্ট ফিড
  useEffect(() => {
    loadCustomerPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalJWT])

  // ✅ NEW (Redesign Phase ১.৯ — unread ট্র্যাকিং): ফিড ওপেন করাটাকেই "দেখা
  // হয়েছে" ধরা হচ্ছে — এই কলের সময়টা পরের ভিজিটের জন্য baseline হয়ে যায়।
  // এই সেশনে ইতিমধ্যে fetch হওয়া is_new ফ্ল্যাগে এটা প্রভাব ফেলে না,
  // শুধু পরের বার কোনগুলো "নতুন" দেখাবে সেটা ঠিক করে।
  useEffect(() => {
    portalFetch('/portal/feed/mark-seen', {
      method: 'POST',
      headers: { Authorization: `Bearer ${portalJWT}` },
    }).catch(() => { /* চুপচাপ — badge একটু ভুল থাকলেও ক্ষতি নেই */ })
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
              <FeedPostCard
                key={post.id}
                icon={FiVolume2}
                iconTone="trust"
                title={post.company_name_bn || post.company_name}
                subtitle={fmtDate(post.created_at)}
                isNew={post.is_new}
                commentCount={post.comment_count || 0}
                portalJWT={portalJWT}
                mediaPosition="before"
                imageUrl={post.image_url}
                videoUrl={post.video_url}
                mediaItems={post.media}
                actionsProps={{
                  type: 'company_post',
                  id: post.id,
                  reactionCount: post.reaction_count || 0,
                  myReaction: !!post.my_reaction,
                  reported: reportedKeys.has(`company_post:${post.id}`),
                  confirming: reportConfirmKey === `company_post:${post.id}`,
                  onToggleReaction: toggleReaction,
                  onReportTap: () => setReportConfirmKey(`company_post:${post.id}`),
                  onReportConfirm: submitReport,
                  onReportCancel: () => setReportConfirmKey(null),
                }}
              >
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
                  {/* ✅ NEW (Redesign Phase ১.৯ — transparency label): admin
                      visibility বাছতে পারে, কিন্তু আগে পোস্টে কোথাও দেখানো
                      হতো না কারা দেখছে — 'public' ডিফল্ট বলে সেটার জন্য
                      আলাদা লেবেল না দেখিয়ে শুধু বাকি ৩ লেভেলে দেখানো হচ্ছে */}
                  {post.visibility && post.visibility !== 'public' && (
                    <p className="text-[10px] text-cp-text-muted mt-1.5 flex items-center gap-1">
                      <FiUsers size={10} /> {VISIBILITY_LABELS[post.visibility]}
                    </p>
                  )}
                </div>
              </FeedPostCard>
            ))}
            {postsCursor && (
              <button
                onClick={loadMorePosts}
                disabled={postsLoadingMore}
                className="mx-auto text-[11.5px] font-semibold text-cp-trust-600 py-2 disabled:opacity-50"
              >
                {postsLoadingMore ? 'লোড হচ্ছে...' : 'আরও দেখুন'}
              </button>
            )}
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

          {/* ✅ NEW (Redesign Phase ১.৫/১.৬/১.৭ — মিডিয়া পাইপলাইন): ছবি/ভিডিও/গ্যালারি প্রিভিউ — একসাথে একটাই, একটা বাছলে বাকিগুলো সাফ হয়ে যায় */}
          {composerImageFile && (
            <div className="relative w-full h-32 rounded-xl overflow-hidden border border-cp-border mt-2">
              <img src={URL.createObjectURL(composerImageFile)} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => setComposerImageFile(null)}
                className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1"
              >
                <FiX size={11} />
              </button>
            </div>
          )}
          {composerVideoFile && (
            <div className="relative w-full rounded-xl overflow-hidden border border-cp-border mt-2 bg-black">
              <video src={URL.createObjectURL(composerVideoFile)} className="w-full max-h-40" controls />
              <button
                onClick={() => setComposerVideoFile(null)}
                className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1"
              >
                <FiX size={11} />
              </button>
            </div>
          )}
          {composerGalleryFiles.length > 0 && (
            <div className="flex gap-1.5 mt-2 overflow-x-auto">
              {composerGalleryFiles.map((f, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-cp-border flex-shrink-0">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setComposerGalleryFiles(files => files.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5"
                  >
                    <FiX size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={() => composerFileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-cp-text-muted px-2 py-1.5"
              >
                <FiImage size={13} /> ছবি
              </button>
              <button
                onClick={() => composerVideoInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-cp-text-muted px-2 py-1.5"
              >
                <FiVideo size={13} /> ভিডিও
              </button>
            </div>
            <button
              onClick={submitPost}
              disabled={posting || !composerText.trim()}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-white bg-cp-trust-500 rounded-full px-3.5 py-1.5 disabled:opacity-40"
            >
              <FiSend size={11} /> {posting ? 'পোস্ট হচ্ছে...' : 'পোস্ট করুন'}
            </button>
          </div>
          <input
            ref={composerFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => {
              // ✅ NEW (Redesign Phase ১.৭): একটা ছবি বাছলে আগের সরল single-image
              // পথ (দ্রুত), ২+ বাছলে গ্যালারি পথ — আলাদা বাটন না রেখে input-এই
              // "multiple" দিয়ে স্বাভাবিকভাবে দুটো পথ বেছে নেওয়া
              const files = Array.from(e.target.files || [])
              if (files.length === 0) return
              setComposerVideoFile(null)
              if (files.length === 1) {
                setComposerImageFile(files[0]); setComposerGalleryFiles([])
              } else {
                if (files.length > 4) alert('সর্বোচ্চ ৪টা ছবি — প্রথম ৪টা নেওয়া হলো।')
                setComposerGalleryFiles(files.slice(0, 4)); setComposerImageFile(null)
              }
            }}
          />
          <input
            ref={composerVideoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files[0]
              if (!f) return
              // ✅ NEW (Redesign Phase ১.৬): সার্ভারে পাঠানোর আগেই সাইজ চেক —
              // backend-এর ২০MB লিমিটের সাথে মিলিয়ে, আপলোড শুরু করে ব্যর্থ
              // হওয়ার চেয়ে আগেই জানিয়ে দেওয়া ভালো
              if (f.size > 20 * 1024 * 1024) {
                alert('ভিডিও সর্বোচ্চ ২০MB পর্যন্ত হতে পারে।')
                return
              }
              setComposerVideoFile(f); setComposerImageFile(null); setComposerGalleryFiles([])
            }}
          />
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
              <div key={post.id} className={post._pending ? 'opacity-60 pointer-events-none' : ''}>
              <FeedPostCard
                icon={FiUsers}
                iconTone="trust"
                title={post.author_name || 'কাস্টমার'}
                subtitle={post._pending ? 'পাঠানো হচ্ছে...' : fmtDate(post.created_at)}
                isNew={post.is_new}
                commentCount={post.comment_count || 0}
                portalJWT={portalJWT}
                headerAction={post.is_mine && (
                  <button onClick={() => deletePost(post.id)} className="text-cp-text-muted p-1.5 mr-3 flex-shrink-0">
                    <FiTrash2 size={13} />
                  </button>
                )}
                mediaPosition="after"
                imageUrl={post.image_url}
                videoUrl={post.video_url}
                mediaItems={post.media}
                actionsProps={{
                  type: 'customer_post',
                  id: post.id,
                  reactionCount: post.reaction_count || 0,
                  myReaction: !!post.my_reaction,
                  reported: reportedKeys.has(`customer_post:${post.id}`),
                  confirming: reportConfirmKey === `customer_post:${post.id}`,
                  hideReport: post.is_mine,
                  onToggleReaction: toggleReaction,
                  onReportTap: () => setReportConfirmKey(`customer_post:${post.id}`),
                  onReportConfirm: submitReport,
                  onReportCancel: () => setReportConfirmKey(null),
                }}
              >
                <div className="px-4 pb-3.5">
                  <p className="text-[12.5px] text-cp-text-primary leading-relaxed whitespace-pre-wrap">{post.body}</p>
                </div>
              </FeedPostCard>
              </div>
            ))}
            {custPostsCursor && (
              <button
                onClick={loadMoreCustPosts}
                disabled={custPostsLoadingMore}
                className="mx-auto text-[11.5px] font-semibold text-cp-trust-600 py-2 disabled:opacity-50"
              >
                {custPostsLoadingMore ? 'লোড হচ্ছে...' : 'আরও দেখুন'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
