/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep "dark pool" greys/blacks.
        ink: {
          950: '#070709',
          900: '#0b0b10',
          850: '#101016',
          800: '#15151d',
          750: '#1a1a23',
          700: '#22222d',
          600: '#2c2c39',
          500: '#3a3a49',
        },
        // Single spectral accent.
        spectral: {
          DEFAULT: '#7c6cff',
          soft: '#9b8dff',
          dim: '#5d4fd0',
          glow: '#a99dff',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,108,255,0.25), 0 8px 40px -12px rgba(124,108,255,0.45)',
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 50px -24px rgba(0,0,0,0.8)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
}
