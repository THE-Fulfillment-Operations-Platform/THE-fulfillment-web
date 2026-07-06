import { apiGet, apiPost } from '../http'
import type { Order, ReviewOrderDetail, ListParams } from '~/types'

export interface ReviewListParams extends ListParams {
  status?: string // PENDING_REVIEW | NEEDS_CORRECTION
  seller_id?: number
  store_order_id?: string
}

// Review (intake) endpoints — OWNER/ADMIN/OPS/DESIGNER.
export const reviewApi = {
  list: (params?: ReviewListParams) => apiGet<Order[]>('/api/review/orders', params),
  get: (id: number | string) => apiGet<ReviewOrderDetail>(`/api/review/orders/${id}`),
  approve: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/review/orders/${id}/approve`, { note }),
  reject: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/review/orders/${id}/reject`, { note }),
  requestCorrection: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/review/orders/${id}/request-correction`, { note }),
}

// Cancellation-request management — OWNER/ADMIN/OPS.
export const cancellationApi = {
  list: (params?: ListParams) => apiGet<Order[]>('/api/cancellation-requests', params),
  approve: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/cancellation-requests/${id}/approve`, { note }),
  reject: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/cancellation-requests/${id}/reject`, { note }),
}
