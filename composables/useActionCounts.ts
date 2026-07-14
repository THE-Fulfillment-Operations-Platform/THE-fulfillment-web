import type { Role } from '~/types'
import { reviewApi, cancellationApi, notesApi } from '~/services/api'
import { useAuthStore } from '~/stores/auth'

// Pull-based "work waiting for you" counters that drive the sidebar badges, so
// actionable queues (orders to review, cancellations to resolve, notes flagged
// for attention) are visible without opening each screen. Polls on an interval
// and whenever the tab regains focus; role-gated so we never hit an endpoint the
// current role is forbidden from (which would 403).

const POLL_INTERVAL_MS = 90 * 1000

// Mirror the nav roles in utils/navigation.ts for the three queues.
const REVIEW_ROLES: Role[] = ['OWNER', 'ADMIN', 'OPS', 'DESIGNER']
const CANCEL_ROLES: Role[] = ['OWNER', 'ADMIN', 'OPS']
const NOTES_ROLES: Role[] = ['OWNER', 'ADMIN', 'OPS', 'DESIGNER', 'PRODUCTION', 'QC', 'PACKING', 'SHIPPING']

export function useActionCounts() {
  const auth = useAuthStore()
  const counts = reactive({ review: 0, cancellations: 0, notes: 0 })

  const can = (roles: Role[]) => !!auth.role && roles.includes(auth.role)

  // Prefer the server's total; fall back to the page length. Returns null on
  // failure so the caller keeps the last good value instead of flashing 0.
  async function totalOf(fetcher: () => Promise<{ data: unknown[]; meta?: { total: number } | null }>) {
    try {
      const res = await fetcher()
      return res.meta?.total ?? res.data?.length ?? 0
    } catch {
      return null
    }
  }

  async function refresh() {
    if (!auth.isAuthenticated || auth.isSeller) return
    const jobs: Promise<void>[] = []

    if (can(REVIEW_ROLES)) {
      jobs.push(
        totalOf(() => reviewApi.list({ status: 'PENDING_REVIEW', page: 1, page_size: 1 })).then((n) => {
          if (n !== null) counts.review = n
        }),
      )
    }
    if (can(CANCEL_ROLES)) {
      jobs.push(
        Promise.all([
          totalOf(() => cancellationApi.list({ page: 1, page_size: 1 })),
          totalOf(() => cancellationApi.itemList({ page: 1, page_size: 1 })),
        ]).then(([orders, items]) => {
          if (orders !== null || items !== null) counts.cancellations = (orders ?? 0) + (items ?? 0)
        }),
      )
    }
    if (can(NOTES_ROLES)) {
      jobs.push(
        totalOf(() => notesApi.list({ required_attention: true, page: 1, page_size: 1 })).then((n) => {
          if (n !== null) counts.notes = n
        }),
      )
    }
    await Promise.all(jobs)
  }

  function countForPath(path: string): number {
    if (path === '/review') return counts.review
    if (path === '/cancellations') return counts.cancellations
    if (path === '/notes') return counts.notes
    return 0
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refresh()
  }

  onMounted(() => {
    void refresh()
    timer = setInterval(() => void refresh(), POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  })

  return { counts, countForPath, refresh }
}
