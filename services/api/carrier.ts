import { apiBlob, apiGet, apiPost, apiPut } from '../http'

// Kết nối THE: FFM tạo đơn vận chuyển trên THE (trừ tiền ví THE của xưởng) khi
// bấm "Gửi cho THE", lấy mã THE + label về in, rồi tự gắn mã USPS chặng cuối.

/** Một dòng bảng "loại hàng → dịch vụ THE" (#7783). */
export interface THEGoodsGroup {
  name: string
  /** Mã dịch vụ THE của loại này; rỗng = dịch vụ mặc định của kết nối. */
  service_code: string
  service_name?: string
  /** Từ khoá so với mã / tên NVL của SKU (nguyên chữ, không dấu): "MICA", "GO"… */
  materials: string[]
  /** SKU không có NVL nào khớp: nhận theo mã HS bắt đầu bằng các số này. */
  hs_prefixes: string[]
}

/** Bảng chọn dịch vụ THE theo loại hàng. Thứ tự dòng = ưu tiên khi đơn trộn nhiều loại. */
export interface THEServiceRules {
  auto: boolean
  groups: THEGoodsGroup[]
  /** Hàng chưa xếp loại: 'default' = dùng dịch vụ mặc định; 'block' = chặn, không tạo label. */
  unclassified: 'default' | 'block'
}

/** Dịch vụ FFM chọn cho một kiện, kèm lý do bằng lời. */
export interface THEServicePick {
  service_code: string
  service_name?: string
  goods?: string
  reason: string
  unclassified?: string[]
}

export interface THERulesPreview {
  groups: Array<{ name: string; service_code: string; skus: number; by_hs: number }>
  unclassified: { name: string; service_code: string; blocked?: boolean; skus: number; examples?: string[] }
  materials: Array<{ code: string; name: string; skus: number; group: string; service_code: string }>
  skus: number
}

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
  service_rules: THEServiceRules
  /** false = chưa ai lưu bảng, đang dùng bảng mặc định. */
  service_rules_saved: boolean
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
  service_rules?: THEServiceRules
  reset_service_rules?: boolean
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
  /** Dịch vụ THE sẽ dùng cho kiện này (theo loại hàng) và lý do. */
  service: THEServicePick
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
  service_code?: string
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
  // Trạng thái package lần cuối THE báo (pre-transit, in-transit…).
  the_status?: string
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
  /** Chỉ đọc: NVL / SKU nào rơi vào loại hàng nào, đi dịch vụ nào, theo bảng đang sửa (chưa lưu). */
  previewRules: (rules: THEServiceRules | undefined, serviceCode: string) =>
    apiPost<THERulesPreview>('/api/carrier/the/service-rules/preview', { service_rules: rules, service_code: serviceCode }),
  /** Trước khi gửi: đơn nào sẵn sàng, thiếu gì, ví còn bao nhiêu. Không tốn tiền. */
  preflight: (orderIds: number[]) => apiPost<THEPreflight>('/api/orders/the/preflight', { order_ids: orderIds }),
  shipments: (orderId: number | string) => apiGet<THEShipment[]>(`/api/orders/${orderId}/the/shipments`),
  /** Hỏi THE ngay: label THE đã huỷ thì FFM bỏ label + tracking cũ. Trả lại danh sách đơn THE. */
  checkOrder: (orderId: number | string) => apiPost<THEShipment[]>(`/api/orders/${orderId}/the/check`),
  labelBlob: (orderId: number | string) => apiBlob(`/api/orders/${orderId}/the/label`, 'Không tải được label'),
  /** Label mua ngoài (link nhập từ Excel): server tải PDF/ảnh từ link rồi trả về để in. */
  externalLabelBlob: (orderId: number | string) =>
    apiBlob(`/api/orders/${orderId}/label/external`, 'Không tải được label ngoài'),
  cancel: (orderId: number | string, reason: string) =>
    apiPost<THEShipment>(`/api/orders/${orderId}/the/cancel`, { reason }),
}
