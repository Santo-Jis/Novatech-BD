import { useState, useEffect, useCallback } from 'react'
import { FiMapPin, FiBell, FiCamera, FiCheck, FiX, FiAlertTriangle, FiArrowRight, FiShield } from 'react-icons/fi'
import { useAuthStore } from '../store/auth.store'

// ============================================================
// PermissionSetup — App-wide Permission Request Modal
// Login করার পরে প্রথমবার দেখায়, সব permission এক জায়গায়
// Native app-এর মতো popup করে permission চায়
// ============================================================

const STORAGE_KEY = 'novatech_permissions_asked'

// ✅ Native App (Android/iOS) detection
const isNative = () => !!(window?.Capacitor?.isNativePlatform?.())

// Permission এর স্ট্যাটাস
const STATUS = {
  IDLE: 'idle',
  GRANTED: 'granted',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
}

// কোন role-এ কোন permission লাগবে
const ROLE_PERMISSIONS = {
  worker:     ['location', 'camera', 'notification'],
  manager:    ['location', 'notification'],
  supervisor: ['location', 'notification'],
  asm:        ['location', 'notification'],
  rsm:        ['notification'],
  admin:      ['notification'],
  accountant: ['notification'],
}

// Permission এর বিস্তারিত তথ্য
const PERMISSION_INFO = {
  location: {
    icon: FiMapPin,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    grantedBg: 'bg-blue-50',
    title: 'লোকেশন অ্যাক্সেস',
    desc: 'লাইভ GPS ট্র্যাকিং ও চেক-ইন/আউটের জন্য আপনার অবস্থান জানা দরকার',
    why: 'হাজিরা ও রুট ট্র্যাকিংয়ের জন্য প্রয়োজন',
  },
  camera: {
    icon: FiCamera,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    grantedBg: 'bg-green-50',
    title: 'ক্যামেরা অ্যাক্সেস',
    desc: 'চেক-ইন সেলফি ও কাস্টমার ভিজিটের ছবি তোলার জন্য ক্যামেরা ব্যবহার করা হবে',
    why: 'হাজিরার সেলফি ও ভিজিট ছবির জন্য প্রয়োজন',
  },
  notification: {
    icon: FiBell,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    grantedBg: 'bg-amber-50',
    title: 'নোটিফিকেশন',
    desc: 'অর্ডার, হিসাব অনুমোদন ও বোনাসের আপডেট তাৎক্ষণিকভাবে পাওয়ার জন্য',
    why: 'গুরুত্বপূর্ণ আপডেট পাওয়ার জন্য প্রয়োজন',
  },
}

// ─── Single Permission Row ────────────────────────────────────
function PermissionRow({ type, status, onRequest, loading }) {
  const info = PERMISSION_INFO[type]
  const Icon = info.icon

  const isGranted  = status === STATUS.GRANTED
  const isDenied   = status === STATUS.DENIED
  const isUnsup    = status === STATUS.UNSUPPORTED

  return (
    <div className={`
      rounded-2xl border-2 p-4 transition-all duration-300
      ${isGranted
        ? 'border-green-300 bg-green-50'
        : isDenied
        ? 'border-red-200 bg-red-50'
        : `${info.border} ${info.bg}`
      }
    `}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`
          w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0
          ${isGranted ? 'bg-green-500' : isDenied ? 'bg-red-400' : 'bg-white shadow-sm'}
        `}>
          {isGranted
            ? <FiCheck className="text-white text-xl" />
            : isDenied
            ? <FiX className="text-white text-lg" />
            : <Icon className={`${info.color} text-xl`} />
          }
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 text-sm">{info.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{info.desc}</p>

          {isDenied && (
            <p className="text-xs text-red-600 mt-1 font-medium flex items-center gap-1">
              <FiAlertTriangle className="flex-shrink-0" />
              ব্রাউজার Settings থেকে Permission চালু করুন
            </p>
          )}
          {isUnsup && (
            <p className="text-xs text-gray-400 mt-1">এই ডিভাইসে সাপোর্ট নেই</p>
          )}
        </div>

        {/* Action Button */}
        <div className="flex-shrink-0">
          {isGranted ? (
            <span className="text-xs text-green-600 font-semibold bg-green-100 px-2.5 py-1 rounded-full">
              ✓ চালু
            </span>
          ) : isDenied || isUnsup ? (
            <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {isDenied ? 'বন্ধ' : 'নেই'}
            </span>
          ) : (
            <button
              onClick={() => onRequest(type)}
              disabled={loading === type}
              className={`
                text-xs font-semibold px-3 py-1.5 rounded-full
                transition-all duration-200 active:scale-95 flex items-center gap-1
                ${loading === type
                  ? 'bg-gray-100 text-gray-400 cursor-wait'
                  : 'bg-white shadow-md text-gray-700 hover:shadow-lg'
                }
              `}
            >
              {loading === type ? (
                <span className="animate-pulse">অপেক্ষা...</span>
              ) : (
                <>অনুমতি দিন <FiArrowRight className="text-xs" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Modal ──────────────────────────────────────────────
export default function PermissionSetup({ onDone }) {
  const { user } = useAuthStore()
  const [statuses, setStatuses] = useState({
    location:     STATUS.IDLE,
    camera:       STATUS.IDLE,
    notification: STATUS.IDLE,
  })
  const [loading,  setLoading]  = useState(null) // কোন permission-এর request চলছে
  const [step,     setStep]     = useState('intro') // 'intro' | 'permissions' | 'done'
  const [allDone,  setAllDone]  = useState(false)

  // এই role-এ কোন permission দরকার
  const required = ROLE_PERMISSIONS[user?.role] || ['notification']

  // ─── বর্তমান permission status check ──────────────────────
  const checkAllStatuses = useCallback(async () => {
    const next = { ...statuses }

    // ✅ Native App-এ Capacitor plugin ছাড়া Web Permission API নেই
    // Native-এ OS নিজেই permission চায় (install/first launch-এ)
    // তাই সব GRANTED ধরা হয় — modal দেখানোর দরকার নেই
    if (isNative()) {
      next.location     = STATUS.GRANTED
      next.camera       = STATUS.GRANTED
      next.notification = STATUS.GRANTED
      setStatuses(next)
      return
    }

    // Web Browser — স্বাভাবিক Permission API চেক
    // Geolocation
    if (required.includes('location')) {
      if (!navigator.geolocation) {
        next.location = STATUS.UNSUPPORTED
      } else if (navigator.permissions) {
        try {
          const r = await navigator.permissions.query({ name: 'geolocation' })
          next.location = r.state === 'granted' ? STATUS.GRANTED
                        : r.state === 'denied'  ? STATUS.DENIED
                        : STATUS.IDLE
        } catch { next.location = STATUS.IDLE }
      }
    } else {
      next.location = STATUS.GRANTED
    }

    // Camera
    if (required.includes('camera')) {
      if (!navigator.mediaDevices?.getUserMedia) {
        next.camera = STATUS.UNSUPPORTED
      } else if (navigator.permissions) {
        try {
          const r = await navigator.permissions.query({ name: 'camera' })
          next.camera = r.state === 'granted' ? STATUS.GRANTED
                      : r.state === 'denied'  ? STATUS.DENIED
                      : STATUS.IDLE
        } catch { next.camera = STATUS.IDLE }
      }
    } else {
      next.camera = STATUS.GRANTED
    }

    // Notification
    if (required.includes('notification')) {
      if (!('Notification' in window)) {
        next.notification = STATUS.UNSUPPORTED
      } else {
        next.notification = Notification.permission === 'granted' ? STATUS.GRANTED
                          : Notification.permission === 'denied'  ? STATUS.DENIED
                          : STATUS.IDLE
      }
    } else {
      next.notification = STATUS.GRANTED
    }

    setStatuses(next)
  }, [required.join(',')])

  useEffect(() => {
    checkAllStatuses()
  }, [])

  // সব required permission granted কিনা check
  useEffect(() => {
    const allGrantedOrNA = required.every(p =>
      statuses[p] === STATUS.GRANTED ||
      statuses[p] === STATUS.UNSUPPORTED
    )
    setAllDone(allGrantedOrNA)
  }, [statuses, required.join(',')])

  // ─── Permission Request ────────────────────────────────────
  const requestPermission = async (type) => {
    setLoading(type)
    try {
      if (type === 'location') {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
          })
        })
        setStatuses(p => ({ ...p, location: STATUS.GRANTED }))
      }

      else if (type === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        stream.getTracks().forEach(t => t.stop()) // তুরন্ত বন্ধ করো
        setStatuses(p => ({ ...p, camera: STATUS.GRANTED }))
      }

      else if (type === 'notification') {
        const result = await Notification.requestPermission()
        setStatuses(p => ({
          ...p,
          notification: result === 'granted' ? STATUS.GRANTED
                      : result === 'denied'  ? STATUS.DENIED
                      : STATUS.IDLE
        }))
      }
    } catch {
      await checkAllStatuses() // error হলে re-check করো
    } finally {
      setLoading(null)
    }
  }

  // ─── সব দিলে বা skip করলে Done ────────────────────────────
  const handleDone = () => {
    // localStorage-এ mark করো যাতে পরের বার না দেখায়
    try {
      const asked = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      asked[user?.id] = Date.now()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(asked))
    } catch {}
    onDone?.()
  }

  // ─── Render ────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        {/* Sheet */}
        <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden">
          {/* Top decoration */}
          <div className="h-1 w-12 bg-gray-200 rounded-full mx-auto mt-3" />

          {/* Content */}
          <div className="px-6 pt-4 pb-8">
            {/* App icon area */}
            <div className="flex flex-col items-center mb-6 mt-2">
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg mb-3">
                <FiShield className="text-white text-3xl" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 text-center">
                অ্যাপ ব্যবহারের অনুমতি
              </h2>
              <p className="text-sm text-gray-500 text-center mt-1.5 leading-relaxed">
                NovaTech BD সঠিকভাবে কাজ করতে কিছু অনুমতি দরকার।
                আপনার তথ্য সম্পূর্ণ সুরক্ষিত।
              </p>
            </div>

            {/* Quick permission preview */}
            <div className="space-y-2 mb-6">
              {required.map(type => {
                const info = PERMISSION_INFO[type]
                const Icon = info.icon
                return (
                  <div key={type} className="flex items-center gap-3 py-2">
                    <div className={`w-8 h-8 ${info.bg} rounded-xl flex items-center justify-center`}>
                      <Icon className={`${info.color} text-base`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{info.title}</p>
                      <p className="text-xs text-gray-400">{info.why}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Buttons */}
            <button
              onClick={() => setStep('permissions')}
              className="w-full bg-primary text-white py-3.5 rounded-2xl font-semibold text-base
                         active:scale-98 transition-transform shadow-lg shadow-primary/30"
            >
              চালু করুন
            </button>
            <button
              onClick={handleDone}
              className="w-full text-gray-400 py-2.5 mt-2 text-sm font-medium"
            >
              এখন না
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Drag handle */}
        <div className="h-1 w-12 bg-gray-200 rounded-full mx-auto mt-3" />

        <div className="px-5 pt-4 pb-8">
          {/* Header */}
          <div className="mb-5">
            <h2 className="text-lg font-bold text-gray-900">অনুমতি দিন</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              একটিতে ট্যাপ করে অনুমতি দিন
            </p>
          </div>

          {/* Permission Rows — শুধু required গুলো */}
          <div className="space-y-3 mb-6">
            {required.map(type => (
              <PermissionRow
                key={type}
                type={type}
                status={statuses[type]}
                onRequest={requestPermission}
                loading={loading}
              />
            ))}
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-5">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{
                  width: `${
                    (required.filter(p =>
                      statuses[p] === STATUS.GRANTED || statuses[p] === STATUS.UNSUPPORTED
                    ).length / required.length) * 100
                  }%`
                }}
              />
            </div>
            <span className="text-xs text-gray-400 font-medium flex-shrink-0">
              {required.filter(p =>
                statuses[p] === STATUS.GRANTED || statuses[p] === STATUS.UNSUPPORTED
              ).length}/{required.length}
            </span>
          </div>

          {/* Done Button */}
          <button
            onClick={handleDone}
            className={`
              w-full py-3.5 rounded-2xl font-semibold text-base transition-all duration-200
              active:scale-98 shadow-lg
              ${allDone
                ? 'bg-secondary text-white shadow-secondary/30'
                : 'bg-primary text-white shadow-primary/30'
              }
            `}
          >
            {allDone ? '✓ সব সেটআপ হয়েছে — চালু করুন' : 'এড়িয়ে যান'}
          </button>

          {!allDone && (
            <p className="text-center text-xs text-gray-400 mt-2.5">
              পরে Settings থেকেও দেওয়া যাবে
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Hook: Permission Setup প্রয়োজন কিনা check করে ──────────
export function usePermissionSetup() {
  const { user } = useAuthStore()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!user?.id) return

    // আগে জিজ্ঞেস করা হয়েছে কিনা check করো
    try {
      const asked = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      // ৭ দিনের বেশি আগে জিজ্ঞেস করা হলে আবার দেখাও
      const lastAsked = asked[user.id]
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
      if (lastAsked && Date.now() - lastAsked < SEVEN_DAYS) {
        return // এই সপ্তাহে দেখানো হয়েছে
      }
    } catch {}

    // Required permission গুলো granted কিনা check করো
    const role = user.role
    const required = ROLE_PERMISSIONS[role] || ['notification']

    const checkNeeded = async () => {
      // ✅ Native App-এ এই modal দেখানো অর্থহীন
      // Android/iOS-এ OS নিজেই permission চায় — Web API নেই
      if (isNative()) return

      const checks = await Promise.all(required.map(async (type) => {
        if (type === 'location') {
          if (!navigator.geolocation) return false
          if (!navigator.permissions) return true
          try {
            const r = await navigator.permissions.query({ name: 'geolocation' })
            return r.state !== 'granted'
          } catch { return true }
        }
        if (type === 'camera') {
          if (!navigator.mediaDevices?.getUserMedia) return false
          if (!navigator.permissions) return true
          try {
            const r = await navigator.permissions.query({ name: 'camera' })
            return r.state !== 'granted'
          } catch { return true }
        }
        if (type === 'notification') {
          if (!('Notification' in window)) return false
          return Notification.permission !== 'granted'
        }
        return false
      }))

      // যেকোনো একটাও না থাকলে modal দেখাও
      if (checks.some(Boolean)) {
        setTimeout(() => setShow(true), 500)
      }
    }

    checkNeeded()
  }, [user?.id, user?.role])

  const close = () => setShow(false)

  return { show, close }
}
