import { defineStore } from 'pinia'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function systemPrefersDark(): boolean {
  return import.meta.client && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Light/Dark theme state. The actual `.dark` class is first applied by the
 * no-flash inline script in nuxt.config (before paint); this store keeps the
 * reactive state in sync, persists the user's explicit choice, and re-applies
 * the class on toggle with a brief transition.
 */
export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: 'light' as Theme,
    initialized: false,
  }),

  getters: {
    isDark: (s): boolean => s.theme === 'dark',
  },

  actions: {
    /** Resolve the active theme from storage → system preference, then apply. */
    init() {
      if (!import.meta.client || this.initialized) return
      const stored = localStorage.getItem(STORAGE_KEY)
      this.theme = stored === 'dark' || stored === 'light' ? stored : systemPrefersDark() ? 'dark' : 'light'
      this.apply(false)
      this.initialized = true

      // Follow OS changes only while the user hasn't made an explicit choice.
      if (!stored) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (!localStorage.getItem(STORAGE_KEY)) this.applyTheme(e.matches ? 'dark' : 'light')
        })
      }
    },

    /** Toggle the .dark class + native color-scheme on <html>. */
    apply(animate = true) {
      if (!import.meta.client) return
      const el = document.documentElement
      if (animate) {
        el.classList.add('theme-transition')
        window.setTimeout(() => el.classList.remove('theme-transition'), 300)
      }
      el.classList.toggle('dark', this.theme === 'dark')
      el.style.colorScheme = this.theme
    },

    /** Apply a theme without persisting (used by the system-preference watcher). */
    applyTheme(t: Theme) {
      this.theme = t
      this.apply()
    },

    /** Set + persist the user's explicit choice. */
    set(t: Theme) {
      this.theme = t
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, t)
      this.apply()
    },

    toggle() {
      this.set(this.theme === 'dark' ? 'light' : 'dark')
    },
  },
})
