/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        ubuntu: ['Ubuntu', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        inconsolata: ['Inconsolata', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Ubuntu', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Inconsolata', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        'surface-1': 'var(--app-surface-1)',
        'surface-2': 'var(--app-surface-2)',
        'surface-3': 'var(--app-surface-3)',
        'surface-hover': 'var(--app-surface-hover)',
        'surface-active': 'var(--app-surface-active)',
        'overlay-dim': 'var(--app-overlay-dim)',
        'overlay-heavy': 'var(--app-overlay-heavy)',
        'overlay-opaque': 'var(--app-overlay-opaque)',
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
        '2xs': ['var(--font-2xs)', { lineHeight: '1.4' }],
        'xs': ['var(--font-xs)', { lineHeight: '1.4' }],
        'sm': ['var(--font-sm)', { lineHeight: '1.4' }],
        'base': ['var(--font-base)', { lineHeight: '1.5' }],
        'lg': ['var(--font-lg)', { lineHeight: '1.5' }],
        'xl': ['var(--font-xl)', { lineHeight: '1.4' }],
        '2xl': ['var(--font-2xl)', { lineHeight: '1.3' }],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
}
