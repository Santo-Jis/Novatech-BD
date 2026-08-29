// chat/voice/VoicePlayer.jsx
//
// নিজস্ব play/pause+progress UI — ব্রাউজারের ডিফল্ট <audio controls> এর বদলে,
// বাকি চ্যাট UI-এর সাথে ভিজ্যুয়ালি সামঞ্জস্যপূর্ণ রাখতে।

import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { FiPlay, FiPause } from 'react-icons/fi'

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function VoicePlayer({ url, duration, mine, accent }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrentTime(audio.currentTime)
    const onEnd = () => {
      setPlaying(false)
      setCurrentTime(0)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play().catch((e) => console.error('[voice] playback failed:', e.message))
      setPlaying(true)
    }
  }

  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  const iconBg = mine ? 'bg-white/25' : accent === 'warmth' ? 'bg-cp-warmth-100 text-cp-warmth-700' : 'bg-cp-trust-100 text-cp-trust-700'

  return (
    <div className="flex items-center gap-2.5 w-52">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={toggle}
        type="button"
        className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', iconBg, mine && 'text-white')}
      >
        {playing ? <FiPause size={13} /> : <FiPlay size={13} className="-mr-0.5" />}
      </button>
      <div className="flex-1">
        <div className={clsx('h-1 rounded-full overflow-hidden', mine ? 'bg-white/25' : 'bg-cp-bg-sunken')}>
          <div className={clsx('h-full rounded-full', mine ? 'bg-white' : accent === 'warmth' ? 'bg-cp-warmth-500' : 'bg-cp-trust-500')} style={{ width: `${pct}%` }} />
        </div>
        <p className={clsx('text-[10.5px] mt-1', mine ? 'text-white/75' : 'text-cp-text-muted')}>
          {formatMMSS(playing || currentTime > 0 ? currentTime : duration)}
        </p>
      </div>
    </div>
  )
}
