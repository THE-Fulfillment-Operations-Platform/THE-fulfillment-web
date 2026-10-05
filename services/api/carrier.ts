import { apiBlob, apiGet, apiPost, apiPut } from '../http'

// Kết nối THE: FFM tạo đơn vận chuyển trên THE (trừ tiền ví THE của xưởng) khi
// bấm "Gửi cho THE", lấy mã THE + label về in, rồi tự gắn mã USPS chặng cuối.

export interface CarrierConfig {
  provider: string
  enabled: boolean
  base_url: string
  has_token: boolean
  /** Vài ký tự cuối của token — token thật không bao giờ rời máy chủ. */
  token_hint: string
  token_unreadable: boolean
  service_code: string
  default_phone: string
  packaging_weight_g: number
  /** Mặc định hải quan do bên THE đặt; SKU khai riêng thì SKU thắng. */
  default_hs_code: string
  default_declared_value: number
  ready: boolean
  problem?: string
}

export interface CarrierConfigInput {
  enabled?: boolean
  token?: string
  clear_token?: boolean
  service_code?: string
  default_phone?: string
  packaging_weight_g?: number
  default_hs_code?: string
  default_declared_value?: number
}

export interface CarrierCheck {
  ok: boolean
  message?: string
  balance: number
  debt: number
  services: Array<{ code: string; name: string }>
}

/** Kiện FFM sẽ khai cho THE. */
export interface THEParcel {
  weight_g: number
  length_cm: number
  width_cm: number
  height_cm: number
  value: number
  hs_code: string
  units: number
  country: string
}

export interface THEPreflight {
  enabled: boolean
  problem?: string
  balance?: number
  debt?: number
  ready: number
  blocked: number
  orders: Array<{
    order_id: number
    internal_code: string
    ready: boolean
    already_paid?: boolean
    reason?: string
    parcel?: THEParcel
  }>
}

/** Kết quả trên THE của một đơn vừa gửi. */
export interface THEOutcome {
  shipment_id: number
  tracking_code: string
  last_mile_tracking?: string
  cost?: number
  has_label: boolean
  reused?: boolean
}

export type THEShipmentStatus = 'CREATING' | 'CREATED' | 'LABELED' | 'CANCELLED' | 'FAILED'

export interface THEShipment {
  id: number
  order_id: number
  status: THEShipmentStatus
  order_number: string
  external_id: string
  tracking_code: string
  last_mile_carrier: string
  last_mile_tracking: string
  bill_code: string
  service_code: string
  weight_g: number
  length_cm: number
  width_cm: number
  height_cm: number
  declared_value: number
  hs_code: string
  cost?: number | null
  label_type: string
  error: string
  labeled_at?: string | null
  cancelled_at?: string | null
  created_at: string
  has_label: boolean
}

export const carrierApi = {
  getConfig: () => apiGet<CarrierConfig>('/api/carrier/the/config'),
  updateConfig: (body: CarrierConfigInput) => apiPut<CarrierConfig>('/api/carrier/the/config', body),
  /** Chỉ đọc: số dư ví + danh sách dịch vụ. Không tạo gì trên THE. */
  check: () => apiPost<CarrierCheck>('/api/carrier/the/check'),
  /** Trước khi gửi: đơn nào sẵn sàng, thiếu gì, ví còn bao nhiêu. Không tốn tiền. */
  preflight: (orderIds: number[]) => apiPost<THEPreflight>('/api/orders/the/preflight', { order_ids: orderIds }),
  shipments: (orderId: number | string) => apiGet<THEShipment[]>(`/api/orders/${orderId}/the/shipments`),
  labelBlob: (orderId: number | string) => apiBlob(`/api/orders/${orderId}/the/label`, 'Không tải được label'),
  cancel: (orderId: number | string, reason: string) =>
    apiPost<THEShipment>(`/api/orders/${orderId}/the/cancel`, { reason }),
}
