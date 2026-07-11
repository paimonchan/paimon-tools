/** @type {import('tailwindcss').Config} */
// Warm honey on warm charcoal. The accent is used sparingly — borders and
// hairlines do the structural work instead of soft drop shadows.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Warm charcoal ramp — base surfaces, slightly desaturated
        ink: {
          50: '#f7f5f1',
          100: '#ece8e1',
          200: '#d9d2c6',
          300: '#b8ad9c',
          400: '#8a8074',
          500: '#5f574d',
          600: '#423d35',
          700: '#2e2a24',
          800: '#1d1a16',
          900: '#131110',
          950: '#0c0b09',
        },
        // Honey — the accent. Warm amber, slightly muted so it doesn't scream.
        honey: {
          50: '#fdf8ed',
          100: '#faedcd',
          200: '#f4d98a',
          300: '#eec35a',
          400: '#e7ac34',
          500: '#d9911e',
          600: '#bb7016',
          700: '#955217',
          800: '#7a4219',
          900: '#673819',
        },
      },
      boxShadow: {
        // Hairline borders are the default; these are for floating elements only
        'pop': '0 8px 30px -8px rgba(0,0,0,0.5)',
        'kbd': '0 1px 0 rgba(0,0,0,0.4), 0 -1px 0 rgba(255,255,255,0.05) inset',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'scale-in': 'scale-in 0.14s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
