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
        danger:    { DEFAULT: '#991b1b', light: '#ef4444', dark: '#7f1d1d' }
      },
      fontFamily: {
        sans: ['Hind Siliguri', 'Arial', 'sans-serif']
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
  plugins: []
}
