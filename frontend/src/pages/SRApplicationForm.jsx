import { useState } from 'react'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  FiUser, FiPhone, FiMail, FiMapPin, FiBook,
  FiBriefcase, FiUpload, FiCheck, FiChevronRight,
  FiChevronLeft, FiAlertCircle, FiShield, FiAward,
  FiStar, FiCalendar, FiHome
} from 'react-icons/fi'
import SREmailOTPVerify from '../components/SREmailOTPVerify'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '')

// ── Steps Config ──────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'ব্যক্তিগত',   icon: FiUser },
  { id: 2, label: 'ঠিকানা',      icon: FiMapPin },
  { id: 3, label: 'শিক্ষা',      icon: FiBook },
  { id: 4, label: 'অভিজ্ঞতা',    icon: FiBriefcase },
  { id: 5, label: 'দক্ষতা',      icon: FiStar },
  { id: 6, label: 'চূড়ান্ত',    icon: FiUpload },
]

// ── Step Indicator ────────────────────────────────────────────
function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-between mb-8 px-1">
      {STEPS.map((step, i) => {
        const Icon = step.icon
        const done   = current > step.id
        const active = current === step.id
        return (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div className={`
                w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center
                text-xs sm:text-sm font-bold transition-all duration-300
                ${done   ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                : active ? 'bg-red-600 text-white shadow-md shadow-red-600/30 scale-110'
                :          'bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-gray-500'}
              `}>
                {done ? <FiCheck size={14} strokeWidth={3} /> : <Icon size={14} />}
              </div>
              <span className={`text-[9px] sm:text-[10px] font-semibold text-center leading-tight hidden xs:block
                ${active ? 'text-red-600' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 sm:mx-2 mb-4 transition-all duration-500
                ${current > step.id ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-slate-600'}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Field ─────────────────────────────────────────────────────
function Field({ label, required, error, children, hint, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
          {label}
          {required && <span className="text-red-500 text-sm leading-none">*</span>}
        </label>
      )}
      {children}
      {hint  && <p className="text-[11px] text-gray-400 leading-relaxed">{hint}</p>}
      {error && (
        <p className="text-[11px] text-red-500 flex items-center gap-1">
          <FiAlertCircle size={10} /> {error}
        </p>
      )}
    </div>
  )
}

const inputCls = `
  w-full border rounded-xl px-3.5 py-3 text-[14px] transition-all duration-200
  focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500
  bg-white dark:bg-slate-800/80 dark:text-gray-100
  border-gray-200 dark:border-slate-600 text-gray-800
  placeholder:text-gray-300 dark:placeholder:text-gray-600
`

// ── STEP 1: Personal ──────────────────────────────────────────
function Step1({ register, errors, emailVerified }) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={FiUser} title="ব্যক্তিগত তথ্য" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="পূর্ণ নাম (বাংলায়)" required error={errors.name_bn?.message}>
          <input {...register('name_bn', { required: 'বাংলায় নাম দিন' })}
            className={inputCls} placeholder="মোঃ রাকিবুল ইসলাম" />
        </Field>
        <Field label="পূর্ণ নাম (ইংরেজিতে)" required error={errors.name_en?.message}>
          <input {...register('name_en', { required: 'ইংরেজিতে নাম দিন' })}
            className={inputCls} placeholder="Md. Rakibul Islam" />
        </Field>
        <Field label="পিতার নাম" required error={errors.father_name?.message}>
          <input {...register('father_name', { required: 'পিতার নাম দিন' })}
            className={inputCls} placeholder="পিতার পূর্ণ নাম" />
        </Field>
        <Field label="মাতার নাম" required error={errors.mother_name?.message}>
          <input {...register('mother_name', { required: 'মাতার নাম দিন' })}
            className={inputCls} placeholder="মাতার পূর্ণ নাম" />
        </Field>
        <Field label="জন্ম তারিখ" required error={errors.dob?.message}>
          <input type="date"
            {...register('dob', { required: 'জন্ম তারিখ দিন' })}
            className={inputCls} />
        </Field>
        <Field label="লিঙ্গ" required error={errors.gender?.message}>
          <select {...register('gender', { required: 'লিঙ্গ বেছে নিন' })} className={inputCls}>
            <option value="">— বেছে নিন —</option>
            <option value="male">পুরুষ</option>
            <option value="female">মহিলা</option>
            <option value="other">অন্যান্য</option>
          </select>
        </Field>
        <Field label="বৈবাহিক অবস্থা" required error={errors.marital_status?.message}>
          <select {...register('marital_status', { required: 'বৈবাহিক অবস্থা দিন' })} className={inputCls}>
            <option value="">— বেছে নিন —</option>
            <option value="single">অবিবাহিত</option>
            <option value="married">বিবাহিত</option>
          </select>
        </Field>
        <Field label="NID নম্বর" required error={errors.nid?.message}>
          <input {...register('nid', {
            required: 'NID নম্বর দিন',
            minLength: { value: 10, message: 'সঠিক NID নম্বর দিন' }
          })} className={inputCls} placeholder="জাতীয় পরিচয়পত্র নম্বর" />
        </Field>
        <Field label="মোবাইল নম্বর" required error={errors.phone?.message}>
          <input {...register('phone', {
            required: 'মোবাইল নম্বর দিন',
            pattern: { value: /^01[3-9]\d{8}$/, message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন' }
          })} className={inputCls} placeholder="01XXXXXXXXX" />
        </Field>

        {/* Email with OTP badge */}
        <Field
          label="ইমেইল ঠিকানা" required
          error={errors.email?.message}
          hint={emailVerified ? null : 'আবেদন জমার আগে OTP দিয়ে যাচাই করতে হবে'}
        >
          <div className="relative">
            <input type="email"
              {...register('email', {
                required: 'ইমেইল ঠিকানা দিন',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'সঠিক ইমেইল দিন' },
              })}
              className={inputCls + (emailVerified ? ' pr-10 border-emerald-400 bg-emerald-50/50' : '')}
              placeholder="example@gmail.com"
              readOnly={emailVerified}
            />
            {emailVerified && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600">
                <FiCheck size={16} strokeWidth={3} />
              </span>
            )}
          </div>
          {emailVerified && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold">
              <FiShield size={11} /> ইমেইল যাচাই সম্পন্ন
            </div>
          )}
        </Field>
      </div>
    </div>
  )
}

// ── STEP 2: Address ───────────────────────────────────────────
function Step2({ register, errors }) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={FiMapPin} title="ঠিকানা" />
      <Field label="স্থায়ী ঠিকানা" required error={errors.permanent_address?.message}>
        <textarea rows={3}
          {...register('permanent_address', { required: 'স্থায়ী ঠিকানা দিন' })}
          className={inputCls + ' resize-none'}
          placeholder="গ্রাম/মহল্লা, পোস্ট অফিস, উপজেলা" />
      </Field>
      <Field label="বর্তমান ঠিকানা" required error={errors.current_address?.message}>
        <textarea rows={3}
          {...register('current_address', { required: 'বর্তমান ঠিকানা দিন' })}
          className={inputCls + ' resize-none'}
          placeholder="গ্রাম/মহল্লা, পোস্ট অফিস, উপজেলা" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="জেলা" required error={errors.district?.message}>
          <input {...register('district', { required: 'জেলা দিন' })}
            className={inputCls} placeholder="যেমন: বরিশাল" />
        </Field>
        <Field label="থানা / উপজেলা" required error={errors.thana?.message}>
          <input {...register('thana', { required: 'থানা/উপজেলা দিন' })}
            className={inputCls} placeholder="যেমন: বরিশাল সদর" />
        </Field>
      </div>
      <InfoBox icon="📍" color="amber">
        কর্মএলাকা: বরিশাল সদর ও আশেপাশের জেলায় কাজ করতে আগ্রহী প্রার্থীরা অগ্রাধিকার পাবেন।
      </InfoBox>
    </div>
  )
}

// ── STEP 3: Education ─────────────────────────────────────────
function Step3({ register }) {
  const levels = [
    { key: 'ssc',       label: 'এসএসসি / সমমান' },
    { key: 'hsc',       label: 'এইচএসসি / সমমান' },
    { key: 'degree',    label: 'স্নাতক / সমমান' },
    { key: 'other_edu', label: 'অন্যান্য' },
  ]
  return (
    <div className="space-y-4">
      <SectionTitle icon={FiBook} title="শিক্ষাগত যোগ্যতা" />
      <p className="text-[13px] text-gray-500">প্রযোজ্য তথ্য পূরণ করুন। সর্বোচ্চ ডিগ্রি অবশ্যই দিন।</p>

      {/* Mobile: Card layout */}
      <div className="sm:hidden space-y-3">
        {levels.map(lv => (
          <div key={lv.key} className="border border-gray-200 dark:border-slate-600 rounded-xl p-4 bg-gray-50/50 dark:bg-slate-800/50 space-y-3">
            <p className="text-[12px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{lv.label}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="বোর্ড / বিশ্ববিদ্যালয়" className="col-span-2">
                <input {...register(`edu_${lv.key}_board`)} className={inputCls} placeholder="বোর্ড / বিশ্ববিদ্যালয়" />
              </Field>
              <Field label="পাসের বছর">
                <input {...register(`edu_${lv.key}_year`)} className={inputCls} placeholder="২০২০" maxLength={4} />
              </Field>
              <Field label="জিপিএ / বিভাগ">
                <input {...register(`edu_${lv.key}_gpa`)} className={inputCls} placeholder="৩.৫০ / A+" />
              </Field>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-600">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide w-40">পরীক্ষা</th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">বোর্ড / বিশ্ববিদ্যালয়</th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide w-28">পাসের বছর</th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide w-28">জিপিএ / বিভাগ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {levels.map(lv => (
              <tr key={lv.key} className="bg-white dark:bg-slate-800 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-3 text-[13px] font-semibold text-gray-700 dark:text-gray-300">{lv.label}</td>
                <td className="px-3 py-2.5">
                  <input {...register(`edu_${lv.key}_board`)} className={inputCls} placeholder="বোর্ড / বিশ্ববিদ্যালয়" />
                </td>
                <td className="px-3 py-2.5">
                  <input {...register(`edu_${lv.key}_year`)} className={inputCls} placeholder="২০২০" maxLength={4} />
                </td>
                <td className="px-3 py-2.5">
                  <input {...register(`edu_${lv.key}_gpa`)} className={inputCls} placeholder="৩.৫০ / A+" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── STEP 4: Experience ────────────────────────────────────────
function Step4({ register }) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={FiBriefcase} title="কাজের অভিজ্ঞতা" />
      <p className="text-[13px] text-gray-500">পূর্বে কাজের অভিজ্ঞতা থাকলে পূরণ করুন। না থাকলে ফাঁকা রাখুন।</p>
      {[0, 1, 2].map(i => (
        <div key={i} className="border border-gray-200 dark:border-slate-600 rounded-xl overflow-hidden">
          <div className="bg-gray-50 dark:bg-slate-700/50 px-4 py-2.5 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
            <p className="text-[12px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">অভিজ্ঞতা #{i + 1}</p>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="প্রতিষ্ঠানের নাম">
              <input {...register(`exp_${i}_company`)} className={inputCls} placeholder="প্রতিষ্ঠানের নাম" />
            </Field>
            <Field label="পদবী">
              <input {...register(`exp_${i}_position`)} className={inputCls} placeholder="পদবী / পদের নাম" />
            </Field>
            <Field label="সময়কাল">
              <input {...register(`exp_${i}_duration`)} className={inputCls} placeholder="যেমন: ২০২২ – ২০২৩" />
            </Field>
            <Field label="দায়িত্বের বিবরণ">
              <input {...register(`exp_${i}_duties`)} className={inputCls} placeholder="সংক্ষেপে দায়িত্ব" />
            </Field>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <Field label="মোট অভিজ্ঞতা (বছর)">
          <input type="number" min={0} {...register('total_exp_years')} className={inputCls} placeholder="০" />
        </Field>
        <Field label="মোট অভিজ্ঞতা (মাস)">
          <input type="number" min={0} max={11} {...register('total_exp_months')} className={inputCls} placeholder="০" />
        </Field>
      </div>
    </div>
  )
}

// ── STEP 5: Skills & Reference ────────────────────────────────
function Step5({ register, errors }) {
  const skills = [
    { key: 'skill_bangla',     label: 'বাংলায় যোগাযোগ' },
    { key: 'skill_english',    label: 'ইংরেজিতে যোগাযোগ' },
    { key: 'skill_smartphone', label: 'স্মার্টফোন ব্যবহার' },
    { key: 'skill_computer',   label: 'কম্পিউটার (MS Office)' },
  ]
  const levels = ['নিম্ন', 'মাঝারি', 'উচ্চ']

  return (
    <div className="space-y-6">
      <SectionTitle icon={FiStar} title="দক্ষতা ও রেফারেন্স" />

      {/* Skills — Mobile cards */}
      <div>
        <p className="text-[13px] font-bold text-gray-700 dark:text-gray-300 mb-3">দক্ষতার মাত্রা</p>
        <div className="sm:hidden space-y-3">
          {skills.map(sk => (
            <div key={sk.key} className="border border-gray-200 dark:border-slate-600 rounded-xl p-4 bg-gray-50/50 dark:bg-slate-800/50">
              <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-3">{sk.label}</p>
              <div className="flex gap-4">
                {levels.map(l => (
                  <label key={l} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={l} {...register(sk.key)} className="w-4 h-4 accent-red-600" />
                    <span className="text-[13px] text-gray-600 dark:text-gray-400">{l}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Skills — Desktop table */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-600">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide">দক্ষতার ধরন</th>
                {levels.map(l => (
                  <th key={l} className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wide">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {skills.map(sk => (
                <tr key={sk.key} className="bg-white dark:bg-slate-800 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3.5 text-[13px] font-medium text-gray-700 dark:text-gray-300">{sk.label}</td>
                  {levels.map(l => (
                    <td key={l} className="px-4 py-3.5 text-center">
                      <input type="radio" value={l} {...register(sk.key)} className="w-4 h-4 accent-red-600" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bike */}
        <div className="mt-3 flex items-center gap-6 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600">
          <label className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">নিজস্ব মোটরসাইকেল আছে?</label>
          <div className="flex gap-5">
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="radio" value="yes" {...register('has_bike')} className="w-4 h-4 accent-red-600" /> হ্যাঁ
            </label>
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="radio" value="no" {...register('has_bike')} className="w-4 h-4 accent-red-600" /> না
            </label>
          </div>
        </div>
      </div>

      {/* Emergency */}
      <div>
        <p className="text-[13px] font-bold text-gray-700 dark:text-gray-300 mb-3">জরুরি যোগাযোগ</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="নাম" required error={errors.emergency_name?.message}>
            <input {...register('emergency_name', { required: 'জরুরি যোগাযোগের নাম দিন' })} className={inputCls} placeholder="নাম" />
          </Field>
          <Field label="সম্পর্ক" required error={errors.emergency_relation?.message}>
            <input {...register('emergency_relation', { required: 'সম্পর্ক লিখুন' })} className={inputCls} placeholder="যেমন: বাবা, ভাই" />
          </Field>
          <Field label="মোবাইল" required error={errors.emergency_phone?.message}>
            <input {...register('emergency_phone', { required: 'জরুরি মোবাইল নম্বর দিন' })} className={inputCls} placeholder="01XXXXXXXXX" />
          </Field>
          <Field label="ঠিকানা">
            <input {...register('emergency_address')} className={inputCls} placeholder="ঠিকানা" />
          </Field>
        </div>
      </div>

      {/* References */}
      {[1, 2].map(n => (
        <div key={n}>
          <p className="text-[13px] font-bold text-gray-700 dark:text-gray-300 mb-3">রেফারেন্স — {n}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="নাম"><input {...register(`ref${n}_name`)} className={inputCls} placeholder="নাম" /></Field>
            <Field label="পেশা"><input {...register(`ref${n}_profession`)} className={inputCls} placeholder="পেশা" /></Field>
            <Field label="মোবাইল"><input {...register(`ref${n}_phone`)} className={inputCls} placeholder="01XXXXXXXXX" /></Field>
            <Field label="ঠিকানা"><input {...register(`ref${n}_address`)} className={inputCls} placeholder="ঠিকানা" /></Field>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── STEP 6: Photo & Declaration ───────────────────────────────
function Step6({ register, errors, photoPreview, setPhotoPreview }) {
  const { onChange: rhfOnChange, ...photoRest } = register('photo', { required: 'ছবি আপলোড করা আবশ্যক' })

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) { toast.error('ছবির সাইজ ২ MB এর বেশি হবে না।'); return }
      setPhotoPreview(URL.createObjectURL(file))
    }
    rhfOnChange(e)
  }

  return (
    <div className="space-y-6">
      <SectionTitle icon={FiUpload} title="ছবি ও চূড়ান্ত ঘোষণা" />

      {/* Photo */}
      <div className="flex flex-col sm:flex-row items-start gap-5">
        <div className={`
          w-28 h-32 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden flex-shrink-0
          ${photoPreview ? 'border-emerald-400' : 'border-gray-300 dark:border-slate-600'}
        `}>
          {photoPreview
            ? <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
            : <div className="text-center text-gray-300 dark:text-gray-600 p-2">
                <FiUpload className="mx-auto mb-1.5" size={22} />
                <p className="text-[11px]">ছবি নেই</p>
              </div>
          }
        </div>
        <div className="flex-1 space-y-3">
          <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">
            পাসপোর্ট সাইজ ছবি <span className="text-red-500">*</span>
          </p>
          <label className={`
            flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 cursor-pointer text-[13px] font-semibold
            transition-all active:scale-[0.98]
            ${photoPreview
              ? 'border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
              : 'border-dashed border-gray-300 dark:border-slate-600 text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50/30'}
          `}>
            <FiUpload size={16} />
            {photoPreview ? 'ছবি পরিবর্তন করুন' : 'ছবি আপলোড করুন'}
            <input type="file" accept="image/*" {...photoRest} onChange={handlePhoto} className="hidden" />
          </label>
          <p className="text-[11px] text-gray-400">JPG / PNG • সর্বোচ্চ ২ MB • সাদা ব্যাকগ্রাউন্ড সহ পাসপোর্ট সাইজ</p>
          {errors.photo && (
            <p className="text-[11px] text-red-500 flex items-center gap-1">
              <FiAlertCircle size={10} /> {errors.photo.message}
            </p>
          )}
        </div>
      </div>

      {/* Terms — FIXED: বেতন আলোচনা সাপেক্ষে, গ্রেস পিরিয়ড ৭ কর্মদিবস */}
      <div className="rounded-2xl border border-gray-200 dark:border-slate-600 overflow-hidden">
        <div className="bg-gray-50 dark:bg-slate-700/50 px-4 py-3 flex items-center gap-2 border-b border-gray-200 dark:border-slate-600">
          <FiAward className="text-red-600" size={15} />
          <p className="text-[12px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">চাকরির শর্তাবলী সারসংক্ষেপ</p>
        </div>
        <div className="p-4 space-y-2.5">
          {[
            { icon: '📅', text: 'প্রথম ৭ কর্মদিবস প্রশিক্ষণ পর্যায় — দৈনিক কমিশন ও TA/DA প্রযোজ্য' },
            { icon: '💼', text: 'গ্রেস পিরিয়ড শেষে স্থায়ী নিয়োগ — বেতন আলোচনা সাপেক্ষে নির্ধারিত হবে' },
            { icon: '📈', text: 'দৈনিক বিক্রয়ের উপর আকর্ষণীয় কমিশন সুবিধা' },
            { icon: '🏆', text: 'পারফরম্যান্স অনুযায়ী পদোন্নতি ও বোনাসের সুযোগ' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
              <p className="text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Declaration */}
      <div>
        <p className="text-[13px] font-bold text-gray-700 dark:text-gray-300 mb-3">ঘোষণাপত্র</p>
        <label className={`
          flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
          ${errors.declaration
            ? 'border-red-400 bg-red-50 dark:bg-red-900/10'
            : 'border-gray-200 dark:border-slate-600 hover:border-red-300 hover:bg-red-50/20'}
        `}>
          <input
            type="checkbox"
            {...register('declaration', { required: 'ঘোষণাপত্রে সম্মতি দিন' })}
            className="mt-0.5 w-4 h-4 rounded accent-red-600 flex-shrink-0"
          />
          <p className="text-[12.5px] text-gray-600 dark:text-gray-400 leading-relaxed">
            আমি ঘোষণা করছি যে এই ফর্মে প্রদত্ত সকল তথ্য সঠিক ও পূর্ণাঙ্গ। কোম্পানির সকল নিয়ম ও নীতিমালা
            মেনে চলতে এবং প্রয়োজনে যেকোনো কর্মএলাকায় দায়িত্ব পালন করতে সম্মত। কোনো তথ্য মিথ্যা
            প্রমাণিত হলে নিয়োগ তাৎক্ষণিকভাবে বাতিলযোগ্য।
          </p>
        </label>
        {errors.declaration && (
          <p className="text-[11px] text-red-500 flex items-center gap-1 mt-1.5">
            <FiAlertCircle size={10} /> {errors.declaration.message}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Helper Components ─────────────────────────────────────────
function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100 dark:border-slate-700 mb-1">
      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
        <Icon className="text-red-600 dark:text-red-400" size={15} />
      </div>
      <h2 className="text-[15px] font-bold text-gray-800 dark:text-white">{title}</h2>
    </div>
  )
}

function InfoBox({ icon, color = 'amber', children }) {
  const colors = {
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-400',
    blue:  'bg-blue-50  dark:bg-blue-900/20  border-blue-200  dark:border-blue-900/30  text-blue-700  dark:text-blue-400',
    red:   'bg-red-50   dark:bg-red-900/20   border-red-200   dark:border-red-900/30   text-red-700   dark:text-red-400',
  }
  return (
    <div className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-[12.5px] leading-relaxed ${colors[color]}`}>
      <span className="flex-shrink-0 text-base">{icon}</span>
      <p>{children}</p>
    </div>
  )
}

// ── SUCCESS SCREEN ────────────────────────────────────────────
function SuccessScreen({ appId }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="relative inline-flex">
          <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
            <FiCheck className="text-emerald-500" size={44} strokeWidth={2.5} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
            <FiShield className="text-white" size={14} />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">আবেদন সফলভাবে জমা হয়েছে!</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">
            আপনার আবেদন আমাদের নিয়োগ টিম পর্যালোচনা করবে। শীঘ্রই আপনার সাথে যোগাযোগ করা হবে।
          </p>
        </div>
        {appId && (
          <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-600 shadow-sm">
            <p className="text-[11px] text-gray-400 mb-1.5 uppercase tracking-wide font-semibold">আবেদন নম্বর</p>
            <p className="text-2xl font-bold text-red-600 font-mono tracking-wider">{appId}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">এই নম্বরটি সংরক্ষণ করুন</p>
          </div>
        )}
        <InfoBox icon="📞" color="amber">
          যোগাযোগ: <strong>01836-191102</strong> — WhatsApp / কল
        </InfoBox>
        <a href="/login" className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-red-600 transition-colors">
          <FiChevronLeft size={14} /> লগইন পেজে ফিরুন
        </a>
      </div>
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────
export default function SRApplicationForm() {
  const [step,         setStep]         = useState(1)
  const [loading,      setLoading]      = useState(false)
  const [submitted,    setSubmitted]    = useState(false)
  const [appId,        setAppId]        = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [showOTP,      setShowOTP]      = useState(false)
  const [emailVerified,setEmailVerified]= useState(false)
  const [pendingSubmit,setPendingSubmit]= useState(null)

  const { register, handleSubmit, trigger, getValues, formState: { errors } } = useForm({ mode: 'onBlur' })

  const stepFields = {
    1: ['name_bn', 'name_en', 'father_name', 'mother_name', 'dob', 'gender', 'marital_status', 'nid', 'phone', 'email'],
    2: ['permanent_address', 'current_address', 'district', 'thana'],
    3: [],
    4: [],
    5: ['emergency_name', 'emergency_relation', 'emergency_phone'],
    6: ['photo', 'declaration'],
  }

  const nextStep = async () => {
    const valid = await trigger(stepFields[step])
    if (valid) setStep(s => Math.min(s + 1, 6))
  }
  const prevStep = () => setStep(s => Math.max(s - 1, 1))

  const onSubmit = async (data) => {
    if (localStorage.getItem('sr_applied')) {
      toast.error('এই ডিভাইস থেকে আগেই আবেদন করা হয়েছে।')
      return
    }
    if (!emailVerified) {
      if (!data.email) { toast.error('ইমেইল ঠিকানা দিন।'); setStep(1); return }
      setPendingSubmit(data)
      setShowOTP(true)
      return
    }
    await doSubmit(data)
  }

  const handleOTPVerified = async () => {
    setEmailVerified(true)
    setShowOTP(false)
    if (pendingSubmit) await doSubmit(pendingSubmit)
  }

  const doSubmit = async (data) => {
    setLoading(true)
    try {
      const deviceId = btoa([
        navigator.userAgent, navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
      ].join('|')).slice(0, 32)

      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (k === 'photo') { if (v[0]) fd.append('photo', v[0]) }
        else fd.append(k, v ?? '')
      })
      fd.append('device_id', deviceId)

      const res = await axios.post(`${API_BASE}/api/recruitment/apply`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      localStorage.setItem('sr_applied', res.data?.data?.application_id)
      setAppId(res.data?.data?.application_id)
      setSubmitted(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'আবেদন জমা দিতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) return <SuccessScreen appId={appId} />

  // ── OTP Screen ──
  if (showOTP) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center px-4 py-10">
        <style>{`
          @keyframes fade-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
          .animate-fade-in { animation: fade-in 0.4s ease forwards; }
          @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
          .animate-shake { animation: shake 0.4s ease; }
        `}</style>
        <div className="fixed top-0 left-0 right-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 z-10">
          <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">NT</span>
            </div>
            <div>
              <h1 className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">NovaTech BD</h1>
              <p className="text-[11px] text-gray-500">ইমেইল যাচাই</p>
            </div>
            <div className="ml-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-[11px] font-bold">
                <FiShield size={11} /> নিরাপত্তা যাচাই
              </span>
            </div>
          </div>
        </div>
        <div className="w-full max-w-md mt-20">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <SREmailOTPVerify
              email={pendingSubmit?.email || getValues('email')}
              name={getValues('name_bn') || getValues('name_en') || ''}
              onVerified={handleOTPVerified}
              onBack={() => { setShowOTP(false); setPendingSubmit(null) }}
            />
          </div>
          <p className="text-center text-[12px] text-gray-400 mt-4">
            সমস্যা হলে যোগাযোগ করুন: <strong>01836-191102</strong>
          </p>
        </div>
      </div>
    )
  }

  // ── Main Form ──
  return (
    <div className="min-h-screen bg-gray-50 dark:from-slate-900 dark:to-slate-800">
      <style>{`
        @keyframes fade-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease forwards; }
      `}</style>

      {/* Sticky Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">NT</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight truncate">NovaTech BD</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">SR নিয়োগ আবেদন ফর্ম</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-[11px] font-bold flex-shrink-0">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            নিয়োগ চলছে
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 pb-10">

        {/* Job Info Banner */}
        <div className="mb-5 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 p-4 text-white shadow-lg shadow-red-600/20">
          <p className="text-[11px] text-red-200 font-semibold uppercase tracking-wider mb-2">পদের বিবরণ</p>
          <p className="text-[17px] font-bold mb-3">Sales Representative (SR)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white/10 rounded-xl p-2.5">
              <p className="text-red-200 text-[10px] mb-0.5">কোম্পানি</p>
              <p className="font-bold text-[13px]">NovaTech BD</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5">
              <p className="text-red-200 text-[10px] mb-0.5">কর্মএলাকা</p>
              <p className="font-bold text-[13px]">বরিশাল</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 col-span-2 sm:col-span-1">
              <p className="text-red-200 text-[10px] mb-0.5">বেতন</p>
              <p className="font-bold text-[13px]">আলোচনা সাপেক্ষে</p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 sm:p-6">
          <StepIndicator current={step} />

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="min-h-[380px] animate-fade-in" key={step}>
              {step === 1 && <Step1 register={register} errors={errors} emailVerified={emailVerified} />}
              {step === 2 && <Step2 register={register} errors={errors} />}
              {step === 3 && <Step3 register={register} errors={errors} />}
              {step === 4 && <Step4 register={register} errors={errors} />}
              {step === 5 && <Step5 register={register} errors={errors} />}
              {step === 6 && <Step6 register={register} errors={errors} photoPreview={photoPreview} setPhotoPreview={setPhotoPreview} />}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-gray-100 dark:border-slate-700 gap-3">
              <button
                type="button" onClick={prevStep} disabled={step === 1}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all
                  disabled:opacity-30 disabled:cursor-not-allowed
                  text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600"
              >
                <FiChevronLeft size={15} /> পিছনে
              </button>

              {/* Dot progress */}
              <div className="flex items-center gap-1.5">
                {STEPS.map(s => (
                  <div key={s.id} className={`rounded-full transition-all duration-300
                    ${s.id === step   ? 'w-5 h-2 bg-red-600'
                    : s.id < step     ? 'w-2 h-2 bg-emerald-400'
                    :                   'w-2 h-2 bg-gray-200 dark:bg-slate-600'}`}
                  />
                ))}
              </div>

              {step < 6 ? (
                <button
                  type="button" onClick={nextStep}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95
                    text-white rounded-xl text-[13px] font-bold transition-all shadow-sm shadow-red-600/30"
                >
                  পরবর্তী <FiChevronRight size={15} />
                </button>
              ) : (
                <button
                  type="submit" disabled={loading}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95
                    disabled:opacity-60 text-white rounded-xl text-[13px] font-bold transition-all shadow-sm shadow-red-600/30"
                >
                  {loading
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : emailVerified ? <FiCheck size={15} strokeWidth={3} /> : <FiShield size={15} />
                  }
                  {loading ? 'জমা হচ্ছে...' : emailVerified ? 'আবেদন জমা দিন' : 'যাচাই ও জমা দিন'}
                </button>
              )}
            </div>
          </form>
        </div>

        <p className="text-center text-[12px] text-gray-400 mt-5">
          সমস্যা হলে যোগাযোগ করুন: <strong className="text-gray-600 dark:text-gray-300">01836-191102</strong>
        </p>
      </div>
    </div>
  )
}
