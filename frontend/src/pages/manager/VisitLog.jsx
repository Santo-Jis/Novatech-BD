import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import toast from 'react-hot-toast'
import {
  FiArrowLeft, FiCalendar, FiMapPin, FiCheckCircle,
  FiXCircle, FiX, FiCheck, FiUser, FiPhone, FiMail,
  FiNavigation
} from 'react-icons/fi'

const QUICK_RANGES = [
  { label: 'আজ',      days: 0  },
  { label: '৭ দিন',   days: 6  },
  { label: '১৫ দিন',  days: 14 },
  { label: 'এই মাস',  days: 29 },
]

function getDateRange(days) {
  const to   = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().split('T')[0],
    to:   to.toISOString().split('T')[0],
  }
}

export default function VisitLog() {
  const { workerId }          = useParams()
  const [searchParams]        = useSearchParams()
  const navigate              = useNavigate()
  const workerName            = searchParams.get('name') || 'SR'

  const [visits,       setVisits]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [dateFrom,     setDateFrom]     = useState(() => getDateRange(6).from)
  const [dateTo,       setDateTo]       = useState(() => getDateRange(0).to)
  const [activeRange,  setActiveRange]  = useState(1)   // index of QUICK_RANGES
  const [photoModal,   setPhotoModal]   = useState(null)

  const fetchVisits = async (from, to) => {
    setLoading(true)
    try {
      const res = await api.get(`/sales/team-visits?worker_id=${workerId}&from=${from}&to=${to}`)
      setVisits(res.data.data || [])
    } catch {
      toast.error('ভিজিট তথ্য আনতে সমস্যা।')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchVisits(dateFrom, dateTo) }, [])

  const handleQuickRange = (idx) => {
    const { from, to } = getDateRange(QUICK_RANGES[idx].days)
    setActiveRange(idx)
    setDateFrom(from)
    setDateTo(to)
    fetchVisits(from, to)
  }

  const handleCustomDate = (from, to) => {
    setActiveRange(null)
    setDateFrom(from)
    setDateTo(to)
    if (from && to) fetchVisits(from, to)
  }

  const soldCount   = visits.filter(v => v.will_sell).length
  const noSellCount = visits.filter(v => !v.will_sell).length
  const missedGPS   = visits.filter(v => v.location_matched === false).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FiArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900">ভিজিট লগ</h1>
            <p className="text-xs text-gray-500">{workerName}</p>
          </div>
        </div>

        {/* ── Date Filter ── */}
        <div className="px-4 pb-3 space-y-2">
          {/* Quick buttons */}
          <div className="flex gap-2">
            {QUICK_RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => handleQuickRange(i)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeRange === i
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* Custom date range */}
          <div className="flex items-center gap-2">
            <FiCalendar size={13} className="text-gray-400 flex-shrink-0" />
            <input
              type="date" value={dateFrom}
              max={dateTo}
              onChange={e => handleCustomDate(e.target.value, dateTo)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-400 flex-1"
            />
            <span className="text-gray-400 text-xs">—</span>
            <input
              type="date" value={dateTo}
              min={dateFrom}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => handleCustomDate(dateFrom, e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-400 flex-1"
            />
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-24">
        {/* ── Summary Cards ── */}
        {!loading && visits.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <p className="text-xl font-bold text-gray-800">{visits.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">মোট ভিজিট</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-3 text-center">
              <p className="text-xl font-bold text-green-600">{soldCount}</p>
              <p className="text-xs text-green-600 mt-0.5">বিক্রয়</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-3 text-center">
              <p className="text-xl font-bold text-red-500">{noSellCount}</p>
              <p className="text-xs text-red-500 mt-0.5">বিক্রয়বিহীন</p>
            </div>
          </div>
        )}

        {missedGPS > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-orange-500">⚠️</span>
            <p className="text-xs text-orange-700 font-medium">
              {missedGPS}টি ভিজিটে লোকেশন মেলেনি
            </p>
          </div>
        )}

        {/* ── Visit List ── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse space-y-2">
                <div className="h-4 bg-gray-100 rounded w-2/3" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : visits.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FiMapPin size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">এই সময়ে কোনো ভিজিট নেই</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visits.map((v, i) => {
              const time     = new Date(v.created_at)
              const mapsUrl  = (v.worker_lat && v.worker_lng)
                ? `https://www.google.com/maps?q=${v.worker_lat},${v.worker_lng}`
                : null

              return (
                <div
                  key={i}
                  className={`bg-white rounded-xl border overflow-hidden shadow-sm ${
                    v.will_sell ? 'border-green-100' : 'border-red-100'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`px-4 pt-3 pb-2 flex items-start justify-between gap-3 ${
                    v.will_sell ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {v.will_sell
                        ? <FiCheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={16} />
                        : <FiXCircle    className="text-red-400 flex-shrink-0 mt-0.5"   size={16} />
                      }
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-900 truncate">{v.shop_name}</p>
                        {v.owner_name && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <FiUser size={10} /> {v.owner_name}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* বন্ধ দোকানের ছবি */}
                    {v.closed_shop_photo && (
                      <button
                        onClick={() => setPhotoModal(v.closed_shop_photo)}
                        className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 border-red-200 hover:opacity-80 transition-opacity"
                      >
                        <img src={v.closed_shop_photo} alt="দোকান" className="w-full h-full object-cover" />
                      </button>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="px-4 py-3 space-y-2">

                    {/* তারিখ ও সময় */}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <FiCalendar size={11} className="flex-shrink-0" />
                      <span>
                        {new Date(v.visit_date || v.created_at).toLocaleDateString('bn-BD', {
                          weekday: 'short', day: 'numeric', month: 'short'
                        })}
                        {' · '}
                        {time.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Route */}
                    {v.route_name && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <FiNavigation size={11} className="flex-shrink-0" />
                        <span>রুট: <span className="font-semibold text-gray-700">{v.route_name}</span></span>
                      </div>
                    )}

                    {/* ঠিকানা */}
                    {v.address && (
                      <div className="flex items-start gap-2 text-xs text-gray-500">
                        <FiMapPin size={11} className="flex-shrink-0 mt-0.5" />
                        <span>{v.address}</span>
                      </div>
                    )}

                    {/* লোকেশন status + Maps link */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {v.location_matched === true && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <FiCheck size={10} /> লোকেশন মিলেছে
                        </span>
                      )}
                      {v.location_matched === false && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          ⚠️ মেলেনি
                          {v.location_distance != null && ` — ${Math.round(v.location_distance)} মি দূরে`}
                        </span>
                      )}
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 underline underline-offset-2"
                        >
                          <FiMapPin size={10} /> মানচিত্রে দেখুন
                        </a>
                      )}
                    </div>

                    {/* no-sell কারণ */}
                    {!v.will_sell && v.no_sell_reason && (
                      <div className="bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                        <p className="text-xs text-red-600">
                          <span className="font-bold">বিক্রয় না হওয়ার কারণ:</span>{' '}
                          {v.no_sell_reason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Full Photo Modal ── */}
      {photoModal && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setPhotoModal(null)}
        >
          <button
            className="absolute top-5 right-5 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            onClick={() => setPhotoModal(null)}
          >
            <FiX size={18} />
          </button>
          <img
            src={photoModal}
            alt="বন্ধ দোকান"
            className="max-w-full max-h-[88vh] rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
