/** @type {import('tailwindcss').Config} */

// All themeable colours are driven by CSS variables (see assets/css/main.css),
// exposed here as semantic Tailwind tokens. Using the `rgb(var(--x) / <alpha>)`
// form keeps opacity utilities (e.g. bg-primary/10) working. Light/dark are
// swapped by toggling the `.dark` class on <html> — never hard-code raw colours.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic design tokens
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        success: { DEFAULT: token('success'), foreground: token('success-foreground') },
        warning: { DEFAULT: token('warning'), foreground: token('warning-foreground') },
        info: { DEFAULT: token('info'), foreground: token('info-foreground') },

        // Soft-minimal accent scale, kept for fine-grained tints. `primary`
        // above is the themed entry point; prefer it for theme-aware UI.
        brand: {
          50: '#eef1fa',
          100: '#e2e7f5',
          200: '#c9d2ec',
          300: '#a6b4de',
          400: '#7d8fcd',
          500: '#5f72bd',
          600: '#4e5fa8',
          700: '#414e8a',
          800: '#37416e',
          900: '#2f3759',
        },
      },
      borderRadius: {
        DEFAULT: '0.625rem',
        md: '0.625rem',
        lg: '0.875rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 18 25 / 0.04), 0 4px 16px -4px rgb(15 18 25 / 0.10)',
        softer: '0 1px 3px 0 rgb(15 18 25 / 0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
