import { setApiClient, setMockEnabled } from '~/services/http'
import { useAuthStore } from '~/stores/auth'

// Creates the single configured ofetch client used by the whole service layer.
// Runs on the client only (the app is SPA / ssr:false).
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl as string
  // The Pinia auth store is the single source of truth for the session; the
  // request/response hooks read and mutate it (not localStorage directly) so
  // in-memory state and persistence never drift apart.
  const auth = useAuthStore()

  // Accept both the string 'true' (build-time default) and boolean true (Nuxt
  // coerces a runtime NUXT_PUBLIC_USE_MOCK=true env override via destr), so
  // `NUXT_PUBLIC_USE_MOCK=true npm run dev` actually enables the mock layer.
  setMockEnabled(String(config.public.useMock) === 'true')

  const client = $fetch.create({
    baseURL,
    onRequest({ options }) {
      const token = auth.token
      if (token) {
        const headers = new Headers(options.headers as HeadersInit)
        headers.set('Authorization', `Bearer ${token}`)
        options.headers = headers
      }
    },
    onResponseError({ response }) {
      // 401 → token missing/expired (no refresh-token flow in the MVP backend).
      // Clear the whole session (store + localStorage) and bounce to login,
      // unless already there. Using auth.clear() keeps the in-memory
      // isAuthenticated getter in sync — a bare localStorage wipe left it stale.
      if (response.status === 401) {
        auth.clear()
        const router = nuxtApp.$router as ReturnType<typeof useRouter>
        const current = router?.currentRoute?.value
        if (current && current.path !== '/login') {
          router.push({ path: '/login', query: { redirect: current.fullPath } })
        }
      }
    },
  })

  setApiClient(client)
})
