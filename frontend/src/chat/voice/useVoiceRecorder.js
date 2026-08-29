// chat/voice/useVoiceRecorder.js
//
// ব্রাউজার/WebView-এর MediaRecorder API সরাসরি — কোনো নতুন npm প্যাকেজ লাগেনি।
// Capacitor WebView-তে সাধারণত কাজ করে, কিন্তু native Android মাইক্রোফোন
// পারমিশন (AndroidManifest.xml-এ RECORD_AUDIO) আগে থেকে যোগ করা না থাকলে
// getUserMedia() ব্যর্থ হবে — এটা কোডে ফিক্স করার কিছু না, native config,
// রেফারেন্স README-তে ফ্ল্যাগ করা আছে।

import { useState, useRef, useCallback, useEffect } from 'react'

const MAX_DURATION_SECONDS = 120 // ২ মিনিট ক্যাপ — লম্বা রেকর্ডিং ৮MB আপলোড-লিমিট ছাড়িয়ে যেতে পারে

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [error, setError] = useState('')

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const startedAtRef = useRef(0)
  const autoStopRef = useRef(null)

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const start = useCallback(async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('এই ডিভাইসে ভয়েস রেকর্ডিং সাপোর্ট নেই')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t))
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mediaRecorderRef.current = mr
      mr.start()

      startedAtRef.current = Date.now()
      setDurationSeconds(0)
      setRecording(true)
      timerRef.current = setInterval(() => setDurationSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)), 400)
      autoStopRef.current = setTimeout(() => mr.state !== 'inactive' && mr.stop(), MAX_DURATION_SECONDS * 1000)
    } catch (e) {
      console.error('[voice] getUserMedia ব্যর্থ:', e.message)
      setError('মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি — পারমিশন দিয়েছেন কিনা দেখুন')
    }
  }, [])

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current
      if (!mr || mr.state === 'inactive') return resolve(null)
      mr.onstop = () => {
        clearInterval(timerRef.current)
        clearTimeout(autoStopRef.current)
        cleanupStream()
        setRecording(false)
        const finalDuration = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000))
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        chunksRef.current = []
        resolve({ blob, durationSeconds: finalDuration })
      }
      mr.stop()
    })
  }, [])

  const cancel = useCallback(() => {
    const mr = mediaRecorderRef.current
    clearInterval(timerRef.current)
    clearTimeout(autoStopRef.current)
    if (mr && mr.state !== 'inactive') {
      mr.onstop = null
      mr.stop()
    }
    cleanupStream()
    chunksRef.current = []
    setRecording(false)
    setDurationSeconds(0)
  }, [])

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      clearTimeout(autoStopRef.current)
      cleanupStream()
    }
  }, [])

  return { recording, durationSeconds, error, start, stop, cancel, maxDurationSeconds: MAX_DURATION_SECONDS }
}
