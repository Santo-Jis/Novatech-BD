import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { FiBell, FiClock, FiInfo } from 'react-icons/fi'

export default function NoticesView() {
  const [notices,  setNotices]  = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    api.get('/notices')
      .then(res => setNotices(res.data.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-4 space-y-3">
      {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <FiBell className="text-primary dark:text-blue-400 text-xl" />
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">নোটিশ বোর্ড</h2>
      </div>

      {notices.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-10 text-center">
          <FiInfo className="text-gray-300 text-4xl mx-auto mb-2" />
          <p className="text-gray-400 dark:text-gray-500 text-sm">কোনো সক্রিয় নোটিশ নেই।</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(n => (
            <div key={n.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-100 dark:border-blue-900/40 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <FiBell className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{n.title}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{n.message}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <FiClock className="text-xs" />
                      {new Date(n.created_at).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {n.creator_name && <span>— {n.creator_name}</span>}
                    {n.expires_at && (
                      <span className="text-amber-500">
                        মেয়াদ: {new Date(n.expires_at).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
