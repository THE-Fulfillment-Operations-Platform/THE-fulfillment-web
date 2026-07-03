import type { ApiEnvelope, ApiMeta } from '~/types'
import { ApiError } from '~/utils/api-error'
import { resolveMock } from './mock'

// The configured client is whatever `$fetch.create()` returns. Deriving the type
// from the global `$fetch` (Nitro-augmented) keeps it in lockstep with the plugin
// and avoids a version skew against ofetch's own `$Fetch` type.
type ApiClient = typeof $fetch

// ---------------------------------------------------------------------------
// Centralised HTTP layer. The configured ofetch client is created once in
// plugins/api.client.ts and registered here, so plain service functions can be
// called from anywhere (components, stores, event handlers) without needing the
// Nuxt context at call time.
// ---------------------------------------------------------------------------

let _client: ApiClient | null = null
let _mockEnabled = false

export function setApiClient(client: ApiClient) {
  _client = client
}

export function setMockEnabled(enabled: boolean) {
  _mockEnabled = enabled
}

export function isMockEnabled(): boolean {
  return _mockEnabled
}

function client(): ApiClient {
  if (!_client) throw new ApiError('API client chưa được khởi tạo', 'NO_CLIENT')
  return _client
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiResult<T> {
  data: T
  meta?: ApiMeta
}

export interface RequestOptions {
  params?: Record<string, unknown>
  body?: unknown
}

/** Drop undefined/null/'' query params so we don't send `?status=`. */
function cleanParams(params?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!params) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out
}

export async function request<T>(
  method: HttpMethod,
  url: string,
  opts: RequestOptions = {},
): Promise<ApiResult<T>> {
  // Mock mode: serve from the local fixture resolver when enabled.
  if (_mockEnabled) {
    const mocked = await resolveMock<T>(method, url, opts)
    if (mocked) return mocked
    throw new ApiError(`Mock chưa hỗ trợ endpoint: ${method} ${url}`, 'MOCK_MISS')
  }

  try {
    const env = await client()<ApiEnvelope<T>>(url, {
      method,
      params: cleanParams(opts.params),
      body: opts.body as Record<string, unknown> | undefined,
    })
    if (env && env.success === false) {
      throw new ApiError(
        env.error?.message ?? 'Yêu cầu thất bại',
        env.error?.code ?? 'INTERNAL',
        0,
        env.error?.details,
      )
    }
    return { data: env?.data as T, meta: env?.meta }
  } catch (e) {
    if (e instanceof ApiError) throw e
    const fe = e as {
      data?: ApiEnvelope<unknown>
      status?: number
      statusCode?: number
      message?: string
    }
    const env = fe?.data
    throw new ApiError(
      env?.error?.message || fe?.message || 'Không kết nối được máy chủ',
      env?.error?.code || 'NETWORK',
      fe?.statusCode || fe?.status || 0,
      env?.error?.details,
    )
  }
}

export const apiGet = <T>(url: string, params?: Record<string, unknown>) =>
  request<T>('GET', url, { params })
export const apiPost = <T>(url: string, body?: unknown) => request<T>('POST', url, { body })
export const apiPut = <T>(url: string, body?: unknown) => request<T>('PUT', url, { body })
export const apiPatch = <T>(url: string, body?: unknown) => request<T>('PATCH', url, { body })
export const apiDelete = <T>(url: string, params?: Record<string, unknown>) =>
  request<T>('DELETE', url, { params })
