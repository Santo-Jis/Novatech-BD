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
      output: {
        manualChunks: {
          // React core — সবচেয়ে stable, আলাদা chunk-এ রাখো
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Firebase — বড় library, আলাদা chunk
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/database',
            'firebase/messaging',
          ],
          // Charts — recharts ভারী, আলাদা chunk
          'vendor-charts': ['recharts'],
          // UI utilities
          'vendor-ui': [
            'react-hot-toast',
            'react-icons',
            'react-hook-form',
            'clsx',
            'date-fns',
          ],
          // Map — leaflet ভারী, lazy load
          'vendor-map': ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
})
