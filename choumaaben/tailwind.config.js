/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary':     'var(--bg-primary)',
        'bg-secondary':   'var(--bg-secondary)',
        'bg-card':        'var(--bg-card)',
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'border-col':     'var(--border)',
        'up':             '#e63946',
        'down':           '#2ecc71',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        none: '0',
        sm:   '4px',
        DEFAULT: '4px',
        md:   '4px',
        lg:   '8px',
        xl:   '8px',
        '2xl':'8px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        sm:   'none',
        DEFAULT: 'none',
        md:   'none',
        lg:   'none',
        xl:   'none',
        '2xl':'none',
        inner:'none',
      },
    },
  },
  plugins: [],
}
