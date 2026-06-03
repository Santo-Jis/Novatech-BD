import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ========================================================
// Vite Config - NovaTechBD
// ========================================================

export default defineConfig({
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
      // এই দুটো package শুধু Native Android-এ থাকে।
      // Web/PWA build-এ লেগে — Vite কে বলা এগুলো external।
      // Runtime-এ dynamic import() কাজ না হলে try/catch থাকে।
      external: [
        '@capacitor/push-notifications',
        '@codetrix-studio/capacitor-google-auth',
      ],
    },
  },
})
