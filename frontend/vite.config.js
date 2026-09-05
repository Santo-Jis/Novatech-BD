import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_APP_BASE || '/'

export default defineConfig({
  base,

  plugins: [
    react(),
    VitePWA({
      strategies:     'injectManifest',
      srcDir:         'src',
      filename:       'sw.js',
      registerType:   'autoUpdate',
      injectRegister: 'auto',
      manifest:       false,
      devOptions: { enabled: true, type: 'module' },
      injectManifest: {
        // ✅ FIX: html বাদ দেওয়া হলো — নাহলে workbox পুরনো index.html
        // cache-first serve করতো এবং নতুন deploy এর loading page কখনো দেখাতো না।
        // HTML এখন sw.js এর NetworkFirst navigation route দিয়ে হ্যান্ডেল হয়।
        globPatterns: ['**/*.{css,ico,png,svg,woff2}'],
        globIgnores:  ['**/role-*.js', '**/vendor-*.js'],
        maximumFileSizeToCacheInBytes: 5242880,
      },
    }),
  ],

  server: {
    port: 3000,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } },
  },

  build: {
    // ✅ TEMP DEBUG (৩১ আগস্ট ২০২৬): sourcemap সাময়িকভাবে অন করা হলো।
    // একটা crash কয়েকবার ফিক্স করার পরেও ফিরে আসছে, আর minified stack
    // trace-এ শুধু single-letter নাম (যেমন "Ui") দেখা যাচ্ছে — আসল
    // component/লাইন বোঝা যাচ্ছে না। sourcemap থাকলে Chrome DevTools-এর
    // Console-এ resolved (আসল ফাইল/লাইন-সহ) stack trace দেখা যাবে।
    // কারণ ধরা পড়ার পর এটা আবার false করে দেওয়া উচিত (bundle সাইজ/
    // বিল্ড সময় বাড়ায়, আর সোর্স কোড কারিগরিভাবে exposed হয়ে যায়)।
    sourcemap: true,

    // ✅ FIX: chunk warning threshold বাড়ানো হয়েছে
    // recharts (410 kB) + firebase (379 kB) এর জন্য 500 kB যথেষ্ট না
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Vendor: core React ───────────────────────────────────
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router')
          ) return 'vendor-react'

          // ── Vendor: Firebase — modular SDK আলাদা রাখো ──────────
          if (
            id.includes('/node_modules/firebase/') ||
            id.includes('/node_modules/@firebase/')
          ) {
            // ✅ FIX: Firebase modular packages আলাদা করো
            // auth, firestore, messaging — যার যার chunk
            if (id.includes('/auth'))        return 'vendor-firebase-auth'
            if (id.includes('/messaging'))   return 'vendor-firebase-msg'
            if (id.includes('/firestore'))   return 'vendor-firebase-store'
            return 'vendor-firebase-core'
          }

          // ── Vendor: Charts — recharts ────────────────────────────
          if (id.includes('/node_modules/recharts')) {
            // ✅ FIX: recharts internal modules আলাদা করো
            if (id.includes('/victory-') || id.includes('d3-')) return 'vendor-charts-d3'
            return 'vendor-charts'
          }

          // ── Vendor: Map ──────────────────────────────────────────
          if (
            id.includes('/node_modules/leaflet') ||
            id.includes('/node_modules/react-leaflet')
          ) return 'vendor-map'

          // ── Vendor: UI utilities ─────────────────────────────────
          if (
            id.includes('/node_modules/react-hot-toast') ||
            id.includes('/node_modules/react-icons') ||
            id.includes('/node_modules/react-hook-form') ||
            id.includes('/node_modules/clsx') ||
            id.includes('/node_modules/date-fns')
          ) return 'vendor-ui'

          // ── Shared app core ──────────────────────────────────────
          // ✅ FIX (crash: "Cannot access 'X' before initialization"):
          // store/preferencesStore.js (app-core) imports portalFetch from
          // pages/customer/utils/api.js — which the rule below would've
          // put in 'role-customer'. Meanwhile CustomerLayout.jsx
          // (role-customer) imports usePreferencesStore from app-core.
          // That's a circular chunk dependency (app-core ⇄ role-customer),
          // which makes Rollup emit one chunk's top-level const being read
          // before the other chunk finishes initializing → TDZ crash in
          // production only (dev server doesn't chunk-split this way).
          // Pinning utils/api.js to app-core makes the dependency
          // one-directional (role-customer → app-core) and breaks the cycle.
          if (id.includes('/src/pages/customer/utils/api.js')) return 'app-core'

          if (
            id.includes('/src/store/') ||
            id.includes('/src/api/') ||
            id.includes('/src/firebase/') ||
            id.includes('/src/hooks/')
          ) return 'app-core'

          // ── Shared components ────────────────────────────────────
          if (id.includes('/src/components/')) return 'app-components'

          // ── Role-based chunks ────────────────────────────────────
          if (
            id.includes('/src/pages/admin/') ||
            id.includes('/src/layouts/AdminLayout')
          ) return 'role-admin'

          if (
            id.includes('/src/pages/manager/') ||
            id.includes('/src/layouts/ManagerLayout')
          ) return 'role-manager'

          if (
            id.includes('/src/pages/worker/') ||
            id.includes('/src/layouts/WorkerLayout')
          ) return 'role-worker'

          if (
            id.includes('/src/pages/customer/') ||
            id.includes('/src/layouts/CustomerLayout')
          ) return 'role-customer'

          if (id.includes('/src/pages/shared/')) return 'role-shared'
        },
      },
    },
  },
})
