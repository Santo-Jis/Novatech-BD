import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../api/axios'
import Modal, { ConfirmModal } from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import {
  FiSave, FiRotateCcw, FiPlus, FiTrash2, FiArrowUp, FiArrowDown,
  FiAlertTriangle, FiExternalLink,
} from 'react-icons/fi'
import {
  RECRUITMENT_LIMITS as L,
  mergeFormConfig,
  cloneDefaultConfig,
} from '../recruitmentFormDefaults'

// ── ছোট UI অংশ ────────────────────────────────────────────────
function Section({ title, hint, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 dark:border-slate-700 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h4>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button" role="switch" aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 w-10 h-6 rounded-full flex-shrink-0 transition-colors
          ${checked ? 'bg-red-600' : 'bg-gray-300 dark:bg-slate-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
          ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span onClick={() => onChange(!checked)}>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-gray-400 mt-0.5">{hint}</span>}
      </span>
    </div>
  )
}

// ── মূল কম্পোনেন্ট ────────────────────────────────────────────
export default function RecruitmentFormSettings({ isOpen, onClose, previewHref }) {
  const [cfg,       setCfg]       = useState(() => cloneDefaultConfig())
  const [initial,   setInitial]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [loadError, setLoadError] = useState(false)  // লোড না হলে সংরক্ষণ বন্ধ — ডিফল্ট দিয়ে কাস্টম সেটিংস মুছে ফেলা এড়াতে
  const [saving,    setSaving]    = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  // খোলার সময় সার্ভার থেকে বর্তমান config
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true); setLoadError(false)
    api.get('/recruitment/form-config')
      .then(r => {
        if (cancelled) return
        const c = mergeFormConfig(r.data?.data?.config)
        setCfg(c); setInitial(JSON.stringify(c))
      })
      .catch(() => { if (!cancelled) { setLoadError(true); toast.error('ফর্ম সেটিংস আনতে সমস্যা হয়েছে।') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isOpen])

  const dirty = useMemo(() => JSON.stringify(cfg) !== initial, [cfg, initial])

  // সুবিধাজনক আপডেটার: set('job', 'title', value) বা set('accepting', value)
  const set = (a, b, v) => setCfg(prev =>
    v === undefined ? { ...prev, [a]: b } : { ...prev, [a]: { ...prev[a], [b]: v } })

  const setItem = (i, patch) => setCfg(prev => ({
    ...prev,
    terms: { ...prev.terms, items: prev.terms.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) },
  }))
  const addItem = () => setCfg(prev => prev.terms.items.length >= L.termsMax ? prev : ({
    ...prev, terms: { ...prev.terms, items: [...prev.terms.items, { icon: '✅', text: '' }] },
  }))
  const removeItem = (i) => setCfg(prev => ({
    ...prev, terms: { ...prev.terms, items: prev.terms.items.filter((_, idx) => idx !== i) },
  }))
  const moveItem = (i, dir) => setCfg(prev => {
    const items = [...prev.terms.items]
    const j = i + dir
    if (j < 0 || j >= items.length) return prev
    ;[items[i], items[j]] = [items[j], items[i]]
    return { ...prev, terms: { ...prev.terms, items } }
  })

  const handleClose = () => {
    if (dirty && !window.confirm('সংরক্ষণ না করা পরিবর্তন মুছে যাবে। বন্ধ করবেন?')) return
    onClose()
  }

  const save = async () => {
    // সার্ভার আবার যাচাই করে; এখানে শুধু স্পষ্ট ভুল আটকানো
    if (!cfg.job.title.trim())         return toast.error('পদের নাম দিন।')
    if (!cfg.header.subtitle.trim())   return toast.error('ফর্মের উপশিরোনাম দিন।')
    if (!cfg.declaration.text.trim())  return toast.error('ঘোষণাপত্রের লেখা দিন।')
    if (cfg.terms.enabled && !cfg.terms.items.some(i => i.text.trim()))
      return toast.error('শর্তাবলী চালু রাখলে অন্তত একটি শর্ত দিন, নয়তো সেকশন বন্ধ করুন।')
    if (!cfg.accepting && !cfg.closed_message.trim())
      return toast.error('আবেদন বন্ধ রাখলে প্রার্থীকে দেখানোর বার্তা দিন।')

    setSaving(true)
    try {
      const r = await api.put('/recruitment/form-config', { config: cfg })
      const c = mergeFormConfig(r.data?.data?.config)   // সার্ভারে sanitize হওয়া রূপ
      setCfg(c); setInitial(JSON.stringify(c))
      toast.success('ফর্ম সেটিংস সংরক্ষিত হয়েছে।')
    } catch (e) {
      toast.error(e.response?.data?.message || 'সংরক্ষণ করতে সমস্যা হয়েছে।')
    } finally { setSaving(false) }
  }

  const reset = async () => {
    setConfirmReset(false)
    setSaving(true)
    try {
      const r = await api.delete('/recruitment/form-config')
      const c = mergeFormConfig(r.data?.data?.config)
      setCfg(c); setInitial(JSON.stringify(c))
      toast.success('ডিফল্ট সেটিংসে ফেরানো হয়েছে।')
    } catch (e) {
      toast.error(e.response?.data?.message || 'ডিফল্টে ফেরাতে সমস্যা হয়েছে।')
    } finally { setSaving(false) }
  }

  const footer = (
    <>
      <Button variant="ghost" size="md" icon={<FiRotateCcw size={14} />}
        onClick={() => setConfirmReset(true)} disabled={saving || loading || loadError} className="mr-auto">
        ডিফল্টে ফিরুন
      </Button>
      <Button variant="outline" onClick={handleClose} disabled={saving}>বন্ধ করুন</Button>
      <Button icon={<FiSave size={14} />} onClick={save} loading={saving} disabled={loading || loadError || !dirty}>
        সংরক্ষণ করুন
      </Button>
    </>
  )

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="আবেদন ফর্ম সেটিংস" size="xl" footer={footer}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-red-600/20 border-t-red-600 rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-red-500 py-10 text-center">সেটিংস লোড হয়নি। বন্ধ করে আবার খুলুন।</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              এখানে বদলানো লেখা ও সেটিংস শুধু আপনার কোম্পানির আবেদন ফর্মে প্রযোজ্য হবে।
              {previewHref && (
                <> সংরক্ষণের পর <a href={previewHref} target="_blank" rel="noreferrer"
                  className="text-red-600 hover:underline inline-flex items-center gap-1">
                  ফর্মটি দেখুন <FiExternalLink size={11} /></a>।</>
              )}
            </p>

            {/* সাধারণ */}
            <Section title="আবেদন গ্রহণ ও যাচাই">
              <Toggle checked={cfg.accepting} onChange={v => set('accepting', v)}
                label="আবেদন নেওয়া চলছে"
                hint="বন্ধ করলে ফর্মের লিংকে নিচের বার্তা দেখাবে এবং নতুন আবেদন জমা হবে না।" />
              {!cfg.accepting && (
                <Textarea label="আবেদন বন্ধ থাকলে দেখানো বার্তা" rows={2} maxLength={L.medium}
                  value={cfg.closed_message} onChange={e => set('closed_message', e.target.value)} />
              )}
              <Toggle checked={cfg.require_otp} onChange={v => set('require_otp', v)}
                label="WhatsApp OTP দিয়ে মোবাইল যাচাই বাধ্যতামূলক"
                hint="নিরাপত্তার জন্য চালু রাখাই ভালো।" />
              {!cfg.require_otp && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 text-xs text-amber-700 dark:text-amber-400">
                  <FiAlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>যাচাই বন্ধ থাকলে যে কেউ ভুয়া বা অন্যের নম্বর দিয়ে আবেদন করতে পারবে। ফোন/NID/ডিভাইসের ডুপ্লিকেট চেক তবুও চলবে।</span>
                </div>
              )}
            </Section>

            {/* হেডার */}
            <Section title="ফর্মের হেডার">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="উপশিরোনাম" maxLength={L.short} value={cfg.header.subtitle}
                  onChange={e => set('header', 'subtitle', e.target.value)} />
                <Input label="স্ট্যাটাস ব্যাজ" maxLength={L.short} value={cfg.header.status_badge}
                  hint="ফাঁকা রাখলে ব্যাজ দেখাবে না"
                  onChange={e => set('header', 'status_badge', e.target.value)} />
              </div>
            </Section>

            {/* ব্যানার */}
            <Section title="পদের বিবরণ ব্যানার">
              <Toggle checked={cfg.job.show_banner} onChange={v => set('job', 'show_banner', v)} label="ব্যানার দেখান" />
              {cfg.job.show_banner && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="পদের নাম" maxLength={L.short} value={cfg.job.title}
                    onChange={e => set('job', 'title', e.target.value)} />
                  <Input label="কোম্পানির নাম (ব্যানারে)" maxLength={L.short} value={cfg.job.company}
                    hint="ফাঁকা রাখলে কোম্পানির নাম স্বয়ংক্রিয়ভাবে বসবে"
                    onChange={e => set('job', 'company', e.target.value)} />
                  <Input label="কর্মএলাকা" maxLength={L.short} value={cfg.job.work_area}
                    hint="ফাঁকা রাখলে এই ঘর দেখাবে না"
                    onChange={e => set('job', 'work_area', e.target.value)} />
                  <Input label="বেতন" maxLength={L.short} value={cfg.job.salary}
                    hint="ফাঁকা রাখলে এই ঘর দেখাবে না"
                    onChange={e => set('job', 'salary', e.target.value)} />
                </div>
              )}
            </Section>

            {/* ঠিকানা নোট */}
            <Section title="ঠিকানা পাতার নোট" hint="ঠিকানা ধাপের নিচে হলুদ বক্সে দেখায়।">
              <Toggle checked={cfg.address_note.enabled} onChange={v => set('address_note', 'enabled', v)} label="নোট দেখান" />
              {cfg.address_note.enabled && (
                <Textarea rows={2} maxLength={L.medium} value={cfg.address_note.text}
                  onChange={e => set('address_note', 'text', e.target.value)} />
              )}
            </Section>

            {/* শর্তাবলী */}
            <Section title="চাকরির শর্তাবলী" hint={`শেষ ধাপে দেখায়। সর্বোচ্চ ${L.termsMax}টি।`}>
              <Toggle checked={cfg.terms.enabled} onChange={v => set('terms', 'enabled', v)} label="শর্তাবলী দেখান" />
              {cfg.terms.enabled && (
                <>
                  <Input label="শিরোনাম" maxLength={L.short} value={cfg.terms.title}
                    onChange={e => set('terms', 'title', e.target.value)} />
                  <div className="space-y-2">
                    {cfg.terms.items.map((it, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <input value={it.icon} maxLength={L.termsIcon} aria-label="আইকন"
                          onChange={e => setItem(i, { icon: e.target.value })}
                          className="w-14 text-center border rounded-xl px-2 py-2.5 text-base bg-white dark:bg-slate-800 dark:border-slate-600 border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
                        <input value={it.text} maxLength={L.termsText} aria-label={`শর্ত ${i + 1}`}
                          placeholder={`শর্ত ${i + 1}`}
                          onChange={e => setItem(i, { text: e.target.value })}
                          className="flex-1 min-w-0 border rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 dark:text-gray-100 dark:border-slate-600 border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
                        <div className="flex flex-col sm:flex-row gap-1">
                          <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0}
                            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30" aria-label="উপরে"><FiArrowUp size={14} /></button>
                          <button type="button" onClick={() => moveItem(i, 1)} disabled={i === cfg.terms.items.length - 1}
                            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30" aria-label="নিচে"><FiArrowDown size={14} /></button>
                          <button type="button" onClick={() => removeItem(i)}
                            className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="মুছুন"><FiTrash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                    {cfg.terms.items.length < L.termsMax && (
                      <Button variant="outline" size="sm" icon={<FiPlus size={13} />} onClick={addItem}>শর্ত যোগ করুন</Button>
                    )}
                  </div>
                </>
              )}
            </Section>

            {/* ঘোষণাপত্র */}
            <Section title="ঘোষণাপত্র" hint="প্রার্থী টিক দিয়ে সম্মতি দেবেন — এটি বাধ্যতামূলক থাকে।">
              <Input label="শিরোনাম" maxLength={L.short} value={cfg.declaration.title}
                onChange={e => set('declaration', 'title', e.target.value)} />
              <Textarea label="ঘোষণার লেখা" rows={4} maxLength={L.long} value={cfg.declaration.text}
                onChange={e => set('declaration', 'text', e.target.value)} />
            </Section>

            {/* সফল বার্তা */}
            <Section title="আবেদন জমার পর বার্তা">
              <Input label="শিরোনাম" maxLength={L.short} value={cfg.success.title}
                onChange={e => set('success', 'title', e.target.value)} />
              <Textarea label="বার্তা" rows={3} maxLength={L.long} value={cfg.success.message}
                onChange={e => set('success', 'message', e.target.value)} />
            </Section>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={confirmReset} onClose={() => setConfirmReset(false)} onConfirm={reset}
        title="ডিফল্টে ফিরবেন?" danger confirmLabel="হ্যাঁ, ডিফল্টে ফিরুন"
        message="আপনার কাস্টম লেখা ও সেটিংস মুছে যাবে এবং ফর্ম আগের ডিফল্ট রূপে ফিরবে।"
      />
    </>
  )
}
