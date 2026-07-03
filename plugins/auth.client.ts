import { useAuthStore } from '~/stores/auth'

// Restore the session from localStorage before the first route renders.
export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  auth.hydrate()
})
