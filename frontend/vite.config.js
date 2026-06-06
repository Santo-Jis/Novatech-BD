import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ========================================================
// Vite Config - NovaTechBD
// ========================================================

export default defineConfig({
  base: './', // ✅ Capacitor APK-এর জন্য দরকার — file:// path fix

  plugins: [
    react(),
    VitePWA({
      strategies:    'injectManifest',
      srcDir:        'src',
      filename:      'sw.js',
      registerType:  'autoUpdate',
      injectRegister: 'auto',
      manifest:      false,

      devOptions: {
        enabled: true,
        type:    'module',
      },

      injectManifest: {
        // ✅ FIX: আগে **/*.js দিয়ে সব JS pre-cache হত (app open-এ সব chunk download)।
        //   এখন শুধু app shell (HTML, CSS, icons) pre-cache।
        //   JS chunks (role-admin, role-worker, etc.) প্রথমবার navigate করলে
        //   লোড হবে এবং SW runtime cache-এ থাকবে — পরে instant।
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2}'],
        globIgnores:  ['**/role-*.js', '**/vendor-*.js'],
        maximumFileSizeToCacheInBytes: 5242880,
      },
    }),
  ],

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target:      'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        // ✅ FIX: Object → Function syntax।
        //
        // আগে: ৭২টা lazy page → ৭২টা আলাদা chunk → Worker Dashboard,
        //       Customer List প্রতিটা navigate-এ আলাদা আলাদা loader।
        //
        // এখন: Role অনুযায়ী group করা হয়েছে।
        //   role-worker  → Worker-এর সব ২০ পেইজ + WorkerLayout একসাথে
        //   role-admin   → Admin-এর সব পেইজ + AdminLayout একসাথে
        //   role-manager → Manager-এর সব পেইজ + ManagerLayout একসাথে
        //   role-customer→ Customer-এর সব পেইজ + CustomerLayout একসাথে
        //
        // ফলাফল: প্রথমবার Worker Dashboard-এ গেলে role-worker chunk লোড হবে।
        //         তারপর Customer List, Sales Form, Settlement — সব instant।
        //         কোনো loader দেখাবে না।
        manualChunks(id) {
          // ── Vendor: core React ───────────────────────────────────
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router')
          ) {
            return 'vendor-react'
          }

          // ── Vendor: Firebase (বড় library, আলাদা chunk) ──────────
          if (
            id.includes('/node_modules/firebase') ||
            id.includes('/node_modules/@firebase')
          ) {
            return 'vendor-firebase'
          }

          // ── Vendor: Charts ───────────────────────────────────────
          if (id.includes('/node_modules/recharts')) {
            return 'vendor-charts'
          }

          // ── Vendor: Map (leaflet ভারী, আলাদা chunk) ─────────────
          if (
            id.includes('/node_modules/leaflet') ||
            id.includes('/node_modules/react-leaflet')
          ) {
            return 'vendor-map'
          }

          // ── Vendor: UI utilities ─────────────────────────────────
          if (
            id.includes('/node_modules/react-hot-toast') ||
            id.includes('/node_modules/react-icons') ||
            id.includes('/node_modules/react-hook-form') ||
            id.includes('/node_modules/clsx') ||
            id.includes('/node_modules/date-fns')
          ) {
            return 'vendor-ui'
          }

          // ── Shared app core (store, api, hooks, firebase) ────────
          // এগুলো multiple role-এ import হয়।
          // আলাদা chunk-এ রাখলে duplication হবে না।
          if (
            id.includes('/src/store/') ||
            id.includes('/src/api/') ||
            id.includes('/src/firebase/') ||
            id.includes('/src/hooks/')
          ) {
            return 'app-core'
          }

          // ── Shared components ────────────────────────────────────
          if (id.includes('/src/components/')) {
            return 'app-components'
          }

          // ── Role-based page chunks ───────────────────────────────
          if (
            id.includes('/src/pages/admin/') ||
            id.includes('/src/layouts/AdminLayout')
          ) {
            return 'role-admin'
          }

          if (
            id.includes('/src/pages/manager/') ||
            id.includes('/src/layouts/ManagerLayout')
          ) {
            return 'role-manager'
          }

          if (
            id.includes('/src/pages/worker/') ||
            id.includes('/src/layouts/WorkerLayout')
          ) {
            return 'role-worker'
          }

          if (
            id.includes('/src/pages/customer/') ||
            id.includes('/src/layouts/CustomerLayout')
          ) {
            return 'role-customer'
          }

          if (id.includes('/src/pages/shared/')) {
            return 'role-shared'
          }

          // বাকি সব (Login, LandingPage, SRApplicationForm, etc.)
          // Vite নিজেই ঠিক করবে — auto-split
        },
      },
    },
  },
})
