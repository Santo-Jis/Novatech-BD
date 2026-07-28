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

import { useState, useEffect, useCallback } from 'react'
import { FiCheck, FiMapPin, FiEye, FiEyeOff } from 'react-icons/fi'
import { portalFetch } from '../utils/api'
import CpCard from './ui/CpCard'
import CpButton from './ui/CpButton'
import CpInput from './ui/CpInput'
import CpBadge from './ui/CpBadge'

export default function ProfileTab({ portalJWT }) {
  const authHeader = { Authorization: `Bearer ${portalJWT}` }

  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  const [divisions,      setDivisions]      = useState([])
  const [districts,      setDistricts]      = useState([])
  const [businessFields, setBusinessFields] = useState([])

  const [form, setForm] = useState({
    shop_name: '', address: '', division_id: '', district_id: '',
    discoverable: true, business_field_ids: [],
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

  if (loading) {
    return <CpCard padding="md"><p className="text-xs text-cp-text-muted text-center">লোড হচ্ছে...</p></CpCard>
  }

  return (
    <div className="flex flex-col gap-3">
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

      <CpButton variant="primary" fullWidth loading={saving} onClick={save}>
        সংরক্ষণ করুন
      </CpButton>
    </div>
  )
}
