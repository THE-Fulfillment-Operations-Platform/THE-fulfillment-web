import { apiGet, apiPatch } from '../http'
import type { OrderItem, ListParams } from '~/types'

export interface ItemListParams extends ListParams {
  sku?: string
  status?: string // = internal_status
  design_status?: string
  review_status?: string // parent order review status
  // Kéo cả dòng đã huỷ vào kết quả. Mặc định tắt ở mọi hàng chờ việc (dòng huỷ
  // không phải việc); bật khi đang tra cứu lịch sử. Backend tự bật khi
  // review_status=CANCELLED, vì huỷ đơn là huỷ mọi dòng của nó — không bật thì
  // bộ lọc "Đã huỷ" luôn trả về rỗng.
  include_cancelled?: boolean
  store_order_id?: string // partial match on the parent order's store order id
  internal_code?: string // partial match on the item's internal (QR) code
  batch_id?: number
  seller_id?: number
  store_id?: number
  date_from?: string
  date_to?: string
  sort?: string // sku | created_at | quantity | stt | internal_code
  order?: 'asc' | 'desc'
}

export interface DesignPatch {
  print_file_url?: string
  cut_file_url?: string
  mockup_url?: string
  design_url?: string
  back_design_url?: string
  set_ready?: boolean
  // Production-ready fields (legacy production-template columns).
  image_code?: string
  qc_description?: string
  production_sequence?: number
  production_file_name?: string
}

export const itemsApi = {
  list: (params?: ItemListParams) => apiGet<OrderItem[]>('/api/items', params),
  get: (id: number | string) => apiGet<OrderItem>(`/api/items/${id}`),
  patchDesign: (id: number | string, body: DesignPatch) =>
    apiPatch<OrderItem>(`/api/items/${id}/design`, body),
}
