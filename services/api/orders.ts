import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../http'
import type {
  Order,
  OrderDeleteResult,
  ListParams,
  TrackingStatus,
  WarrantyEntry,
  WarrantyInfo,
  WarrantyReason,
} from '~/types'

export interface OrderListParams extends ListParams {
  seller_id?: number
  store_id?: number
  sku?: string
  status?: string
  store_order_id?: string
  date_from?: string
  date_to?: string
  sort?: string // sku | created_at | quantity | stt
  order?: 'asc' | 'desc'
  /**
   * Customer-support lookup. `search` is the one-box form: it matches the store
   * order id, our internal code, the tracking number and the recipient's name,
   * phone or email. The narrower fields below are for when the operator knows
   * which identifier they are holding.
   */
  search?: string
  internal_code?: string
  tracking_number?: string
  shipping_name?: string
  shipping_phone?: string
  tracking_status?: TrackingStatus
  /** false = the CS work queue: orders still waiting for a tracking number. */
  has_tracking?: boolean
  /** true = đơn đã gửi cho THE — tập của màn Hành trình đơn hàng. */
  handed_over?: boolean
  /**
   * Lọc theo thời điểm xuất xưởng (handed_over_at), dạng RFC3339. Cận trên là
   * NỬA MỞ (<): gửi đầu ngày kế tiếp để lấy trọn ngày cuối, không dùng 23:59:59.
   */
  handed_over_from?: string
  handed_over_to?: string
}

export interface DirectOrderInput {
  seller_id: number
  store_order_id: string
  store_name?: string
  shipping_name?: string
  shipping_address1?: string
  shipping_country?: string
  items: Array<{
    sku_code: string
    quantity: number
    mockup_url?: string
    engrave_text?: string
  }>
}

// One line-item edit inside an order update. Omitted fields stay unchanged.
export interface EditOrderItemInput {
  id: number
  sku_code?: string
  quantity?: number
  // Không sửa tên sản phẩm ở đây nữa: tên thuộc về SKU trong master data, sửa
  // trên một đơn sẽ khiến đơn đó lệch với catalogue. Đổi SKU, hoặc sửa tên SKU.
  design_url?: string
  back_design_url?: string
  mockup_url?: string
  engrave_text?: string
  note?: string
}

// Editable order fields. Every field is optional so "not sent" ≠ "cleared".
export interface UpdateOrderInput {
  store_order_id?: string
  store_name?: string
  shipping_name?: string
  shipping_address1?: string
  shipping_address2?: string
  shipping_city?: string
  shipping_zip?: string
  shipping_province?: string
  shipping_country?: string
  shipping_phone?: string
  note?: string
  items?: EditOrderItemInput[]
}

export interface UpdateTrackingInput {
  tracking_number?: string
  tracking_status?: TrackingStatus
  tracking_url?: string
}

// Form "Bảo hành". items rỗng = gửi lại toàn bộ; address bỏ trống = giữ địa chỉ cũ.
export interface CreateWarrantyInput {
  reason: WarrantyReason
  reason_note?: string
  items?: Array<{ item_id: number; quantity: number }>
  address?: {
    shipping_name?: string
    shipping_address1?: string
    shipping_address2?: string
    shipping_city?: string
    shipping_zip?: string
    shipping_province?: string
    shipping_country?: string
    shipping_phone?: string
  }
}

/**
 * Kết quả tra mã ở "Quét in label" (POST /api/orders/label-scan). Chỉ đọc: quét để in
 * label không đổi trạng thái đơn, không bàn giao, không gọi THE.
 */
export interface LabelScanResult {
  order_id: number
  internal_code: string
  store_order_id: string
  /** Đơn có link label mua ngoài (orders.external_label_url). */
  has_external_label: boolean
  /** Mã label THE đã tạo cho đơn (rỗng = chưa có). */
  the_tracking?: string
  /** false = còn sản phẩm chưa QC đạt; vẫn in nhưng nhật ký ghi chú "đơn chưa QC xong". */
  qc_done: boolean
  unfinished_items?: number
  total_items?: number
}

export const ordersApi = {
  /** Quét mã đơn nội bộ hoặc tem sản phẩm (100048_1/3) → đơn + trạng thái label. Chỉ đọc. */
  labelScan: (code: string) => apiPost<LabelScanResult>('/api/orders/label-scan', { code }),
  list: (params?: OrderListParams) => apiGet<Order[]>('/api/orders', params),
  get: (id: number | string) => apiGet<Order>(`/api/orders/${id}`),
  create: (body: DirectOrderInput) => apiPost<Order>('/api/orders', body),
  update: (id: number | string, body: UpdateOrderInput) => apiPut<Order>(`/api/orders/${id}`, body),
  cancel: (id: number | string, reason: string) =>
    apiPost<Order>(`/api/orders/${id}/cancel`, { reason }),
  remove: (id: number | string) => apiDelete<{ deleted: boolean; id: number }>(`/api/orders/${id}`),
  // Gỡ link label mua ngoài (để đơn được tạo label THE). Cần quyền orders.manage.
  clearExternalLabel: (id: number | string) =>
    apiDelete<{ external_label_url: string }>(`/api/orders/${id}/label/external`),
  // Xoá nhiều đơn trong MỘT request. Đơn đã vào sản xuất nằm trong `skipped`
  // kèm lý do, không bị xoá.
  bulkRemove: (ids: number[]) => apiPost<OrderDeleteResult>('/api/orders/bulk-delete', { ids }),
  updateTracking: (id: number | string, body: UpdateTrackingInput) =>
    apiPatch<Order>(`/api/orders/${id}/tracking`, body),
  // Bảo hành: tạo đơn MỚI (chờ duyệt) nối với đơn này; đơn cũ giữ nguyên.
  warrantyInfo: (id: number | string) => apiGet<WarrantyInfo>(`/api/orders/${id}/warranty-info`),
  warranties: (id: number | string) => apiGet<WarrantyEntry[]>(`/api/orders/${id}/warranties`),
  createWarranty: (id: number | string, body: CreateWarrantyInput) =>
    apiPost<Order>(`/api/orders/${id}/warranty`, body),
}
