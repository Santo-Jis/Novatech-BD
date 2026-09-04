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
        // ✅ FIX — আগে এখানে flat hex ছিল, তাই tailwind.config.js-এর
        // darkMode:'class' সেট করা থাকলেও কার্যত কিছুই বদলাতো না (টগল
        // চাপলে UI-তে কোনো visual change হতো না)। এখন var(--cp-*)
        // রেফার করে, আসল মান index.css-এর :root (light) / .dark (dark)
        // ব্লকে — dark class যেকোনো ancestor-এ (এখানে CustomerLayout-এর
        // <main>) থাকলেই পুরো subtree সঠিক রঙ পাবে, প্রতিটা কম্পোনেন্টে
        // আলাদা dark: variant লিখতে হবে না।
        'cp-bg': {
          base:    'var(--cp-bg-base)',
          surface: 'var(--cp-bg-surface)',
          alt:     'var(--cp-bg-alt)',
          sunken:  'var(--cp-bg-sunken)',
        },
        'cp-trust': {
          900: 'var(--cp-trust-900)',
          700: 'var(--cp-trust-700)',
          500: 'var(--cp-trust-500)',
          300: 'var(--cp-trust-300)',
          100: 'var(--cp-trust-100)',
        },
        'cp-confidence': {
          600: 'var(--cp-confidence-600)',
          300: 'var(--cp-confidence-300)',
          100: 'var(--cp-confidence-100)',
        },
        'cp-warmth': {
          600: 'var(--cp-warmth-600)',
          300: 'var(--cp-warmth-300)',
          100: 'var(--cp-warmth-100)',
        },
        'cp-text': {
          primary:   'var(--cp-text-primary)',
          secondary: 'var(--cp-text-secondary)',
          muted:     'var(--cp-text-muted)',
        },
        'cp-border': {
          DEFAULT: 'var(--cp-border)',
          strong:  'var(--cp-border-strong)',
          focus:   'var(--cp-border-focus)',
        },
        'cp-success': { DEFAULT: 'var(--cp-success)', bg: 'var(--cp-success-bg)' },
        'cp-warning': { DEFAULT: 'var(--cp-warning)', bg: 'var(--cp-warning-bg)' },
        'cp-error':   { DEFAULT: 'var(--cp-error)',   bg: 'var(--cp-error-bg)' },
        'cp-info':    { DEFAULT: 'var(--cp-info)',    bg: 'var(--cp-info-bg)' },

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
