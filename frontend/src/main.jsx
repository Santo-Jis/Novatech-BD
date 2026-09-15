import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom' // ✅ BrowserRouter → HashRouter (APK fix)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'
import { initAutoSync } from './api/syncService'
import ErrorBoundary from './components/ErrorBoundary'

// ⬇️ নতুন — Phase 1: TanStack Query client।
// retry: false — network/offline নিজেই হুক-লেভেলে (useRoutes/useCustomers)
// সামলানো হয়, তাই এখানে আবার retry করলে toast ডুপ্লিকেট হবে।
// refetchOnWindowFocus: false — মোবাইল অ্যাপে বারবার ফোকাসে রিফেচ করলে
// স্পটি নেটওয়ার্কে অপ্রয়োজনীয় ডেটা খরচ হয়।
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

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
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
