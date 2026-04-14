import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiCpu, FiRefreshCw, FiSettings, FiZap, FiCheckCircle, FiAlertCircle, FiEye, FiEyeOff } from 'react-icons/fi'

// Provider তথ্য
const PROVIDER_INFO = {
    openrouter: {
        label:       'OpenRouter',
        description: 'সব মডেল একসাথে — Claude, GPT, Gemini, Llama',
        color:       'bg-purple-100 text-purple-700 border-purple-200',
        icon:        '🔀',
        keyHint:     'sk-or-... দিয়ে শুরু',
        website:     'https://openrouter.ai'
    },
    anthropic: {
        label:       'Anthropic',
        description: 'Claude মডেলের অফিশিয়াল API',
        color:       'bg-orange-100 text-orange-700 border-orange-200',
        icon:        '🤖',
        keyHint:     'sk-ant-... দিয়ে শুরু',
        website:     'https://console.anthropic.com'
    },
    openai: {
        label:       'OpenAI',
        description: 'GPT-4o, o1 মডেল',
        color:       'bg-green-100 text-green-700 border-green-200',
        icon:        '🧠',
        keyHint:     'sk-... দিয়ে শুরু',
        website:     'https://platform.openai.com'
    },
    gemini: {
        label:       'Google Gemini',
        description: 'Gemini Flash ও Pro মডেল',
        color:       'bg-blue-100 text-blue-700 border-blue-200',
        icon:        '✨',
        keyHint:     'AIza... দিয়ে শুরু',
        website:     'https://aistudio.google.com'
    }
}

const TIER_STYLE = {
    fast:   'bg-green-50 text-green-600 border-green-200',
    smart:  'bg-blue-50 text-blue-600 border-blue-200',
    best:   'bg-purple-50 text-purple-600 border-purple-200',
    budget: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    free:   'bg-gray-50 text-gray-600 border-gray-200',
}
const TIER_LABEL = { fast: 'দ্রুত', smart: 'স্মার্ট', best: 'সেরা', budget: 'সাশ্রয়ী', free: 'বিনামূল্যে' }

export default function AIInsights() {
    const [insights,    setInsights]    = useState([])
    const [config,      setConfig]      = useState({})
    const [models,      setModels]      = useState([])
    const [loading,     setLoading]     = useState(true)
    const [saving,      setSaving]      = useState(false)
    const [testing,     setTesting]     = useState(false)
    const [triggering,  setTriggering]  = useState(false)
    const [tab,         setTab]         = useState('insights')
    const [showKey,     setShowKey]     = useState(false)
    const [apiKeyInput, setApiKeyInput] = useState('')
    const [detectedProvider, setDetectedProvider] = useState(null)

    const fetchData = async () => {
        try {
            const [insRes, cfgRes] = await Promise.all([
                api.get('/ai/insights'),
                api.get('/ai/config')
            ])
            setInsights(insRes.data.data.insights)
            const cfg = cfgRes.data.data
            setConfig(cfg)
            setModels(cfg.available_models || [])
            setDetectedProvider(cfg.detected_provider)
        } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
        finally { setLoading(false) }
    }

    useEffect(() => { fetchData() }, [])

    // API Key টাইপ করলে provider auto-detect করো
    const handleApiKeyChange = (val) => {
        setApiKeyInput(val)
        if (!val) { setDetectedProvider(null); return }
        if (val.startsWith('sk-or-'))  { setDetectedProvider('openrouter'); loadModelsForProvider('openrouter') }
        else if (val.startsWith('sk-ant-')) { setDetectedProvider('anthropic'); loadModelsForProvider('anthropic') }
        else if (val.startsWith('AIza'))    { setDetectedProvider('gemini');    loadModelsForProvider('gemini')    }
        else if (val.startsWith('sk-'))     { setDetectedProvider('openai');    loadModelsForProvider('openai')    }
        else { setDetectedProvider('openrouter') }
    }

    const loadModelsForProvider = async (provider) => {
        try {
            const res = await api.get(`/ai/models?provider=${provider}`)
            setModels(res.data.data.models)
        } catch {}
    }

    const markRead = async (id) => {
        await api.put(`/ai/insights/${id}/read`)
        setInsights(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i))
    }

    const triggerJob = async () => {
        setTriggering(true)
        try {
            await api.post('/ai/trigger')
            toast.success('AI Job শুরু হয়েছে।')
        } catch { toast.error('সমস্যা হয়েছে।') }
        finally { setTriggering(false) }
    }

    const testConnection = async () => {
        setTesting(true)
        try {
            const res = await api.post('/ai/test')
            toast.success(`✅ ${res.data.message}`)
        } catch (err) {
            toast.error(err.response?.data?.message || 'সংযোগ ব্যর্থ।')
        } finally { setTesting(false) }
    }

    const saveConfig = async () => {
        setSaving(true)
        try {
            const payload = { ...config }
            if (apiKeyInput && !apiKeyInput.includes('...')) {
                payload.api_key = apiKeyInput
            }
            await api.put('/ai/config', payload)
            toast.success('AI Config আপডেট সফল।')
            setApiKeyInput('')
            await fetchData()
        } catch { toast.error('সমস্যা হয়েছে।') }
        finally { setSaving(false) }
    }

    const severityIcon = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }
    const provider     = detectedProvider || config.detected_provider
    const provInfo     = PROVIDER_INFO[provider] || PROVIDER_INFO.openrouter

    return (
        <div className="space-y-5 animate-fade-in">

            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">AI ইনসাইটস</h1>
                <div className="flex gap-2">
                    <Button variant="outline" icon={<FiRefreshCw className={triggering ? 'animate-spin' : ''} />}
                        onClick={triggerJob} loading={triggering}>
                        AI রান করুন
                    </Button>
                </div>
            </div>

            {/* Provider Badge */}
            {provider && (
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium ${provInfo.color}`}>
                    <span>{provInfo.icon}</span>
                    <span>{provInfo.label}</span>
                    <span className="opacity-60 font-normal">· {provInfo.description}</span>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                {[{ key: 'insights', label: 'ইনসাইটস' }, { key: 'config', label: '⚙️ AI কনফিগ' }].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* INSIGHTS TAB */}
            {tab === 'insights' && (
                <div className="space-y-3">
                    {loading ? (
                        [...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />)
                    ) : insights.length === 0 ? (
                        <Card><p className="text-center text-gray-400 py-8">কোনো AI ইনসাইটস নেই। "AI রান করুন" বাটনে ক্লিক করুন।</p></Card>
                    ) : insights.map(insight => (
                        <div key={insight.id} onClick={() => !insight.is_read && markRead(insight.id)}
                            className={`p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-sm ${
                                !insight.is_read ? 'border-primary/30 bg-blue-50 dark:bg-blue-900/10' : 'border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800'
                            }`}>
                            <div className="flex items-start gap-3">
                                <span className="text-2xl flex-shrink-0">{severityIcon[insight.severity]}</span>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{insight.title}</p>
                                        <Badge variant={insight.severity} />
                                        {!insight.is_read && <span className="w-2 h-2 bg-primary rounded-full" />}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{insight.description}</p>
                                    <p className="text-xs text-gray-400 mt-2">{new Date(insight.created_at).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* CONFIG TAB */}
            {tab === 'config' && (
                <div className="space-y-4 max-w-2xl">

                    {/* Provider Selection Cards */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">AI Provider</h3>
                        <p className="text-xs text-gray-400 mb-3">API Key দিলে Provider স্বয়ংক্রিয়ভাবে চিহ্নিত হবে</p>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                                <div key={key}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                        provider === key
                                            ? `${info.color} border-2`
                                            : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                                    }`}
                                    onClick={() => { setDetectedProvider(key); setConfig(p => ({ ...p, provider_override: key })); loadModelsForProvider(key) }}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{info.icon}</span>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{info.label}</p>
                                            <p className="text-xs text-gray-400">{info.keyHint}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* API Key */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 space-y-3">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100">API Key</h3>

                        {config.api_key && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                                <FiCheckCircle className="text-green-500 flex-shrink-0" />
                                <span className="text-sm text-green-700 dark:text-green-400 font-mono">{config.api_key}</span>
                                <span className="text-xs text-green-500 ml-auto">{provInfo.label}</span>
                            </div>
                        )}

                        <div className="relative">
                            <input
                                type={showKey ? 'text' : 'password'}
                                placeholder={provInfo.keyHint + ' (নতুন key দিতে চাইলে এখানে লিখুন)'}
                                value={apiKeyInput}
                                onChange={e => handleApiKeyChange(e.target.value)}
                                className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-2.5 pr-10 text-sm bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary font-mono"
                            />
                            <button type="button" onClick={() => setShowKey(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showKey ? <FiEyeOff /> : <FiEye />}
                            </button>
                        </div>

                        {apiKeyInput && detectedProvider && (
                            <div className={`text-xs px-3 py-1.5 rounded-lg border ${provInfo.color}`}>
                                ✓ {provInfo.label} API Key চিহ্নিত হয়েছে — {provInfo.description}
                            </div>
                        )}

                        <a href={provInfo.website} target="_blank" rel="noreferrer"
                            className="text-xs text-primary hover:underline">
                            🔗 {provInfo.label} থেকে API Key নিন →
                        </a>
                    </div>

                    {/* Model Selection */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 space-y-3">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100">মডেল নির্বাচন</h3>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">দৈনিক চ্যাট মডেল (দ্রুত)</label>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {models.map(m => (
                                    <label key={m.id}
                                        className={`flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                                            config.daily_model === m.id
                                                ? 'border-primary bg-primary/5'
                                                : 'border-gray-100 dark:border-slate-700 hover:border-gray-200'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <input type="radio" name="daily_model" value={m.id}
                                                checked={config.daily_model === m.id}
                                                onChange={() => setConfig(p => ({ ...p, daily_model: m.id }))}
                                                className="accent-primary" />
                                            <span className="text-sm text-gray-800 dark:text-gray-100">{m.name}</span>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-lg border ${TIER_STYLE[m.tier]}`}>
                                            {TIER_LABEL[m.tier]}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">পিরিয়ডিক রিপোর্ট মডেল (স্মার্ট)</label>
                            <div className="space-y-1.5 max-h-36 overflow-y-auto">
                                {models.filter(m => ['smart', 'best'].includes(m.tier)).map(m => (
                                    <label key={m.id}
                                        className={`flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                                            config.periodic_model === m.id
                                                ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                                                : 'border-gray-100 dark:border-slate-700 hover:border-gray-200'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <input type="radio" name="periodic_model" value={m.id}
                                                checked={config.periodic_model === m.id}
                                                onChange={() => setConfig(p => ({ ...p, periodic_model: m.id }))}
                                                className="accent-purple-500" />
                                            <span className="text-sm text-gray-800 dark:text-gray-100">{m.name}</span>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-lg border ${TIER_STYLE[m.tier]}`}>
                                            {TIER_LABEL[m.tier]}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Custom model input */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">কাস্টম মডেল ID (ঐচ্ছিক)</label>
                            <input
                                type="text"
                                placeholder="যেমন: anthropic/claude-3-opus, gpt-4-turbo"
                                value={config.daily_model || ''}
                                onChange={e => setConfig(p => ({ ...p, daily_model: e.target.value }))}
                                className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary font-mono"
                            />
                        </div>
                    </div>

                    {/* Advanced Settings */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">অ্যাডভান্সড সেটিংস</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Max Tokens" type="number"
                                value={config.max_tokens || '1000'}
                                onChange={e => setConfig(p => ({ ...p, max_tokens: e.target.value }))} />
                            <Input label="পিরিয়ডিক রিভিউ (মাস)" type="number"
                                value={config.periodic_review_months || '3'}
                                onChange={e => setConfig(p => ({ ...p, periodic_review_months: e.target.value }))} />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <Button onClick={testConnection} loading={testing} variant="outline" icon={<FiZap />}>
                            সংযোগ পরীক্ষা করুন
                        </Button>
                        <Button onClick={saveConfig} loading={saving} icon={<FiSettings />}>
                            কনফিগ সেভ করুন
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
