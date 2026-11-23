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
  action: 'ASSIGN' | 'OVERWRITE' | 'UNCHANGED' | 'NONE'
  /** Link label ngoài của dòng (rỗng = dòng không có link). */
  label_url?: string
  current_label?: string
  /** Giống `action` nhưng cho link label; rỗng khi dòng không có link. */
  label_action?: 'ASSIGN' | 'OVERWRITE' | 'UNCHANGED' | ''
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
  /** Excel đã đổi mã thành số mũ (9.4E+21) — mất chữ số, không gắn. */
  | 'EXCEL_NUMBER'
  /** Link label không phải http(s) hợp lệ. */
  | 'BAD_LABEL'
  /** Một link label dán ở nhiều đơn khác nhau. */
  | 'SHARED_LABEL'

/** Một dòng file sẽ KHÔNG được ghi, kèm lý do tiếng Việt. */
export interface TrackingImportIssue {
  row: number
  order_key: string
  tracking_number?: string
  label_url?: string
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
  /** Đếm riêng cho link label (chỉ các dòng có link). */
  label_assign: number
  label_overwrite: number
  label_unchanged: number
  /** Dòng phụ của một đơn (label dùng chung nhiều dòng sản phẩm) đã gộp vào dòng đầu. */
  merged_rows: number
  issues: number
  /** -1 = không so sánh (không gửi khoảng ngày xuất xưởng kèm file). */
  scope_total: number
  scope_missing: number
  /**
   * Số dòng của file "Xuất Excel" (chính màn này) để trống cột Mã vận đơn — bỏ
   * qua, không phải lỗi, không tính trong total_rows. Luôn 0 với file khác.
   */
  skipped_blank?: number
}

/** Bộ lọc của màn Hành trình (không gồm trang) — cùng tham số với GET /api/orders. */
export interface JourneyExportParams {
  handed_over?: boolean
  has_tracking?: boolean
  handed_over_from?: string
  handed_over_to?: string
  search?: string
}

/** Backend giới hạn mỗi lần commit (MaxTrackingCommitBatch) — dialog chia lô theo số này. */
export const TRACKING_COMMIT_BATCH = 500

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
  /** Pull the last-mile numbers (USPS…) THE has assigned since the label. */
  syncLastMile: () => apiPost<{ synced: number }>('/api/tracking/last-mile/sync', {}),
  /** Run one full pass by hand instead of waiting for the scheduler. */
  syncAll: (limit?: number) =>
    apiPost<TrackingSyncStats>(`/api/tracking/sync${limit ? `?limit=${limit}` : ''}`, {}),

  /** File mẫu 3 cột (OrderID, Mã vận đơn, Link label) — .xlsx thật từ backend. */
  downloadImportTemplate: () =>
    apiDownload('/api/orders/tracking/import/template.xlsx', 'tracking-import-template.xlsx'),
  /**
   * Xuất Excel màn Hành trình: TOÀN BỘ đơn khớp bộ lọc (không chỉ trang đang
   * xem), tối đa 5000 — vượt thì backend báo lỗi kèm số đơn. File này điền cột
   * "Mã vận đơn" rồi đưa lại vào "Gắn mã từ Excel" được, không phải sửa cột.
   */
  downloadJourneyExport: (params: JourneyExportParams) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
    }
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
    return apiDownload(`/api/orders/tracking/export.xlsx?${q.toString()}`, `hanh-trinh-don-${stamp}.xlsx`)
  },
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
  commitImport: (assignments: Array<{ order_id: number; tracking_number?: string; label_url?: string }>) =>
    apiPost<TrackingImportCommitResult>('/api/orders/tracking/import/commit', { assignments }),
}
