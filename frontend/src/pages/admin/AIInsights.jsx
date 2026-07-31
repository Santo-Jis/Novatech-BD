import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { Card } from '../../components/ui/Badge'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { FiZap, FiCheckCircle, FiEye, FiEyeOff, FiLock } from 'react-icons/fi'

// Provider তথ্য (BYOK ফর্মে দেখানোর জন্য)
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

// key_source অনুযায়ী স্ট্যাটাস ব্যাজ
const KEY_SOURCE_INFO = {
    own:      { label: '✅ আপনার নিজের Key সক্রিয়',        color: 'bg-green-50 text-green-700 border-green-200' },
    platform: { label: '💳 Platform Shared Key (চার্জযোগ্য)', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    blocked:  { label: '⛔ AI ফিচার বন্ধ করা আছে',           color: 'bg-red-50 text-red-700 border-red-200' },
}

export default function AIInsights() {
    const [insights,    setInsights]    = useState([])
    const [loading,     setLoading]     = useState(true)
    const [tab,         setTab]         = useState('insights')

    // ── BYOK state ──
    const [keyStatus,    setKeyStatus]    = useState(null) // { key_source, has_own_key, provider, model_override, masked_key }
    const [keyLoading,   setKeyLoading]   = useState(true)
    const [saving,       setSaving]       = useState(false)
    const [showKey,      setShowKey]      = useState(false)
    const [apiKeyInput,  setApiKeyInput]  = useState('')
    const [selProvider,  setSelProvider]  = useState('openrouter')
    const [modelOverride, setModelOverride] = useState('')

    const fetchInsights = async () => {
        try {
            const res = await api.get('/ai/insights')
            setInsights(res.data.data.insights)
        } catch { toast.error('তথ্য আনতে সমস্যা হয়েছে।') }
        finally { setLoading(false) }
    }

    const fetchKeyStatus = async () => {
        setKeyLoading(true)
        try {
            const res = await api.get('/ai/own-key')
            const d = res.data.data
            setKeyStatus(d)
            if (d.provider) setSelProvider(d.provider)
            if (d.model_override) setModelOverride(d.model_override)
        } catch { toast.error('AI Key স্ট্যাটাস আনতে সমস্যা হয়েছে।') }
        finally { setKeyLoading(false) }
    }

    useEffect(() => { fetchInsights(); fetchKeyStatus() }, [])

    const markRead = async (id) => {
        await api.put(`/ai/insights/${id}/read`)
        setInsights(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i))
    }

    const saveOwnKey = async () => {
        if (!apiKeyInput.trim()) { toast.error('API Key দিন।'); return }
        setSaving(true)
        try {
            await api.put('/ai/own-key', {
                api_key: apiKeyInput.trim(),
                provider: selProvider,
                model_override: modelOverride.trim() || undefined,
            })
            toast.success('আপনার AI Key সেভ হয়েছে। Super Admin অনুমোদন করলে সক্রিয় হবে।')
            setApiKeyInput('')
            await fetchKeyStatus()
        } catch (err) {
            toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
        } finally { setSaving(false) }
    }

    const severityIcon = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }
    const provInfo = PROVIDER_INFO[selProvider] || PROVIDER_INFO.openrouter
    const sourceInfo = keyStatus ? (KEY_SOURCE_INFO[keyStatus.key_source] || KEY_SOURCE_INFO.platform) : null

    return (
        <div className="space-y-5 animate-fade-in">

            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">AI ইনসাইটস</h1>
            </div>

            {/* Key Source Badge */}
            {sourceInfo && (
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium ${sourceInfo.color}`}>
                    {sourceInfo.label}
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                {[{ key: 'insights', label: 'ইনসাইটস' }, { key: 'config', label: '⚙️ AI Key (BYOK)' }].map(t => (
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
                        <Card><p className="text-center text-gray-400 py-8">কোনো AI ইনসাইটস নেই।</p></Card>
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

            {/* BYOK CONFIG TAB */}
            {tab === 'config' && (
                <div className="space-y-4 max-w-2xl">

                    {keyLoading ? (
                        <div className="h-40 bg-white dark:bg-slate-800 rounded-2xl animate-pulse" />
                    ) : (
                        <>
                            {/* Status explanation */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 space-y-2">
                                <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                    <FiLock className="text-gray-400" /> AI অ্যাক্সেস কীভাবে কাজ করে
                                </h3>
                                {keyStatus?.key_source === 'own' && (
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        আপনার নিজের API Key সক্রিয় আছে ({PROVIDER_INFO[keyStatus.provider]?.label || keyStatus.provider})।
                                        সরাসরি আপনার provider account থেকে বিল হবে, প্ল্যাটফর্ম কোনো টোকেন চার্জ নেয় না।
                                    </p>
                                )}
                                {keyStatus?.key_source === 'platform' && (
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        আপাতত প্ল্যাটফর্মের shared AI key ব্যবহার হচ্ছে — প্রতিটা AI ব্যবহারে আপনার
                                        ওয়ালেট থেকে টোকেন-ভিত্তিক চার্জ কাটা হবে। ব্যালেন্স শেষ হলে AI ফিচার
                                        সাময়িকভাবে বন্ধ হয়ে যাবে। নিচে নিজের Key যোগ করলে (Super Admin অনুমোদনের পর)
                                        আর চার্জ কাটবে না।
                                    </p>
                                )}
                                {keyStatus?.key_source === 'blocked' && (
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                        এই অ্যাকাউন্টের জন্য AI ফিচার Super Admin বন্ধ করে রেখেছেন। সক্রিয় করতে সাপোর্টে যোগাযোগ করুন।
                                    </p>
                                )}
                                {keyStatus?.has_own_key && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-700/40 rounded-xl mt-2">
                                        <FiCheckCircle className="text-green-500 flex-shrink-0" />
                                        <span className="text-sm font-mono text-gray-700 dark:text-gray-200">{keyStatus.masked_key}</span>
                                        {keyStatus.key_source !== 'own' && (
                                            <span className="text-xs text-amber-600 ml-auto">Super Admin অনুমোদনের অপেক্ষায়</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Provider Selection */}
                            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4">
                                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">নিজের AI Provider যোগ করুন</h3>
                                <p className="text-xs text-gray-400 mb-3">সরাসরি provider থেকে অথবা OpenRouter-এর মতো 3rd-party থেকে Key নিন</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                                        <div key={key}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                                selProvider === key ? `${info.color} border-2` : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                                            }`}
                                            onClick={() => setSelProvider(key)}>
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
                                <div className="relative">
                                    <input
                                        type={showKey ? 'text' : 'password'}
                                        placeholder={provInfo.keyHint}
                                        value={apiKeyInput}
                                        onChange={e => setApiKeyInput(e.target.value)}
                                        className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-2.5 pr-10 text-sm bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary font-mono"
                                    />
                                    <button type="button" onClick={() => setShowKey(p => !p)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showKey ? <FiEyeOff /> : <FiEye />}
                                    </button>
                                </div>
                                <a href={provInfo.website} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                                    🔗 {provInfo.label} থেকে API Key নিন →
                                </a>

                                <Input label="মডেল (ঐচ্ছিক — খালি রাখলে ডিফল্ট ব্যবহার হবে)"
                                    placeholder="যেমন: gpt-4o-mini, claude-haiku-4-5-20251001"
                                    value={modelOverride}
                                    onChange={e => setModelOverride(e.target.value)} />

                                <Button onClick={saveOwnKey} loading={saving} icon={<FiZap />}>
                                    Key সেভ করুন
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
