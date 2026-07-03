import type { ApiMeta } from '~/types'
import type { ApiResult } from '~/services/http'
import { errorMessage } from '~/utils/api-error'

/**
 * Wraps an async loader with loading / error / data / meta state and a reload().
 * The loader closure should read current filter refs so reload() re-queries with
 * the latest values.
 */
export function useApiResource<T>(
  loader: () => Promise<ApiResult<T>>,
  opts: { immediate?: boolean } = {},
) {
  const data = ref<T | null>(null) as Ref<T | null>
  const meta = ref<ApiMeta | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const res = await loader()
      data.value = res.data
      meta.value = res.meta ?? null
    } catch (e) {
      error.value = errorMessage(e)
      data.value = null
    } finally {
      loading.value = false
    }
  }

  if (opts.immediate !== false) {
    onMounted(load)
  }

  return { data, meta, loading, error, load, reload: load }
}
