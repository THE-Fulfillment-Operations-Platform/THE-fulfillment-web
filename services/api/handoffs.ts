import { apiGet, apiPost } from '../http'
import type { Handoff } from '~/types'

export interface HandoffInput {
  order_id?: number
  package_id?: number
  box_type?: string
  weight_grams?: number
  length_cm?: number
  width_cm?: number
  height_cm?: number
  packing_note?: string
  photo_url?: string
  note?: string
}

export interface ShipHandoffInput {
  tracking_number: string
  label_url?: string
}

/** Kết quả một lượt gửi hàng hàng loạt cho THE. */
export interface ShipToCarrierResult {
  shipped: Array<{ order_id: number; internal_code: string; handoff_code: string }>
  /** Đơn bị bỏ qua kèm lý do — một đơn chưa xong không được làm hỏng cả lượt gửi. */
  skipped: Array<{ order_id: number; internal_code: string; reason: string }>
}

/** Kết quả một lần quét gửi hàng: quét là gửi, một mã — một đơn — một câu trả lời. */
export interface ShipScanResult {
  order_id: number
  internal_code: string
  store_order_id: string
  seller_name?: string
  handoff_code: string
}

export const handoffsApi = {
  list: (params?: { page?: number; page_size?: number }) => apiGet<Handoff[]>('/api/handoffs', params),
  create: (body: HandoffInput) => apiPost<Handoff>('/api/handoffs', body),
  // Mark a handed-off package as dispatched — the final leg that moves an order
  // to SHIPPED and records the tracking number the seller can follow.
  //
  //   POST /api/handoffs/:id/ship  { tracking_number, label_url? }
  //   → transitions status HANDED_OFF → SHIPPED and returns the updated Handoff.
  markShipped: (id: number | string, body: ShipHandoffInput) =>
    apiPost<Handoff>(`/api/handoffs/${id}/ship`, body),
  // Gửi nhiều đơn đã QC xong cho THE trong một thao tác. Đây là bước kết thúc
  // luồng sản xuất và mở đầu luồng vận chuyển — không cần quét đóng gói.
  shipToCarrier: (orderIds: number[]) =>
    apiPost<ShipToCarrierResult>('/api/orders/ship-to-carrier', { order_ids: orderIds }),
  // Gửi MỘT đơn cho THE bằng chính mã vừa quét (mã nội bộ của đơn, hoặc mã tem
  // item — server tự suy ra đơn). Trạm gửi hàng dùng cái này: quét là gửi.
  shipScan: (code: string) => apiPost<ShipScanResult>('/api/orders/ship-scan', { code }),
}
