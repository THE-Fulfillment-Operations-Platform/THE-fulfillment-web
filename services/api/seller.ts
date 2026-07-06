import { apiGet, apiPost } from '../http'
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
  // Direct cancel of a pending-review order.
  cancel: (id: number | string, reason?: string) =>
    apiPost<SellerOrder>(`/api/seller/orders/${id}/cancel`, { reason }),
  // Request cancellation of an approved (not-yet-in-production) order.
  requestCancellation: (id: number | string, reason?: string) =>
    apiPost<SellerOrder>(`/api/seller/orders/${id}/cancellation-request`, { reason }),
}
