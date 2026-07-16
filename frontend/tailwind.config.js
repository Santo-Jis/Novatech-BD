/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: '#1e3a8a', light: '#3b5fc9', dark: '#162d6e' },
        secondary: { DEFAULT: '#065f46', light: '#059669', dark: '#044d38' },
        accent:    { DEFAULT: '#d97706', light: '#f59e0b', dark: '#b45309' },
        danger:    { DEFAULT: '#991b1b', light: '#ef4444', dark: '#7f1d1d' },

        // ============================================================
        // ⬇️ নতুন — Customer Portal Design System (customer-design-system.html)
        // 'cp-' প্রিফিক্স দিয়ে সম্পূর্ণ আলাদা রাখা হয়েছে যাতে admin/worker/manager
        // পোর্টালের বিদ্যমান primary/secondary/accent/danger একদমই স্পর্শ না হয়।
        // ============================================================
        'cp-bg': {
          base:    '#F5F9FD',
          surface: '#FFFFFF',
          alt:     '#EAF2FA',
          sunken:  '#DEEAF6',
        },
        'cp-trust': {
          900: '#0A2E5C',
          700: '#124A8C',
          500: '#2E7BD6',
          300: '#8FBCEE',
          100: '#E1EEFC',
        },
        'cp-confidence': {
          600: '#0E9B6C',
          300: '#7FD3AE',
          100: '#DCF6EA',
        },
        'cp-warmth': {
          600: '#F07B22',
          300: '#F7B88A',
          100: '#FDEBDB',
        },
        'cp-text': {
          primary:   '#152A43',
          secondary: '#54697F',
          muted:     '#8CA0B3',
        },
        'cp-border': {
          DEFAULT: '#D9E4EF',
          strong:  '#C0D2E3',
          focus:   '#2E7BD6',
        },
        'cp-success': { DEFAULT: '#0E9B6C', bg: '#DCF6EA' },
        'cp-warning': { DEFAULT: '#F07B22', bg: '#FDEBDB' },
        'cp-error':   { DEFAULT: '#D64545', bg: '#FBE4E4' },
        'cp-info':    { DEFAULT: '#2E7BD6', bg: '#E1EEFC' },
      },
      fontFamily: {
        sans: ['Hind Siliguri', 'Arial', 'sans-serif'],

        // ⬇️ নতুন — Customer Portal ফন্ট (index.html-এ Poppins/Inter link যোগ করা হয়েছে)
        'cp-head': ['Poppins', 'Hind Siliguri', 'sans-serif'],
        'cp-body': ['Inter', 'Hind Siliguri', 'sans-serif'],
        'cp-mono': ['IBM Plex Mono', 'monospace'],
      },
      animation: {
        'pulse-slow':   'pulse 2s infinite',
        'bounce-slow':  'bounce 2s infinite',
        'fade-in':      'fadeIn 0.3s ease-in-out',
        'slide-up':     'slideUp 0.3s ease-out',
        'typing':       'typing 3s steps(30) infinite'
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 },             to: { opacity: 1 } },
        slideUp: { from: { transform: 'translateY(20px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } }
      }
    }
  },
  plugins: [function({addUtilities}){addUtilities({".scrollbar-hide":{"-ms-overflow-style":"none","scrollbar-width":"none","&::-webkit-scrollbar":{display:"none"}}})}]
}
