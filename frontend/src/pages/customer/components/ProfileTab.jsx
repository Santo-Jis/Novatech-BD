// components/ProfileTab.jsx
// ✅ NEW — "প্রোফাইল" ট্যাব (Phase 2 ফ্রন্টএন্ড — ব্যাকএন্ড অনেক আগে থেকেই
// রেডি ছিল: GET/PUT /api/portal/profile/area-field + GET /api/reference/*)
//
// এখানে কাস্টমার নিজের শপ-নাম/ঠিকানা, সার্ভিস এরিয়া (বিভাগ→জেলা) ও
// বিজনেস ফিল্ড (মাল্টি-সিলেক্ট) সেট করে, আর "discoverable" টগল দিয়ে
// ঠিক করে দেয় ডিস্ট্রিবিউটরদের discovery লিস্টে দেখানো হবে কিনা।
//
// এই ডেটাই ভবিষ্যতে distributor-সাইড discovery matching-এ ব্যবহৃত হবে
// (01-Requirements-Spec.md ধারা ৩.৩)। ConnectionsTab.jsx-এর মতোই
// self-contained: portalJWT prop নেয়, নিজের state/fetch নিজেই সামলায়।

import { useState, useEffect, useCallback, useRef } from 'react'
import { FiCheck, FiMapPin, FiEye, FiEyeOff, FiPhone, FiMessageCircle, FiMail, FiLock, FiCamera, FiCheckCircle, FiUser, FiX, FiLink, FiChevronRight } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpCard from './ui/CpCard'
import CpButton from './ui/CpButton'
import CpInput from './ui/CpInput'
import CpBadge from './ui/CpBadge'

export default function ProfileTab({ portalJWT, onTabChange = () => {} }) {
  const authHeader = { Authorization: `Bearer ${portalJWT}` }

  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  // ── আইডেন্টিটি হেডার — read-only ডেটা + ছবি/QR ── (form state-এর বাইরে,
  // কারণ form সরাসরি PUT /area-field বডিতে যায়, এগুলো আলাদা এন্ডপয়েন্ট/read-only)
  const [person, setPerson] = useState({ full_name: '', shop_photo: '', profile_photo: '', qr_code: '', is_verified: null })
  const [uploadingCover,  setUploadingCover]  = useState(false) // শপ-ফটো (cover)
  const [uploadingAvatar, setUploadingAvatar] = useState(false) // মালিকের ছবি (circular avatar)
  const [qrOpen, setQrOpen] = useState(false)
  const shopPhotoInputRef    = useRef(null)
  const profilePhotoInputRef = useRef(null)

  const [divisions,      setDivisions]      = useState([])
  const [districts,      setDistricts]      = useState([])
  const [businessFields, setBusinessFields] = useState([])
  const [companyCount,   setCompanyCount]   = useState(null) // null = এখনো লোড হয়নি

  // ── অ্যাকাউন্ট ও নিরাপত্তা সেকশন ProfileTab থেকে সরিয়ে
  // AccountMenu → SettingsPage → SecurityPanel-এ নিয়ে যাওয়া হয়েছে।
  // (security, pwOpen, pwForm, pwSaving, pwError, revokingId — সব সরানো)

  const [form, setForm] = useState({
    shop_name: '', address: '', division_id: '', district_id: '',
    discoverable: true, business_field_ids: [],
    phone: '', whatsapp: '', email: '', bio: '',
  })

  // ── প্রাথমিক লোড: রেফারেন্স ডেটা + নিজের বর্তমান প্রোফাইল ──────
  const loadAll = useCallback(async () => {
    setLoading(true); setErrorMsg('')
    try {
      const [divRes, bfRes, meRes] = await Promise.all([
        portalFetch('/reference/divisions'),
        portalFetch('/reference/business-fields'),
        portalFetch('/portal/profile/area-field', { headers: authHeader }),
      ])
      setDivisions(divRes.data || [])
      setBusinessFields(bfRes.data || [])

      const me = meRes.data || {}
      setForm({
        shop_name:    me.shop_name || '',
        address:      me.address || '',
        division_id:  me.division_id || '',
        district_id:  me.district_id || '',
        discoverable: me.discoverable !== false,
        business_field_ids: (me.business_fields || []).map(f => f.id),
        phone:    me.phone || '',
        whatsapp: me.whatsapp || '',
        email:    me.email || '',
        bio:      me.bio || '',
      })
      setPerson({
        full_name:     me.full_name || '',
        shop_photo:    me.shop_photo || '',
        profile_photo: me.profile_photo || '',
        qr_code:       me.qr_code || '',
        is_verified:   me.is_verified ?? null,
      })

      if (me.division_id) {
        const distRes = await portalFetch(`/reference/districts?division_id=${me.division_id}`)
        setDistricts(distRes.data || [])
      }
    } catch {
      setErrorMsg('প্রোফাইল তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }

    // সংযুক্ত কোম্পানির সংখ্যা — ইচ্ছাকৃতভাবে উপরের মূল try/catch-এর বাইরে
    try {
      const compRes = await portalFetch('/portal/connections/my-companies', { headers: authHeader })
      setCompanyCount((compRes.data || []).length)
    } catch {
      setCompanyCount(null)
    }
    // ✅ Security fetch সরানো হয়েছে — এখন SecurityPanel.jsx-এ
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll() }, [loadAll])

  // ── বিভাগ বদলালে জেলা রিলোড ──────────────────────────────────
  const onDivisionChange = async (division_id) => {
    setForm(f => ({ ...f, division_id, district_id: '' }))
    setDistricts([])
    if (!division_id) return
    try {
      const res = await portalFetch(`/reference/districts?division_id=${division_id}`)
      setDistricts(res.data || [])
    } catch { /* silent */ }
  }

  const toggleField = (id) => {
    setForm(f => ({
      ...f,
      business_field_ids: f.business_field_ids.includes(id)
        ? f.business_field_ids.filter(x => x !== id)
        : [...f.business_field_ids, id],
    }))
  }

  // ── ফটো আপলোড (POST /portal/profile/photo, multipart) ────────
  // field: 'shop_photo' (cover) বা 'profile_photo' (গোলাকার avatar) —
  // দুটো আপলোড-বাটনই একই হ্যান্ডলার শেয়ার করে, শুধু target field আলাদা
  const onPhotoSelected = (field) => async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // একই ফাইল আবার সিলেক্ট করলেও onChange ফায়ার হবে
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMsg('শুধু ছবি আপলোড করা যাবে।')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('ছবির সাইজ ৫MB-এর বেশি হতে পারবে না।')
      return
    }

    const setUploading = field === 'shop_photo' ? setUploadingCover : setUploadingAvatar
    setUploading(true); setErrorMsg(''); setSavedMsg('')
    try {
      const fd = new FormData()
      fd.append(field, file)
      const res = await portalFetch('/portal/profile/photo', {
        method: 'POST',
        headers: authHeader,
        body: fd,
      })
      if (res.data?.[field]) {
        setPerson(p => ({ ...p, [field]: res.data[field] }))
        setSavedMsg(field === 'shop_photo' ? '✅ কভার ছবি আপডেট হয়েছে।' : '✅ প্রোফাইল ছবি আপডেট হয়েছে।')
      }
    } catch {
      setErrorMsg('ছবি আপলোড করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setSaving(true); setSavedMsg(''); setErrorMsg('')
    try {
      await portalFetch('/portal/profile/area-field', {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify({
          shop_name:    form.shop_name,
          address:      form.address,
          division_id:  form.division_id || null,
          district_id:  form.district_id || null,
          discoverable: form.discoverable,
          business_field_ids: form.business_field_ids,
          phone:    form.phone,
          whatsapp: form.whatsapp,
          email:    form.email,
          bio:      form.bio,
        }),
      })
      setSavedMsg('✅ প্রোফাইল আপডেট হয়েছে।')
    } catch {
      setErrorMsg('আপডেট করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।')
    } finally {
      setSaving(false)
    }
  }

  const fieldName = (f) => f.name_bn || f.name_en

  // discoverable প্রিভিউতে division/district নাম দেখাতে — id মিশ্র টাইপ হতে
  // পারে (API-থেকে number, <select> থেকে string), তাই String() দিয়ে তুলনা
  const areaLabel = () => {
    const divName  = divisions.find(d => String(d.id) === String(form.division_id))
    const distName = districts.find(d => String(d.id) === String(form.district_id))
    return [distName?.name_bn || distName?.name_en, divName?.name_bn || divName?.name_en]
      .filter(Boolean).join(', ')
  }

  if (loading) {
    return <CpCard padding="md"><p className="text-xs text-cp-text-muted text-center">লোড হচ্ছে...</p></CpCard>
  }

  const previewAreaLabel = areaLabel()

  return (
    <div className="flex flex-col gap-3">
      {/* ── আইডেন্টিটি হেডার (Facebook-স্টাইল কভার + গোলাকার অ্যাভাটার) ── */}
      <CpCard padding="none" className="overflow-hidden">
        {/* কভার — শপের ছবি, wide ব্যানার */}
        <div className="relative w-full h-32 bg-cp-bg-alt">
          {person.shop_photo && (
            <img src={person.shop_photo} alt="কভার ছবি" className="w-full h-full object-cover" />
          )}
          <button
            onClick={() => shopPhotoInputRef.current?.click()}
            disabled={uploadingCover}
            className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-black/45 border border-white/40 flex items-center justify-center disabled:opacity-60"
          >
            <FiCamera className="text-white" size={15} />
          </button>
          <input
            ref={shopPhotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPhotoSelected('shop_photo')}
          />
        </div>

        <div className="px-4 pb-4">
          {/* অ্যাভাটার — কভারের উপর overlap, negative margin দিয়ে */}
          <div className="relative -mt-10 mb-2 inline-block">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-cp-bg-alt border-4 border-white flex items-center justify-center">
              {person.profile_photo
                ? <img src={person.profile_photo} alt="প্রোফাইল ছবি" className="w-full h-full object-cover" />
                : <FiUser className="text-cp-text-muted" size={30} />
              }
            </div>
            <button
              onClick={() => profilePhotoInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-cp-trust-500 border-2 border-white flex items-center justify-center disabled:opacity-60"
            >
              <FiCamera className="text-white" size={13} />
            </button>
            <input
              ref={profilePhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPhotoSelected('profile_photo')}
            />
          </div>

          {/* নাম + মালিক + verified ব্যাজ + QR — অ্যাভাটারের নিচে */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-cp-text-primary truncate">
                {form.shop_name || 'শপের নাম নেই'}
              </p>
              {person.full_name && (
                <p className="text-xs text-cp-text-muted truncate">{person.full_name}</p>
              )}
              {person.is_verified && (
                <div className="mt-1">
                  <CpBadge variant="verified" icon={FiCheckCircle}>ভেরিফায়েড</CpBadge>
                </div>
              )}
            </div>

            {/* QR বাটন — qr_code ইতিমধ্যে GET /area-field রেসপন্সেই আছে, আলাদা কল লাগছে না */}
            <button
              onClick={() => setQrOpen(true)}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-cp-bg-alt border border-cp-border flex items-center justify-center"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cp-text-secondary">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3zM19 14v3M14 19h3M19 19h2" />
              </svg>
            </button>
          </div>

          {/* বায়ো — ইনলাইন-এডিটেবল, Facebook "intro" টেক্সটের মতো, সরাসরি
              form.bio-তেই থাকে তাই নিচের "সংরক্ষণ করুন" দিয়েই সেভ হয়,
              আলাদা কোনো সাবমিট/মোডাল লাগে না */}
          <textarea
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value.slice(0, 280) }))}
            placeholder="নিজের বা শপের সম্পর্কে কিছু লিখুন..."
            rows={2}
            className="mt-3 w-full resize-none rounded-xl border border-cp-border bg-white px-3 py-2 text-sm text-cp-text-primary placeholder:text-cp-text-muted focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500"
          />
          <p className="mt-1 text-right text-[10px] text-cp-text-muted">{form.bio.length}/280</p>
        </div>
      </CpCard>

      {savedMsg && (
        <CpCard variant="sunken" padding="sm"><span className="text-xs text-cp-confidence-600 font-medium">{savedMsg}</span></CpCard>
      )}
      {errorMsg && (
        <CpCard variant="sunken" padding="sm"><span className="text-xs text-cp-error">{errorMsg}</span></CpCard>
      )}

      {/* ── শপ তথ্য ── */}
      <CpCard padding="md" className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-cp-text-secondary">শপের তথ্য</p>
        <CpInput
          label="শপের নাম"
          placeholder="যেমন: রহিম স্টোর"
          value={form.shop_name}
          onChange={e => setForm(f => ({ ...f, shop_name: e.target.value }))}
        />
        <CpInput
          label="ঠিকানা"
          icon={FiMapPin}
          placeholder="দোকানের সম্পূর্ণ ঠিকানা"
          value={form.address}
          onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
        />
      </CpCard>

      {/* ── যোগাযোগের তথ্য ── */}
      {/* discoverable চালু থাকলে এই ৩টা ফিল্ড connect হওয়ার আগ পর্যন্ত
          distributor-দের কাছে masked থাকে (discovery.controller.js এর
          getDiscoveryShops-এই এই মাস্কিং হয়) — সেটার ইঙ্গিত দিতে প্রতিটা
          ইনপুটের পাশে ছোট eye/lock আইকন, ক্লিকযোগ্য না, শুধু ভিজ্যুয়াল হিন্ট। */}
      <CpCard padding="md" className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-cp-text-secondary">যোগাযোগের তথ্য</p>
        <CpInput
          label="ফোন নম্বর"
          icon={FiPhone}
          placeholder="01XXXXXXXXX"
          value={form.phone}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          rightElement={
            form.discoverable
              ? <FiEye className="text-cp-text-muted" size={16} />
              : <FiLock className="text-cp-text-muted" size={16} />
          }
        />
        <CpInput
          label="হোয়াটসঅ্যাপ নম্বর"
          icon={FiMessageCircle}
          placeholder="01XXXXXXXXX"
          value={form.whatsapp}
          onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
          rightElement={
            form.discoverable
              ? <FiEye className="text-cp-text-muted" size={16} />
              : <FiLock className="text-cp-text-muted" size={16} />
          }
        />
        <CpInput
          label="ইমেইল"
          icon={FiMail}
          placeholder="shop@example.com"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          rightElement={
            form.discoverable
              ? <FiEye className="text-cp-text-muted" size={16} />
              : <FiLock className="text-cp-text-muted" size={16} />
          }
        />
        <p className="text-[11px] text-cp-text-muted leading-snug">
          {form.discoverable
            ? 'এই তথ্যগুলো কোনো ডিস্ট্রিবিউটর আপনার সাথে Connect করার আগ পর্যন্ত দেখতে পাবে না।'
            : 'Discovery বন্ধ থাকায় এই তথ্যগুলো কোনো ডিস্ট্রিবিউটর discovery লিস্টে দেখতে পাবে না।'}
        </p>
      </CpCard>

      {/* ── সার্ভিস এরিয়া ── */}
      <CpCard padding="md" className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-cp-text-secondary">এরিয়া (ডিস্ট্রিবিউটর discovery-এর জন্য)</p>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-cp-text-secondary font-cp-body">বিভাগ</label>
          <select
            value={form.division_id}
            onChange={e => onDivisionChange(e.target.value)}
            className="w-full h-12 rounded-xl border border-cp-border bg-white px-4 font-cp-body text-cp-text-primary focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500"
          >
            <option value="">বেছে নিন</option>
            {divisions.map(d => (
              <option key={d.id} value={d.id}>{d.name_bn || d.name_en}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-cp-text-secondary font-cp-body">জেলা</label>
          <select
            value={form.district_id}
            onChange={e => setForm(f => ({ ...f, district_id: e.target.value }))}
            disabled={!form.division_id}
            className="w-full h-12 rounded-xl border border-cp-border bg-white px-4 font-cp-body text-cp-text-primary disabled:bg-cp-bg-alt disabled:text-cp-text-muted focus:outline-none focus:ring-2 focus:ring-cp-trust-500/40 focus:border-cp-trust-500"
          >
            <option value="">বেছে নিন</option>
            {districts.map(d => (
              <option key={d.id} value={d.id}>{d.name_bn || d.name_en}</option>
            ))}
          </select>
        </div>
      </CpCard>

      {/* ── বিজনেস ফিল্ড (মাল্টি-সিলেক্ট চিপ) ── */}
      <CpCard padding="md" className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-cp-text-secondary">ব্যবসার ধরন (একাধিক বেছে নেওয়া যাবে)</p>
        <div className="flex flex-wrap gap-2">
          {businessFields.map(bf => {
            const active = form.business_field_ids.includes(bf.id)
            return (
              <button
                key={bf.id}
                onClick={() => toggleField(bf.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium font-cp-body transition-colors ${
                  active
                    ? 'bg-cp-trust-500 text-white'
                    : 'bg-cp-bg-alt text-cp-text-secondary'
                }`}
              >
                {active && <FiCheck size={12} />}
                {fieldName(bf)}
              </button>
            )
          })}
        </div>
      </CpCard>

      {/* ── Discoverable টগল ── */}
      <CpCard padding="md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {form.discoverable
              ? <FiEye className="text-cp-trust-500 flex-shrink-0" size={18} />
              : <FiEyeOff className="text-cp-text-muted flex-shrink-0" size={18} />
            }
            <div className="min-w-0">
              <p className="text-sm font-semibold text-cp-text-primary">Discovery-তে দৃশ্যমান</p>
              <p className="text-[11px] text-cp-text-muted leading-snug">
                চালু থাকলে আপনার এরিয়া+ফিল্ড ম্যাচ করা ডিস্ট্রিবিউটররা আপনাকে খুঁজে পাবে (Connect করার আগ পর্যন্ত শুধু শপের নাম+ঠিকানা দেখাবে)
              </p>
            </div>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, discoverable: !f.discoverable }))}
            className="flex-shrink-0 w-12 h-7 rounded-full relative transition-colors"
            style={{ background: form.discoverable ? '#2E7BD6' : '#CBD5E1' }}
          >
            <span
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all"
              style={{ left: form.discoverable ? 22 : 2 }}
            />
          </button>
        </div>
      </CpCard>

      {/* ── লাইভ প্রিভিউ: ডিস্ট্রিবিউটর যেভাবে দেখবে ── */}
      {/* discovery.controller.js-এর getDiscoveryShops মাস্কিং লজিকের সাথে হুবহু
          মিলিয়ে রেন্ডার করা — নতুন কোনো API কল লাগছে না, শুধু ফর্মের বর্তমান
          state থেকেই বানানো। ২টা কেস:
          (১) discoverable=false → person discovery query-র WHERE p.discoverable=true
              শর্তেই বাদ পড়ে যায়, অর্থাৎ কোনো distributor-এর লিস্টেই আসবে না —
              এটা শুধু "contact info hidden" থেকে ভিন্ন, তাই আলাদা বার্তা।
          (২) discoverable=true → shop_name/address/division/district সবসময়
              দেখা যায়; owner_name/phone/whatsapp/email শুধু connection_status
              === 'connected' হলে unlock হয় — তার আগ পর্যন্ত এই প্রিভিউ সেই
              locked অবস্থাটাই দেখায়, কারণ এটাই ডিফল্ট/সবচেয়ে বেশি প্রযোজ্য অবস্থা। */}
      <CpCard variant="sunken" padding="md" className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-cp-text-secondary">ডিস্ট্রিবিউটর আপনাকে যেভাবে দেখবে</p>

        {!form.discoverable ? (
          <div className="flex items-center gap-2.5 py-1">
            <FiEyeOff className="text-cp-text-muted flex-shrink-0" size={16} />
            <p className="text-xs text-cp-text-muted leading-snug">
              আপনি এখন Discovery লিস্টেই নেই — কোনো ডিস্ট্রিবিউটর আপনাকে খুঁজে পাবে না, নতুন করে Connect হওয়ার আগ পর্যন্ত।
            </p>
          </div>
        ) : (
          <>
            <CpCard padding="sm" className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-cp-text-primary truncate">
                  {form.shop_name || 'শপের নাম নেই'}
                </p>
                <CpBadge variant="pending">Connect হয়নি</CpBadge>
              </div>
              <div className="flex items-start gap-1.5">
                <FiMapPin className="text-cp-text-muted flex-shrink-0 mt-0.5" size={13} />
                <p className="text-xs text-cp-text-secondary leading-snug">
                  {form.address || 'ঠিকানা নেই'}
                  {previewAreaLabel ? ` — ${previewAreaLabel}` : ''}
                </p>
              </div>

              {/* locked ফিল্ড — placeholder, ব্লার-স্টাইল */}
              <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-cp-border/60">
                {[
                  { icon: FiUser,          label: 'মালিকের নাম' },
                  { icon: FiPhone,         label: 'ফোন নম্বর'   },
                  { icon: FiMessageCircle, label: 'হোয়াটসঅ্যাপ' },
                  { icon: FiMail,          label: 'ইমেইল'       },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <Icon className="text-cp-text-muted flex-shrink-0" size={12} />
                    <span className="text-[11px] text-cp-text-muted italic">{label} — লুকানো</span>
                    <FiLock className="text-cp-text-muted flex-shrink-0 ml-auto" size={11} />
                  </div>
                ))}
              </div>
            </CpCard>
            <p className="text-[11px] text-cp-text-muted leading-snug">
              ডিস্ট্রিবিউটর প্রথমে শুধু এইটুকুই দেখবে। আপনার সাথে Connect হয়ে গেলে (আপনার QR স্ক্যান করে বা রিকোয়েস্ট গ্রহণ করলে) মালিকের নাম, ফোন, হোয়াটসঅ্যাপ ও ইমেইলও দেখতে পারবে।
            </p>
          </>
        )}
      </CpCard>

      {/* ── সংযুক্ত কোম্পানি — মিনি সামারি ── */}
      {/* পুরো ConnectionsTab এখানে আনা হচ্ছে না, শুধু count + নেভিগেশন লিংক।
          GET /portal/connections/my-companies (loadAll-এ ইতিমধ্যে কল হয়েছে,
          independent try/catch-এ) — status='connected' ফিল্টার করা, pending
          বাদ, তাই এখানে "সংযুক্ত" বলাটা সঠিক। কল ব্যর্থ হলে companyCount
          null-ই থেকে যায় এবং এই কার্ড নিজে থেকেই hide হয়ে যায় — একটা
          সেকেন্ডারি সামারির জন্য এরর-ব্যানার দেখানো অতিরিক্ত। */}
      {companyCount !== null && (
        <CpCard padding="md" pressable onClick={() => onTabChange('network')}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cp-trust-100 flex items-center justify-center flex-shrink-0">
              <FiLink className="text-cp-trust-600" size={16} />
            </div>
            <p className="flex-1 text-sm font-medium text-cp-text-primary">
              {companyCount === 0
                ? 'এখনো কোনো কোম্পানির সাথে সংযুক্ত নন'
                : `${companyCount}টি কোম্পানির সাথে সংযুক্ত`}
            </p>
            <FiChevronRight className="text-cp-text-muted flex-shrink-0" size={16} />
          </div>
        </CpCard>
      )}

      <CpButton variant="primary" fullWidth loading={saving} onClick={save}>
        সংরক্ষণ করুন
      </CpButton>

      {/* ✅ অ্যাকাউন্ট ও নিরাপত্তা সেকশন এখানে আর নেই —
          AccountMenu (☰) → সেটিংস → পাসওয়ার্ড ও নিরাপত্তা-তে সরানো হয়েছে।
          (SecurityPanel.jsx) */}

      {/* ── QR মোডাল ── */}
      {qrOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setQrOpen(false)}>
          <div className="bg-white w-full max-w-[480px] rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <p className="text-base font-bold text-cp-text-primary">আমার QR কোড</p>
              <button onClick={() => setQrOpen(false)}><FiX size={20} className="text-cp-text-muted" /></button>
            </div>
            {person.qr_code ? (
              <div className="flex flex-col items-center gap-3 pb-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(person.qr_code)}`}
                  alt="QR কোড"
                  className="w-[220px] h-[220px] rounded-2xl border border-cp-border"
                />
                <p className="text-sm font-semibold text-cp-text-primary">{form.shop_name}</p>
                <p className="text-xs text-cp-text-muted text-center px-6">
                  ডিস্ট্রিবিউটর সামনাসামনি এই QR স্ক্যান করলে সাথে সাথে সংযোগ হয়ে যাবে — অনুমোদনের দরকার নেই।
                </p>
              </div>
            ) : (
              <p className="text-xs text-cp-text-muted text-center py-8">QR কোড পাওয়া যায়নি।</p>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
