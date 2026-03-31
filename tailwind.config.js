/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        geist: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        app: {
          bg: 'var(--app-bg)',
          panel: 'var(--app-panel)',
          sidebar: 'var(--app-sidebar)',
          titlebar: 'var(--app-titlebar)',
          border: 'var(--app-border)',
          'border-highlight': 'var(--app-border-highlight)',
          accent: 'var(--app-accent)',
          'accent-glow': 'var(--app-accent-glow)',
          'accent-hover': 'var(--app-accent-hover)',
          'accent-alt': 'var(--app-accent-alt)',
          text: 'var(--app-text)',
          'text-muted': 'var(--app-text-muted)',
        },
      },
      borderRadius: {
        'none': '0',
        'sm': '0.125rem',
        DEFAULT: '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
      },
      fontSize: {
        'xs': ['13px', { lineHeight: '1.4' }],
        'sm': ['14px', { lineHeight: '1.4' }],
        'base': ['15px', { lineHeight: '1.5' }],
        'lg': ['16px', { lineHeight: '1.5' }],
        'xl': ['18px', { lineHeight: '1.4' }],
        '2xl': ['22px', { lineHeight: '1.3' }],
      },
    },
  },
  plugins: [],
}
