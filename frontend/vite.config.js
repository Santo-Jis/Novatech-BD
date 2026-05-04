import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ============================================================
// Vite Config — NovaTechBD
// ============================================================

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies:     'injectManifest',
      srcDir:         'src',
      filename:       'sw.js',
      registerType:   'autoUpdate',
      injectRegister: 'auto',
      manifest:       false,

      devOptions: {
        enabled: true,
        type:    'module',
      },

      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target:       'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      // @capacitor/push-notifications শুধু Native Android-এ থাকে।
      // Web/PWA build-এ এই package নেই — Vite কে বলো এটা external।
      // Runtime-এ dynamic import() ব্যর্থ হলে useFCMToken-এ try/catch ধরবে।
      external: ['@capacitor/push-notifications'],
    },
  },
})
