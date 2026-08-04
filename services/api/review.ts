import { apiGet, apiPost } from '../http'
import type { Order, OrderItem, ReviewOrderDetail, ListParams } from '~/types'

export interface ReviewListParams extends ListParams {
  status?: string // PENDING_REVIEW | NEEDS_CORRECTION
  seller_id?: number
  store_order_id?: string
}

export interface BulkApproveSkip {
  order_id: number
  code: string
  reason: string
}

export interface BulkApproveResult {
  approved: number[]
  approved_count: number
  skipped: BulkApproveSkip[]
  skipped_count: number
}

// Review (intake) endpoints — OWNER/ADMIN/OPS/DESIGNER.
export const reviewApi = {
  list: (params?: ReviewListParams) => apiGet<Order[]>('/api/review/orders', params),
  get: (id: number | string) => apiGet<ReviewOrderDetail>(`/api/review/orders/${id}`),
  approve: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/review/orders/${id}/approve`, { note }),
  // Approve several orders at once; returns which were approved and which skipped.
  bulkApprove: (orderIds: number[], note?: string) =>
    apiPost<BulkApproveResult>('/api/review/orders/bulk-approve', { order_ids: orderIds, note }),
  reject: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/review/orders/${id}/reject`, { note }),
  requestCorrection: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/review/orders/${id}/request-correction`, { note }),
}

// Cancellation-request management — OWNER/ADMIN/OPS.
// `billable` on approve overrides whether the customer is still charged; leave it
// undefined to keep what was recorded when the seller raised the request (đơn đã
// vào sản xuất thì mặc định vẫn tính tiền).
export const cancellationApi = {
  list: (params?: ListParams) => apiGet<Order[]>('/api/cancellation-requests', params),
  // Các đơn đã huỷ/đã xử lý xong. Đây là chỗ duy nhất còn thấy chúng theo danh
  // sách: huỷ đơn là huỷ mọi dòng của nó nên đơn rơi khỏi mọi hàng chờ việc.
  // billable=true lọc ra đúng những đơn còn phải tính tiền khách.
  resolved: (params?: ListParams & { billable?: boolean }) =>
    apiGet<Order[]>('/api/cancellation-requests/resolved', params),
  approve: (id: number | string, note?: string, billable?: boolean) =>
    apiPost<Order>(`/api/cancellation-requests/${id}/approve`, { note, billable }),
  reject: (id: number | string, note?: string) =>
    apiPost<Order>(`/api/cancellation-requests/${id}/reject`, { note }),
  itemList: (params?: ListParams) => apiGet<OrderItem[]>('/api/cancellation-requests/items', params),
  approveItem: (id: number | string, note?: string, billable?: boolean) =>
    apiPost<OrderItem>(`/api/cancellation-requests/items/${id}/approve`, { note, billable }),
  rejectItem: (id: number | string, note?: string) =>
    apiPost<OrderItem>(`/api/cancellation-requests/items/${id}/reject`, { note }),
}
