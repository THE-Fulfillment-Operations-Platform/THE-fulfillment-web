import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { TOKEN_KEY } from '~/utils/storage'

// Session lifecycle guard (client-only). Runs after auth.client.ts has hydrated
// the store and covers the three gaps a bare-localStorage token had:
//   1. Idle timeout   — sign out after a stretch of no user activity.
//   2. Expiry sweep   — sign out the moment the stored token passes expires_at.
//   3. Cross-tab sync — mirror a logout that happened in another tab.
// It also revalidates the restored token against /api/me once on boot, so a
// stale/revoked token is caught immediately instead of on the first data fetch.

// Auto sign-out after this much inactivity. Generous enough for a shop-floor
// station left mid-task, tight enough to not leave sessions open all night.
const IDLE_LIMIT_MS = 30 * 60 * 1000
const CHECK_INTERVAL_MS = 60 * 1000
// Genuine user-interaction events only. Deliberately excludes 'visibilitychange'
// so merely tabbing back to the app does not reset the idle countdown (that would
// weaken the idle logout); visibility is handled separately for the expiry sweep.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const

export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const toast = useToastStore()
  const router = useRouter()

  let lastActivity = Date.now()
  const markActive = () => {
    lastActivity = Date.now()
  }
  ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }))

  function endSession(reason: 'idle' | 'expired') {
    if (!auth.isAuthenticated) return
    auth.clear()
    toast.info(
      reason === 'idle'
        ? 'Đã tự đăng xuất do không hoạt động. Vui lòng đăng nhập lại.'
        : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    )
    const current = router.currentRoute.value
    if (current.path !== '/login') {
      router.push({ path: '/login', query: { redirect: current.fullPath } })
    }
  }

  const timer = setInterval(() => {
    if (!auth.isAuthenticated) return
    if (auth.isExpired()) return endSession('expired')
    if (Date.now() - lastActivity >= IDLE_LIMIT_MS) return endSession('idle')
  }, CHECK_INTERVAL_MS)

  // Cross-tab logout: another tab clearing the token (logout or its own 401)
  // fires a storage event here — follow it so every tab lands on /login.
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === TOKEN_KEY && !ev.newValue && auth.isAuthenticated) {
      auth.clear()
      if (router.currentRoute.value.path !== '/login') router.push('/login')
    }
  }
  window.addEventListener('storage', onStorage)

  // Boot revalidation: confirm the restored token is still accepted. A rejected
  // token 401s inside refreshMe → the api.client interceptor clears + redirects.
  if (auth.isAuthenticated) void auth.refreshMe()

  // Tidy up listeners/timer across HMR reloads in dev.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      clearInterval(timer)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive))
      window.removeEventListener('storage', onStorage)
    })
  }
})
