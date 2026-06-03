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
      // external রাখা হয়নি — dynamic import + try/catch দিয়ে
      // Login.jsx ও useFCMToken.js নিজেই handle করে।
      // external রাখলে web build-এ dynamic import() silent fail করে
      // এবং পুরো component crash করে সাদা পেজ দেখায়।
    },
  },
})
