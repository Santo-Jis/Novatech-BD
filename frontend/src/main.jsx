import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom' // ✅ BrowserRouter → HashRouter (APK fix)
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'
import { initAutoSync } from './api/syncService'
import ErrorBoundary from './components/ErrorBoundary'

// ✅ Diagnostic: JS bundle loaded হয়েছে
if (typeof window !== 'undefined') window.__STEP__ = 3

// App চালু হলেই offline queue auto-sync শুরু
// try/catch: IndexedDB fail হলে (private mode, quota) React mount আটকাবে না
try { initAutoSync() } catch (e) { console.warn('[Sync] initAutoSync failed:', e.message) }

// ✅ FIX: React mount-এর আগে #root-এর inline style সরিয়ে দাও।
// পুরনো cache বা যেকোনো কারণে loading screen-এর flex style থাকলে
// সেটা সব screen-কে narrow করে দেয় — এই লাইনে সেটা পরিষ্কার হয়।
const rootEl = document.getElementById('root')
if (rootEl) rootEl.removeAttribute('style')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1e3a8a',
              color:       '#fff',
              fontFamily:  'Hind Siliguri, sans-serif',
              fontSize:    '14px',
              borderRadius: '10px'
            },
            success: {
              style: { background: '#065f46' }
            },
            error: {
              style: { background: '#991b1b' }
            }
          }}
        />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
