// ============================================================
// AI Insights Page
// ============================================================
import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiCpu, FiRefreshCw, FiEye, FiSettings } from 'react-icons/fi'

export function AIInsights() {
  const [insights,  setInsights]  = useState([])
  const [config,    setConfig]    = useState({})
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('insights')
  const [triggering, setTriggering] = useState(false)

  const fetchData = async () => {
    try {
      const [insRes, cfgRes] = await Promise.all([
        api.get('/ai/insights'),
        api.get('/ai/config')
      ])
      setInsights(insRes.data.data.insights)
      setConfig(cfgRes.data.data)
    } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const markRead = async (id) => {
    await api.put(`/ai/insights/${id}/read`)
    setInsights(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i))
  }

  const triggerJob = async () => {
    setTriggering(true)
    try {
      await api.post('/ai/trigger')
      toast.success('AI Job শুরু হয়েছে। কিছুক্ষণ পরে রিফ্রেশ করুন।')
    } catch { toast.error('সমস্যা হয়েছে।') }
    finally { setTriggering(false) }
  }

  const saveConfig = async () => {
    try {
      await api.put('/ai/config', config)
      toast.success('AI Config আপডেট সফল।')
    } catch { toast.error('সমস্যা হয়েছে।') }
  }

  const severityIcon = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">AI ইনসাইটস</h1>
        <div className="flex gap-2">
          <Button variant="outline" icon={<FiRefreshCw className={triggering ? 'animate-spin' : ''} />}
            onClick={triggerJob} loading={triggering}>
            AI রান করুন
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {[{ key: 'insights', label: 'ইনসাইটস' }, { key: 'config', label: 'কনফিগারেশন' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'insights' ? (
        <div className="space-y-3">
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)
          ) : insights.length === 0 ? (
            <Card><p className="text-center text-gray-400 py-8">কোনো AI ইনসাইটস নেই। "AI রান করুন" বাটনে ক্লিক করুন।</p></Card>
          ) : insights.map(insight => (
            <div
              key={insight.id}
              onClick={() => !insight.is_read && markRead(insight.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-sm ${
                !insight.is_read ? 'border-primary/30 bg-blue-50' : 'border-gray-100 bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{severityIcon[insight.severity]}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800 text-sm">{insight.title}</p>
                    <Badge variant={insight.severity} />
                    {!insight.is_read && <span className="w-2 h-2 bg-primary rounded-full" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(insight.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card title="AI কনফিগারেশন">
          <div className="space-y-4 max-w-md">
            <Input label="Claude API Key" type="password" placeholder="sk-ant-..." value={config.api_key || ''}
              onChange={e => setConfig(prev => ({ ...prev, api_key: e.target.value }))} />
            <Input label="দৈনিক মডেল" value={config.daily_model || ''} placeholder="claude-haiku-4-5-20251001"
              onChange={e => setConfig(prev => ({ ...prev, daily_model: e.target.value }))} />
            <Input label="পিরিয়ডিক মডেল" value={config.periodic_model || ''} placeholder="claude-sonnet-4-6"
              onChange={e => setConfig(prev => ({ ...prev, periodic_model: e.target.value }))} />
            <Input label="Max Tokens" type="number" value={config.max_tokens || '1000'}
              onChange={e => setConfig(prev => ({ ...prev, max_tokens: e.target.value }))} />
            <Input label="পিরিয়ডিক রিভিউ (মাস)" type="number" value={config.periodic_review_months || '3'}
              onChange={e => setConfig(prev => ({ ...prev, periodic_review_months: e.target.value }))} />
            <Button onClick={saveConfig} icon={<FiSettings />}>কনফিগ সেভ করুন</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

export default AIInsights
