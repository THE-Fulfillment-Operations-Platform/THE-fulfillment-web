import { apiGet, apiPost } from '../http'
import type { Order, ListParams } from '~/types'

export interface OrderListParams extends ListParams {
  seller_id?: number
  store_id?: number
  sku?: string
  status?: string
  store_order_id?: string
  date_from?: string
  date_to?: string
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

export const ordersApi = {
  list: (params?: OrderListParams) => apiGet<Order[]>('/api/orders', params),
  get: (id: number | string) => apiGet<Order>(`/api/orders/${id}`),
  create: (body: DirectOrderInput) => apiPost<Order>('/api/orders', body),
}
