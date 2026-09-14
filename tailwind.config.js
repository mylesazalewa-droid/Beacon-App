/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:              'var(--bg)',
        surface:         'var(--surface)',
        surface2:        'var(--surface2)',
        surface3:        'var(--surface3)',
        border:          'var(--border)',
        accent:          'var(--accent)',
        'accent-hover':  'var(--accent-hover)',
        'accent-dim':    'var(--accent-dim)',
        'text-primary':  'var(--text-primary)',
        'text-muted':    'var(--text-muted)',
        'text-dim':      'var(--text-dim)',
        'match-visual':  'var(--match-visual)',
        'match-speech':  'var(--match-speech)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'sm':     'var(--shadow-sm)',
        'md':     'var(--shadow-md)',
        'lg':     'var(--shadow-lg)',
        'xl':     'var(--shadow-xl)',
        'btn':    'var(--shadow-btn)',
        'accent': 'var(--shadow-accent)',
        'inset':  'var(--shadow-inset)',
      },
      animation: {
        'fade-in':        'fadeIn 0.15s ease-out',
        'slide-in-right': 'slideInRight 0.2s ease-out',
        'slide-up':       'slideUp 0.22s cubic-bezier(0.16,1,0.3,1)',
      },
      keyframes: {
        fadeIn:       { '0%': { opacity: '0' },                                     '100%': { opacity: '1' } },
        slideInRight: { '0%': { transform: 'translateX(20px)', opacity: '0' },      '100%': { transform: 'translateX(0)', opacity: '1' } },
        slideUp:      { '0%': { transform: 'translateY(12px)', opacity: '0' },      '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
    },
  },
  plugins: [],
}
