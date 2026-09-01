// frontend/src/components/ErrorBoundary.jsx
// ─────────────────────────────────────────────────────────────
// React Error Boundary — একটা child component crash করলে
// পুরো page blank হওয়ার বদলে এই fallback UI দেখাবে।
//
// Usage:
//   <ErrorBoundary>
//     <SomeComponent />
//   </ErrorBoundary>
//
// Custom fallback:
//   <ErrorBoundary fallback={<p>কিছু একটা ভুল হয়েছে</p>}>
//     <SomeComponent />
//   </ErrorBoundary>
// ─────────────────────────────────────────────────────────────

import { Component } from 'react'

// ============================================================
// ✅ TEMP DEBUG (১ সেপ্টেম্বর ২০২৬): মিনিফাইড স্ট্যাক ট্রেস ("at Ki
// (.../role-customer-xxx.js:49:88938)") থেকে single-letter নাম দিয়ে
// আসল বাগ বোঝা যাচ্ছিল না, আর ডেস্কটপ Chrome DevTools দিয়ে যাচাই করাটা
// ঘুরিয়ে-ফিরিয়ে সম্ভব হচ্ছিল না। তাই sourcemap resolve করাটা এখন
// অ্যাপের ভেতরেই (ফোনেই) — .map ফাইল fetch করে, mappings নিজে VLQ
// decode করে, প্রতিটা স্ট্যাক-লাইনকে আসল ফাইল/লাইনে বদলে দেখানো হচ্ছে।
// কারণ ধরা পড়ার পর পুরো ব্লকটা (নিচের mapCache পর্যন্ত) সরিয়ে ফেলা
// উচিত — এটা শুধু ডিবাগিং-এর জন্য, প্রোডাকশনে স্থায়ীভাবে রাখার মতো
// কিছু না (bundle-এর ভেতরের সোর্স স্ট্রাকচার এক্সপোজ করে)।
// ============================================================
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_VAL = {}
for (let i = 0; i < B64.length; i++) B64_VAL[B64[i]] = i

function decodeVLQSegment(str) {
  const out = []
  let shift = 0, value = 0
  for (let i = 0; i < str.length; i++) {
    let digit = B64_VAL[str[i]]
    if (digit === undefined) continue
    const cont = !!(digit & 32)
    digit &= 31
    value += digit << shift
    if (cont) {
      shift += 5
    } else {
      out.push((value & 1) ? -(value >> 1) : (value >> 1))
      value = 0
      shift = 0
    }
  }
  return out
}

const mapCache = new Map() // js url -> parsed sourcemap (বা null যদি fetch/parse ব্যর্থ হয়)

async function fetchSourceMap(jsUrl) {
  if (mapCache.has(jsUrl)) return mapCache.get(jsUrl)
  try {
    const res = await fetch(`${jsUrl}.map`)
    if (!res.ok) { mapCache.set(jsUrl, null); return null }
    const map = await res.json()
    mapCache.set(jsUrl, map)
    return map
  } catch {
    mapCache.set(jsUrl, null)
    return null
  }
}

// generatedLine/Column ব্রাউজারের স্ট্যাক ট্রেস অনুযায়ী 1-based
function resolvePosition(map, generatedLine, generatedColumn) {
  if (!map || !map.mappings) return null
  const lines = map.mappings.split(';')
  const targetLine = generatedLine - 1
  if (targetLine < 0 || targetLine >= lines.length) return null

  // VLQ-এর source-file/line/column/name ফিল্ড সারা ফাইল জুড়ে cumulative —
  // প্রতি লাইনে রিসেট হয় না, শুধু generated column রিসেট হয়
  let srcFile = 0, srcLine = 0, srcCol = 0, nameIdx = 0
  let best = null

  for (let li = 0; li <= targetLine; li++) {
    let genCol = 0
    const raw = lines[li]
    if (!raw) continue
    for (const seg of raw.split(',')) {
      if (!seg) continue
      const d = decodeVLQSegment(seg)
      if (d.length < 1) continue
      genCol += d[0]
      if (d.length >= 4) {
        srcFile += d[1]
        srcLine += d[2]
        srcCol += d[3]
        if (d.length >= 5) nameIdx += d[4]
      }
      if (li === targetLine && genCol <= generatedColumn) {
        best = {
          source: (map.sources || [])[srcFile] || '(unknown)',
          line: srcLine + 1,
          column: srcCol,
          name: d.length >= 5 ? (map.names || [])[nameIdx] : null,
        }
      }
    }
  }
  return best
}

const STACK_FRAME_RE = /at\s+(?:(.*?)\s+\()?((?:https?:)?\/\/[^\s)]+?\.js):(\d+):(\d+)\)?/g

async function resolveStack(rawStack) {
  if (!rawStack) return null
  const frames = [...rawStack.matchAll(STACK_FRAME_RE)]
  if (frames.length === 0) return null

  const resolvedLines = []
  for (const m of frames) {
    const [, fnName, url, lineStr, colStr] = m
    const map = await fetchSourceMap(url)
    const pos = map ? resolvePosition(map, parseInt(lineStr, 10), parseInt(colStr, 10)) : null
    if (pos) {
      resolvedLines.push(`at ${pos.name || fnName || '?'}  →  ${pos.source}:${pos.line}:${pos.column}`)
    } else {
      resolvedLines.push(`at ${fnName || '?'} (${url}:${lineStr}:${colStr})  [unresolved]`)
    }
  }
  return resolvedLines.join('\n')
}
// ============================================================

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, componentStack: null, resolvedStack: null, resolving: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Production-এ এখানে Sentry / LogRocket পাঠানো যাবে:
    //   Sentry.captureException(error, { extra: info })
    //
    // এখন console-এ log করা হচ্ছে — server logger নয়,
    // কারণ এটা browser-side error।
    console.error('[ErrorBoundary] Component crashed:', error, info.componentStack)
    // ✅ TEMP DEBUG (৩০ আগস্ট ২০২৬): componentStack state-এ রাখা হচ্ছে
    // যাতে নিচে ফলব্যাক UI-তে দেখানো যায় — নিচের নোট দেখুন কেন।
    this.setState({ componentStack: info.componentStack })

    // ✅ TEMP DEBUG: sourcemap দিয়ে আসল ফাইল/লাইন resolve করার চেষ্টা
    this.setState({ resolving: true })
    resolveStack(error && error.stack).then((resolved) => {
      if (this._unmounted) return
      this.setState({ resolvedStack: resolved, resolving: false })
    })
  }

  componentWillUnmount() {
    this._unmounted = true
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // Custom fallback prop থাকলে সেটা দেখাও
    if (this.props.fallback) return this.props.fallback

    // Default fallback UI
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="font-bold text-gray-800 text-base mb-1">
          কিছু একটা ভুল হয়েছে
        </h2>
        <p className="text-gray-400 text-xs mb-5 max-w-xs leading-relaxed">
          এই পেজটি লোড করতে সমস্যা হয়েছে।
          পেজ রিফ্রেশ করুন অথবা হোমে ফিরে যান।
        </p>

        {/* error message — ✅ TEMP DEBUG (৩০ আগস্ট ২০২৬): production-এও
            সাময়িকভাবে দেখানো হচ্ছে, কারণ একই crash কয়েকবার ফিক্স করার
            পরেও ফিরে আসছে আর dev-only গার্ডের কারণে আসল error কখনো
            দেখাই যায়নি — শুধু browser console-এ চাপা পড়ে থাকত, যেটা
            ফোন থেকে দেখা যায় না। কারণ ধরা পড়ার পর এই ব্লক আবার
            import.meta.env.DEV দিয়ে গার্ড করে দেওয়া উচিত। */}
        {this.state.error && (
          <div className="text-left bg-gray-100 text-red-600 rounded-xl p-3 mb-4 max-w-full overflow-auto max-h-64 text-[10px] leading-snug">
            <p className="font-bold mb-1">{this.state.error.name}: {this.state.error.message}</p>

            {/* ✅ resolved (আসল ফাইল/লাইন) — পাওয়া গেলে এটাই আসল দরকারি অংশ */}
            {this.state.resolving && <p className="opacity-60 italic mb-1">সোর্স ম্যাপ resolve হচ্ছে…</p>}
            {this.state.resolvedStack && (
              <>
                <p className="font-bold mt-2 mb-0.5 text-cp-trust-700" style={{ color: '#1d4ed8' }}>Resolved:</p>
                <pre className="whitespace-pre-wrap">{this.state.resolvedStack}</pre>
              </>
            )}

            {this.state.componentStack && (
              <>
                <p className="font-bold mt-2 mb-0.5 opacity-70">React component stack:</p>
                <pre className="whitespace-pre-wrap opacity-70">{this.state.componentStack}</pre>
              </>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600"
          >
            আবার চেষ্টা করুন
          </button>
          <button
            onClick={() => window.location.href = '/'}  // HomeRedirect সব role handle করবে
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold"
          >
            হোমে যান
          </button>
        </div>
      </div>
    )
  }
}
