import { setApiClient, setMockEnabled } from '~/services/http'
import { TOKEN_KEY, USER_KEY } from '~/utils/storage'

// Creates the single configured ofetch client used by the whole service layer.
// Runs on the client only (the app is SPA / ssr:false).
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const baseURL = config.public.apiBaseUrl as string

  setMockEnabled(config.public.useMock === 'true')

  const client = $fetch.create({
    baseURL,
    onRequest({ options }) {
      const token = localStorage.getItem(TOKEN_KEY)
      if (token) {
        const headers = new Headers(options.headers as HeadersInit)
        headers.set('Authorization', `Bearer ${token}`)
        options.headers = headers
      }
    },
    onResponseError({ response }) {
      // 401 → token missing/expired (no refresh-token flow in the MVP backend).
      // Clear session and bounce to login, unless already there.
      if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        const router = nuxtApp.$router as ReturnType<typeof useRouter>
        const current = router?.currentRoute?.value?.path
        if (current && current !== '/login') {
          router.push('/login')
        }
      }
    },
  })

  setApiClient(client)
})
