import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../http'
import type { Order, ListParams, TrackingStatus } from '~/types'

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
    product_name?: string
    variant_code?: string
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
  product_name?: string
  variant_code?: string
  design_url?: string
  back_design_url?: string
  engrave_text?: string
  note?: string
}

// Editable order fields. Every field is optional so "not sent" ≠ "cleared".
export interface UpdateOrderInput {
  store_order_id?: string
  store_name?: string
  shipping_method?: string
  shipping_name?: string
  shipping_address1?: string
  shipping_address2?: string
  shipping_city?: string
  shipping_zip?: string
  shipping_province?: string
  shipping_country?: string
  shipping_phone?: string
  shipping_email?: string
  ioss?: string
  note?: string
  items?: EditOrderItemInput[]
}

export interface UpdateTrackingInput {
  tracking_number?: string
  tracking_status?: TrackingStatus
  tracking_url?: string
}

export const ordersApi = {
  list: (params?: OrderListParams) => apiGet<Order[]>('/api/orders', params),
  get: (id: number | string) => apiGet<Order>(`/api/orders/${id}`),
  create: (body: DirectOrderInput) => apiPost<Order>('/api/orders', body),
  update: (id: number | string, body: UpdateOrderInput) => apiPut<Order>(`/api/orders/${id}`, body),
  cancel: (id: number | string, reason: string) =>
    apiPost<Order>(`/api/orders/${id}/cancel`, { reason }),
  remove: (id: number | string) => apiDelete<{ deleted: boolean; id: number }>(`/api/orders/${id}`),
  updateTracking: (id: number | string, body: UpdateTrackingInput) =>
    apiPatch<Order>(`/api/orders/${id}/tracking`, body),
}
