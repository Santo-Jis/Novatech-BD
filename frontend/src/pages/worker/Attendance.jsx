import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import FingerPrint from '../../components/FingerPrint'
import Camera from '../../components/Camera'
import toast from 'react-hot-toast'

const STEPS = ['finger', 'selfie', 'location', 'done']

export default function WorkerAttendance() {
  const navigate          = useNavigate()
  const [mode,      setMode]      = useState(null)    // 'checkin' | 'checkout'
  const [step,      setStep]      = useState('finger')
  const [selfieBlob, setSelfieBlob] = useState(null)
  const [location,  setLocation]  = useState(null)
  const [todayAtt,  setTodayAtt]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [lateInfo,  setLateInfo]  = useState(null)
  const [settings,  setSettings]  = useState({
    attendance_checkin_start: '09:00',
    attendance_popup_cutoff:  '14:30',
  })

  // আজকের হাজিরা ও সেটিংস লোড
  useEffect(() => {
    // Settings লোড করুন
    api.get('/admin/settings')
      .then(res => {
        if (res.data?.data) setSettings(res.data.data)
      })
      .catch(() => {})

    api.get('/attendance/my?month=' + (new Date().getMonth() + 1) + '&year=' + new Date().getFullYear())
      .then(res => {
        const today = new Date().toISOString().split('T')[0]
        const att   = res.data.data.attendance.find(a => a.date === today)
        setTodayAtt(att || null)
      })
      .finally(() => setLoading(false))
  }, [])

  // Location নেওয়া
  const getLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS সাপোর্ট নেই।'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => reject(new Error('লোকেশন নেওয়া সম্ভব হয়নি।'))
      )
    })
  }

  // FingerPrint সম্পন্ন হলে
  const onFingerDone = () => {
    setStep('selfie')
  }

  // Selfie নেওয়া হলে
  const onSelfieCaptured = (blob) => {
    setSelfieBlob(blob)
    setStep('location')
    // লোকেশন অটো নিন
    getLocation()
      .then(loc => {
        setLocation(loc)
        setStep('submit')
        handleSubmit(blob, loc)
      })
      .catch(() => {
        toast.error('লোকেশন নেওয়া সম্ভব হয়নি। GPS চালু করুন।')
        setStep('selfie')
      })
  }

  // Submit
  const handleSubmit = async (blob, loc) => {
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('selfie',    blob, 'selfie.jpg')
      formData.append('latitude',  loc.latitude)
      formData.append('longitude', loc.longitude)

      let res
      if (mode === 'checkin') {
        res = await api.post('/attendance/checkin', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        if (res.data.data.isLate) {
          setLateInfo(res.data.data)
        }
      } else {
        res = await api.post('/attendance/checkout', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      toast.success(res.data.message)
      setStep('done')

    } catch (err) {
      toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
      setStep('finger')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-4"><div className="h-64 bg-white rounded-2xl animate-pulse" /></div>
  }

  // চেক-ইন/আউট অপশন
  if (!mode) {
    const now    = new Date()
    const hour   = now.getHours()
    const minute = now.getMinutes()
    const time   = hour * 60 + minute

    // Settings থেকে সময় নেওয়া (hardcoded নয়)
    const [startH, startM] = (settings.attendance_checkin_start || '09:00').split(':').map(Number)
    const [cutH,   cutM]   = (settings.attendance_popup_cutoff  || '14:30').split(':').map(Number)
    const startTime = startH * 60 + startM
    const cutTime   = cutH   * 60 + cutM

    const canCheckIn  = !todayAtt?.check_in_time  && time >= startTime && time <= cutTime
    const canCheckOut = !!todayAtt?.check_in_time && !todayAtt?.check_out_time

    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <h2 className="text-xl font-bold text-gray-800 text-center">হাজিরা</h2>

        {/* Today Status */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">আজকের অবস্থা</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">চেক-ইন</p>
              <p className="font-bold text-sm text-gray-800 mt-1">
                {todayAtt?.check_in_time
                  ? new Date(todayAtt.check_in_time).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
                  : '—'
                }
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">চেক-আউট</p>
              <p className="font-bold text-sm text-gray-800 mt-1">
                {todayAtt?.check_out_time
                  ? new Date(todayAtt.check_out_time).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
                  : '—'
                }
              </p>
            </div>
          </div>
          {todayAtt?.late_minutes > 0 && (
            <div className="mt-3 bg-amber-50 rounded-xl p-2 text-center">
              <p className="text-xs text-amber-700">
                দেরি: {todayAtt.late_minutes} মিনিট | কর্তন: ৳{parseFloat(todayAtt.salary_deduction || 0)}
              </p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          {canCheckIn && (
            <button
              onClick={() => setMode('checkin')}
              className="w-full py-4 bg-secondary text-white rounded-2xl font-bold text-lg shadow-lg shadow-secondary/30 active:scale-95 transition-transform"
            >
              👆 চেক-ইন করুন
            </button>
          )}

          {canCheckOut && (
            <button
              onClick={() => setMode('checkout')}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg shadow-lg shadow-primary/30 active:scale-95 transition-transform"
            >
              👋 চেক-আউট করুন
            </button>
          )}

          {todayAtt?.check_out_time && (
            <div className="text-center py-6">
              <span className="text-4xl">✅</span>
              <p className="text-gray-600 font-semibold mt-2">আজকের হাজিরা সম্পন্ন!</p>
            </div>
          )}

          {!canCheckIn && !canCheckOut && !todayAtt?.check_out_time && (
            <div className="text-center py-6 text-gray-400">
              <p className="text-sm">চেক-ইনের সময় {settings.attendance_checkin_start} - {settings.attendance_popup_cutoff}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Done screen
  if (step === 'done') {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <span className="text-6xl mb-4">🎉</span>
        <h2 className="text-xl font-bold text-gray-800">
          {mode === 'checkin' ? 'চেক-ইন সফল!' : 'চেক-আউট সফল!'}
        </h2>
        {lateInfo && (
          <div className="mt-4 bg-amber-50 rounded-2xl p-4 text-center w-full">
            <p className="text-amber-700 font-semibold">⚠️ দেরি হয়েছে</p>
            <p className="text-amber-600 text-sm mt-1">
              {lateInfo.lateMinutes} মিনিট দেরি — কর্তন: ৳{lateInfo.deduction}
            </p>
          </div>
        )}
        <button
          onClick={() => navigate('/worker/dashboard')}
          className="mt-6 w-full py-3 bg-primary text-white rounded-2xl font-semibold"
        >
          ড্যাশবোর্ডে যান
        </button>
      </div>
    )
  }

  // Step: Finger
  if (step === 'finger') {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[70vh] animate-fade-in">
        <p className="text-lg font-bold text-gray-800 mb-2">
          {mode === 'checkin' ? 'চেক-ইন' : 'চেক-আউট'}
        </p>
        <p className="text-sm text-gray-500 mb-8">৩ সেকেন্ড চেপে ধরুন</p>
        <FingerPrint
          onSuccess={onFingerDone}
          label={mode === 'checkin' ? 'চেক-ইন' : 'চেক-আউট'}
          color={mode === 'checkin' ? 'secondary' : 'primary'}
        />
        <button onClick={() => setMode(null)} className="mt-8 text-sm text-gray-400 hover:text-gray-600">
          বাতিল করুন
        </button>
      </div>
    )
  }

  // Step: Selfie
  if (step === 'selfie') {
    return (
      <div className="p-4 animate-fade-in">
        <p className="text-lg font-bold text-gray-800 mb-2 text-center">সেলফি দিন</p>
        <p className="text-sm text-gray-500 mb-4 text-center">আপনার মুখ ফ্রেমের মধ্যে রাখুন</p>
        <Camera onCapture={onSelfieCaptured} onClose={() => setStep('finger')} />
      </div>
    )
  }

  // Step: Location loading
  if (step === 'location' || step === 'submit') {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-gray-600 mt-4 font-semibold">
          {step === 'location' ? 'লোকেশন নেওয়া হচ্ছে...' : 'সাবমিট হচ্ছে...'}
        </p>
      </div>
    )
  }
}
