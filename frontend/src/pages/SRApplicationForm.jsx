import { useState } from 'react'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import { FiUser, FiPhone, FiMail, FiMapPin, FiBook, FiBriefcase, FiUpload, FiCheck, FiChevronRight, FiChevronLeft, FiAlertCircle, FiShield } from 'react-icons/fi'
import SREmailOTPVerify from '../components/SREmailOTPVerify'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '')

// ── NT Logo ──────────────────────────────────────────────────
function NTLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#111"/>
      <ellipse cx="50" cy="50" rx="44" ry="20" stroke="#ef4444" strokeWidth="2.5" fill="none" strokeDasharray="4 3" opacity="0.8"
        style={{ transformOrigin: '50px 50px', animation: 'spin 8s linear infinite' }} />
      <text x="50" y="62" textAnchor="middle" fontFamily="Georgia, serif" fontSize="36" fontWeight="bold" fill="white" letterSpacing="-1">NT</text>
    </svg>
  )
}

// ── Step Indicator ────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'ব্যক্তিগত তথ্য', icon: FiUser },
  { id: 2, label: 'ঠিকানা',         icon: FiMapPin },
  { id: 3, label: 'শিক্ষা',         icon: FiBook },
  { id: 4, label: 'অভিজ্ঞতা',       icon: FiBriefcase },
  { id: 5, label: 'দক্ষতা ও রেফারেন্স', icon: FiCheck },
  { id: 6, label: 'ছবি ও ঘোষণা',   icon: FiUpload },
]

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
      {STEPS.map((step, i) => {
        const Icon = step.icon
        const done = current > step.id
        const active = current === step.id
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1 min-w-[60px]">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                ${done   ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                         : active ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 scale-110'
                         : 'bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-gray-500'}`}>
                {done ? <FiCheck size={16} /> : <Icon size={16} />}
              </div>
              <span className={`text-[10px] font-medium text-center leading-tight
                ${active ? 'text-red-600 dark:text-red-400' : done ? 'text-green-600' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 sm:w-10 mx-1 mt-[-20px] transition-all duration-500
                ${current > step.id ? 'bg-green-400' : 'bg-gray-200 dark:bg-slate-600'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Field Components ──────────────────────────────────────────
function Field({ label, required, error, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint  && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><FiAlertCircle size={11}/> {error}</p>}
    </div>
  )
}

const inputCls = 'w-full border rounded-xl px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-white dark:bg-slate-800 dark:text-gray-100 border-gray-200 dark:border-slate-600 text-gray-800'

// ── STEP 1: Personal Info ─────────────────────────────────────
function Step1({ register, errors, watch, emailVerified }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="পূর্ণ নাম (বাংলায়)" required error={errors.name_bn?.message}>
        <input {...register('name_bn', { required: 'বাংলায় নাম দিন' })} className={inputCls} placeholder="যেমন: মোঃ রাকিবুল ইসলাম" />
      </Field>
      <Field label="পূর্ণ নাম (ইংরেজিতে)" required error={errors.name_en?.message}>
        <input {...register('name_en', { required: 'ইংরেজিতে নাম দিন' })} className={inputCls} placeholder="Md. Rakibul Islam" />
      </Field>
      <Field label="পিতার নাম" required error={errors.father_name?.message}>
        <input {...register('father_name', { required: 'পিতার নাম দিন' })} className={inputCls} placeholder="পিতার পূর্ণ নাম" />
      </Field>
      <Field label="মাতার নাম" required error={errors.mother_name?.message}>
        <input {...register('mother_name', { required: 'মাতার নাম দিন' })} className={inputCls} placeholder="মাতার পূর্ণ নাম" />
      </Field>
      <Field label="জন্ম তারিখ" required error={errors.dob?.message}>
        <input type="date" {...register('dob', { required: 'জন্ম তারিখ দিন' })} className={inputCls} />
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
        <input {...register('nid', { required: 'NID নম্বর দিন', minLength: { value: 10, message: 'সঠিক NID নম্বর দিন' } })} className={inputCls} placeholder="জাতীয় পরিচয়পত্র নম্বর" />
      </Field>
      <Field label="মোবাইল নম্বর" required error={errors.phone?.message}>
        <input {...register('phone', { required: 'মোবাইল নম্বর দিন', pattern: { value: /^01[3-9]\d{8}$/, message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন' } })} className={inputCls} placeholder="01XXXXXXXXX" />
      </Field>

      {/* ── Email — বাধ্যতামূলক + OTP যাচাই ── */}
      <Field
        label="ইমেইল ঠিকানা"
        required
        error={errors.email?.message}
        hint={emailVerified ? null : "আবেদন জমার আগে ইমেইল OTP দিয়ে যাচাই করতে হবে"}
      >
        <div className="relative">
          <input
            type="email"
            {...register('email', {
              required: 'ইমেইল ঠিকানা দিন',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'সঠিক ইমেইল দিন' },
            })}
            className={inputCls + (emailVerified ? ' pr-10 border-green-400 bg-green-50' : '')}
            placeholder="example@gmail.com"
            readOnly={emailVerified}
          />
          {emailVerified && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600">
              <FiCheck size={16} strokeWidth={3} />
            </span>
          )}
        </div>
        {emailVerified && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-green-600 font-semibold">
            <FiShield size={11} />
            ইমেইল যাচাই সম্পন্ন
          </div>
        )}
      </Field>
    </div>
  )
}

// ── STEP 2: Address ───────────────────────────────────────────
function Step2({ register, errors }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="স্থায়ী ঠিকানা" required error={errors.permanent_address?.message} className="sm:col-span-2">
        <textarea rows={3} {...register('permanent_address', { required: 'স্থায়ী ঠিকানা দিন' })} className={inputCls + ' resize-none'} placeholder="গ্রাম/মহল্লা, পোস্ট অফিস, উপজেলা" />
      </Field>
      <Field label="বর্তমান ঠিকানা" required error={errors.current_address?.message} className="sm:col-span-2">
        <textarea rows={3} {...register('current_address', { required: 'বর্তমান ঠিকানা দিন' })} className={inputCls + ' resize-none'} placeholder="গ্রাম/মহল্লা, পোস্ট অফিস, উপজেলা" />
      </Field>
      <Field label="জেলা" required error={errors.district?.message}>
        <input {...register('district', { required: 'জেলা দিন' })} className={inputCls} placeholder="যেমন: বরিশাল" />
      </Field>
      <Field label="থানা / উপজেলা" required error={errors.thana?.message}>
        <input {...register('thana', { required: 'থানা/উপজেলা দিন' })} className={inputCls} placeholder="যেমন: বরিশাল সদর" />
      </Field>
      <div className="sm:col-span-2 mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30 flex items-start gap-2">
        <FiAlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={15}/>
        <p className="text-xs text-red-600 dark:text-red-400">কর্মএলাকা: বরিশাল সদর ও আশেপাশের জেলায় কাজ করতে আগ্রহী প্রার্থীরা অগ্রাধিকার পাবেন।</p>
      </div>
    </div>
  )
}

// ── STEP 3: Education ─────────────────────────────────────────
function Step3({ register, errors }) {
  const levels = [
    { key: 'ssc', label: 'এসএসসি / সমমান' },
    { key: 'hsc', label: 'এইচএসসি / সমমান' },
    { key: 'degree', label: 'স্নাতক / সমমান' },
    { key: 'other_edu', label: 'অন্যান্য' },
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">প্রযোজ্য শিক্ষাগত তথ্য পূরণ করুন। সর্বোচ্চ ডিগ্রি অবশ্যই দিন।</p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-600">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-700/50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-36">পরীক্ষার নাম</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">বোর্ড / বিশ্ববিদ্যালয়</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-24">পাসের বছর</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-28">জিপিএ / বিভাগ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {levels.map(lv => (
              <tr key={lv.key} className="bg-white dark:bg-slate-800">
                <td className="px-3 py-2.5 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{lv.label}</td>
                <td className="px-2 py-2">
                  <input {...register(`edu_${lv.key}_board`)} className={inputCls} placeholder="বোর্ড / বিশ্ববিদ্যালয়" />
                </td>
                <td className="px-2 py-2">
                  <input {...register(`edu_${lv.key}_year`)} className={inputCls} placeholder="২০২০" maxLength={4} />
                </td>
                <td className="px-2 py-2">
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
function Step4({ register, errors }) {
  const rows = [0, 1, 2]
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">পূর্বে কোনো কাজের অভিজ্ঞতা থাকলে পূরণ করুন। না থাকলে ফাঁকা রাখুন।</p>
      {rows.map(i => (
        <div key={i} className="p-4 border border-gray-200 dark:border-slate-600 rounded-xl space-y-3 bg-gray-50/50 dark:bg-slate-800/50">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">অভিজ্ঞতা #{i + 1}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
    { key: 'skill_bangla',    label: 'বাংলা ভাষায় যোগাযোগ' },
    { key: 'skill_english',   label: 'ইংরেজি ভাষায় যোগাযোগ' },
    { key: 'skill_smartphone',label: 'স্মার্টফোন ব্যবহার' },
    { key: 'skill_computer',  label: 'কম্পিউটার (এমএস অফিস)' },
  ]
  const levels = ['নিম্ন', 'মাঝারি', 'উচ্চ']
  return (
    <div className="space-y-6">
      {/* Skills */}
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">দক্ষতা</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-600">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">দক্ষতার ধরন</th>
                {levels.map(l => <th key={l} className="px-3 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400">{l}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {skills.map(sk => (
                <tr key={sk.key} className="bg-white dark:bg-slate-800">
                  <td className="px-3 py-3 text-xs text-gray-700 dark:text-gray-300">{sk.label}</td>
                  {levels.map(l => (
                    <td key={l} className="px-3 py-3 text-center">
                      <input type="radio" value={l} {...register(sk.key)} className="w-4 h-4 accent-red-600" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">মোটরসাইকেল আছে?</label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" value="yes" {...register('has_bike')} className="accent-red-600" /> হ্যাঁ
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" value="no" {...register('has_bike')} className="accent-red-600" /> না
          </label>
        </div>
      </div>

      {/* Emergency Contact */}
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">জরুরি যোগাযোগ</p>
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
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">রেফারেন্স – {n}</p>
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
  // register থেকে onChange আলাদা করে নিই, তারপর দুটো একসাথে call করবো
  const { onChange: rhfOnChange, ...photoRest } = register('photo', { required: 'ছবি আপলোড করা আবশ্যক' })

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) { toast.error('ছবির সাইজ ২ MB এর বেশি হবে না।'); return }
      setPhotoPreview(URL.createObjectURL(file))
    }
    // RHF-এর onChange অবশ্যই call করতে হবে, নাহলে form-এ file আসে না
    rhfOnChange(e)
  }
  return (
    <div className="space-y-6">
      {/* Photo Upload */}
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">পাসপোর্ট সাইজ ছবি <span className="text-red-500">*</span></p>
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className={`w-28 h-32 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden
            ${photoPreview ? 'border-green-400' : 'border-gray-300 dark:border-slate-600'}`}>
            {photoPreview
              ? <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
              : <div className="text-center text-gray-400">
                  <FiUpload className="mx-auto mb-1" size={20}/>
                  <p className="text-xs">ছবি নেই</p>
                </div>
            }
          </div>
          <div className="flex-1 space-y-2">
            <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer text-sm font-medium transition-all
              ${photoPreview ? 'border-green-400 text-green-600 bg-green-50' : 'border-gray-300 hover:border-red-400 hover:text-red-600 hover:bg-red-50 dark:border-slate-600 dark:text-gray-300'}`}>
              <FiUpload size={16}/> ছবি আপলোড করুন
              <input type="file" accept="image/*" {...photoRest} onChange={handlePhoto} className="hidden" />
            </label>
            <p className="text-xs text-gray-400">JPG / PNG • সর্বোচ্চ ২ MB • পাসপোর্ট সাইজ</p>
            {errors.photo && <p className="text-xs text-red-500 flex items-center gap-1"><FiAlertCircle size={11}/> {errors.photo.message}</p>}
          </div>
        </div>
      </div>

      {/* Terms */}
      <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-600 space-y-2">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">চাকরির শর্তাবলী সারসংক্ষেপ</p>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
          <li className="flex gap-2"><span className="text-red-500 font-bold flex-shrink-0">•</span> প্রথম ২২ কর্মদিবস ট্রেনিং পিরিয়ড (দৈনিক কমিশন + ৳৩০০ TA/DA)</li>
          <li className="flex gap-2"><span className="text-red-500 font-bold flex-shrink-0">•</span> ৩ মাস গ্রেস পিরিয়ড — মাসিক বেতন ৳৮,০০০ + কমিশন</li>
          <li className="flex gap-2"><span className="text-red-500 font-bold flex-shrink-0">•</span> দৈনিক বিক্রয়ের উপর ১% – ৪% কমিশন</li>
          <li className="flex gap-2"><span className="text-red-500 font-bold flex-shrink-0">•</span> পারফরম্যান্স অনুযায়ী স্থায়ী নিয়োগ</li>
        </ul>
      </div>

      {/* Declaration */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">ঘোষণাপত্র</p>
        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all
          ${errors.declaration ? 'border-red-400 bg-red-50 dark:bg-red-900/10' : 'border-gray-200 dark:border-slate-600 hover:border-red-400 hover:bg-red-50/30'}`}>
          <input type="checkbox" {...register('declaration', { required: 'ঘোষণাপত্রে সম্মতি দিন' })} className="mt-0.5 w-4 h-4 rounded accent-red-600 flex-shrink-0" />
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            আমি ঘোষণা করছি যে এই ফর্মে প্রদত্ত সকল তথ্য সঠিক ও পূর্ণাঙ্গ। কোম্পানির সকল নিয়ম ও নীতিমালা মেনে চলতে সম্মত।
            কোনো তথ্য মিথ্যা প্রমাণিত হলে নিয়োগ তাৎক্ষণিকভাবে বাতিলযোগ্য এবং আমি আইনত দায়ী থাকব।
          </p>
        </label>
        {errors.declaration && <p className="text-xs text-red-500 flex items-center gap-1"><FiAlertCircle size={11}/> {errors.declaration.message}</p>}
      </div>
    </div>
  )
}

// ── SUCCESS SCREEN ────────────────────────────────────────────
function SuccessScreen({ appId }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
          <FiCheck className="text-green-500" size={48} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">আবেদন সফলভাবে জমা হয়েছে!</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">আপনার আবেদন আমাদের টিম পর্যালোচনা করবে। শীঘ্রই যোগাযোগ করা হবে।</p>
        </div>
        {appId && (
          <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-600">
            <p className="text-xs text-gray-500 mb-1">আবেদন নম্বর</p>
            <p className="text-2xl font-bold text-red-600 font-mono">{appId}</p>
            <p className="text-xs text-gray-400 mt-1">এই নম্বরটি সংরক্ষণ করুন</p>
          </div>
        )}
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-900/30">
          <p className="text-xs text-yellow-800 dark:text-yellow-400">যোগাযোগের জন্য: <strong>01836-191102</strong> অথবা WhatsApp করুন</p>
        </div>
        <a href="/login" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors">
          <FiChevronLeft size={14}/> লগইন পেজে ফিরুন
        </a>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function SRApplicationForm() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [appId, setAppId] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  // ── Email OTP state ──
  const [showOTP,       setShowOTP]       = useState(false)   // OTP screen দেখাবে কিনা
  const [emailVerified, setEmailVerified] = useState(false)   // OTP সফলভাবে যাচাই হয়েছে কিনা
  const [pendingSubmit, setPendingSubmit] = useState(null)    // OTP পরে submit করার জন্য data hold

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

  // ── Submit: email যাচাই না হলে OTP screen দেখাও ──
  const onSubmit = async (data) => {
    const deviceKey = 'sr_applied'
    if (localStorage.getItem(deviceKey)) {
      toast.error('এই ডিভাইস থেকে আগেই আবেদন করা হয়েছে।')
      return
    }

    // Email যাচাই না হলে OTP screen দেখাও
    if (!emailVerified) {
      if (!data.email) {
        toast.error('ইমেইল ঠিকানা দিন এবং যাচাই করুন।')
        setStep(1)
        return
      }
      setPendingSubmit(data)
      setShowOTP(true)
      return
    }

    // Email যাচাই হয়ে গেলে সরাসরি submit করো
    await doSubmit(data)
  }

  // ── OTP verified callback ──
  const handleOTPVerified = async () => {
    setEmailVerified(true)
    setShowOTP(false)
    if (pendingSubmit) {
      await doSubmit(pendingSubmit)
    }
  }

  // ── Actual form submission ──
  const doSubmit = async (data) => {
    setLoading(true)
    try {
      const deviceId = btoa([
        navigator.userAgent,
        navigator.language,
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

  // ── OTP Verification Screen ──
  if (showOTP) {
    const currentEmail = pendingSubmit?.email || getValues('email')
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center px-4 py-10">
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.4s ease forwards; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
        .animate-shake { animation: shake 0.4s ease; }`}</style>

        {/* Header */}
        <div className="fixed top-0 left-0 right-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 z-10">
          <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
            <NTLogo size={32} />
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">NovaTEch BD</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">ইমেইল যাচাই</p>
            </div>
            <div className="ml-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full text-xs font-semibold">
                <FiShield size={11} />
                নিরাপত্তা যাচাই
              </span>
            </div>
          </div>
        </div>

        {/* OTP Card */}
        <div className="w-full max-w-md mt-16">
          {/* Progress indicator */}
          <div className="mb-4 flex items-center gap-2 px-1">
            <div className="flex-1 h-1.5 rounded-full bg-red-600" />
            <div className="flex-1 h-1.5 rounded-full bg-red-600" />
            <div className="flex-1 h-1.5 rounded-full bg-red-600" />
            <div className="flex-1 h-1.5 rounded-full bg-red-600" />
            <div className="flex-1 h-1.5 rounded-full bg-red-600" />
            <div className="flex-1 h-1.5 rounded-full bg-red-600" />
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <FiShield size={11} className="text-red-600" />
              ইমেইল যাচাই
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <SREmailOTPVerify
              email={currentEmail}
              onVerified={handleOTPVerified}
              onBack={() => { setShowOTP(false); setPendingSubmit(null) }}
            />
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            সমস্যা হলে যোগাযোগ করুন: <strong>01836-191102</strong>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800">
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.35s ease forwards; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-5px)} 40%,80%{transform:translateX(5px)} }
        .animate-shake { animation: shake 0.4s ease; }`}</style>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <NTLogo size={36} />
          <div>
            <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">NovaTEch BD</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">SR নিয়োগ আবেদন ফর্ম</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"/>
              নিয়োগ চলছে
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Job Summary Card */}
        <div className="mb-6 p-4 bg-gradient-to-r from-red-600 to-red-700 rounded-2xl text-white shadow-lg shadow-red-600/20">
          <div className="flex flex-wrap gap-4 text-sm">
            <div><p className="text-red-200 text-xs mb-0.5">পদ</p><p className="font-bold">Sales Representative (SR)</p></div>
            <div><p className="text-red-200 text-xs mb-0.5">কোম্পানি</p><p className="font-bold">NovaTEch BD</p></div>
            <div><p className="text-red-200 text-xs mb-0.5">কর্মএলাকা</p><p className="font-bold">বরিশাল</p></div>
            <div><p className="text-red-200 text-xs mb-0.5">বেতন</p><p className="font-bold">৳৮,০০০ + কমিশন</p></div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <StepIndicator current={step} />

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="min-h-[400px]">
              {step === 1 && <Step1 register={register} errors={errors} emailVerified={emailVerified} />}
              {step === 2 && <Step2 register={register} errors={errors} />}
              {step === 3 && <Step3 register={register} errors={errors} />}
              {step === 4 && <Step4 register={register} errors={errors} />}
              {step === 5 && <Step5 register={register} errors={errors} />}
              {step === 6 && <Step6 register={register} errors={errors} photoPreview={photoPreview} setPhotoPreview={setPhotoPreview} />}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-gray-100 dark:border-slate-700">
              <button type="button" onClick={prevStep} disabled={step === 1}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                  disabled:opacity-30 disabled:cursor-not-allowed
                  text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700">
                <FiChevronLeft size={16}/> পিছনে
              </button>

              <div className="flex items-center gap-1">
                {STEPS.map(s => (
                  <div key={s.id} className={`h-1.5 rounded-full transition-all duration-300
                    ${s.id === step ? 'w-6 bg-red-600' : s.id < step ? 'w-2 bg-green-400' : 'w-2 bg-gray-200 dark:bg-slate-600'}`} />
                ))}
              </div>

              {step < 6 ? (
                <button type="button" onClick={nextStep}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shadow-red-600/30">
                  পরবর্তী <FiChevronRight size={16}/>
                </button>
              ) : (
                <button type="submit" disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shadow-red-600/30">
                  {loading
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    : emailVerified ? <FiCheck size={16}/> : <FiShield size={16}/>
                  }
                  {loading
                    ? 'জমা দেওয়া হচ্ছে...'
                    : emailVerified
                      ? 'আবেদন জমা দিন'
                      : 'ইমেইল যাচাই ও জমা দিন'
                  }
                </button>
              )}
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          সমস্যা হলে যোগাযোগ করুন: <strong>01836-191102</strong>
        </p>
      </div>
    </div>
  )
}
