import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ============================================================
// Vite Config — NovaTechBD
// PWA যোগ করা হয়েছে যাতে SR/Manager app বন্ধ থাকলেও
// Background Push Notification পায়
// ============================================================

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // আমাদের নিজের sw.js ব্যবহার করব (Firebase SW এর সাথে merge)
      strategies:     'injectManifest',
      srcDir:         'src',
      filename:       'sw.js',
      registerType:   'autoUpdate',
      injectRegister: 'auto',
      manifest:       false, // public/manifest.json নিজে দিচ্ছি

      // Dev এ SW চালু রাখো (test করতে)
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
})
