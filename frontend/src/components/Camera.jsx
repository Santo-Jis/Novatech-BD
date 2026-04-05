import { useRef, useState, useCallback } from 'react'
import { FiCamera, FiRefreshCw, FiCheck } from 'react-icons/fi'

// ============================================================
// Camera Component — সেলফি তোলার জন্য
// ============================================================

export default function Camera({ onCapture, onClose }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)

  const [started,   setStarted]   = useState(false)
  const [captured,  setCaptured]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [facingMode, setFacingMode] = useState('user') // front camera

  // ক্যামেরা শুরু
  const startCamera = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current       = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setStarted(true)
    } catch (err) {
      setError('ক্যামেরা চালু করা সম্ভব হয়নি। অনুমতি দিন।')
    } finally {
      setLoading(false)
    }
  }, [facingMode])

  // ক্যামেরা বন্ধ
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    setStarted(false)
  }

  // ছবি তোলা
  const capturePhoto = () => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob)
      setCaptured({ blob, url })
      stopCamera()
    }, 'image/jpeg', 0.85)
  }

  // ক্যামেরা পাল্টানো
  const flipCamera = () => {
    stopCamera()
    setFacingMode(m => m === 'user' ? 'environment' : 'user')
    setTimeout(startCamera, 300)
  }

  // confirm
  const confirmPhoto = () => {
    onCapture?.(captured.blob, captured.url)
  }

  // retake
  const retake = () => {
    setCaptured(null)
    startCamera()
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Camera/Preview area */}
      <div className="relative w-full max-w-sm aspect-square bg-black rounded-2xl overflow-hidden">

        {/* Video stream */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${started ? 'block' : 'hidden'} ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          muted
          playsInline
        />

        {/* Canvas (hidden) */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Captured image */}
        {captured && (
          <img
            src={captured.url}
            alt="ছবি"
            className="w-full h-full object-cover"
          />
        )}

        {/* Placeholder */}
        {!started && !captured && (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/50 gap-3">
            <FiCamera className="text-5xl" />
            <p className="text-sm">ক্যামেরা চালু নেই</p>
          </div>
        )}

        {/* Guide overlay */}
        {started && !captured && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-white/50 rounded-full" />
          </div>
        )}

        {/* Flip button */}
        {started && (
          <button
            onClick={flipCamera}
            className="absolute top-3 right-3 p-2 bg-black/40 rounded-full text-white"
          >
            <FiRefreshCw />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      {/* Buttons */}
      <div className="flex gap-3 w-full max-w-sm">
        {!started && !captured && (
          <button
            onClick={startCamera}
            disabled={loading}
            className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FiCamera />
            )}
            {loading ? 'চালু হচ্ছে...' : 'ক্যামেরা চালু করুন'}
          </button>
        )}

        {started && !captured && (
          <>
            <button
              onClick={onClose}
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-600"
            >
              বাতিল
            </button>
            <button
              onClick={capturePhoto}
              className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            >
              <FiCamera /> ছবি তুলুন
            </button>
          </>
        )}

        {captured && (
          <>
            <button
              onClick={retake}
              className="flex-1 border border-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-sm"
            >
              আবার তুলুন
            </button>
            <button
              onClick={confirmPhoto}
              className="flex-1 bg-secondary text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            >
              <FiCheck /> ঠিক আছে
            </button>
          </>
        )}
      </div>
    </div>
  )
}
