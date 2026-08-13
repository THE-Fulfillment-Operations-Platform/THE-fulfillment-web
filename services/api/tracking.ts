import { apiGet, apiPost, apiDownload } from '../http'
import type { Order, OrderTrackingEvent } from '~/types'

/** What one full provider pass did — returned by the manual "sync all" trigger. */
export interface TrackingSyncStats {
  /** Orders that had no tracking number and were matched to a parcel by store order id. */
  resolved: number
  synced: number
  /** Of those synced, how many actually changed status. */
  changed: number
  failed: number
  skipped: number
}

export interface OrderTrackingResponse {
  events: OrderTrackingEvent[]
  /** False when the 24hTrack integration is off — lets the UI explain an empty journey. */
  enabled: boolean
}

// ---- Gắn mã vận đơn hàng loạt từ file Excel/CSV -----------------------------

/** Một dòng file đã khớp được đúng một đơn. */
export interface TrackingImportMatch {
  row: number
  order_id: number
  internal_code: string
  store_order_id: string
  shipping_name?: string
  tracking_number: string
  current_tracking?: string
  /** ASSIGN = chưa có mã; OVERWRITE = đã có mã khác (chỉ ghi khi được tick); UNCHANGED = trùng mã hiện tại. */
  action: 'ASSIGN' | 'OVERWRITE' | 'UNCHANGED'
}

export type TrackingImportIssueCode =
  | 'EMPTY_ORDER'
  | 'EMPTY_TRACKING'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'DUPLICATE'
  | 'CONFLICT'
  | 'SHARED_TRACKING'
  | 'TAKEN_TRACKING'

/** Một dòng file sẽ KHÔNG được ghi, kèm lý do tiếng Việt. */
export interface TrackingImportIssue {
  row: number
  order_key: string
  tracking_number?: string
  code: TrackingImportIssueCode
  reason: string
}

/** Đơn trong hệ thống (xuất xưởng trong khoảng ngày, chưa có mã) mà file bỏ sót. */
export interface TrackingImportScopeOrder {
  id: number
  internal_code: string
  store_order_id: string
  shipping_name?: string
  handed_over_at?: string | null
}

export interface TrackingImportSummary {
  total_rows: number
  assign: number
  overwrite: number
  unchanged: number
  issues: number
  /** -1 = không so sánh (không gửi khoảng ngày xuất xưởng kèm file). */
  scope_total: number
  scope_missing: number
}

export interface TrackingImportPreview {
  summary: TrackingImportSummary
  matches: TrackingImportMatch[]
  issues: TrackingImportIssue[]
  scope_missing: TrackingImportScopeOrder[]
}

export interface TrackingImportCommitResult {
  updated: number
  failed: Array<{ order_id: number; reason: string }>
}

export const trackingApi = {
  events: (orderId: number | string) =>
    apiGet<OrderTrackingResponse>(`/api/orders/${orderId}/tracking/events`),
  /** Pull one order straight from the provider (resolves its number first if needed). */
  syncOrder: (orderId: number | string) =>
    apiPost<Order>(`/api/orders/${orderId}/tracking/sync`, {}),
  /** Run one full pass by hand instead of waiting for the scheduler. */
  syncAll: (limit?: number) =>
    apiPost<TrackingSyncStats>(`/api/tracking/sync${limit ? `?limit=${limit}` : ''}`, {}),

  /** File mẫu 2 cột (OrderID, Mã vận đơn) — .xlsx thật từ backend. */
  downloadImportTemplate: () =>
    apiDownload('/api/orders/tracking/import/template.xlsx', 'tracking-import-template.xlsx'),
  /**
   * Preview gắn mã hàng loạt: backend parse file và đối chiếu, KHÔNG ghi gì.
   * Gửi kèm khoảng ngày xuất xưởng đang lọc để nhận cảnh báo "file thiếu N đơn".
   */
  previewImport: (file: File, range?: { handed_over_from?: string; handed_over_to?: string }) => {
    const fd = new FormData()
    fd.append('file', file)
    if (range?.handed_over_from) fd.append('handed_over_from', range.handed_over_from)
    if (range?.handed_over_to) fd.append('handed_over_to', range.handed_over_to)
    return apiPost<TrackingImportPreview>('/api/orders/tracking/import', fd)
  },
  /** Ghi các gán mã đã xác nhận từ preview. Partial success — xem `failed`. */
  commitImport: (assignments: Array<{ order_id: number; tracking_number: string }>) =>
    apiPost<TrackingImportCommitResult>('/api/orders/tracking/import/commit', { assignments }),
}
