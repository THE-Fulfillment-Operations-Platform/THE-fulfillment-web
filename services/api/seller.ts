import { apiGet } from '../http'
import type { SellerOrder, ListParams } from '~/types'

export interface SellerOrderListParams extends ListParams {
  status?: string
  store_order_id?: string
  date_from?: string
  date_to?: string
}

// Seller-facing endpoints. The backend sanitises these — no internal status leaks.
export const sellerViewApi = {
  orders: (params?: SellerOrderListParams) => apiGet<SellerOrder[]>('/api/seller/orders', params),
  order: (id: number | string) => apiGet<SellerOrder>(`/api/seller/orders/${id}`),
}
