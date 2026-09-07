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
        //
        // ✅ dark mode: হেক্স ভ্যালুর বদলে CSS variable রেফারেন্স — আসল মান
        // index.css-এর :root/.dark ব্লকে। ফলে bg-cp-*/text-cp-* ব্যবহারকারী
        // প্রতিটা existing কম্পোনেন্ট কোনো পরিবর্তন ছাড়াই automatically
        // dark-aware — rgb(var(--x) / <alpha-value>) প্যাটার্নে opacity
        // মডিফায়ারও (bg-cp-x/60) কাজ করে।
        // ============================================================
        'cp-bg': {
          base:    'rgb(var(--cp-bg-base) / <alpha-value>)',
          surface: 'rgb(var(--cp-bg-surface) / <alpha-value>)',
          alt:     'rgb(var(--cp-bg-alt) / <alpha-value>)',
          sunken:  'rgb(var(--cp-bg-sunken) / <alpha-value>)',
        },
        'cp-trust': {
          900: 'rgb(var(--cp-trust-900) / <alpha-value>)',
          700: 'rgb(var(--cp-trust-700) / <alpha-value>)',
          500: 'rgb(var(--cp-trust-500) / <alpha-value>)',
          300: 'rgb(var(--cp-trust-300) / <alpha-value>)',
          100: 'rgb(var(--cp-trust-100) / <alpha-value>)',
        },
        'cp-confidence': {
          600: 'rgb(var(--cp-confidence-600) / <alpha-value>)',
          300: 'rgb(var(--cp-confidence-300) / <alpha-value>)',
          100: 'rgb(var(--cp-confidence-100) / <alpha-value>)',
        },
        'cp-warmth': {
          600: 'rgb(var(--cp-warmth-600) / <alpha-value>)',
          300: 'rgb(var(--cp-warmth-300) / <alpha-value>)',
          100: 'rgb(var(--cp-warmth-100) / <alpha-value>)',
        },
        'cp-text': {
          primary:   'rgb(var(--cp-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--cp-text-secondary) / <alpha-value>)',
          muted:     'rgb(var(--cp-text-muted) / <alpha-value>)',
        },
        'cp-border': {
          DEFAULT: 'rgb(var(--cp-border) / <alpha-value>)',
          strong:  'rgb(var(--cp-border-strong) / <alpha-value>)',
          focus:   'rgb(var(--cp-border-focus) / <alpha-value>)',
        },
        'cp-success': { DEFAULT: 'rgb(var(--cp-success) / <alpha-value>)', bg: 'rgb(var(--cp-success-bg) / <alpha-value>)' },
        'cp-warning': { DEFAULT: 'rgb(var(--cp-warning) / <alpha-value>)', bg: 'rgb(var(--cp-warning-bg) / <alpha-value>)' },
        'cp-error':   { DEFAULT: 'rgb(var(--cp-error) / <alpha-value>)',   bg: 'rgb(var(--cp-error-bg) / <alpha-value>)' },
        'cp-info':    { DEFAULT: 'rgb(var(--cp-info) / <alpha-value>)',    bg: 'rgb(var(--cp-info-bg) / <alpha-value>)' },

        // ============================================================
        // ⬇️ নতুন — Platform Panel Design System (design.html — Business
        // Admin থিম: warm serif + IBM Plex Sans)। Super Admin ও Support
        // Panel দুটোই এই একই 'pf-' (platform) টোকেন সেট ব্যবহার করবে,
        // যেহেতু দুটোই একই internal/business-facing admin context —
        // আলাদা করার দরকার নেই, customer-facing 'cp-' থেকে সম্পূর্ণ পৃথক।
        // ============================================================
        'pf-bg': {
          base:    '#FAF8F3',
          surface: '#FFFFFF',
          alt:     '#F3F1EA',
          sunken:  '#EFEDE4',
        },
        'pf-primary': {
          900: '#0F1B2E',
          700: '#16253D',
          500: '#2C4870',
          300: '#6B85A8',
          100: '#DCE3EC',
        },
        'pf-accent': {
          600: '#9C6B2E',
          300: '#C99B5A',
          100: '#F3E6D0',
        },
        'pf-text': {
          primary:   '#1F2937',
          secondary: '#5B6472',
          muted:     '#8B8F98',
        },
        'pf-border': {
          DEFAULT: '#E4E1D8',
          strong:  '#D0CCC0',
          focus:   '#16253D',
        },
        'pf-success': { DEFAULT: '#2F7D5D', bg: '#E3F0EA' },
        'pf-warning': { DEFAULT: '#B8860B', bg: '#F7EED9' },
        'pf-error':   { DEFAULT: '#B3452C', bg: '#F5E4DF' },
        'pf-info':    { DEFAULT: '#2C5C87', bg: '#E1EAF2' },
      },
      fontFamily: {
        sans: ['Hind Siliguri', 'Arial', 'sans-serif'],

        // ⬇️ নতুন — Customer Portal ফন্ট (index.html-এ Poppins/Inter link যোগ করা হয়েছে)
        'cp-head': ['Poppins', 'Hind Siliguri', 'sans-serif'],
        'cp-body': ['Inter', 'Hind Siliguri', 'sans-serif'],
        'cp-mono': ['IBM Plex Mono', 'monospace'],

        // ⬇️ নতুন — Platform Panel ফন্ট (index.html-এ আগে থেকেই Source Serif 4 +
        // IBM Plex Sans link যোগ করা আছে, design.html-এর সাথে সামঞ্জস্যপূর্ণ)
        'pf-head': ['Source Serif 4', 'Noto Sans Bengali', 'Georgia', 'serif'],
        'pf-body': ['IBM Plex Sans', 'Noto Sans Bengali', 'Hind Siliguri', 'sans-serif'],
        'pf-mono': ['IBM Plex Mono', 'monospace'],
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
