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
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2}'],
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
