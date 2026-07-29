// components/QrScanner.jsx
// ✅ NEW — কাস্টমারের QR কোড স্ক্যান করার জন্য (SR/Worker সামনাসামনি
// কাস্টমার connect করতে ব্যবহার করবে)।
//
// Camera.jsx-এর মতোই raw getUserMedia + <video>/<canvas> প্যাটার্ন —
// নতুন কোনো ভারী স্ক্যানার-ইঞ্জিন লাইব্রেরি (html5-qrcode ইত্যাদি) না
// এনে হালকা `jsqr` দিয়ে ফ্রেম-বাই-ফ্রেম ডিকোড করা হচ্ছে (package.json-এ
// যোগ করা হয়েছে — প্রথমবার `npm install` লাগবে)।
//
// ব্যবহার: <QrScanner onScan={(code) => ...} onClose={() => ...} />

import { useRef, useState, useEffect, useCallback } from 'react'
import jsQR from 'jsqr'
import { FiCamera, FiX, FiEdit3 } from 'react-icons/fi'

export default function QrScanner({ onScan, onClose }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const scannedRef = useRef(false) // ✅ ডাবল-স্ক্যান/ডাবল-কল আটকাতে

  const [started,  setStarted]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualCode, setManualCode] = useState('')

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setStarted(false)
  }, [])

  const tick = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    })
    if (code && code.data && !scannedRef.current) {
      scannedRef.current = true
      stopCamera()
      onScan?.(code.data)
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [onScan, stopCamera])

  const startCamera = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setStarted(true)
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setError('ক্যামেরা চালু করা সম্ভব হয়নি। অনুমতি দিন, অথবা নিচে কোড লিখে দিন।')
    } finally {
      setLoading(false)
    }
  }, [tick])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitManual = () => {
    const v = manualCode.trim()
    if (!v) return
    scannedRef.current = true
    stopCamera()
    onScan?.(v)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-sm aspect-square bg-black rounded-2xl overflow-hidden">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${started && !manualMode ? 'block' : 'hidden'}`}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />

        {!started && !error && (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/50 gap-3">
            {loading
              ? <span className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <FiCamera className="text-5xl" />
            }
            <p className="text-sm">ক্যামেরা চালু হচ্ছে...</p>
          </div>
        )}

        {started && !manualMode && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-56 border-2 border-white/70 rounded-2xl" />
          </div>
        )}

        {manualMode && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6">
            <FiEdit3 className="text-white/40 text-3xl" />
            <input
              autoFocus
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitManual()}
              placeholder="কাস্টমারের QR কোড লিখুন"
              className="w-full h-11 rounded-xl px-4 text-sm bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:border-white/50"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500 text-center px-4">{error}</p>}

      <div className="flex gap-3 w-full max-w-sm">
        <button onClick={onClose} className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-600">
          <FiX className="inline mr-1" /> বাতিল
        </button>
        {manualMode ? (
          <button onClick={submitManual} className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold text-sm">
            যাচাই করুন
          </button>
        ) : (
          <button
            onClick={() => setManualMode(true)}
            className="flex-1 border border-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-sm"
          >
            কোড হাতে লিখুন
          </button>
        )}
      </div>
    </div>
  )
}
