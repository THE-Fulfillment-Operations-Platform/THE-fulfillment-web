import { useThemeStore } from '~/stores/theme'

// Sync the reactive theme store with the class the no-flash script already set,
// and wire up the system-preference watcher.
export default defineNuxtPlugin(() => {
  useThemeStore().init()
})
